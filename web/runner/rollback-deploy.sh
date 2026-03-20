#!/bin/bash
set -euo pipefail

# ==================================================
# WizardCD - Rollback Orchestrator (Runs on Runner VM)
#
# Called by runner-service-ms to execute a rollback.
# Reads the deployment config YAML from the original job,
# SSHs into the target VM, and runs rollback.sh.
#
# Usage:
#   ./rollback-deploy.sh --job-id <uuid> --config <path-to-yaml>
#
# Exit codes:
#   0  — Rollback succeeded
#   10 — Invalid arguments
#   11 — YAML parse error
#   60 — Remote rollback failed
#   70 — No last-successful backup on target
# ==================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/helpers.sh"

# Exit code constants
EXIT_INVALID_ARGS=10
EXIT_YAML_INVALID=11
EXIT_REMOTE_FAILED=60

trap 'log_error "Rollback orchestrator failed on line $LINENO (exit code $?)"; exit 1' ERR

# --------------------------------------------------
# Parse arguments
# --------------------------------------------------
JOB_ID=""
CONFIG_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job-id)  JOB_ID="$2";     shift 2 ;;
    --config)  CONFIG_FILE="$2"; shift 2 ;;
    *) log_error "Unknown argument: $1"; exit $EXIT_INVALID_ARGS ;;
  esac
done

if [[ -z "$JOB_ID" || -z "$CONFIG_FILE" ]]; then
  log_error "Usage: $0 --job-id <uuid> --config <path>"
  exit $EXIT_INVALID_ARGS
fi

export JOB_ID

# --------------------------------------------------
# Resolve workspace
# --------------------------------------------------
WORKSPACE_ROOT="$(dirname "$(dirname "$CONFIG_FILE")")"
LOG_DIR="${WORKSPACE_ROOT}/logs"
mkdir -p "$LOG_DIR"

WIZARD_LOG_FILE="${LOG_DIR}/deploy.log"
export WIZARD_LOG_FILE

SSH_LOG="${LOG_DIR}/ssh.log"
touch "$SSH_LOG"

log_section "Rollback job initialized"
log_info "Job ID: ${JOB_ID}"
log_info "Config: ${CONFIG_FILE}"

# --------------------------------------------------
# Ensure yq is available
# --------------------------------------------------
if ! command -v yq &>/dev/null; then
  log_error "yq is not installed — required to parse deployment config"
  exit $EXIT_YAML_INVALID
fi

# --------------------------------------------------
# Parse YAML config
# --------------------------------------------------
APP_NAME=$(yq -r 'keys | .[] ' <(yq -r '.apps' "$CONFIG_FILE") | head -1)
ENV_NAME=$(yq -r "keys | .[]" <(yq -r ".apps.${APP_NAME}" "$CONFIG_FILE") | head -1)

log_info "Application: ${APP_NAME}"
log_info "Environment: ${ENV_NAME}"

SSH_USER="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.user" "$CONFIG_FILE")"
SSH_HOST="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.host" "$CONFIG_FILE")"
SSH_PORT="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.port" "$CONFIG_FILE")"
SSH_KEY="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.privateKeyPath" "$CONFIG_FILE")"
TARGET_BASE="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.target.base_path" "$CONFIG_FILE")"
SERVER_PORT="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.runtime.server_port" "$CONFIG_FILE")"

log_info "Target: ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"
log_info "Deploy path: ${TARGET_BASE}/${APP_NAME}"
log_info "Server port: ${SERVER_PORT}"

# --------------------------------------------------
# Execute remote rollback
# --------------------------------------------------
log_section "Executing remote rollback"

log_info "Connecting to ${SSH_USER}@${SSH_HOST}:${SSH_PORT} ..."
log_info "Rolling back: ${APP_NAME} (${ENV_NAME}) → ${TARGET_BASE}/${APP_NAME}"

SSH_REMOTE_LOG="${LOG_DIR}/ssh-remote.log"

set +e
ssh -i "$SSH_KEY" -p "$SSH_PORT" \
    -o StrictHostKeyChecking=no \
    -o ConnectTimeout=30 \
    "${SSH_USER}@${SSH_HOST}" "bash -s" \
    < "${SCRIPT_DIR}/rollback.sh" \
    "$APP_NAME" \
    "$ENV_NAME" \
    "$SSH_HOST" \
    "$TARGET_BASE" \
    "$SERVER_PORT" \
    > "$SSH_REMOTE_LOG" 2>&1
SSH_EXIT=$?
set -e

# Forward remote output into deploy.log
if [[ -s "$SSH_REMOTE_LOG" ]]; then
  while IFS= read -r line; do
    [[ -n "${line// }" ]] && log_info "  ${line}"
  done < "$SSH_REMOTE_LOG"
  cat "$SSH_REMOTE_LOG" >> "$SSH_LOG" 2>/dev/null || true
fi

if [[ $SSH_EXIT -ne 0 ]]; then
  if [[ $SSH_EXIT -eq 70 ]]; then
    log_error "No last-successful backup found on target server."
    log_error "A successful deployment must have completed before rollback is available."
  else
    log_error "Remote rollback failed (exit code: ${SSH_EXIT})"
  fi
  exit $EXIT_REMOTE_FAILED
fi

log_section "Rollback completed successfully"
log_info "${APP_NAME} (${ENV_NAME}) rolled back to last successful state on ${SSH_HOST}:${SERVER_PORT}"
exit 0
