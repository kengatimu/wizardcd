#!/bin/bash
set -euo pipefail # Exit on error, unset variables as error, fail on pipe errors

# ==================================================
# WizardCd - Generate Tanuki Wrapper Config
#
# This script generates two files for a given app/env:
#   1. Tanuki wrapper config (.conf)
#   2. Tanuki wrapper start/stop script (.sh)
#
# The values are loaded from config/deployment-config.yml
#
# Usage:
#   ./bin/generate-tanuki-wrapper-conf.sh --app <app_name> --env <environment>
# ==================================================

# --------------------------------------------------
# Load WizardCd shared utilities (helpers.sh)
# --------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/helpers.sh"
log_info "SCRIPT_DIR: $SCRIPT_DIR"

# Resolve WizardCD root directory (for locating templates)
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
log_info "ROOT_DIR: $ROOT_DIR"

trap 'log_error "Unexpected error on line $LINENO (exit code $?)"; exit 1' ERR

# --------------------------------------------------
# Function: Print usage instructions
# --------------------------------------------------
print_usage() {
  log_error "Usage: $0 --app <app_name> --env <environment>"
  exit 1
}

# --------------------------------------------------
# Parse arguments
# --------------------------------------------------
if [[ "$1" == "--app" && "$3" == "--env" ]]; then
  APP="$2"
  ENV="$4"
elif [[ "$1" == "--env" && "$3" == "--app" ]]; then
  ENV="$2"
  APP="$4"
else
  print_usage
fi

export APP ENV WIZARD_LOG_FILE

# --------------------------------------------------
# Paths
# --------------------------------------------------
if [[ -n "${WIZARDCONFIG:-}" ]]; then
  CONFIG_FILE="$WIZARDCONFIG"
else
  CONFIG_FILE="${HOME}/.wizardcd/deployment-config.yml"
  if [[ ! -f "$CONFIG_FILE" ]]; then
    CONFIG_FILE="config/deployment-config.yml"
  fi
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  log_error "No valid configuration file found at $CONFIG_FILE"
  exit 1
fi

CONF_TEMPLATE="${SCRIPT_DIR}/wrappers/tanuki/conf/default.conf.template"
SH_TEMPLATE="${SCRIPT_DIR}/wrappers/tanuki/bin/wrapper.sh.template"
OUTPUT_DIR="${SCRIPT_DIR}/wrappers/tanuki/configs"

# --------------------------------------------------
# Load values from YAML (FIXED MAPPINGS)
# --------------------------------------------------
APP_NAME="$APP"

APP_HOME_BASE=$(yq -r ".apps.${APP}.${ENV}.deployment.target.base_path" "$CONFIG_FILE")
APP_HOME="$APP_HOME_BASE"

JAVA_CMD=$(yq -r ".apps.${APP}.${ENV}.java.command" "$CONFIG_FILE")
APP_JAR=$(yq -r ".apps.${APP}.${ENV}.app.jar_name" "$CONFIG_FILE")
MAIN_CLASS=$(yq -r ".apps.${APP}.${ENV}.app.main_class" "$CONFIG_FILE")

# Detect optional external lib mode
LIB_PATH=$(yq -r ".apps.${APP}.${ENV}.build.lib_path" "$CONFIG_FILE")

JVM_XMS=$(yq -r ".apps.${APP}.${ENV}.jvm.xms" "$CONFIG_FILE")
JVM_XMX=$(yq -r ".apps.${APP}.${ENV}.jvm.xmx" "$CONFIG_FILE")
JVM_NEW_RATIO=$(yq -r ".apps.${APP}.${ENV}.jvm.new_ratio" "$CONFIG_FILE")

LOGFILE_MAXSIZE=$(yq -r ".apps.${APP}.${ENV}.logging.max_size" "$CONFIG_FILE")
LOGFILE_MAXFILES=$(yq -r ".apps.${APP}.${ENV}.logging.max_files" "$CONFIG_FILE")

# --------------------------------------------------
# Determine deployment mode (Backward Compatible)
# --------------------------------------------------
# If lib_path is empty or null, use Spring Boot FAT JAR mode, Otherwise, use classic external lib (THIN JAR) mode
if [[ -z "$LIB_PATH" || "$LIB_PATH" == "null" ]]; then
  log_info "Deployment mode detected: FAT_JAR (Spring Boot)"
  MAIN_CLASS="org.springframework.boot.loader.launch.JarLauncher"
else
  log_info "Deployment mode detected: EXTERNAL_LIB - Thin Jar (WrapperSimpleApp)"
  # MAIN_CLASS remains the application main class from deployment-config.yaml file
fi

# --------------------------------------------------
# Validate required values
# --------------------------------------------------
if [[ -z "$APP_HOME" || -z "$JAVA_CMD" || -z "$APP_JAR" || -z "$MAIN_CLASS" ]]; then
  log_error "Missing required configuration values for app=$APP env=$ENV"
  exit 1
fi

if [[ ! -f "$CONF_TEMPLATE" || ! -f "$SH_TEMPLATE" ]]; then
  log_error "Missing Tanuki template files. Expected at: $CONF_TEMPLATE and $SH_TEMPLATE"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# --------------------------------------------------
# Generate wrapper.conf
# --------------------------------------------------
CONF_FILE="${OUTPUT_DIR}/${APP}-${ENV}.conf"
log_info "Generating Tanuki wrapper config: $CONF_FILE ..."

sed \
  -e "s|{{APP_NAME}}|$APP_NAME|g" \
  -e "s|{{APP_HOME}}|$APP_HOME|g" \
  -e "s|{{JAVA_CMD}}|$JAVA_CMD|g" \
  -e "s|{{APP_JAR}}|$APP_JAR|g" \
  -e "s|{{MAIN_CLASS}}|$MAIN_CLASS|g" \
  -e "s|{{JVM_XMS}}|$JVM_XMS|g" \
  -e "s|{{JVM_XMX}}|$JVM_XMX|g" \
  -e "s|{{JVM_NEW_RATIO}}|$JVM_NEW_RATIO|g" \
  -e "s|{{LOGFILE_MAXSIZE}}|$LOGFILE_MAXSIZE|g" \
  -e "s|{{LOGFILE_MAXFILES}}|$LOGFILE_MAXFILES|g" \
  "$CONF_TEMPLATE" > "$CONF_FILE"

# --------------------------------------------------
# Generate wrapper.sh
# --------------------------------------------------
SH_FILE="${OUTPUT_DIR}/${APP}-wrapper.sh"
log_info "Generating Tanuki wrapper script: $SH_FILE ..."

sed \
  -e "s|{{APP_NAME}}|$APP_NAME|g" \
  -e "s|{{APP_HOME}}|$APP_HOME|g" \
  -e "s|{{ENV}}|$ENV|g" \
  "$SH_TEMPLATE" > "$SH_FILE"

chmod +x "$SH_FILE"

# --------------------------------------------------
# Summary
# --------------------------------------------------
log_info "--------------------------------------------------"
log_info "Generated Tanuki wrapper files for $APP ($ENV):"
log_info "  - $CONF_FILE"
log_info "  - $SH_FILE"
log_info "Tanuki wrapper configuration completed successfully."
log_info "--------------------------------------------------"
