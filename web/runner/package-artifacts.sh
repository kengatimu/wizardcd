#!/bin/bash
set -e # Exit immediately if any command fails (non-zero exit code)

# ==================================================
# WizardCd - Package Artifacts
#
# This script prepares a deployable tarball for a given app/env.
# It collects:
#   - Application JAR
#   - Dependency libs
#   - Tanuki wrapper components (always mandatory)
#   - Generated Tanuki wrapper.conf and wrapper.sh
#   - Any optional paths (certs, apm, etc.)
#
# Output:
#   build/packages/<app>-<env>.tar.gz
#
# Usage:
#   ./bin/package-artifacts.sh <app_name> <environment>
# ==================================================

# --------------------------------------------------
# Load WizardCd shared utilities (helpers.sh)
# --------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/helpers.sh"

trap 'log_error "Unexpected error on line $LINENO (exit code $?)"; exit 1' ERR

# --------------------------------------------------
# Function: Print usage instructions
# --------------------------------------------------
print_usage() {
  echo "Usage: $0 <app_name> <environment>"
  exit 1
}

# --------------------------------------------------
# Args
# --------------------------------------------------
APP="$1"
ENV="$2"

if [[ -z "$APP" || -z "$ENV" ]]; then
  print_usage
fi

export APP ENV WIZARD_LOG_FILE

# --------------------------------------------------
# Paths
# --------------------------------------------------
CONFIG_FILE="${HOME}/.wizardcd/deployment-config.yml"
if [[ ! -f "$CONFIG_FILE" ]]; then
  CONFIG_FILE="config/deployment-config.yml"
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  log_error "No valid configuration file found at ~/.wizardcd/ or ./config/"
  exit 1
fi

ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

OUTPUT_BASE="${ROOT_DIR}/build/packages"
PKG_DIR="${OUTPUT_BASE}/${APP}/${ENV}"
mkdir -p "$PKG_DIR/bin" "$PKG_DIR/conf" "$PKG_DIR/lib" "$PKG_DIR/extras"

log_info "Using configuration file: $CONFIG_FILE"
log_info "Resolved root directory: $ROOT_DIR"

# --------------------------------------------------
# Load config values
# --------------------------------------------------
PROJECT_BASE_PATH=$(yq -r ".apps.${APP}.${ENV}.build.project_base_path" "$CONFIG_FILE")
APP_JAR_NAME=$(yq -r ".apps.${APP}.${ENV}.build.jar_path" "$CONFIG_FILE")
APP_LIB_DIR_NAME=$(yq -r ".apps.${APP}.${ENV}.build.lib_path" "$CONFIG_FILE")
APP_JAR=$(yq -r ".apps.${APP}.${ENV}.app.jar_name" "$CONFIG_FILE")

WRAPPER_CONF="${ROOT_DIR}/wrappers/tanuki/configs/${APP}-${ENV}.conf"
WRAPPER_SH="${ROOT_DIR}/wrappers/tanuki/configs/${APP}-wrapper.sh"

# --------------------------------------------------
# Determine deployment mode (Backward Compatible)
# --------------------------------------------------
if [[ -z "$APP_LIB_DIR_NAME" || "$APP_LIB_DIR_NAME" == "null" ]]; then
  DEPLOY_MODE="FAT_JAR"
  log_info "Packaging mode: FAT_JAR (Spring Boot executable jar)"
else
  DEPLOY_MODE="EXTERNAL_LIB"
  log_info "Packaging mode: EXTERNAL_LIB: Thin Jar (classic bin/lib layout)"
fi

# --------------------------------------------------
# Resolve Tanuki core components internally
# --------------------------------------------------
TANUKI_BIN="${ROOT_DIR}/wrappers/tanuki/bin/wrapper"
TANUKI_JAR="${ROOT_DIR}/wrappers/tanuki/lib/wrapper.jar"
TANUKI_LIB="${ROOT_DIR}/wrappers/tanuki/lib/libwrapper.so"

# --------------------------------------------------
# Load optional paths from YAML
# --------------------------------------------------
OPTIONAL_PATHS=$(yq -r ".apps.${APP}.${ENV}.build.optional_paths[]" "$CONFIG_FILE" 2>/dev/null || echo "")

# --------------------------------------------------
# Resolve artifact paths using project_base_path
# --------------------------------------------------
APP_JAR_SRC="${PROJECT_BASE_PATH}/${APP_JAR_NAME}"
APP_LIB_SRC="${PROJECT_BASE_PATH}/${APP_LIB_DIR_NAME}"

# --------------------------------------------------
# Validate required values
# --------------------------------------------------
log_info "Validating paths and configurations..."

if [[ -z "$PROJECT_BASE_PATH" || ! -d "$PROJECT_BASE_PATH" ]]; then
  log_error "Project base path not found or undefined: $PROJECT_BASE_PATH"
  exit 1
fi
if [[ -z "$APP_JAR_SRC" || ! -f "$APP_JAR_SRC" ]]; then
  log_error "Application jar not found: $APP_JAR_SRC"
  exit 1
fi
if [[ "$DEPLOY_MODE" == "EXTERNAL_LIB" && ! -d "$APP_LIB_SRC" ]]; then
  log_error "Dependency lib directory not found: $APP_LIB_SRC"
  exit 1
fi
if [[ ! -f "$WRAPPER_CONF" || ! -f "$WRAPPER_SH" ]]; then
  log_error "Tanuki config files not found. Run generate-tanuki-wrapper-conf.sh first."
  exit 1
fi
if [[ ! -f "$TANUKI_BIN" || ! -f "$TANUKI_JAR" ]]; then
  log_error "Mandatory Tanuki files missing under wrappers/tanuki/. Ensure core installation is intact."
  exit 1
fi

# --------------------------------------------------
# Copy application jar
# --------------------------------------------------
log_info "Copying application jar to $PKG_DIR/bin/$APP_JAR ..."
cp "$APP_JAR_SRC" "$PKG_DIR/bin/$APP_JAR"

# --------------------------------------------------
# Copy dependency libs (mode-aware)
# --------------------------------------------------
if [[ "$DEPLOY_MODE" == "EXTERNAL_LIB" ]]; then
  log_info "Copying dependency libs from $APP_LIB_SRC ..."
  mkdir -p "$PKG_DIR/bin/lib"
  shopt -s nullglob
  files=("$APP_LIB_SRC"/*)
  shopt -u nullglob
  if [[ ${#files[@]} -gt 0 ]]; then
    cp -r "$APP_LIB_SRC/"* "$PKG_DIR/bin/lib/"
  else
    log_warn "Dependency lib directory is empty (skipping copy)."
  fi
else
  log_info "FAT_JAR mode detected — skipping dependency lib copy."
fi

# --------------------------------------------------
# Copy generated Tanuki configs
# --------------------------------------------------
log_info "Copying generated Tanuki wrapper configs..."
cp "$WRAPPER_CONF" "$PKG_DIR/conf/${APP}-${ENV}.conf"
cp "$WRAPPER_SH" "$PKG_DIR/bin/${APP}-wrapper.sh"
chmod +x "$PKG_DIR/bin/${APP}-wrapper.sh"

# --------------------------------------------------
# Copy mandatory Tanuki binaries
# --------------------------------------------------
log_info "Copying Tanuki core components..."
cp "$TANUKI_BIN" "$PKG_DIR/bin/wrapper"
cp "$TANUKI_JAR" "$PKG_DIR/lib/wrapper.jar"

if [[ -f "$TANUKI_LIB" ]]; then
  log_info "Copying Tanuki native library..."
  cp "$TANUKI_LIB" "$PKG_DIR/lib/libwrapper.so"
fi

# --------------------------------------------------
# Copy optional paths (if any)
# --------------------------------------------------
if [[ -n "$OPTIONAL_PATHS" ]]; then
  log_info "Copying optional paths into extras/ ..."
  for path in $OPTIONAL_PATHS; do
    if [[ -d "$path" || -f "$path" ]]; then
      cp -r "$path" "$PKG_DIR/extras/"
    else
      log_warn "Optional path not found: $path"
    fi
  done
else
  log_info "No optional paths defined in YAML (skipping extras/)."
fi

# --------------------------------------------------
# Create tarball
# --------------------------------------------------
FINAL_TAR="${OUTPUT_BASE}/${APP}-${ENV}.tar.gz"
log_info "Creating package tarball at $FINAL_TAR ..."
tar -czf "$FINAL_TAR" -C "$PKG_DIR" .

# --------------------------------------------------
# Summary
# --------------------------------------------------
log_info "--------------------------------------------------"
log_info "Package ready: $FINAL_TAR"
log_info "Contents (bin, conf, lib, and extras):"
echo

echo "--------------------------------------------------"
echo "Bin directory"
echo "--------------------------------------------------"
ls -1 "$PKG_DIR/bin"
echo

echo "--------------------------------------------------"
echo "Conf directory"
echo "--------------------------------------------------"
ls -1 "$PKG_DIR/conf"
echo

echo "--------------------------------------------------"
echo "Lib directory"
echo "--------------------------------------------------"
ls -1 "$PKG_DIR/lib"
echo

echo "--------------------------------------------------"
echo "Optional extras (if any)"
echo "--------------------------------------------------"
ls -1 "$PKG_DIR/extras" || log_info "No extras included."
echo "--------------------------------------------------"
echo
