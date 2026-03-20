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

log_info "Wrapper start command executed. Waiting for stabilisation..."

GRACE_PERIOD=5
STABILITY_WINDOW=20
CHECK_INTERVAL=2

sleep "$GRACE_PERIOD"

elapsed=0
check_num=0
total_checks=$(( STABILITY_WINDOW / CHECK_INTERVAL ))

while (( elapsed < STABILITY_WINDOW )); do
  check_num=$(( check_num + 1 ))

  # Check wrapper status
  STATUS_OUTPUT=$("$WRAPPER_SH" status || true)
  if ! echo "$STATUS_OUTPUT" | grep -q "STARTED"; then
    log_error "Stabilisation failed — wrapper status not STARTED (check ${check_num}/${total_checks})"
    exit 60
  fi

  # Check PID file
  PID_FILE="${BIN_DIR}/${APP}.pid"
  if [[ ! -f "$PID_FILE" ]]; then
    log_error "Stabilisation failed — PID file missing (check ${check_num}/${total_checks})"
    exit 60
  fi

  PID=$(cat "$PID_FILE")
  if ! kill -0 "$PID" 2>/dev/null; then
    log_error "Stabilisation failed — process ${PID} exited unexpectedly (check ${check_num}/${total_checks})"
    exit 60
  fi

  if ! ss -lnt | grep -q ":${SERVER_PORT}"; then
    log_error "Stabilisation failed — port ${SERVER_PORT} not bound (check ${check_num}/${total_checks})"
    exit 60
  fi

  log_info "  Health check ${check_num}/${total_checks} — process alive, port ${SERVER_PORT} bound"
  sleep "$CHECK_INTERVAL"
  elapsed=$((elapsed + CHECK_INTERVAL))
done

echo
log_info "=================================================="
log_info "Rollback completed successfully for $APP ($ENV)"
log_info "Running on Host: $VM_HOST | Port: $SERVER_PORT | PID: $PID"
log_info "=================================================="
echo
