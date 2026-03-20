#!/bin/bash
set -euo pipefail

# ==================================================
# WizardCD - Generate Tanuki Wrapper Config
#
# Generates two files for a given app/env:
#   1. Tanuki wrapper config (.conf)
#   2. Tanuki wrapper start/stop script (.sh)
#
# Called by deploy.sh. Uses WIZARDCONFIG env var for
# the deployment config YAML path.
#
# Usage:
#   ./generate-tanuki-wrapper-conf.sh --app <app_name> --env <environment>
# ==================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/helpers.sh"

trap 'log_error "Wrapper generation failed on line $LINENO (exit code $?)"; exit 1' ERR

# --------------------------------------------------
# Parse arguments
# --------------------------------------------------
print_usage() {
  log_error "Usage: $0 --app <app_name> --env <environment>"
  exit 1
}

if [[ "$1" == "--app" && "$3" == "--env" ]]; then
  APP="$2"
  ENV="$4"
elif [[ "$1" == "--env" && "$3" == "--app" ]]; then
  ENV="$2"
  APP="$4"
else
  print_usage
fi

export APP ENV

# --------------------------------------------------
# Resolve config file
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
# Load values from YAML
# --------------------------------------------------
APP_HOME=$(yq -r ".apps.${APP}.${ENV}.deployment.target.base_path" "$CONFIG_FILE")
JAVA_CMD=$(yq -r ".apps.${APP}.${ENV}.java.command" "$CONFIG_FILE")
APP_JAR=$(yq -r ".apps.${APP}.${ENV}.app.jar_name" "$CONFIG_FILE")
MAIN_CLASS=$(yq -r ".apps.${APP}.${ENV}.app.main_class" "$CONFIG_FILE")
LIB_PATH=$(yq -r ".apps.${APP}.${ENV}.build.lib_path" "$CONFIG_FILE")
JVM_XMS=$(yq -r ".apps.${APP}.${ENV}.jvm.xms" "$CONFIG_FILE")
JVM_XMX=$(yq -r ".apps.${APP}.${ENV}.jvm.xmx" "$CONFIG_FILE")
JVM_NEW_RATIO=$(yq -r ".apps.${APP}.${ENV}.jvm.new_ratio" "$CONFIG_FILE")
LOGFILE_MAXSIZE=$(yq -r ".apps.${APP}.${ENV}.logging.max_size" "$CONFIG_FILE")
LOGFILE_MAXFILES=$(yq -r ".apps.${APP}.${ENV}.logging.max_files" "$CONFIG_FILE")

# --------------------------------------------------
# Determine deployment mode
# --------------------------------------------------
if [[ -z "$LIB_PATH" || "$LIB_PATH" == "null" ]]; then
  DEPLOY_MODE="FAT_JAR (Spring Boot JarLauncher)"
  MAIN_CLASS="org.springframework.boot.loader.launch.JarLauncher"
else
  DEPLOY_MODE="THIN_JAR (external lib)"
fi

log_info "Deployment mode: ${DEPLOY_MODE}"

# --------------------------------------------------
# Validate required values
# --------------------------------------------------
if [[ -z "$APP_HOME" || -z "$JAVA_CMD" || -z "$APP_JAR" || -z "$MAIN_CLASS" ]]; then
  log_error "Missing required configuration values for app=${APP} env=${ENV}"
  exit 1
fi

if [[ ! -f "$CONF_TEMPLATE" || ! -f "$SH_TEMPLATE" ]]; then
  log_error "Tanuki template files not found — check runner installation"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

# --------------------------------------------------
# Generate wrapper.conf (base from template)
# --------------------------------------------------
CONF_FILE="${OUTPUT_DIR}/${APP}-${ENV}.conf"

sed \
  -e "s|{{APP_NAME}}|${APP}|g" \
  -e "s|{{APP_HOME}}|${APP_HOME}|g" \
  -e "s|{{JAVA_CMD}}|${JAVA_CMD}|g" \
  -e "s|{{APP_JAR}}|${APP_JAR}|g" \
  -e "s|{{MAIN_CLASS}}|${MAIN_CLASS}|g" \
  -e "s|{{LOGFILE_MAXSIZE}}|${LOGFILE_MAXSIZE}|g" \
  -e "s|{{LOGFILE_MAXFILES}}|${LOGFILE_MAXFILES}|g" \
  "$CONF_TEMPLATE" > "$CONF_FILE"

# --------------------------------------------------
# Append JVM additional args dynamically
# Only emit args that have actual values — empty xms/xmx means
# the JVM uses ergonomic defaults (recommended for modern JVMs).
# --------------------------------------------------
ADDITIONAL_IDX=1

# Helper: append a JVM arg to the conf and log it
append_jvm_arg() {
  local flag="$1"
  local source="$2"
  echo "wrapper.java.additional.${ADDITIONAL_IDX}=${flag}" >> "$CONF_FILE"
  log_info "  [jvm.${ADDITIONAL_IDX}] ${flag}  (${source})"
  ((ADDITIONAL_IDX++))
}

# Heap sizing — optional; omit to let JVM auto-size
if [[ -n "${JVM_XMS}" && "${JVM_XMS}" != "null" ]]; then
  append_jvm_arg "-Xms${JVM_XMS}" "heap-min"
fi
if [[ -n "${JVM_XMX}" && "${JVM_XMX}" != "null" ]]; then
  append_jvm_arg "-Xmx${JVM_XMX}" "heap-max"
fi

# NewRatio — only include when explicitly set (not exposed in UI by default)
if [[ -n "${JVM_NEW_RATIO}" && "${JVM_NEW_RATIO}" != "null" && "${JVM_NEW_RATIO}" != "0" ]]; then
  append_jvm_arg "-XX:NewRatio=${JVM_NEW_RATIO}" "new-ratio"
fi

# Extra JVM opts from deployment config (GC flags, workload flags, user-defined opts).
EXTRA_OPTS_COUNT=$(yq -r ".apps.${APP}.${ENV}.jvm.extra_opts | length" "$CONFIG_FILE" 2>/dev/null || echo "0")
SKIPPED_COUNT=0
if [[ "$EXTRA_OPTS_COUNT" =~ ^[0-9]+$ && "$EXTRA_OPTS_COUNT" -gt 0 ]]; then
  for ((i=0; i<EXTRA_OPTS_COUNT; i++)); do
    OPT=$(yq -r ".apps.${APP}.${ENV}.jvm.extra_opts[${i}]" "$CONFIG_FILE")
    if [[ -z "$OPT" || "$OPT" == "null" ]]; then
      log_warn "  Skipping empty/null extra_opts[${i}]"
      ((SKIPPED_COUNT++))
      continue
    fi
    # Validate: must start with - (JVM flags always start with a dash)
    if [[ "$OPT" != -* ]]; then
      log_warn "  Skipping invalid extra_opts[${i}]: '${OPT}' — JVM flags must start with '-'"
      ((SKIPPED_COUNT++))
      continue
    fi
    append_jvm_arg "$OPT" "extra_opts[${i}]"
  done
fi

TOTAL_ARGS=$((ADDITIONAL_IDX - 1))
if [[ $TOTAL_ARGS -gt 0 ]]; then
  log_info "  Total: ${TOTAL_ARGS} JVM arg(s) written to wrapper conf"
  if [[ $SKIPPED_COUNT -gt 0 ]]; then
    log_warn "  ${SKIPPED_COUNT} extra_opts entry/entries skipped (empty or invalid)"
  fi
else
  log_info "  No JVM args configured — JVM will use ergonomic defaults"
fi

# --------------------------------------------------
# Generate wrapper.sh
# --------------------------------------------------
SH_FILE="${OUTPUT_DIR}/${APP}-wrapper.sh"

sed \
  -e "s|{{APP_NAME}}|${APP}|g" \
  -e "s|{{APP_HOME}}|${APP_HOME}|g" \
  -e "s|{{ENV}}|${ENV}|g" \
  "$SH_TEMPLATE" > "$SH_FILE"

chmod +x "$SH_FILE"

# --------------------------------------------------
# Summary
# --------------------------------------------------
log_info "Tanuki wrapper generated for ${APP} (${ENV}):"
log_info "  Config:  ${APP}-${ENV}.conf"
log_info "  Script:  ${APP}-wrapper.sh"
log_info "Tanuki wrapper configuration completed."
