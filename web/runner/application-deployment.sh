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

# Normalize backup flag to strict true/false
if [[ "$BACKUP_ENABLED" != "false" ]]; then
  BACKUP_ENABLED="true"
fi

# Ensure max backups is valid
if [[ -z "$MAX_BACKUPS" || "$MAX_BACKUPS" -lt 1 ]]; then
  MAX_BACKUPS=5
fi

# --------------------------------------------------
# Resolve Root Directory (Portable across packaging methods)
# --------------------------------------------------
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
log_info "Resolved root directory for deployment context: $ROOT_DIR"

# Ensure APP_PATH always includes app name
APP_PATH="${APP_PATH%/}/${APP}"
[[ -d "$APP_PATH" ]] || { log_info "Creating application base path: $APP_PATH"; mkdir -p "$APP_PATH"; }

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

# Safely create directory if missing
create_dir() {
  local dir=$1
  [[ -d "$dir" ]] || { log_info "Creating $dir ..."; mkdir -p "$dir"; }
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

  log_info "Wrapper start command executed. Entering stabilization phase..."

  # --------------------------------------------------
  # Stabilization Logic
  #
  # Purpose:
  # Ensure the application does not crash immediately
  # after wrapper reports success.
  #
  # This protects against:
  #   - Missing keystore
  #   - Invalid config
  #   - Immediate JVM crash
  #   - Port binding failure
  # --------------------------------------------------

  local GRACE_PERIOD=5
  local STABILITY_WINDOW=20
  local CHECK_INTERVAL=2
  local elapsed=0

  sleep "$GRACE_PERIOD"

  while (( elapsed < STABILITY_WINDOW )); do

    # Validate wrapper status
    STATUS_OUTPUT=$("$wrapper_sh" status || true)
    if ! echo "$STATUS_OUTPUT" | grep -q "STARTED"; then
      log_error "Wrapper status not STARTED during stabilization."
      exit 60
    fi

    # Validate PID file
    local pid_file="${BIN_DIR}/${APP}.pid"
    if [[ ! -f "$pid_file" ]]; then
      log_error "PID file missing during stabilization."
      exit 60
    fi

    local pid
    pid=$(cat "$pid_file")

    # Ensure process still alive
    if ! kill -0 "$pid" 2>/dev/null; then
      log_error "Process $pid died during stabilization."
      exit 60
    fi

    # Ensure application port is bound
    if ! ss -lnt | grep -q ":${SERVER_PORT}"; then
      log_error "Port $SERVER_PORT not bound during stabilization."
      exit 60
    fi

    sleep "$CHECK_INTERVAL"
    elapsed=$((elapsed + CHECK_INTERVAL))
  done

  # Final success confirmation with operational visibility
  log_info "-------------------------------------------------------------------------------"
  log_info "Application '$APP' ($ENV) successfully Started and Stabilized."
  log_info "Running on Host: $VM_HOST | Port: $SERVER_PORT | PID: $pid"
  log_info "-------------------------------------------------------------------------------"
  
}

# --------------------------------------------------
# Main Deployment Flow
# --------------------------------------------------

log_info "--------------------------------------------------"
log_info "REMOTE: Starting remote deployment via application-deployment.sh ..."
log_info "App: $APP ($ENV)"
log_info "Host: $VM_HOST"
log_info "Path: $APP_PATH"
log_info "Server port: $SERVER_PORT"
log_info "--------------------------------------------------"

BASE_DIR="$(dirname "$APP_PATH")"

[[ -z "$APP_PATH" ]] && { log_error "Application path is undefined!"; exit 1; }

[[ ! -d "$BASE_DIR" ]] && { log_warn "Base directory missing. Creating it..."; mkdir -p "$BASE_DIR"; }

[[ ! -d "$APP_PATH" ]] && { log_info "Creating application path: $APP_PATH"; mkdir -p "$APP_PATH"; }

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
