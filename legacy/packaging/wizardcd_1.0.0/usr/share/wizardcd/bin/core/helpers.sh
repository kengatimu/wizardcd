#!/bin/bash
# ==================================================
# WizardCd - Helper Functions & Centralized Logging (with rotation)
# ==================================================

# --------------------------------------------------
# Resolve Root Directory (for Brew/Deb/RPM/local portability)
# --------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# --------------------------------------------------
# Define base directory (system-wide install)
# --------------------------------------------------
# Use /usr/local/var/log/wizardcd for Homebrew/macOS (writeable)
# Fallback to /var/log/wizardcd for Linux (created by postinst)
if [[ -w "/usr/local/var" ]]; then
    WIZARD_LOG_DIR="/usr/local/var/log/wizardcd"
else
    WIZARD_LOG_DIR="/var/log/wizardcd"
fi

# Ensure log directory exists (safe and recursive)
mkdir -p "$WIZARD_LOG_DIR" 2>/dev/null || true
chmod 777 "$WIZARD_LOG_DIR" 2>/dev/null || true

# Timestamp for new runs
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# Safely define APP and ENV defaults to avoid 'unbound variable' under `set -u`
: "${APP:=unknown}"
: "${ENV:=local}"

LOG_APP="${APP:-unknown}"
LOG_ENV="${ENV:-local}"

# --------------------------------------------------
# Locate Configuration File (portable lookup order)
# --------------------------------------------------
# Priority order:
#   1. ~/.wizardcd/deployment-config.yml
#   2. ${ROOT_DIR}/config/deployment-config.yml
#   3. /usr/share/wizardcd/config/deployment-config.yml
CONFIG_FILE="${HOME}/.wizardcd/deployment-config.yml"
if [[ ! -f "$CONFIG_FILE" ]]; then
  if [[ -f "${ROOT_DIR}/config/deployment-config.yml" ]]; then
    CONFIG_FILE="${ROOT_DIR}/config/deployment-config.yml"
  elif [[ -f "/usr/share/wizardcd/config/deployment-config.yml" ]]; then
    CONFIG_FILE="/usr/share/wizardcd/config/deployment-config.yml"
  fi
fi

# --------------------------------------------------
# YAML Reader with Default Value
# --------------------------------------------------
read_yaml_value() {
    local query="$1"
    local default="$2"
    local val
    val=$(yq -r "$query" "$CONFIG_FILE" 2>/dev/null || echo "$default")
    [[ "$val" == "null" || -z "$val" ]] && val="$default"
    echo "$val"
}

# Load rotation settings from YAML if available (defaulting if null or missing)
LOG_MAX_SIZE=$(read_yaml_value ".apps.${APP}.${ENV}.logging.max_size" "100m")
LOG_MAX_FILES=$(read_yaml_value ".apps.${APP}.${ENV}.logging.max_files" "10")

# Convert "100m" to bytes safely (POSIX-compatible)
LOG_MAX_SIZE_LOWER=$(echo "$LOG_MAX_SIZE" | tr '[:upper:]' '[:lower:]')
LOG_MAX_BYTES=$(echo "$LOG_MAX_SIZE_LOWER" | sed 's/m$//')
LOG_MAX_BYTES=$((LOG_MAX_BYTES * 1024 * 1024))

# Target log file (fixed name per app/env)
WIZARD_LOG_FILE="${WIZARD_LOG_DIR}/deploy-${LOG_APP}-${LOG_ENV}.log"

# Ensure log file exists before writing
touch "$WIZARD_LOG_FILE" 2>/dev/null || true
chmod 666 "$WIZARD_LOG_FILE" 2>/dev/null || true

# --------------------------------------------------
# Log rotation function
# --------------------------------------------------
rotate_logs_if_needed() {
    if [[ -f "$WIZARD_LOG_FILE" ]]; then
        local size
        size=$(stat -c%s "$WIZARD_LOG_FILE" 2>/dev/null || stat -f%z "$WIZARD_LOG_FILE")
        if (( size > LOG_MAX_BYTES )); then
            for ((i=LOG_MAX_FILES-1; i>=1; i--)); do
                if [[ -f "${WIZARD_LOG_FILE}.${i}" ]]; then
                    mv "${WIZARD_LOG_FILE}.${i}" "${WIZARD_LOG_FILE}.$((i+1))" 2>/dev/null || true
                fi
            done
            mv "$WIZARD_LOG_FILE" "${WIZARD_LOG_FILE}.1"
            gzip -f "${WIZARD_LOG_FILE}.1"
            touch "$WIZARD_LOG_FILE"
            echo "$(get_timestamp) [INFO] [helpers.sh]: Log rotated (${size} bytes > ${LOG_MAX_BYTES} bytes)" >> "$WIZARD_LOG_FILE"
        fi
    fi
}

# --------------------------------------------------
# Logging Functions
# --------------------------------------------------

# Function to get timestamp with milliseconds (cross-platform)
get_timestamp() {
    if date +%N >/dev/null 2>&1; then
        # Works on most Linux and modern macOS versions
        date +"%Y-%m-%d %H:%M:%S.%3N"
    else
        # Fallback for older macOS systems without %N support
        date +"%Y-%m-%d %H:%M:%S.$(($(date +%s%3N) % 1000))"
    fi
}

log_info() {
    rotate_logs_if_needed
    local ts
    ts=$(get_timestamp)
    local line="$ts [INFO] [$0]: $1"
    echo "$line"
    echo "$line" >> "$WIZARD_LOG_FILE"
}

log_warn() {
    rotate_logs_if_needed
    local ts
    ts=$(get_timestamp)
    local line="$ts [WARNING] [$0]: $1"
    echo "$line"
    echo "$line" >> "$WIZARD_LOG_FILE"
}

log_error() {
    rotate_logs_if_needed
    local ts
    ts=$(get_timestamp)
    # Add current line number automatically via ${BASH_LINENO[0]}
    local caller_line=${BASH_LINENO[0]:-unknown}
    local line="$ts [ERROR] [$0: error on line $caller_line]: $1"
    echo "$line" >&2
    echo "$line" >> "$WIZARD_LOG_FILE"
}

log_info_context() {
    local message="$1"
    echo "--------------------------------------------------"
    log_info "$message"
    echo "--------------------------------------------------"
    # Ensure contextual info also goes to the log file (not just console)
    {
        echo "--------------------------------------------------"
        echo "$(get_timestamp) [INFO] [$0]: $message"
        echo "--------------------------------------------------"
    } >> "$WIZARD_LOG_FILE"
}
