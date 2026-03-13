#!/bin/bash
set -euo pipefail # Exit on error, unset variables as error, fail on pipe errors

# ==================================================
# WizardCd - Framework Cleanup Utility
#
# Purpose:
#   Restores WizardCd to a clean, generic state by
#   removing runtime build artifacts and generated
#   wrapper configs while preserving persistent logs.
#
# Actions Performed:
#   1. Removes the build/ directory entirely.
#   2. Removes generated wrapper configs (.conf/.sh)
#      under wrappers/tanuki/configs/, keeping only templates.
#   3. Preserves all log files for traceability.
#
# Usage:
#   ./bin/cleanup-framework.sh
#
# Safe to run before committing or sharing WizardCd.
# ==================================================

# --------------------------------------------------
# Load WizardCd shared utilities (helpers.sh)
# --------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/helpers.sh" ]]; then
  source "${SCRIPT_DIR}/helpers.sh"
else
  echo "[WARN] helpers.sh not found. Using inline logging."
  log_info()  { echo "[INFO]  $*"; }
  log_warn()  { echo "[WARN]  $*"; }
  log_error() { echo "[ERROR] $*" >&2; }
fi

# --------------------------------------------------
# Resolve Root Directory (for Brew/Deb/RPM portability)
# --------------------------------------------------
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
log_info "Resolved root directory: $ROOT_DIR"

# Trap and log unexpected errors
trap 'log_error "Unexpected error on line $LINENO (exit code $?)"; exit 1' ERR

# --------------------------------------------------
# Banner
# --------------------------------------------------
log_info "=================================================="
log_info "WizardCd Framework Cleanup Utility"
log_info "=================================================="
log_info "This operation will:"
log_info "  - Delete build/packages/ directory contents."
log_info "  - Remove generated wrapper configs (keep templates)."
log_info "  - Preserve all logs under logs/."
log_info "--------------------------------------------------"

# --------------------------------------------------
# Step 1: Clean build/packages directory
# --------------------------------------------------
BUILD_DIR="${ROOT_DIR}/build/packages"
if [[ -d "$BUILD_DIR" ]]; then
  log_info "Cleaning files inside: $BUILD_DIR"
  find "$BUILD_DIR" -mindepth 1 -delete
  log_info "Cleanup complete. Directory structure retained."
else
  log_warn "Skipping: build/packages directory not found at $BUILD_DIR"
fi

# --------------------------------------------------
# Step 2: Clean wrapper-generated configs
# --------------------------------------------------
WRAPPER_CONFIG_DIR="${ROOT_DIR}/wrappers/tanuki/configs"
if [[ -d "$WRAPPER_CONFIG_DIR" ]]; then
  log_info "Cleaning generated wrapper configs..."
  find "$WRAPPER_CONFIG_DIR" -type f ! -name 'default.conf.template' ! -name 'wrapper.sh.template' -delete
else
  log_warn "Skipping: wrappers/tanuki/configs directory not found at $WRAPPER_CONFIG_DIR"
fi

# --------------------------------------------------
# Step 3: Preserve logs directory
# --------------------------------------------------
LOGS_DIR="${ROOT_DIR}/logs"
if [[ -d "$LOGS_DIR" ]]; then
  log_info "Preserving logs directory and all log files."
else
  log_info "Creating logs directory for next run."
  mkdir -p "$LOGS_DIR"
fi

# --------------------------------------------------
# Final status
# --------------------------------------------------
log_info "--------------------------------------------------"
log_info "Framework cleanup complete."
log_info "WizardCd restored to a clean, reusable state."
log_info "Logs have been preserved for traceability."
log_info "--------------------------------------------------"
