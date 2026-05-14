#!/usr/bin/env bash
set -euo pipefail

# ===============================================================
# WizardCD Web Runner - deploy.sh
#
# Executes a single deployment job using SSH (Phase 1).
# Designed for runner execution: non-interactive, deterministic,
# and fully job-scoped.
# ===============================================================

# ---------------------------------------------------------------
# Static paths
# ---------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "${SCRIPT_DIR}/../workspace/jobs" && pwd)"

# ---------------------------------------------------------------
# Exit codes (stable contract with runner/orchestrator)
# ---------------------------------------------------------------
EXIT_INVALID_ARGS=10
EXIT_YAML_INVALID=11
EXIT_ARTIFACT_MISSING=12
EXIT_WRAPPER_FAILED=20
EXIT_PACKAGE_FAILED=30
EXIT_SCP_FAILED=40
EXIT_SSH_FAILED=50
EXIT_REMOTE_FAILED=60

# ---------------------------------------------------------------
# Argument parsing (MUST happen before helpers.sh)
# ---------------------------------------------------------------
JOB_ID=""
CONFIG_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job-id)
      JOB_ID="$2"; shift 2 ;;
    --config)
      CONFIG_FILE="$2"; shift 2 ;;
    *)
      echo "[ERROR] Unknown argument: $1"
      exit $EXIT_INVALID_ARGS ;;
  esac
done

if [[ -z "$JOB_ID" || -z "$CONFIG_FILE" ]]; then
  echo "[ERROR] Usage: deploy.sh --job-id <job-id> --config <absolute-path>"
  exit $EXIT_INVALID_ARGS
fi

if [[ "${CONFIG_FILE:0:1}" != "/" || ! -f "$CONFIG_FILE" ]]; then
  echo "[ERROR] Config file must be an absolute path and must exist"
  exit $EXIT_INVALID_ARGS
fi

# ---------------------------------------------------------------
# Job workspace setup (required BEFORE helpers.sh)
# ---------------------------------------------------------------
JOB_DIR="${WORKSPACE_ROOT}/${JOB_ID}"
INPUT_DIR="${JOB_DIR}/input"
BUILD_DIR="${JOB_DIR}/build"
WRAPPER_DIR="${JOB_DIR}/wrappers"
LOG_DIR="${JOB_DIR}/logs"

mkdir -p "$INPUT_DIR" "$BUILD_DIR" "$WRAPPER_DIR" "$LOG_DIR"

DEPLOY_LOG="${LOG_DIR}/deploy.log"
PACKAGE_LOG="${LOG_DIR}/package.log"
SSH_LOG="${LOG_DIR}/ssh.log"

export JOB_ID
export JOB_DIR
export LOG_DIR
export DEPLOY_LOG
export PACKAGE_LOG
export SSH_LOG

# Copy config into INPUT_DIR only when it is not already there.
# The Java runner writes deployment-config.yml directly into INPUT_DIR and then
# passes that same path as --config, so source == destination.  Skipping the cp
# in that case avoids the "same file" error without changing behaviour.
if [[ "$CONFIG_FILE" != "${INPUT_DIR}/deployment-config.yml" ]]; then
  cp "$CONFIG_FILE" "${INPUT_DIR}/deployment-config.yml"
fi
export WIZARDCONFIG="${INPUT_DIR}/deployment-config.yml"

# ---------------------------------------------------------------
# NOW load helpers (safe — required variables are set)
# ---------------------------------------------------------------
source "${SCRIPT_DIR}/helpers.sh"

# -----------------------------------------------------------
# Validate yq is present and on a compatible major version.
#
# Why this changed (2026-05-14):
#   The previous implementation pinned an EXACT version (v4.44.3) and
#   attempted an auto-install of the Linux binary via `sudo mv` when it
#   didn't match. Two problems:
#
#     1. The runner spawns deploy.sh without a TTY, so sudo cannot prompt
#        for a password — it fails with "a terminal is required to read
#        the password" and aborts the deploy. This is exactly how local
#        Mac runs (and most CI contexts) break.
#
#     2. The download URL was hard-coded to `yq_linux_amd64`, which is a
#        Linux ELF binary. Installing it onto macOS leaves a broken yq.
#
#   yq v4 follows a stable command syntax — any v4.x release will parse
#   our deployment-config.yml correctly. So the contract is simply:
#   "we need yq v4". If it's missing, we tell the user how to install it
#   for their OS instead of trying to do it under sudo in the background.
# -----------------------------------------------------------
readonly YQ_REFERENCE_VERSION="v4.44.3"      # the version the project is developed against

ensure_yq_installed() {
  if ! command -v yq >/dev/null 2>&1; then
    log_error "yq is not installed or not on PATH."
    case "$(uname -s)" in
      Darwin) log_error "Install with: brew install yq" ;;
      Linux)  log_error "Install with: sudo curl -L https://github.com/mikefarah/yq/releases/download/${YQ_REFERENCE_VERSION}/yq_linux_amd64 -o /usr/local/bin/yq && sudo chmod +x /usr/local/bin/yq" ;;
      *)      log_error "Install yq v4.x from https://github.com/mikefarah/yq/releases" ;;
    esac
    exit $EXIT_INVALID_ARGS
  fi

  # Extract a clean "X.Y.Z" — yq prints e.g. "yq (https://github.com/...) version v4.48.1"
  local raw current major
  raw="$(yq --version 2>/dev/null || true)"
  current="${raw##* }"     # last whitespace-separated token: "v4.48.1"
  current="${current#v}"   # strip leading "v"
  major="${current%%.*}"

  if [[ "$major" != "4" ]]; then
    log_error "yq v4.x required (developed against ${YQ_REFERENCE_VERSION}). Detected: ${current:-unknown}"
    log_error "Replace your yq with a v4.x release: https://github.com/mikefarah/yq/releases"
    exit $EXIT_INVALID_ARGS
  fi

  if [[ "v${current}" != "$YQ_REFERENCE_VERSION" ]]; then
    log_info "yq v${current} detected — compatible (reference version is ${YQ_REFERENCE_VERSION}, any v4.x works)."
  fi
}

# ---------------------------------------------------------------
# Validate/install yq BEFORE YAML parsing
# ---------------------------------------------------------------
ensure_yq_installed

# ---------------------------------------------------------------
# Read YAML (all values needed before first log_section)
# ---------------------------------------------------------------
APP_NAME="$(yq -r '.apps | keys[0]' "${INPUT_DIR}/deployment-config.yml")"
ENV_NAME="$(yq -r ".apps.${APP_NAME} | keys[0]" "${INPUT_DIR}/deployment-config.yml")"

DEPLOY_TYPE="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.type" "${INPUT_DIR}/deployment-config.yml")"
[[ "$DEPLOY_TYPE" == "direct_vm" ]] || {
  log_error "Unsupported deployment type: ${DEPLOY_TYPE}"
  exit $EXIT_YAML_INVALID
}

JAVA_VERSION="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.java.version" "${INPUT_DIR}/deployment-config.yml")"
SSH_USER="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.user" "${INPUT_DIR}/deployment-config.yml")"
SSH_HOST="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.host" "${INPUT_DIR}/deployment-config.yml")"
SSH_PORT="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.port" "${INPUT_DIR}/deployment-config.yml")"
RUN_AS_USER="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.runtime.run_as_user" "${INPUT_DIR}/deployment-config.yml")"
SERVER_PORT="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.runtime.server_port" "${INPUT_DIR}/deployment-config.yml")"
SSH_KEY="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.ssh.privateKeyPath" "${INPUT_DIR}/deployment-config.yml")"
TARGET_BASE="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment.target.base_path" "${INPUT_DIR}/deployment-config.yml")"
JAR_NAME="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.app.jar_name" "${INPUT_DIR}/deployment-config.yml")"
LOG_MAX_SIZE="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.logging.max_size" "${INPUT_DIR}/deployment-config.yml")"
LOG_MAX_FILES="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.logging.max_files" "${INPUT_DIR}/deployment-config.yml")"

BACKUP_ENABLED="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.backup.perform_backup // \"true\"" "${INPUT_DIR}/deployment-config.yml")"
MAX_BACKUPS="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.backup.max_backups // 5" "${INPUT_DIR}/deployment-config.yml")"
STABILITY_WINDOW="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.deployment_options.stability_window // 20" "${INPUT_DIR}/deployment-config.yml")"

EXTRA_DIRS_COUNT="$(yq -r "(.apps.${APP_NAME}.${ENV_NAME}.build.extra_dirs // []) | length" "${INPUT_DIR}/deployment-config.yml" 2>/dev/null || echo 0)"
CERT_PATHS_COUNT="$(yq -r "(.apps.${APP_NAME}.${ENV_NAME}.build.cert_paths // []) | length" "${INPUT_DIR}/deployment-config.yml")"

if [[ "$BACKUP_ENABLED" != "true" && "$BACKUP_ENABLED" != "false" ]]; then
  BACKUP_ENABLED="true"
fi

if [[ -z "$MAX_BACKUPS" || "$MAX_BACKUPS" -lt 1 ]]; then
  MAX_BACKUPS=5
fi

if [[ -z "$STABILITY_WINDOW" || "$STABILITY_WINDOW" -lt 5 ]]; then
  STABILITY_WINDOW=20
fi

export LOG_MAX_SIZE LOG_MAX_FILES

# ---------------------------------------------------------------
# Phase 1: Deployment Job Initialized
# Now that YAML is read, log full job context upfront.
# ---------------------------------------------------------------
log_section "Deployment Job Initialized"

log_info "Job ID:         ${JOB_ID}"
log_info "Application:    ${APP_NAME}"
log_info "Environment:    ${ENV_NAME}"
log_info "Target:         ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"
log_info "Deploy path:    ${TARGET_BASE}/${APP_NAME}"
log_info "JAR artifact:   ${JAR_NAME}"
log_info "Java version:   ${JAVA_VERSION}"

if [[ "$BACKUP_ENABLED" == "true" ]]; then
  log_info "Backup:         enabled (retain last ${MAX_BACKUPS} releases)"
else
  log_info "Backup:         disabled"
fi
log_info "Stability:      ${STABILITY_WINDOW}s monitoring window"

if [[ "$CERT_PATHS_COUNT" -gt 0 ]]; then
  log_info "Cert paths:     ${CERT_PATHS_COUNT} configured"
fi

if [[ "$EXTRA_DIRS_COUNT" -gt 0 ]]; then
  log_info "Extra dirs:     ${EXTRA_DIRS_COUNT} configured"
fi

log_info "yq:             $(yq --version 2>/dev/null | awk '{print $NF}')"

# ---------------------------------------------------------------
# Validate local build artifacts
# ---------------------------------------------------------------
FULL_JAR="${INPUT_DIR}/${JAR_NAME}"
FULL_LIB="${INPUT_DIR}/lib"

[[ -f "$FULL_JAR" ]] || {
  log_error "Missing application JAR in job workspace: ${JAR_NAME}"
  exit $EXIT_ARTIFACT_MISSING
}

[[ -d "$FULL_LIB" || ! -e "$FULL_LIB" ]] || {
  log_error "Invalid lib directory: ${FULL_LIB}"
  exit $EXIT_ARTIFACT_MISSING
}

JAR_SIZE="$(du -sh "$FULL_JAR" 2>/dev/null | cut -f1)"
log_info "JAR verified:   ${JAR_NAME} (${JAR_SIZE})"

if [[ -d "$FULL_LIB" ]]; then
  LIB_COUNT="$(ls "$FULL_LIB" | wc -l | tr -d ' ')"
  log_info "Lib verified:   ${LIB_COUNT} dependency JAR(s)"
fi

log_info "Deployment configuration verified"

# ---------------------------------------------------------------
# Generate Tanuki wrapper configuration
# ---------------------------------------------------------------
log_section "Generating Tanuki wrapper configuration"

# The child script sources helpers.sh and logs directly to DEPLOY_LOG via tee.
# Stdout is suppressed here to prevent duplicate log lines (helpers.sh tee writes
# to DEPLOY_LOG, and the >> redirect would write the same line a second time).
bash "${SCRIPT_DIR}/generate-tanuki-wrapper-conf.sh" \
  --app "$APP_NAME" \
  --env "$ENV_NAME" \
  > /dev/null || {
    log_error "Tanuki wrapper generation failed for ${APP_NAME} (${ENV_NAME})"
    exit $EXIT_WRAPPER_FAILED
  }

# ---------------------------------------------------------------
# Stage Tanuki wrapper into job workspace
# ---------------------------------------------------------------
mkdir -p "${WRAPPER_DIR}/tanuki"
cp -r "${SCRIPT_DIR}/wrappers/tanuki/"* "${WRAPPER_DIR}/tanuki/"

# ---------------------------------------------------------------
# Package deployment artifacts
# ---------------------------------------------------------------
log_section "Packaging deployment artifacts"

TARBALL="${BUILD_DIR}/${APP_NAME}-${ENV_NAME}.tar.gz"
STAGE_DIR="${BUILD_DIR}/stage"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/bin" "$STAGE_DIR/conf" "$STAGE_DIR/lib"

log_info "Staging artifacts:"
log_info "  Application JAR: ${JAR_NAME} (${JAR_SIZE})"

if [[ -d "$FULL_LIB" ]]; then
  log_info "  Library dependencies: ${LIB_COUNT} JAR(s)"
fi

log_info "  Tanuki config:  ${APP_NAME}-${ENV_NAME}.conf"
log_info "  Tanuki wrapper: ${APP_NAME}-wrapper.sh"

cp "$FULL_JAR" "$STAGE_DIR/bin/$JAR_NAME"

if [[ -d "$FULL_LIB" ]]; then
  mkdir -p "$STAGE_DIR/bin/lib"
  # Use find to flatten any nested directory structure in the lib ZIP.
  # If the user packaged with 'zip -r lib.zip lib/' the ZIP contains a
  # 'lib/' subdirectory inside INPUT_DIR/lib/, which would otherwise
  # produce bin/lib/lib/*.jar instead of bin/lib/*.jar.
  find "$FULL_LIB" -name "*.jar" -exec cp {} "$STAGE_DIR/bin/lib/" \; 2>/dev/null || true
fi

cp "${WRAPPER_DIR}/tanuki/configs/${APP_NAME}-wrapper.sh" \
   "$STAGE_DIR/bin/${APP_NAME}-wrapper.sh"
chmod +x "$STAGE_DIR/bin/${APP_NAME}-wrapper.sh"

cp "${WRAPPER_DIR}/tanuki/configs/${APP_NAME}-${ENV_NAME}.conf" \
   "$STAGE_DIR/conf/${APP_NAME}-${ENV_NAME}.conf"

cp "${WRAPPER_DIR}/tanuki/bin/wrapper" "$STAGE_DIR/bin/wrapper"
cp "${WRAPPER_DIR}/tanuki/lib/wrapper.jar" "$STAGE_DIR/lib/wrapper.jar"
cp "${WRAPPER_DIR}/tanuki/lib/libwrapper.so" "$STAGE_DIR/lib/libwrapper.so"

tar -czf "$TARBALL" -C "$STAGE_DIR" . \
  >> "$PACKAGE_LOG" 2>&1 || {
    log_error "Artifact packaging failed — check package.log for details"
    exit $EXIT_PACKAGE_FAILED
  }

TARBALL_SIZE="$(du -sh "$TARBALL" 2>/dev/null | cut -f1)"
log_info "Package ready:  ${APP_NAME}-${ENV_NAME}.tar.gz (${TARBALL_SIZE})"

# ---------------------------------------------------------------
# Transfer deployment package to target VM
# ---------------------------------------------------------------
log_section "Transferring artifacts to target VM"

log_info "Package:     ${APP_NAME}-${ENV_NAME}.tar.gz (${TARBALL_SIZE})"
log_info "Destination: ${SSH_USER}@${SSH_HOST}:${SSH_PORT}"
log_info "Remote path: /tmp/${APP_NAME}-${ENV_NAME}.tar.gz"

SCP_ERR=$(scp -i "$SSH_KEY" -P "$SSH_PORT" \
    -o StrictHostKeyChecking=no \
    "$TARBALL" "${SSH_USER}@${SSH_HOST}:/tmp/${APP_NAME}-${ENV_NAME}.tar.gz" \
    2>&1 | tee -a "$SSH_LOG") || {
      log_error "Package transfer failed — ${SCP_ERR:-verify SSH connectivity and disk space on target}"
      exit $EXIT_SCP_FAILED
    }

log_info "Package transferred successfully"

# ---------------------------------------------------------------
# Transfer certificate / keystore paths
# ---------------------------------------------------------------
if [[ "$CERT_PATHS_COUNT" -gt 0 ]]; then
  log_section "Transferring certificate paths"

  for (( ci=0; ci<CERT_PATHS_COUNT; ci++ )); do
    CERT_SRC="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.build.cert_paths[${ci}].source" "${INPUT_DIR}/deployment-config.yml")"
    CERT_TARGET="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.build.cert_paths[${ci}].targetPath" "${INPUT_DIR}/deployment-config.yml")"
    CERT_LOCAL="${INPUT_DIR}/${CERT_SRC}"

    if [[ -d "$CERT_LOCAL" ]]; then
      log_info "Transferring certs [${ci}]: ${CERT_SRC} → ${CERT_TARGET}"

      tar -czf - -C "${CERT_LOCAL}" . 2>>"$SSH_LOG" \
        | ssh -i "$SSH_KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=no \
            "${SSH_USER}@${SSH_HOST}" \
            "mkdir -p '${CERT_TARGET}' && tar -xzf - -C '${CERT_TARGET}'" \
            >> "$SSH_LOG" 2>&1 || {
          log_error "Certificate transfer failed: ${CERT_SRC} → ${CERT_TARGET}"
          log_error "  → Verify SSH connectivity, disk space, and permissions on target"
          exit $EXIT_SCP_FAILED
        }

      log_info "Cert transfer complete [${ci}]: ${CERT_SRC} → ${CERT_TARGET}"
    else
      log_error "Cert source not found in workspace: '${CERT_SRC}'"
      log_error "  → The cert ZIP must be uploaded in Step 6 of the deployment wizard"
      log_error "  → Aborting deployment — cert files are required but were not provided"
      exit $EXIT_SCP_FAILED
    fi
  done
fi

# ---------------------------------------------------------------
# Transfer extra directories
# ---------------------------------------------------------------
if [[ "$EXTRA_DIRS_COUNT" -gt 0 ]]; then
  log_section "Transferring extra directories"

  for (( di=0; di<EXTRA_DIRS_COUNT; di++ )); do
    EXTRA_DIR_NAME="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.build.extra_dirs[${di}].dir_name" "${INPUT_DIR}/deployment-config.yml")"
    EXTRA_DIR_TARGET="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.build.extra_dirs[${di}].target_path" "${INPUT_DIR}/deployment-config.yml")"
    EXTRA_LOCAL="${INPUT_DIR}/${EXTRA_DIR_NAME}"

    if [[ -d "$EXTRA_LOCAL" ]]; then
      log_info "Transferring extra dir [${di}]: ${EXTRA_DIR_NAME} → ${EXTRA_DIR_TARGET}"

      tar -czf - -C "${EXTRA_LOCAL}" . 2>>"$SSH_LOG" \
        | ssh -i "$SSH_KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=no \
            "${SSH_USER}@${SSH_HOST}" \
            "mkdir -p '${EXTRA_DIR_TARGET}' && tar -xzf - -C '${EXTRA_DIR_TARGET}'" \
            >> "$SSH_LOG" 2>&1 || {
          log_error "Extra directory transfer failed: ${EXTRA_DIR_NAME} → ${EXTRA_DIR_TARGET}"
          log_error "  → Verify SSH connectivity, disk space, and permissions on target"
          exit $EXIT_SCP_FAILED
        }

      log_info "Extra dir transfer complete [${di}]: ${EXTRA_DIR_NAME} → ${EXTRA_DIR_TARGET}"
    else
      log_error "Extra directory not found in workspace: '${EXTRA_DIR_NAME}'"
      log_error "  → The directory ZIP must be uploaded in Step 6 of the deployment wizard"
      log_error "  → Aborting deployment — extra directory files are required but were not provided"
      exit $EXIT_SCP_FAILED
    fi
  done
fi

# ---------------------------------------------------------------
# Execute remote deployment
# ---------------------------------------------------------------
log_section "Executing remote deployment"

log_info "Connecting to ${SSH_USER}@${SSH_HOST}:${SSH_PORT} ..."
log_info "Deploying: ${APP_NAME} (${ENV_NAME}) → ${TARGET_BASE}/${APP_NAME}"

SSH_REMOTE_LOG="${LOG_DIR}/ssh-remote.log"
> "$SSH_REMOTE_LOG"

# Stream remote output in real-time so the user sees progress live in the UI.
# Disable ERR trap for this block — pipe + set -e interact badly.
trap - ERR
set +e
ssh -i "$SSH_KEY" -p "$SSH_PORT" \
    -o StrictHostKeyChecking=no \
    -o ConnectTimeout=30 \
    "${SSH_USER}@${SSH_HOST}" "bash -s" \
    < "${SCRIPT_DIR}/application-deployment.sh" \
    "$APP_NAME" \
    "$ENV_NAME" \
    "$SSH_HOST" \
    "$TARGET_BASE" \
    "$SERVER_PORT" \
    "$JAVA_VERSION" \
    "$RUN_AS_USER" \
    "$BACKUP_ENABLED" \
    "$MAX_BACKUPS" \
    "$STABILITY_WINDOW" \
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
trap 'log_error "Deploy failed on line $LINENO (exit code $?)"; exit 1' ERR

# Also archive to ssh.log for full audit trail
cat "$SSH_REMOTE_LOG" >> "$SSH_LOG" 2>/dev/null || true

if [[ $SSH_EXIT -ne 0 ]]; then
  log_error "Remote deployment failed (exit code: ${SSH_EXIT})"
  exit $EXIT_REMOTE_FAILED
fi

log_section "Cleanup"
log_info "Removing local build artifacts..."
rm -rf "$BUILD_DIR" 2>/dev/null || true
log_info "Local workspace cleaned"
log_info ""
log_info "${APP_NAME} (${ENV_NAME}) is running on ${SSH_HOST}:${SERVER_PORT}"
log_info "Deployment completed successfully"
exit 0
