#!/usr/bin/env bash
# ===============================================================
# WizardCD Web Runner - helpers.sh
#
# Purpose:
# - Provide job-scoped, audit-grade logging utilities
# - Enforce isolation per deployment job
# - Support size-based log retention (Phase 1)
#
# Scope:
# - Direct VM / SSH deployments only
# - No global state, no YAML parsing, no secrets handling
# ===============================================================

# ---------------------------------------------------------------
# REQUIRED VARIABLES
# These must be set by deploy.sh BEFORE sourcing this file.
# helpers.sh intentionally does not infer or default them.
# ---------------------------------------------------------------
: "${JOB_ID:?JOB_ID not set}"
: "${JOB_DIR:?JOB_DIR not set}"
: "${LOG_DIR:?LOG_DIR not set}"
: "${DEPLOY_LOG:?DEPLOY_LOG not set}"

# Ensure job log directory exists
mkdir -p "$LOG_DIR"

# ---------------------------------------------------------------
# Timestamp helper
# Uses millisecond precision when supported by the OS
# Function to get timestamp with milliseconds (cross-platform)
# ---------------------------------------------------------------
get_timestamp() {
  local base ts_nsec

  base="$(date +"%Y-%m-%d %H:%M:%S")"
  ts_nsec="$(date +%N 2>/dev/null)"

  if [[ "$ts_nsec" =~ ^[0-9]+$ ]]; then
    # GNU date (Linux) — force base-10 to avoid octal bug
    printf "%s.%03d\n" "$base" "$((10#${ts_nsec:0:3}))"
  else
    # BSD/macOS fallback
    echo "$base"
  fi
}

# ---------------------------------------------------------------
# Size parsing helper
# Converts values like 100m / 10k into bytes
# ---------------------------------------------------------------
parse_size_to_bytes() {
  local size="$1"
  case "$size" in
    *k|*K) echo $(( ${size%?} * 1024 )) ;;
    *m|*M) echo $(( ${size%?} * 1024 * 1024 )) ;;
    *g|*G) echo $(( ${size%?} * 1024 * 1024 * 1024 )) ;;
    *) echo "$size" ;;
  esac
}

# ---------------------------------------------------------------
# Job-scoped log rotation
#
# Design notes:
# - Rotation is per job, never global
# - Rotation happens before writes
# - helpers.sh does NOT decide limits; deploy.sh injects them
# ---------------------------------------------------------------
rotate_log_if_needed() {
  [[ -z "${LOG_MAX_SIZE:-}" || -z "${LOG_MAX_FILES:-}" ]] && return 0
  [[ ! -f "$DEPLOY_LOG" ]] && return 0

  local max_bytes
  max_bytes="$(parse_size_to_bytes "$LOG_MAX_SIZE")"

  local current_size
  current_size="$(stat -c%s "$DEPLOY_LOG" 2>/dev/null || echo 0)"

  (( current_size < max_bytes )) && return 0

  # Rotate: deploy.log → deploy.log.1 → deploy.log.N
  for (( i=LOG_MAX_FILES-1; i>=1; i-- )); do
    [[ -f "${DEPLOY_LOG}.${i}" ]] && mv "${DEPLOY_LOG}.${i}" "${DEPLOY_LOG}.$((i+1))"
  done

  mv "$DEPLOY_LOG" "${DEPLOY_LOG}.1"
  touch "$DEPLOY_LOG"
}

# ---------------------------------------------------------------
# Logging primitives
#
# Guarantees:
# - Timestamped
# - Job-identified
# - Deterministic formatting
# ---------------------------------------------------------------
log_info() {
  rotate_log_if_needed
  local ts
  ts="$(get_timestamp)"
  echo "$ts [INFO ] [job=$JOB_ID] $*" | tee -a "$DEPLOY_LOG"
}

log_warn() {
  rotate_log_if_needed
  local ts
  ts="$(get_timestamp)"
  echo "$ts [WARN ] [job=$JOB_ID] $*" | tee -a "$DEPLOY_LOG"
}

log_error() {
  rotate_log_if_needed
  local ts
  ts="$(get_timestamp)"
  local line="${BASH_LINENO[0]:-unknown}"
  echo "$ts [ERROR] [job=$JOB_ID line=$line] $*" | tee -a "$DEPLOY_LOG" >&2
}

# ---------------------------------------------------------------
# Section marker
# Used to clearly delimit deployment phases in logs
# ---------------------------------------------------------------
log_section() {
  rotate_log_if_needed
  local title="$1"
  {
    echo ""
    echo "=================================================================="
    echo "$(get_timestamp) [INFO ] [job=$JOB_ID] $title"
    echo "=================================================================="
  } | tee -a "$DEPLOY_LOG"
}
