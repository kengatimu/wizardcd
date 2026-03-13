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

cp "$CONFIG_FILE" "${INPUT_DIR}/deployment-config.yml"
export WIZARDCONFIG="${INPUT_DIR}/deployment-config.yml"

# ---------------------------------------------------------------
# NOW load helpers (safe — required variables are set)
# ---------------------------------------------------------------
source "${SCRIPT_DIR}/helpers.sh"

log_section "Deployment Job Initialized"
log_info "Job ID: ${JOB_ID}"

# -----------------------------------------------------------
# Ensure yq v4.44.3 is installed (strict enforcement)
#
# WizardCD is pinned to yq v4.44.3 for deterministic parsing.
# Any other version will be replaced.
# -----------------------------------------------------------
ensure_yq_installed() {
  local required_version="v4.44.3"
  local install_path="/usr/local/bin/yq"
  local tmp_binary="/tmp/yq"

  local current_version=""

  if command -v yq >/dev/null 2>&1; then
    current_version="$(yq --version 2>/dev/null | awk '{print $NF}' || true)"
  fi

  # -------------------------------------------------------
  # If exact required version is already installed → exit
  # -------------------------------------------------------
  if [[ "$current_version" == "$required_version" ]]; then
    log_info "yq ${required_version} already installed."
    return 0
  fi

  log_warn "Forcing yq ${required_version} installation (detected: ${current_version:-none})"

  # -------------------------------------------------------
  # Validate curl dependency
  # -------------------------------------------------------
  if ! command -v curl >/dev/null 2>&1; then
    log_error "curl is required to install yq automatically."
    exit $EXIT_INVALID_ARGS
  fi

  # -------------------------------------------------------
  # Download pinned binary
  # -------------------------------------------------------
  local yq_url="https://github.com/mikefarah/yq/releases/download/${required_version}/yq_linux_amd64"

  curl -L "$yq_url" -o "$tmp_binary" || {
    log_error "Failed to download yq ${required_version}"
    exit $EXIT_INVALID_ARGS
  }

  chmod +x "$tmp_binary"

  # -------------------------------------------------------
  # Overwrite existing yq binary
  # -------------------------------------------------------
  if [[ "$EUID" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo mv "$tmp_binary" "$install_path"
    else
      log_error "Root or sudo privileges required to install yq."
      exit $EXIT_INVALID_ARGS
    fi
  else
    mv "$tmp_binary" "$install_path"
  fi

  log_info "yq ${required_version} installed successfully."
}

# Validate/install yq BEFORE YAML parsing
ensure_yq_installed

# ---------------------------------------------------------------
# Read YAML
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

# ---------------------------------------------------------------
# Backup configuration
# ---------------------------------------------------------------
BACKUP_ENABLED="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.backup.perform_backup // \"true\"" "${INPUT_DIR}/deployment-config.yml")"
MAX_BACKUPS="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.backup.max_backups // 5" "${INPUT_DIR}/deployment-config.yml")"

# ---------------------------------------------------------------
# Extra directories (name → absolute target path on server)
# Each entry has {dir_name, target_path}.  After the main tarball
# transfer, deploy.sh scps each dir to its absolute targetPath —
# identical in mechanism to cert_paths but for general-purpose dirs.
# ---------------------------------------------------------------
EXTRA_DIRS_COUNT="$(yq -r "(.apps.${APP_NAME}.${ENV_NAME}.build.extra_dirs // []) | length" "${INPUT_DIR}/deployment-config.yml" 2>/dev/null || echo 0)"

# ---------------------------------------------------------------
# Certificate / keystore path count
# Each entry has {source, targetPath}. After the main tarball
# transfer, deploy.sh scps each source dir to its targetPath.
# ---------------------------------------------------------------
CERT_PATHS_COUNT="$(yq -r "(.apps.${APP_NAME}.${ENV_NAME}.build.cert_paths // []) | length" "${INPUT_DIR}/deployment-config.yml")"

if [[ "$BACKUP_ENABLED" != "true" && "$BACKUP_ENABLED" != "false" ]]; then
  BACKUP_ENABLED="true"
fi

if [[ -z "$MAX_BACKUPS" || "$MAX_BACKUPS" -lt 1 ]]; then
  MAX_BACKUPS=5
fi

export LOG_MAX_SIZE LOG_MAX_FILES

log_info "Configuration loaded for ${APP_NAME} (${ENV_NAME})"
log_info "Backup enabled: ${BACKUP_ENABLED}"
log_info "Max backups: ${MAX_BACKUPS}"

# ---------------------------------------------------------------
# Validate local build artifacts
# ---------------------------------------------------------------
FULL_JAR="${INPUT_DIR}/${JAR_NAME}"
FULL_LIB="${INPUT_DIR}/lib"

[[ -f "$FULL_JAR" ]] || {
  log_error "Missing application JAR in job input: ${FULL_JAR}"
  exit $EXIT_ARTIFACT_MISSING
}

[[ -d "$FULL_LIB" || ! -e "$FULL_LIB" ]] || {
  log_error "Invalid lib directory: ${FULL_LIB}"
  exit $EXIT_ARTIFACT_MISSING
}

log_info "Local build artifacts validated"

# ---------------------------------------------------------------
# Generate Tanuki wrapper configuration
# ---------------------------------------------------------------
log_section "Generating Tanuki wrapper configuration"

bash "${SCRIPT_DIR}/generate-tanuki-wrapper-conf.sh" \
  --app "$APP_NAME" \
  --env "$ENV_NAME" \
  >> "$DEPLOY_LOG" 2>&1 || {
    log_error "Wrapper generation failed"
    exit $EXIT_WRAPPER_FAILED
  }

# ---------------------------------------------------------------
# Stage Tanuki wrapper into job workspace
# ---------------------------------------------------------------
mkdir -p "${WRAPPER_DIR}/tanuki"
cp -r "${SCRIPT_DIR}/wrappers/tanuki/"* "${WRAPPER_DIR}/tanuki/"

# ---------------------------------------------------------------
# Package deployment artifacts (CORRECT STRUCTURE)
# ---------------------------------------------------------------
log_section "Packaging deployment artifacts"

TARBALL="${BUILD_DIR}/${APP_NAME}-${ENV_NAME}.tar.gz"

STAGE_DIR="${BUILD_DIR}/stage"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/bin" "$STAGE_DIR/conf" "$STAGE_DIR/lib"

cp "$FULL_JAR" "$STAGE_DIR/bin/$JAR_NAME"

if [[ -d "$FULL_LIB" ]]; then
  mkdir -p "$STAGE_DIR/bin/lib"
  cp -r "$FULL_LIB/"* "$STAGE_DIR/bin/lib/" 2>/dev/null || true
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
    log_error "Artifact packaging failed"
    exit $EXIT_PACKAGE_FAILED
  }

# ---------------------------------------------------------------
# Copy artifacts to target VM
# ---------------------------------------------------------------
log_section "Transferring artifacts to target VM"
log_info "Target: ${SSH_HOST}:${SSH_PORT}"

scp -i "$SSH_KEY" -P "$SSH_PORT" "$TARBALL" "${SSH_USER}@${SSH_HOST}:/tmp/${APP_NAME}-${ENV_NAME}.tar.gz" \
  >> "$SSH_LOG" 2>&1 || {
    log_error "SCP transfer failed"
    exit $EXIT_SCP_FAILED
  }

# ---------------------------------------------------------------
# Transfer certificate / keystore paths to custom server locations.
# Each cert_paths entry specifies a source directory (relative to
# INPUT_DIR) and an absolute targetPath on the server.
# The directories are transferred independently of the main tarball
# so they can land anywhere on the filesystem (e.g. /opt/certs).
# ---------------------------------------------------------------
if [[ "$CERT_PATHS_COUNT" -gt 0 ]]; then
  log_section "Transferring certificate paths"
  for (( ci=0; ci<CERT_PATHS_COUNT; ci++ )); do
    CERT_SRC="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.build.cert_paths[${ci}].source" "${INPUT_DIR}/deployment-config.yml")"
    CERT_TARGET="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.build.cert_paths[${ci}].targetPath" "${INPUT_DIR}/deployment-config.yml")"
    CERT_LOCAL="${INPUT_DIR}/${CERT_SRC}"

    if [[ -d "$CERT_LOCAL" ]]; then
      log_info "Transferring certs: ${CERT_SRC} → ${CERT_TARGET}"
      # Ensure target directory exists on server
      ssh -i "$SSH_KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=no \
        "${SSH_USER}@${SSH_HOST}" \
        "mkdir -p '${CERT_TARGET}'" \
        >> "$SSH_LOG" 2>&1 \
        || log_warn "Could not create ${CERT_TARGET} on server (may already exist)"

      # Transfer contents of the source dir into targetPath
      scp -i "$SSH_KEY" -P "$SSH_PORT" -r "${CERT_LOCAL}/." \
        "${SSH_USER}@${SSH_HOST}:${CERT_TARGET}/" \
        >> "$SSH_LOG" 2>&1 \
        || log_warn "Failed to transfer cert path ${CERT_SRC} → ${CERT_TARGET}"

      log_info "Cert transfer complete: ${CERT_SRC} → ${CERT_TARGET}"
    else
      log_warn "Cert source directory not found, skipping: ${CERT_LOCAL}"
    fi
  done
fi

# ---------------------------------------------------------------
# Transfer extra directories to custom server locations.
# Each extra_dirs entry specifies a dir_name (relative to INPUT_DIR)
# and an absolute target_path on the server.
# Transferred independently of the main tarball — identical in
# mechanism to cert_paths but for general-purpose directories.
# ---------------------------------------------------------------
if [[ "$EXTRA_DIRS_COUNT" -gt 0 ]]; then
  log_section "Transferring extra directories"
  for (( di=0; di<EXTRA_DIRS_COUNT; di++ )); do
    EXTRA_DIR_NAME="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.build.extra_dirs[${di}].dir_name" "${INPUT_DIR}/deployment-config.yml")"
    EXTRA_DIR_TARGET="$(yq -r ".apps.${APP_NAME}.${ENV_NAME}.build.extra_dirs[${di}].target_path" "${INPUT_DIR}/deployment-config.yml")"
    EXTRA_LOCAL="${INPUT_DIR}/${EXTRA_DIR_NAME}"

    if [[ -d "$EXTRA_LOCAL" ]]; then
      log_info "Transferring extra dir: ${EXTRA_DIR_NAME} → ${EXTRA_DIR_TARGET}"
      # Ensure target directory exists on server
      ssh -i "$SSH_KEY" -p "$SSH_PORT" -o StrictHostKeyChecking=no \
        "${SSH_USER}@${SSH_HOST}" \
        "mkdir -p '${EXTRA_DIR_TARGET}'" \
        >> "$SSH_LOG" 2>&1 \
        || log_warn "Could not create ${EXTRA_DIR_TARGET} on server (may already exist)"

      # Transfer contents of the source dir into target_path
      scp -i "$SSH_KEY" -P "$SSH_PORT" -r "${EXTRA_LOCAL}/." \
        "${SSH_USER}@${SSH_HOST}:${EXTRA_DIR_TARGET}/" \
        >> "$SSH_LOG" 2>&1 \
        || log_warn "Failed to transfer extra dir ${EXTRA_DIR_NAME} → ${EXTRA_DIR_TARGET}"

      log_info "Extra dir transfer complete: ${EXTRA_DIR_NAME} → ${EXTRA_DIR_TARGET}"
    else
      log_warn "Extra directory not found in input, skipping: ${EXTRA_LOCAL}"
    fi
  done
fi

# ---------------------------------------------------------------
# Execute remote deployment
# ---------------------------------------------------------------
log_section "Executing remote deployment"

ssh -i "$SSH_KEY" -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "bash -s" \
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
  >> "$SSH_LOG" 2>&1 || {
    log_error "Remote deployment failed"
    exit $EXIT_REMOTE_FAILED
  }

log_section "Deployment completed successfully"
exit 0
