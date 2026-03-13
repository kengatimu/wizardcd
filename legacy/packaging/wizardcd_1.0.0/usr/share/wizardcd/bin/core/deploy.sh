#!/bin/bash
set -euo pipefail # Exit on error, unset variables as error, fail on pipe errors

# ==================================================
# WizardCd - Deployment Orchestrator
#
# This script orchestrates a full deployment:
#   1. Checks dependencies (ssh, scp, yq).
#   2. Loads app + env config from config/deployment-config.yml.
#   3. Generates Tanuki wrapper.conf and wrapper.sh.
#   4. Packages artifacts into a tarball.
#   5. Copies tarball to target VM via scp.
#   6. Executes application-deployment.sh remotely via ssh.
#
# Usage:
#   ./bin/deploy.sh --check-deps
#   ./bin/deploy.sh --app <app_name> --env <environment>
# ==================================================

# --------------------------------------------------
# Usage
# --------------------------------------------------
print_usage() {
  echo "Usage:"
  echo "  $0 --check-deps"
  echo "  $0 --app <app_name> --env <environment>"
  echo "  $0 --target <platform> --app <app_name> --env <environment>"
  exit 1
}

# --------------------------------------------------
# Load WizardCd shared utilities (helpers.sh)
# --------------------------------------------------
load_helpers() {
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local helpers_file="${script_dir}/helpers.sh"

  if [[ -f "$helpers_file" ]]; then
    source "$helpers_file"
  else
    echo "[WARN] WizardCd helpers not found at: $helpers_file"
    echo "Continuing without enhanced logging..."
  fi
}

# --------------------------------------------------
# Early fallback loggers (used before helpers are loaded)
# --------------------------------------------------
log_info()  { echo "[INFO] $*"; }
log_warn()  { echo "[WARN] $*"; }
log_error() { echo "[ERROR] $*" >&2; }

# --------------------------------------------------
# Dependency check
# --------------------------------------------------
check_dependency() {
  local dep=$1
  if ! command -v "$dep" >/dev/null 2>&1; then
    log_error "Missing dependency '$dep'. Please install it:"
    echo
    echo "HINT: MacOS-Homebrew:"
    echo "  sudo brew update"
    echo "  sudo brew install $dep"
    echo
    echo "HINT: Debian/Ubuntu:"
    echo "  sudo apt-get update"
    echo "  sudo apt-get install $dep"
    echo
    echo "HINT: RHEL/CentOS/Fedora:"
    echo "  sudo yum install $dep      # RHEL/CentOS 7"
    echo "  sudo dnf install $dep      # RHEL 8/9, Fedora"
    echo
    exit 1
  fi
}

check_all_dependencies() {
  log_info "Checking required dependencies..."
  check_dependency ssh
  check_dependency scp
  check_dependency yq
  log_info "All dependencies are installed."
}

# --------------------------------------------------
# Parse args
# --------------------------------------------------
if [[ "${1:-}" == "--check-deps" ]]; then
  load_helpers
  check_all_dependencies
  exit 0

# --- NEW: Support wizard deploy --target <platform> --app <app> --env <env> ---
elif [[ "$1" == "--target" ]]; then
  TARGET="$2"
  if [[ "$3" == "--app" && "$5" == "--env" ]]; then
    APP="$4"
    ENV="$6"
  elif [[ "$3" == "--env" && "$5" == "--app" ]]; then
    ENV="$4"
    APP="$6"
  else
    print_usage
  fi
  log_info "Detected deployment target: $TARGET"

# --- Existing legacy syntax ---
elif [[ "$1" == "--app" && "$3" == "--env" ]]; then
  APP="$2"
  ENV="$4"
elif [[ "$1" == "--env" && "$3" == "--app" ]]; then
  ENV="$2"
  APP="$4"
else
  print_usage
fi

# --------------------------------------------------
# Load WizardCd shared utilities (helpers.sh)
# --------------------------------------------------
load_helpers

# Export log context so sub-scripts reuse the same log file
export APP ENV WIZARD_LOG_FILE

# --------------------------------------------------
# Run session separator for log and console
# --------------------------------------------------
: "${APP:=unknown}"
: "${ENV:=local}"
LOG_FILE="logs/deploy-${APP}-${ENV}.log"

# ensure logs directory exists before using tee
mkdir -p "$(dirname "$LOG_FILE")"

{
  echo ""
  echo "=================================================="
  echo "New WizardCd Run - $(date '+%Y-%m-%d %H:%M:%S')"
  echo "App: ${APP} | Env: ${ENV}"
  echo "=================================================="
  echo ""
} | tee -a "$LOG_FILE" >/dev/null

# --------------------------------------------------
# Config
# --------------------------------------------------
CONFIG_FILE="${HOME}/.wizardcd/deployment-config.yml"
if [[ ! -f "$CONFIG_FILE" ]]; then
  CONFIG_FILE="config/deployment-config.yml"
fi

VM_HOST=$(yq -r ".apps.${APP}.${ENV}.vm_host" "$CONFIG_FILE")
VM_PATH=$(yq -r ".apps.${APP}.${ENV}.vm_path" "$CONFIG_FILE")
SERVER_PORT=$(yq -r ".apps.${APP}.${ENV}.server_port" "$CONFIG_FILE")
JAVA_VERSION=$(yq -r ".apps.${APP}.${ENV}.java_version" "$CONFIG_FILE")
JAVA_CMD=$(yq -r ".apps.${APP}.${ENV}.java_cmd" "$CONFIG_FILE")
RUN_AS_USER=$(yq -r ".apps.${APP}.${ENV}.run_as_user" "$CONFIG_FILE")
PROJECT_BASE_PATH=$(yq -r ".apps.${APP}.${ENV}.project_base_path" "$CONFIG_FILE")
JAR_NAME=$(yq -r ".apps.${APP}.${ENV}.build_paths.jar" "$CONFIG_FILE")
LIB_DIR_NAME=$(yq -r ".apps.${APP}.${ENV}.build_paths.lib" "$CONFIG_FILE")

# --------------------------------------------------
# Detect CI/CD deployment mode
# --------------------------------------------------
AZURE_ENABLED=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.enabled" "$CONFIG_FILE" 2>/dev/null || echo "false")

if [[ "$AZURE_ENABLED" == "true" || "${TARGET:-}" == "azure" ]]; then
  log_info "--------------------------------------------------"
  log_info "Azure deployment mode is enabled for $APP ($ENV)"
  log_info "Generating Azure pipeline YAML and triggering build..."
  log_info "--------------------------------------------------"

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  # Step 1: Generate the Azure pipeline YAML dynamically
  if [[ -x "${SCRIPT_DIR}/generate-azure-pipeline.sh" ]]; then
    log_info "Generating Azure pipeline definition from config..."
    bash "${SCRIPT_DIR}/generate-azure-pipeline.sh" "$APP" "$ENV"
    log_info "Azure pipeline YAML generation completed."
  else
    log_error "generate-azure-pipeline.sh not found or not executable."
    exit 1
  fi

  # Step 2: Trigger the Azure pipeline via REST API
  if [[ -x "${SCRIPT_DIR}/trigger-azure-pipeline.sh" ]]; then
    bash "${SCRIPT_DIR}/trigger-azure-pipeline.sh" "$APP" "$ENV"
    log_info "Azure pipeline trigger completed successfully. Exiting local deploy."
    exit 0
  else
    log_error "trigger-azure-pipeline.sh not found or not executable."
    exit 1
  fi
fi

# --------------------------------------------------
# Continue with normal on-prem deployment if Azure not enabled
# --------------------------------------------------
if [[ -z "$VM_HOST" || -z "$VM_PATH" || -z "$SERVER_PORT" || -z "$JAVA_VERSION" || -z "$JAVA_CMD" || -z "$RUN_AS_USER" ]]; then
  log_error "Missing required config for app=$APP env=$ENV"
  exit 1
fi

# --------------------------------------------------
# Local artifact validation (quick pre-check before packaging)
# --------------------------------------------------
if [[ -n "$PROJECT_BASE_PATH" ]]; then
  JAR_PATH="${PROJECT_BASE_PATH}/${JAR_NAME}"
  LIB_PATH="${PROJECT_BASE_PATH}/${LIB_DIR_NAME}"

  log_info "Verifying local build artifacts..."
  if [[ ! -f "$JAR_PATH" ]]; then
    log_error "Application JAR not found at: $JAR_PATH"
    exit 1
  fi
  if [[ ! -d "$LIB_PATH" ]]; then
    log_error "Dependency lib directory not found at: $LIB_PATH"
    exit 1
  fi
  log_info "Local artifacts verified successfully."
else
  log_warn "project_base_path not defined in YAML. Skipping local artifact verification."
fi

# --------------------------------------------------
# Deployment context summary
# --------------------------------------------------
log_info "--------------------------------------------------"
log_info "Starting deployment"
log_info "App:          $APP"
log_info "Environment:  $ENV"
[[ -n "${TARGET:-}" ]] && log_info "Target:       $TARGET"
log_info "VM Host:      $VM_HOST"
log_info "VM Path:      $VM_PATH"
log_info "Server Port:  $SERVER_PORT"
log_info "Java Version: $JAVA_VERSION"
log_info "Run As User:  $RUN_AS_USER"
[[ -n "${PROJECT_BASE_PATH:-}" ]] && log_info "Project Path:  $PROJECT_BASE_PATH"
log_info "--------------------------------------------------"

# --------------------------------------------------
# Resolve absolute base path for internal scripts
# --------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="${SCRIPT_DIR}"

# Detect root directory dynamically (works for Homebrew, DEB, RPM)
if [[ "$CORE_DIR" == *"/bin/core" ]]; then
  ROOT_DIR="$(dirname "$(dirname "$CORE_DIR")")"
elif [[ "$CORE_DIR" == *"/share/wizardcd/bin/core" ]]; then
  ROOT_DIR="$(dirname "$(dirname "$(dirname "$CORE_DIR")")")"
else
  ROOT_DIR="$(dirname "$(dirname "$CORE_DIR")")"
fi

# --------------------------------------------------
# Generate wrapper configs
# --------------------------------------------------
log_info "Generating Tanuki wrapper configs..."
bash "${CORE_DIR}/generate-tanuki-wrapper-conf.sh" --app "$APP" --env "$ENV"
log_info "Wrapper configs generated."

# --------------------------------------------------
# Package artifacts
# --------------------------------------------------
log_info "Packaging artifacts..."
bash "${CORE_DIR}/package-artifacts.sh" "$APP" "$ENV"

# Use absolute path for portability across Brew/Deb/RPM installations
FINAL_TAR="${ROOT_DIR}/build/packages/${APP}-${ENV}.tar.gz"
log_info "Artifacts packaged into $FINAL_TAR"

# --------------------------------------------------
# Copy tarball to VM
# --------------------------------------------------
log_info "Copying tarball to $VM_HOST:/tmp ..."
scp "$FINAL_TAR" "${RUN_AS_USER}@${VM_HOST}:/tmp/"

# --------------------------------------------------
# Execute remote deployment script
# --------------------------------------------------
log_info "Starting remote deployment via application-deployment.sh on $VM_HOST ..."
if ssh "${RUN_AS_USER}@${VM_HOST}" "bash -s" < "${CORE_DIR}/application-deployment.sh" \
  "$APP" "$ENV" "$VM_HOST" "$VM_PATH" "$SERVER_PORT" "$JAVA_VERSION" "$RUN_AS_USER"; then
    log_info "Remote deployment succeeded for $APP ($ENV)"
else
    log_error "Remote deployment FAILED for $APP ($ENV)"
    # Continue to cleanup even if deployment failed
fi

# --------------------------------------------------
# Success
# --------------------------------------------------
log_info "Deployment run completed for $APP ($ENV)"
log_info "--------------------------------------------------"
echo

# --------------------------------------------------
# Always perform local build cleanup (success or failure)
# --------------------------------------------------
cleanup_local_build() {
  if [[ -d "build/packages" && "$(ls -A build/packages 2>/dev/null)" ]]; then
    log_info "--------------------------------------------------"
    log_info "Performing post-deployment cleanup of local build packages..."
    if rm -rf build/packages/*; then
      log_info "Post-deployment cleanup complete: build/packages directory emptied successfully."
    else
      log_warn "Post-deployment cleanup encountered an issue (non-critical)."
    fi
    log_info "--------------------------------------------------"
    echo
  else
    log_info "No local build artifacts found to clean up."
    echo
  fi

  # --------------------------------------------------
  # Additional framework cleanup (always executed)
  # --------------------------------------------------
  if [[ -x "${CORE_DIR}/cleanup-framework.sh" ]]; then
    log_info "Performing full WizardCd framework cleanup..."
    log_info "Calling WizardCd framework cleanup utility: ${CORE_DIR}/cleanup-framework.sh"
    bash "${CORE_DIR}/cleanup-framework.sh" || log_warn "Framework cleanup encountered a non-critical issue."
    log_info "Framework cleanup completed successfully."
  else
    log_warn "cleanup-framework.sh not found or not executable. Skipping framework cleanup."
  fi
}

trap cleanup_local_build EXIT
