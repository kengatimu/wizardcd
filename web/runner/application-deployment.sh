#!/bin/bash
set -euo pipefail # Exit on error, treat unset variables as error, fail on pipeline errors

# ==================================================
# WizardCd - Application Deployment (Executed Remotely)
#
# IMPORTANT:
# This script runs *on the target VM* via SSH.
# It performs deployment only.
# It does NOT manage job state or orchestration.
#
# Contract:
#   - Exit code 0  → SUCCESS
#   - Exit code 60 → Remote start/stabilization failure
#   - Exit code 1  → Generic failure
#
# Runner-service-ms interprets exit codes.
# ==================================================

# --------------------------------------------------
# Resolve SCRIPT_DIR for SSH-executed context
# --------------------------------------------------
# When executed over SSH, SCRIPT_DIR may not exist.
# Fallback to current working directory.
if [[ -z "${SCRIPT_DIR:-}" ]]; then
  SCRIPT_DIR="$(pwd)"
fi

# --------------------------------------------------
# Load WizardCd Shared Utilities
# --------------------------------------------------
# Prefer helpers.sh if available.
# Fallback to inline logging functions if missing.
if [[ -v BASH_SOURCE && -f "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/helpers.sh" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  source "${SCRIPT_DIR}/helpers.sh"
else
  log_info()   { echo "[INFO]  $(date '+%Y-%m-%d %H:%M:%S')  $*"; }
  log_warn()   { echo "[WARN]  $(date '+%Y-%m-%d %H:%M:%S')  $*"; }
  log_error()  { echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S')  $*" >&2; }
fi

# Trap unexpected runtime errors for visibility.
# This ensures failure is never silent.
trap 'log_error "Unexpected error on line $LINENO (exit code $?)"; exit 1' ERR

# --------------------------------------------------
# Parse Input Arguments (Provided by deploy.sh)
# --------------------------------------------------
APP="$1"
ENV="$2"
VM_HOST="$3"
APP_PATH="$4"
SERVER_PORT="$5"
JAVA_VERSION="$6"
RUN_AS_USER="$7"
BACKUP_ENABLED="${8:-true}"
MAX_BACKUPS="${9:-5}"
STABILITY_WINDOW="${10:-20}"

# Normalize backup flag to strict true/false
if [[ "$BACKUP_ENABLED" != "false" ]]; then
  BACKUP_ENABLED="true"
fi

# Ensure max backups is valid
if [[ -z "$MAX_BACKUPS" || "$MAX_BACKUPS" -lt 1 ]]; then
  MAX_BACKUPS=5
fi

# Ensure stability window is valid
if [[ -z "$STABILITY_WINDOW" || "$STABILITY_WINDOW" -lt 5 ]]; then
  STABILITY_WINDOW=20
fi

# --------------------------------------------------
# Resolve Root Directory (Portable across packaging methods)
# --------------------------------------------------
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
log_info "Resolved root directory for deployment context: $ROOT_DIR"

# Ensure APP_PATH always includes app name
APP_PATH="${APP_PATH%/}/${APP}"

export APP ENV WIZARD_LOG_FILE

# --------------------------------------------------
# Define Key Directories and Paths
# --------------------------------------------------
BIN_DIR="${APP_PATH}/bin"
CONF_DIR="${APP_PATH}/conf"
LIB_DIR="${APP_PATH}/lib"
LOGS_DIR="${APP_PATH}/logs"
DROP_DIR="${APP_PATH}/drop"
BACKUP_DIR="${APP_PATH}/backup"
RELEASES_DIR="${BACKUP_DIR}/releases"
EXTRAS_DIR="${APP_PATH}/extras"
DEPLOY_DIR="${APP_PATH}/deploy"
DEPLOYMENT_TAR="/tmp/${APP}-${ENV}.tar.gz"

# --------------------------------------------------
# Helper Functions
# --------------------------------------------------

# Check whether a TCP port is open on the local target. Tries tools in
# order of preference and falls back to a pure-bash /dev/tcp connect test
# so this works even on minimal/slim base images that don't ship with
# iproute2 (no `ss`), net-tools (no `netstat`) or lsof.
#
# Why this exists: the original implementation relied solely on
#   `ss -lnt | grep -q ":${PORT}"`
# which silently produces `ss: command not found` on minimal containers
# (e.g. official Ubuntu slim/CIS-hardened images). The startup loop then
# spins for the full PORT_WAIT_TIMEOUT even though the app is actually
# up, and the deploy fails with a misleading "failed to bind port".
#
# The /dev/tcp fallback is a Bash built-in (no subprocesses) and is
# strictly stronger than `ss`: it verifies the app is ACCEPTING
# connections, not merely listening on the socket.
port_open() {
  local port=$1
  if command -v ss      >/dev/null 2>&1 && ss      -lnt 2>/dev/null | grep -Eq "[:.]${port}[[:space:]]"; then return 0; fi
  if command -v netstat >/dev/null 2>&1 && netstat -lnt 2>/dev/null | grep -Eq "[:.]${port}[[:space:]]"; then return 0; fi
  # /dev/tcp — bash built-in TCP connect. Subshell so the fd auto-closes.
  (exec 3<>/dev/tcp/127.0.0.1/"${port}") >/dev/null 2>&1
}

# Safely create directory — tries normal mkdir first, falls back to sudo mkdir.
# This allows the deploy user to create directories outside its home when a
# sudoers rule grants NOPASSWD: /bin/mkdir (set up by WizardCD installer).
create_dir() {
  local dir=$1
  if [[ -d "$dir" ]]; then
    return 0
  fi
  log_info "Creating directory: $dir"
  if mkdir -p "$dir" 2>/dev/null; then
    return 0
  fi
  # Fallback: try with sudo (requires NOPASSWD sudoers entry for /bin/mkdir)
  if sudo mkdir -p "$dir" 2>/dev/null; then
    sudo chown "${RUN_AS_USER}:${RUN_AS_USER}" "$dir" 2>/dev/null || true
    return 0
  fi
  log_error "Cannot create directory: $dir — check permissions or add sudo rule for deploy user"
  exit 1
}

# Rotate old release backups (retain only MAX_BACKUPS)
rotate_backups() {
  local backups=($(ls -1t "$RELEASES_DIR"/*.tar.gz 2>/dev/null || true))
  if (( ${#backups[@]} > MAX_BACKUPS )); then
    log_info "Rotating backups in $RELEASES_DIR (keeping last $MAX_BACKUPS)..."
    for old in "${backups[@]:MAX_BACKUPS}"; do
      log_info "Deleting old backup: $old"
      rm -f "$old"
    done
  fi
}

# Stop running instance using wrapper first, port fallback second
stop_running_app() {
  local wrapper_sh="${BIN_DIR}/${APP}-wrapper.sh"

  if [[ -x "$wrapper_sh" ]]; then
    log_info "Stopping application using $wrapper_sh stop ..."
    "$wrapper_sh" stop || true
    sleep 5
  else
    log_warn "Wrapper script not found. Falling back to port check."
  fi

  # Hard stop any process still binding the server port
  local pid
  pid=$(lsof -ti :"$SERVER_PORT" || true)
  if [[ -n "$pid" ]]; then
    log_info "Force stopping process on port $SERVER_PORT (PID $pid)..."
    kill -9 "$pid" || true
  else
    log_info "No process running on port $SERVER_PORT."
  fi
}

# Create tar-based release backup before overwriting directories
create_release_backup() {

  if [[ "$BACKUP_ENABLED" != "true" ]]; then
    log_info "Backup disabled via configuration. Skipping release backup."
    return
  fi

  if [[ -d "$BIN_DIR" || -d "$CONF_DIR" || -d "$LIB_DIR" ]]; then

    create_dir "$RELEASES_DIR"

    # Nanosecond precision timestamp avoids collisions
    local ts
    ts=$(date +"%Y%m%dT%H%M%S_%N")

    local release_file="${RELEASES_DIR}/${ts}.tar.gz"
    log_info "Creating release backup: $release_file"

    local items=()
    [[ -d "$BIN_DIR" ]] && items+=("bin")
    [[ -d "$CONF_DIR" ]] && items+=("conf")
    [[ -d "$LIB_DIR" ]] && items+=("lib")

    if (( ${#items[@]} > 0 )); then
      tar -czf "$release_file" -C "$APP_PATH" "${items[@]}"
      rotate_backups
    fi
  fi
}

# Replace destination directory with source directory
deploy_directory() {
  local src=$1
  local dest=$2

  if [[ -e "$dest" ]]; then
    rm -rf "$dest"
  fi

  if [[ -e "$src" ]]; then
    log_info "Deploying new $(basename "$dest") : $dest"
    cp -r "$src" "$dest"

    # Ensure shell scripts remain executable
    find "$dest" -type f -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
  fi
}

# --------------------------------------------------
# Start Application + Stabilization Phase
# --------------------------------------------------
start_app() {
  local wrapper_sh="${BIN_DIR}/${APP}-wrapper.sh"

  # Validate wrapper script exists
  if [[ ! -x "$wrapper_sh" ]]; then
    log_error "Wrapper script not found: $wrapper_sh"
    exit 60
  fi

  log_info "Starting application with $wrapper_sh ..."

  # Execute wrapper start
  if ! "$wrapper_sh" start; then
    log_error "Application start command failed!"
    exit 60
  fi

  # --------------------------------------------------
  # Phase 1: Wait for port to bind (startup readiness)
  #
  # The wrapper reports "started" when the JVM process
  # launches, but the application hasn't opened its port
  # yet. We poll until the port is bound or the process
  # dies / times out. Max wait = 120s (covers slow
  # Spring Boot apps with DB migrations, large contexts).
  # --------------------------------------------------
  local PORT_WAIT_TIMEOUT=120
  local PORT_WAIT_INTERVAL=2
  local port_waited=0

  log_info "Waiting for port ${SERVER_PORT} to become available (up to ${PORT_WAIT_TIMEOUT}s)..."

  while (( port_waited < PORT_WAIT_TIMEOUT )); do
    # Check if process is still alive
    local pid_file="${BIN_DIR}/${APP}.pid"
    if [[ -f "$pid_file" ]]; then
      local startup_pid
      startup_pid=$(cat "$pid_file")
      if ! kill -0 "$startup_pid" 2>/dev/null; then
        log_error "Application process exited during startup — PID ${startup_pid} no longer running"
        log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
        exit 60
      fi
    fi

    # Check wrapper status
    STATUS_OUTPUT=$("$wrapper_sh" status || true)
    if ! echo "$STATUS_OUTPUT" | grep -q "STARTED"; then
      log_error "Application wrapper stopped during startup — wrapper status not STARTED"
      log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
      exit 60
    fi

    # Check if the port is bound — uses port_open() helper which tries
    # ss → netstat → bash /dev/tcp so this works on minimal images that
    # don't ship iproute2/net-tools.
    if port_open "${SERVER_PORT}"; then
      log_info "  Port ${SERVER_PORT} is ready (took ${port_waited}s)"
      break
    fi

    log_info "  Waiting for port ${SERVER_PORT}... ${port_waited}s/${PORT_WAIT_TIMEOUT}s"
    sleep "$PORT_WAIT_INTERVAL"
    port_waited=$((port_waited + PORT_WAIT_INTERVAL))
  done

  if (( port_waited >= PORT_WAIT_TIMEOUT )); then
    log_error "Application failed to bind port ${SERVER_PORT} within ${PORT_WAIT_TIMEOUT}s"
    log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
    exit 60
  fi

  # --------------------------------------------------
  # Phase 2: Stability monitoring
  #
  # Now that the port is bound, monitor for
  # STABILITY_WINDOW seconds to catch post-startup
  # crashes (OOM, config errors, failed health checks).
  # --------------------------------------------------
  log_info "Application started. Monitoring for ${STABILITY_WINDOW}s to verify stability..."
  log_info "Checks: process alive, port ${SERVER_PORT} listening, wrapper status OK"

  local CHECK_INTERVAL=2
  local elapsed=0
  local pid=""

  while (( elapsed < STABILITY_WINDOW )); do
    local progress_pct=$(( (elapsed + CHECK_INTERVAL) * 100 / STABILITY_WINDOW ))
    if (( progress_pct > 100 )); then progress_pct=100; fi

    # Validate wrapper status
    STATUS_OUTPUT=$("$wrapper_sh" status || true)
    if ! echo "$STATUS_OUTPUT" | grep -q "STARTED"; then
      log_error "Application crashed during stability monitoring at ${elapsed}s — wrapper status not STARTED"
      log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
      exit 60
    fi

    # Validate PID file
    local pid_file="${BIN_DIR}/${APP}.pid"
    if [[ ! -f "$pid_file" ]]; then
      log_error "Application crashed during stability monitoring at ${elapsed}s — PID file missing"
      exit 60
    fi

    pid=$(cat "$pid_file")

    # Ensure process still alive
    if ! kill -0 "$pid" 2>/dev/null; then
      log_error "Application crashed during stability monitoring at ${elapsed}s — process ${pid} exited unexpectedly"
      log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
      exit 60
    fi

    # Ensure application port is still bound — same portability rule as
    # the startup wait loop: use port_open() so we don't depend on `ss`
    # being installed on the target.
    if ! port_open "${SERVER_PORT}"; then
      log_error "Application crashed during stability monitoring at ${elapsed}s — port ${SERVER_PORT} not bound"
      log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
      exit 60
    fi

    log_info "  Monitoring: ${elapsed}s/${STABILITY_WINDOW}s (${progress_pct}%) — all checks passed"
    sleep "$CHECK_INTERVAL"
    elapsed=$((elapsed + CHECK_INTERVAL))
  done

  log_info "  Monitoring: ${STABILITY_WINDOW}s/${STABILITY_WINDOW}s (100%) — all checks passed"

  # Final success confirmation with operational visibility
  log_info "-------------------------------------------------------------------------------"
  log_info "Application '$APP' ($ENV) successfully Started and Stabilized."
  log_info "Running on Host: $VM_HOST | Port: $SERVER_PORT | PID: $pid"
  log_info "-------------------------------------------------------------------------------"
  
}

# --------------------------------------------------
# Main Deployment Flow
# --------------------------------------------------

log_info "=================================================="
log_info "Remote deployment started"
log_info "  Application: ${APP} (${ENV})"
log_info "  Deploy path: ${APP_PATH}"
log_info "  Server port: ${SERVER_PORT}"
log_info "=================================================="

BASE_DIR="$(dirname "$APP_PATH")"

[[ -z "$APP_PATH" ]] && { log_error "Application path is undefined!"; exit 1; }

create_dir "$BASE_DIR"
create_dir "$APP_PATH"

WRAPPER_LOG_PATH="$(dirname "$APP_PATH")/wrapper.log"
[[ -f "$WRAPPER_LOG_PATH" ]] && { log_info "Removing old Tanuki wrapper log."; rm -f "$WRAPPER_LOG_PATH"; }

stop_running_app

create_dir "$LOGS_DIR"
create_dir "$BACKUP_DIR"

# Extract deployment tarball
if [[ -f "$DEPLOYMENT_TAR" ]]; then
  log_info "Extracting tarball $DEPLOYMENT_TAR into $DROP_DIR ..."
  rm -rf "$DROP_DIR"
  mkdir -p "$DROP_DIR"
  tar -xzf "$DEPLOYMENT_TAR" -C "$DROP_DIR"
else
  log_error "Deployment tarball not found at $DEPLOYMENT_TAR"
  exit 1
fi

create_release_backup

log_info "Deploying core application components..."
deploy_directory "$DROP_DIR/bin" "$BIN_DIR"
deploy_directory "$DROP_DIR/conf" "$CONF_DIR"
deploy_directory "$DROP_DIR/lib" "$LIB_DIR"

shopt -s nullglob
log_info "Deploying optional extras..."
for extra in "$DROP_DIR"/*; do
  base_name=$(basename "$extra")
  [[ "$base_name" == "bin" || "$base_name" == "conf" || "$base_name" == "lib" ]] && continue
  deploy_directory "$extra" "$APP_PATH/$base_name"
done
shopt -u nullglob

start_app

# --------------------------------------------------
# Create last-successful backup
#
# This is a PROTECTED backup created ONLY after a deploy
# succeeds and the app stabilises. Unlike release backups
# (which rotate and may contain broken state), this backup
# is guaranteed to be a working state.
#
# Used by the rollback feature to restore the last known
# working version — survives any number of failed deploys.
# --------------------------------------------------
LAST_SUCCESSFUL_DIR="${BACKUP_DIR}/last-successful"
create_dir "$LAST_SUCCESSFUL_DIR"

log_info "Creating last-successful backup (verified working state)..."
local_items=()
[[ -d "$BIN_DIR" ]] && local_items+=("bin")
[[ -d "$CONF_DIR" ]] && local_items+=("conf")
[[ -d "$LIB_DIR" ]] && local_items+=("lib")

if (( ${#local_items[@]} > 0 )); then
  tar -czf "${LAST_SUCCESSFUL_DIR}/latest.tar.gz" -C "$APP_PATH" "${local_items[@]}"
  log_info "Last-successful backup saved: ${LAST_SUCCESSFUL_DIR}/latest.tar.gz"
else
  log_warn "No directories to back up for last-successful snapshot"
fi

rm -rf "$DROP_DIR"

# Cleanup stale tarballs older than 2 hours
tar_name=$(basename "$DEPLOYMENT_TAR")
old_tarballs=$(find /tmp -maxdepth 1 -type f -name "$tar_name" ! -newermt '2 hours ago' 2>/dev/null || true)
[[ -n "$old_tarballs" ]] && find /tmp -maxdepth 1 -type f -name "$tar_name" ! -newermt '2 hours ago' -exec rm -f {} \; 2>/dev/null || true

echo
log_info "=================================================="
log_info "Deployment completed successfully for $APP ($ENV)"
log_info "=================================================="
echo
echo
