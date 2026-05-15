#!/bin/bash
set -euo pipefail

# ==================================================
# WizardCD - Application Rollback (Executed Remotely)
#
# IMPORTANT:
# This script runs *on the target VM* via SSH.
# It restores the last-successful backup and restarts
# the application.
#
# Contract:
#   - Exit code 0  → SUCCESS (rollback completed)
#   - Exit code 60 → Rollback failed (start/stabilization)
#   - Exit code 70 → No last-successful backup found
#   - Exit code 1  → Generic failure
#
# Runner-service-ms interprets exit codes.
# ==================================================

# --------------------------------------------------
# Inline logging (SSH context — no helpers.sh)
# --------------------------------------------------
log_info()   { echo "[INFO]  $(date '+%Y-%m-%d %H:%M:%S')  $*"; }
log_warn()   { echo "[WARN]  $(date '+%Y-%m-%d %H:%M:%S')  $*"; }
log_error()  { echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S')  $*" >&2; }

# Portable "is this TCP port open locally?" check.
#
# Tries `ss` → `netstat` → falls back to a pure-bash /dev/tcp connect
# test so this works on minimal/slim base images that don't ship with
# iproute2 or net-tools. The /dev/tcp form is a Bash built-in and is
# strictly stronger than `ss`: it confirms the app is ACCEPTING
# connections, not merely listening. See the matching helper in
# application-deployment.sh — kept inline here because this script
# is piped over SSH to the target and runs in isolation.
port_open() {
  local port=$1
  if command -v ss      >/dev/null 2>&1 && ss      -lnt 2>/dev/null | grep -Eq "[:.]${port}[[:space:]]"; then return 0; fi
  if command -v netstat >/dev/null 2>&1 && netstat -lnt 2>/dev/null | grep -Eq "[:.]${port}[[:space:]]"; then return 0; fi
  (exec 3<>/dev/tcp/127.0.0.1/"${port}") >/dev/null 2>&1
}

trap 'log_error "Unexpected error on line $LINENO (exit code $?)"; exit 1' ERR

# --------------------------------------------------
# Parse Input Arguments (Provided by deploy.sh / runner)
# --------------------------------------------------
APP="$1"
ENV="$2"
VM_HOST="$3"
APP_BASE_PATH="$4"
SERVER_PORT="$5"

# Ensure APP_PATH includes app name
APP_PATH="${APP_BASE_PATH%/}/${APP}"

# --------------------------------------------------
# Define Key Directories
# --------------------------------------------------
BIN_DIR="${APP_PATH}/bin"
CONF_DIR="${APP_PATH}/conf"
LIB_DIR="${APP_PATH}/lib"
BACKUP_DIR="${APP_PATH}/backup"
LAST_SUCCESSFUL="${BACKUP_DIR}/last-successful/latest.tar.gz"

# --------------------------------------------------
# Validate last-successful backup exists
# --------------------------------------------------
log_info "=================================================="
log_info "Rollback started"
log_info "  Application: ${APP} (${ENV})"
log_info "  Rollback path: ${APP_PATH}"
log_info "  Server port: ${SERVER_PORT}"
log_info "=================================================="

if [[ ! -f "$LAST_SUCCESSFUL" ]]; then
  log_error "No last-successful backup found at: $LAST_SUCCESSFUL"
  log_error "A successful deployment must have completed at least once before rollback is available."
  exit 70
fi

log_info "Last-successful backup found: $LAST_SUCCESSFUL"
log_info "  Size: $(du -h "$LAST_SUCCESSFUL" | cut -f1)"
log_info "  Date: $(stat -c '%y' "$LAST_SUCCESSFUL" 2>/dev/null || stat -f '%Sm' "$LAST_SUCCESSFUL" 2>/dev/null || echo 'unknown')"

# --------------------------------------------------
# Stop running application
# --------------------------------------------------
log_info "Stopping current application..."

WRAPPER_SH="${BIN_DIR}/${APP}-wrapper.sh"
if [[ -x "$WRAPPER_SH" ]]; then
  log_info "Stopping via wrapper: $WRAPPER_SH stop"
  "$WRAPPER_SH" stop || true
  sleep 5
else
  log_warn "Wrapper script not found at $WRAPPER_SH — falling back to port check"
fi

# Force-stop any process on the port
PID=$(lsof -ti :"$SERVER_PORT" 2>/dev/null || true)
if [[ -n "$PID" ]]; then
  log_info "Force stopping process on port $SERVER_PORT (PID $PID)..."
  kill -9 "$PID" || true
  sleep 2
else
  log_info "No process running on port $SERVER_PORT"
fi

# --------------------------------------------------
# Restore from last-successful backup
# --------------------------------------------------
log_info "Restoring from last-successful backup..."

# Remove current directories
for dir in "$BIN_DIR" "$CONF_DIR" "$LIB_DIR"; do
  if [[ -d "$dir" ]]; then
    log_info "  Removing: $dir"
    rm -rf "$dir"
  fi
done

# Extract backup
log_info "  Extracting: $LAST_SUCCESSFUL → $APP_PATH"
tar -xzf "$LAST_SUCCESSFUL" -C "$APP_PATH"

# Ensure wrapper script is executable
if [[ -f "$WRAPPER_SH" ]]; then
  chmod +x "$WRAPPER_SH"
fi
find "$BIN_DIR" -type f -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true

log_info "Backup restored successfully"

# --------------------------------------------------
# Start application + stabilisation
# --------------------------------------------------
log_info "Starting application from restored backup..."

if [[ ! -x "$WRAPPER_SH" ]]; then
  log_error "Wrapper script not found after restore: $WRAPPER_SH"
  exit 60
fi

if ! "$WRAPPER_SH" start; then
  log_error "Application start command failed after rollback!"
  exit 60
fi

# --------------------------------------------------
# Phase 1: Wait for port to bind (startup readiness)
# --------------------------------------------------
PORT_WAIT_TIMEOUT=120
PORT_WAIT_INTERVAL=2
port_waited=0

log_info "Waiting for port ${SERVER_PORT} to become available (up to ${PORT_WAIT_TIMEOUT}s)..."

while (( port_waited < PORT_WAIT_TIMEOUT )); do
  # Check if process is still alive
  PID_FILE="${BIN_DIR}/${APP}.pid"
  if [[ -f "$PID_FILE" ]]; then
    startup_pid=$(cat "$PID_FILE")
    if ! kill -0 "$startup_pid" 2>/dev/null; then
      log_error "Application process exited during startup — PID ${startup_pid} no longer running"
      log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
      exit 60
    fi
  fi

  # Check wrapper status
  STATUS_OUTPUT=$("$WRAPPER_SH" status || true)
  if ! echo "$STATUS_OUTPUT" | grep -q "STARTED"; then
    log_error "Application wrapper stopped during startup — wrapper status not STARTED"
    log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
    exit 60
  fi

  # Check if port is bound — portable: ss → netstat → bash /dev/tcp.
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
# --------------------------------------------------
STABILITY_WINDOW=20
CHECK_INTERVAL=2

log_info "Application started. Monitoring for ${STABILITY_WINDOW}s to verify stability..."
log_info "Checks: process alive, port ${SERVER_PORT} listening, wrapper status OK"

elapsed=0
while (( elapsed < STABILITY_WINDOW )); do
  progress_pct=$(( (elapsed + CHECK_INTERVAL) * 100 / STABILITY_WINDOW ))
  if (( progress_pct > 100 )); then progress_pct=100; fi

  # Check wrapper status
  STATUS_OUTPUT=$("$WRAPPER_SH" status || true)
  if ! echo "$STATUS_OUTPUT" | grep -q "STARTED"; then
    log_error "Application crashed during stability monitoring at ${elapsed}s — wrapper not STARTED"
    log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
    exit 60
  fi

  # Check PID file
  PID_FILE="${BIN_DIR}/${APP}.pid"
  if [[ ! -f "$PID_FILE" ]]; then
    log_error "Application crashed during stability monitoring at ${elapsed}s — PID file missing"
    log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
    exit 60
  fi

  PID=$(cat "$PID_FILE")
  if ! kill -0 "$PID" 2>/dev/null; then
    log_error "Application crashed during stability monitoring at ${elapsed}s — process ${PID} exited unexpectedly"
    log_error "Check the application logs at: ${APP_PATH}/logs/wrapper.log"
    exit 60
  fi

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

echo
log_info "=================================================="
log_info "Rollback completed successfully for $APP ($ENV)"
log_info "Running on Host: $VM_HOST | Port: $SERVER_PORT | PID: $PID"
log_info "=================================================="
echo
