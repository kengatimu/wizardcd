#!/bin/bash
set -euo pipefail # Exit on error, unset variables as error, fail on pipe errors

# ==================================================
# WizardCd - Application Deployment (Executed Remotely)
#
# IMPORTANT: This script is designed to run *on the target VM*
# via SSH execution initiated by ./bin/deploy.sh.
#
# Steps:
#   1. Creates required directories under VM path.
#   2. Extracts the uploaded tarball (/tmp/...) into drop/.
#   3. Stops any running process using Tanuki wrapper or port check.
#   4. Backs up old binaries/configs into backup/ (rotating, max 5).
#   5. Copies new artifacts (bin, conf, lib, extras) into place.
#   6. Starts the application with Tanuki wrapper.
#   7. Cleans up temporary drop/ and uploaded tarball.
# ==================================================

# --------------------------------------------------
# Load WizardCd Shared Utilities
# --------------------------------------------------
if [[ -v BASH_SOURCE && -f "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/helpers.sh" ]]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  source "${SCRIPT_DIR}/helpers.sh"
else
  # Inline fallback logging definitions if helpers.sh is missing
  log_info()   { echo "[INFO]  $(date '+%Y-%m-%d %H:%M:%S')  $*"; }
  log_warn()   { echo "[WARN]  $(date '+%Y-%m-%d %H:%M:%S')  $*"; }
  log_error()  { echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S')  $*" >&2; }
fi

# Trap unexpected runtime errors for visibility
trap 'log_error "Unexpected error on line $LINENO (exit code $?)"; exit 1' ERR

# --------------------------------------------------
# Parse Input Arguments
# --------------------------------------------------
APP="$1"           # Application name
ENV="$2"           # Environment (uat, prod, etc.)
VM_HOST="$3"       # Target VM hostname
APP_PATH="$4"      # Target application path
SERVER_PORT="$5"   # Application port (used to stop existing processes)
JAVA_VERSION="$6"  # Java version for deployment
RUN_AS_USER="$7"   # OS user owning the deployment

# --------------------------------------------------
# Resolve Root Directory (for Brew/Deb/RPM portability)
# --------------------------------------------------
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
log_info "Resolved root directory for deployment context: $ROOT_DIR"

# Append app name to base path (e.g. /u01/gag/app)
APP_PATH="${APP_PATH%/}/${APP}"
[[ -d "$APP_PATH" ]] || { log_info "Creating application base path: $APP_PATH"; mkdir -p "$APP_PATH"; }

# Export context variables for downstream scripts
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
EXTRAS_DIR="${APP_PATH}/extras"
DEPLOY_DIR="${APP_PATH}/deploy"
DEPLOYMENT_TAR="/tmp/${APP}-${ENV}.tar.gz"

# --------------------------------------------------
# Helper Functions
# --------------------------------------------------
create_dir() {
  local dir=$1
  [[ -d "$dir" ]] || { log_info "Creating $dir ..."; mkdir -p "$dir"; }
}

rotate_backups() {
  local target_dir=$1
  local max_backups=5
  local backups=($(ls -1t "$target_dir" 2>/dev/null || true))
  if (( ${#backups[@]} > max_backups )); then
    local remove_count=$(( ${#backups[@]} - max_backups ))
    log_info "Rotating backups in $target_dir (keeping last $max_backups)..."
    for old in "${backups[@]:max_backups}"; do
      log_info "Deleting old backup: $target_dir/$old"
      rm -rf "$target_dir/$old"
    done
  fi
}

stop_running_app() {
  local wrapper_sh="${BIN_DIR}/${APP}-wrapper.sh"

  if [[ -x "$wrapper_sh" ]]; then
    log_info "Stopping application using $wrapper_sh stop ..."
    "$wrapper_sh" stop || true
    sleep 5
  else
    log_warn "Wrapper script not found at $wrapper_sh. Falling back to port check."
  fi

  local pid
  pid=$(lsof -ti :"$SERVER_PORT" || true)
  if [[ -n "$pid" ]]; then
    log_info "Force stopping process on port $SERVER_PORT (PID $pid)..."
    kill -9 "$pid" || true
  else
    log_info "No process running on port $SERVER_PORT."
  fi
}

backup_and_replace() {
  local src=$1
  local dest=$2
  local name=$(basename "$dest")
  local ts
  ts=$(date +"%Y%m%dT%H%M%S")

  create_dir "$BACKUP_DIR/bin"
  create_dir "$BACKUP_DIR/conf"
  create_dir "$BACKUP_DIR/lib"
  create_dir "$BACKUP_DIR/extras"

  if [[ -e "$dest" ]]; then
    case "$name" in
      bin)
        local backup_path="$BACKUP_DIR/bin/bin_$ts"
        log_info "Backing up $name directory : $backup_path"
        mkdir -p "$backup_path"
        cp -r "$dest/"* "$backup_path/" 2>/dev/null || true
        rotate_backups "$BACKUP_DIR/bin"
        ;;
      conf)
        local backup_path="$BACKUP_DIR/conf/conf_$ts"
        log_info "Backing up $name directory : $backup_path"
        mkdir -p "$backup_path"
        cp -r "$dest/"* "$backup_path/" 2>/dev/null || true
        rotate_backups "$BACKUP_DIR/conf"
        ;;
      extras)
        local backup_path="$BACKUP_DIR/extras/extras_$ts"
        log_info "Backing up $name directory : $backup_path"
        mkdir -p "$backup_path"
        cp -r "$dest/"* "$backup_path/" 2>/dev/null || true
        rotate_backups "$BACKUP_DIR/extras"
        ;;
      lib)
        local backup_path="$BACKUP_DIR/lib/lib_$ts"
        log_info "Backing up Tanuki wrapper files : $backup_path"
        mkdir -p "$backup_path"
        find "$dest" -maxdepth 1 -type f \( -name "wrapper.jar" -o -name "libwrapper.so" \) -exec cp {} "$backup_path/" \;
        rotate_backups "$BACKUP_DIR/lib"
        ;;
    esac
    rm -rf "$dest"
  fi

  if [[ -e "$src" ]]; then
    if [[ "$name" == "lib" ]]; then
      log_info "Deploying Tanuki runtime files (wrapper.jar, libwrapper.so) : $dest"
      mkdir -p "$dest"
      find "$src" -maxdepth 1 -type f \( -name "wrapper.jar" -o -name "libwrapper.so" \) -exec cp {} "$dest/" \;
    else
      log_info "Deploying new $name : $dest"
      cp -r "$src" "$dest"
      find "$dest" -type f -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
    fi
  fi
}

start_app() {
  local wrapper_sh="${BIN_DIR}/${APP}-wrapper.sh"
  if [[ -x "$wrapper_sh" ]]; then
    log_info "Starting application with $wrapper_sh ..."
    if "$wrapper_sh" start; then
      log_info "Application started successfully."
    else
      log_error "Application start command failed!"
      exit 1
    fi
  else
    log_error "Wrapper script not found: $wrapper_sh"
    exit 1
  fi
}

# --------------------------------------------------
# Main Deployment Flow
# --------------------------------------------------
log_info "--------------------------------------------------"
log_info "REMOTE: Starting remote deployment via application-deployment.sh ..."
log_info "App: $APP ($ENV)"
log_info "Host: $VM_HOST"
log_info "Path: $APP_PATH"
log_info "Server port:  $SERVER_PORT"
log_info "--------------------------------------------------"

# --------------------------------------------------
# Validate and Prepare Base Paths
# --------------------------------------------------
BASE_DIR="$(dirname "$APP_PATH")"

if [[ -z "$APP_PATH" ]]; then
  log_error "Application path is undefined!"
  exit 1
fi

if [[ ! -d "$BASE_DIR" ]]; then
  log_warn "Base directory $BASE_DIR does not exist. Creating it..."
  mkdir -p "$BASE_DIR"
fi

if [[ ! -d "$APP_PATH" ]]; then
  log_info "Creating application path: $APP_PATH"
  mkdir -p "$APP_PATH"
fi

WRAPPER_LOG_PATH="$(dirname "$APP_PATH")/wrapper.log"
if [[ -f "$WRAPPER_LOG_PATH" ]]; then
  log_info "Removing old Tanuki wrapper log: $WRAPPER_LOG_PATH"
  rm -f "$WRAPPER_LOG_PATH"
fi

stop_running_app

# --------------------------------------------------
# Prepare Environment and Extract Artifacts
# --------------------------------------------------
create_dir "$LOGS_DIR"
create_dir "$BACKUP_DIR"

if [[ -f "$DEPLOYMENT_TAR" ]]; then
  echo
  log_info "--------------------------------------------------"
  log_info "Extracting tarball $DEPLOYMENT_TAR into $DROP_DIR ..."
  echo
  rm -rf "$DROP_DIR"
  mkdir -p "$DROP_DIR"
  tar -xzf "$DEPLOYMENT_TAR" -C "$DROP_DIR"
  log_info "--------------------------------------------------"
  echo
else
  log_error "Deployment tarball not found at $DEPLOYMENT_TAR"
  exit 1
fi

# --------------------------------------------------
# Backup and Deploy Core Components (bin/conf/lib)
# --------------------------------------------------
log_info "Backing up and deploying core application components..."
backup_and_replace "$DROP_DIR/bin" "$BIN_DIR"
backup_and_replace "$DROP_DIR/conf" "$CONF_DIR"
backup_and_replace "$DROP_DIR/lib" "$LIB_DIR"

# --------------------------------------------------
# Deploy Optional Extras (certs, apm configs, etc.)
# --------------------------------------------------
shopt -s nullglob
log_info "Deploying optional extras..."
for extra in "$DROP_DIR"/*; do
  base_name=$(basename "$extra")
  if [[ "$base_name" == "bin" || "$base_name" == "conf" || "$base_name" == "lib" ]]; then
    continue
  fi
  backup_and_replace "$extra" "$APP_PATH/$base_name"
done
shopt -u nullglob

# --------------------------------------------------
# Start Application
# --------------------------------------------------
start_app

# --------------------------------------------------
# Cleanup Temporary Files
# --------------------------------------------------
rm -rf "$DROP_DIR"

echo
log_info "--------------------------------------------------"
log_info "Checking for temporary tarballs older than 2 hours in /tmp..."
tar_name=$(basename "$DEPLOYMENT_TAR")
log_info "Extracted tarball name: $tar_name"

old_tarballs=$(find /tmp -maxdepth 1 -type f -name "$tar_name" ! -newermt '2 hours ago' 2>/dev/null || true)
if [[ -n "$old_tarballs" ]]; then
  log_info "Found the following old tarballs to remove:"
  echo "$old_tarballs"
  find /tmp -maxdepth 1 -type f -name "$tar_name" ! -newermt '2 hours ago' -exec rm -f {} \; 2>/dev/null || true
  log_info "Temporary tarballs older than 2 hours have been removed from /tmp."
else
  log_info "No temporary tarballs older than 2 hours were found in /tmp."
fi

echo

# --------------------------------------------------
# Completion Banner
# --------------------------------------------------
log_info "--------------------------------------------------"
log_info "Deployment completed successfully for $APP ($ENV)"
log_info "--------------------------------------------------"
