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
#   40 — SSH/SCP failed
#   60 — Remote rollback failed
#   70 — No last-successful backup on target
# ==================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Exit code constants
EXIT_INVALID_ARGS=10
EXIT_YAML_INVALID=11
EXIT_SSH_FAILED=40
EXIT_REMOTE_FAILED=60

# --------------------------------------------------
# Parse arguments (BEFORE sourcing helpers.sh)
# --------------------------------------------------
JOB_ID=""
CONFIG_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job-id)  JOB_ID="$2";     shift 2 ;;
    --config)  CONFIG_FILE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit $EXIT_INVALID_ARGS ;;
  esac
done

if [[ -z "$JOB_ID" || -z "$CONFIG_FILE" ]]; then
  echo "Usage: $0 --job-id <uuid> --config <path>" >&2
  exit $EXIT_INVALID_ARGS
fi

# --------------------------------------------------
# Resolve workspace and set required variables for helpers.sh
# --------------------------------------------------
WORKSPACE_ROOT="$(dirname "$(dirname "$CONFIG_FILE")")"
LOG_DIR="${WORKSPACE_ROOT}/logs"
mkdir -p "$LOG_DIR"

JOB_DIR="${WORKSPACE_ROOT}"
DEPLOY_LOG="${LOG_DIR}/deploy.log"

export JOB_ID JOB_DIR LOG_DIR DEPLOY_LOG

# Now source helpers (all required vars are set)
source "${SCRIPT_DIR}/helpers.sh"

trap 'log_error "Rollback orchestrator failed on line $LINENO (exit code $?)"; exit 1' ERR

WIZARD_LOG_FILE="${DEPLOY_LOG}"
export WIZARD_LOG_FILE

SSH_LOG="${LOG_DIR}/ssh.log"
touch "$SSH_LOG"

# ==================================================
# Phase 1: Rollback Job Initialized
# ==================================================
log_section "Rollback Job Initialized"
log_info "Job ID:         ${JOB_ID}"
log_info "Type:           ROLLBACK (restore last successful deployment)"

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

SSH_USER="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.user" "$CONFIG_FILE")"
SSH_HOST="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.host" "$CONFIG_FILE")"
SSH_PORT="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.port" "$CONFIG_FILE")"
SSH_KEY="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.privateKeyPath" "$CONFIG_FILE")"
TARGET_BASE="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.target.base_path" "$CONFIG_FILE")"
SERVER_PORT="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.runtime.server_port" "$CONFIG_FILE")"

log_info "Application:    ${APP_NAME}"
log_info "Environment:    ${ENV_NAME}"
log_info "Target:         ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"
log_info "Rollback path:  ${TARGET_BASE}/${APP_NAME}"
log_info "Server port:    ${SERVER_PORT}"

# ==================================================
# Phase 2: Pre-flight Backup Verification
# ==================================================
log_section "Verifying rollback backup on target"

log_info "Checking last-successful backup on ${SSH_HOST}..."

BACKUP_PATH="${TARGET_BASE}/${APP_NAME}/backup/last-successful/latest.tar.gz"

# SSH to check if backup exists and get its details
set +e
BACKUP_CHECK=$(ssh -i "$SSH_KEY" -p "$SSH_PORT" \
    -o StrictHostKeyChecking=no \
    -o ConnectTimeout=30 \
    -o BatchMode=yes \
    "${SSH_USER}@${SSH_HOST}" "
    if [ -f '${BACKUP_PATH}' ]; then
        SIZE=\$(du -h '${BACKUP_PATH}' | cut -f1)
        DATE=\$(stat -c '%y' '${BACKUP_PATH}' 2>/dev/null | cut -d. -f1 || stat -f '%Sm' '${BACKUP_PATH}' 2>/dev/null || echo 'unknown')
        echo \"FOUND|\${SIZE}|\${DATE}\"
    else
        echo 'NOT_FOUND'
    fi
" 2>/dev/null)
BACKUP_CHECK_EXIT=$?
set -e

if [[ $BACKUP_CHECK_EXIT -ne 0 ]]; then
  log_error "Failed to connect to ${SSH_HOST} — cannot verify backup"
  exit $EXIT_SSH_FAILED
fi

if [[ "$BACKUP_CHECK" == "NOT_FOUND" ]]; then
  log_error "No last-successful backup found at: ${BACKUP_PATH}"
  log_error "A successful deployment with stability verification must have completed first."
  log_error "Rollback is only available after at least one successful deployment."
  exit $EXIT_REMOTE_FAILED
fi

# Parse backup details
IFS='|' read -r _status BACKUP_SIZE BACKUP_DATE <<< "$BACKUP_CHECK"
log_info "✓ Last-successful backup exists"
log_info "  Path:    ${BACKUP_PATH}"
log_info "  Size:    ${BACKUP_SIZE}"
log_info "  Created: ${BACKUP_DATE}"
log_info ""
log_info "This rollback will restore the application to the state captured"
log_info "in the backup above. The current deployment will be replaced."
log_info ""
log_info "Pre-flight check passed — proceeding with rollback"

# ==================================================
# Phase 3: Executing Remote Rollback
# ==================================================
log_section "Executing remote rollback"

log_info "Connecting to ${SSH_USER}@${SSH_HOST}:${SSH_PORT} ..."
log_info "Rolling back ${APP_NAME} (${ENV_NAME}) from backup created ${BACKUP_DATE}"
log_info "Target: ${TARGET_BASE}/${APP_NAME}"
log_info ""

SSH_REMOTE_LOG="${LOG_DIR}/ssh-remote.log"
> "$SSH_REMOTE_LOG"

# Stream remote output in real-time via a pipe so the user sees progress live
# Disable ERR trap for this block — pipe + set -e interact badly
trap - ERR
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
    2>&1 | {
      STABILITY_EMITTED=false
      while IFS= read -r line; do
        echo "$line" >> "$SSH_REMOTE_LOG"
        if [[ -n "${line// }" ]]; then
          # Detect stability phase start (port wait or monitoring) and emit a new section header
          if [[ "$STABILITY_EMITTED" == "false" ]]; then
            if echo "$line" | grep -qi "Waiting for port\|Monitoring for.*to verify stability"; then
              STABILITY_EMITTED=true
              log_section "Stability check"
            fi
          fi
          log_info "  ${line}"
        fi
      done
    }
SSH_EXIT=${PIPESTATUS[0]}
set -e
trap 'log_error "Rollback orchestrator failed on line $LINENO (exit code $?)"; exit 1' ERR

# Also archive to ssh.log
cat "$SSH_REMOTE_LOG" >> "$SSH_LOG" 2>/dev/null || true

if [[ $SSH_EXIT -ne 0 ]]; then
  if [[ $SSH_EXIT -eq 70 ]]; then
    log_error "No last-successful backup found on target server."
    log_error "A successful deployment must have completed before rollback is available."
  else
    log_error "Remote rollback failed (exit code: ${SSH_EXIT})"
  fi
  exit $EXIT_REMOTE_FAILED
fi

# ==================================================
# Phase 4: Rollback Complete
# ==================================================
log_section "Cleanup"
log_info "Rollback workspace preserved for audit"
log_info ""
log_info "Summary"
log_info "  Application:   ${APP_NAME} (${ENV_NAME})"
log_info "  Restored from: backup created ${BACKUP_DATE}"
log_info "  Running on:    ${SSH_HOST}:${SERVER_PORT}"
log_info ""
log_info "Rollback completed successfully"
exit 0
