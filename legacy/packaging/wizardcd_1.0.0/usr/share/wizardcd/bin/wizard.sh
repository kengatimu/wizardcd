#!/bin/bash
set -e

# ==================================================
# WizardCD - Main CLI Entrypoint
# Purpose:
#   1. Display version and help information.
#   2. Parse user CLI arguments.
#   3. Route execution to internal core scripts (deploy.sh, etc.).
#
# Author: Engineered By Bytes Ltd
# Version: 1.0.0
# Website: https://wizardcd.com
# ==================================================

# --------------------------------------------------
# Define key paths (auto-detect Brew or System)
# --------------------------------------------------
INSTALL_DIR="/usr/share/wizardcd"

# Detect Homebrew Cellar (macOS)
if [[ ! -d "$INSTALL_DIR" ]]; then
  for base in "/usr/local/Cellar/wizardcd" "/opt/homebrew/Cellar/wizardcd"; do
    if [[ -d "$base" ]]; then
      latest=$(ls -1 "$base" | sort -V | tail -1)
      if [[ -d "$base/$latest/wizardcd" ]]; then
        INSTALL_DIR="$base/$latest/wizardcd"
        break
      fi
    fi
  done
fi

CORE_DIR="${INSTALL_DIR}/bin/core"
VERSION_FILE="${INSTALL_DIR}/VERSION"

# --------------------------------------------------
# NEW: Define Templates Directory and Select Template
# --------------------------------------------------
TEMPLATE_DIR="${INSTALL_DIR}/config_templates"
TEMPLATE_FILE=""

# Simple OS-based selection logic
if [[ "$OSTYPE" == "darwin"* ]]; then
  TEMPLATE_FILE="${TEMPLATE_DIR}/config-brew.yml"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Distro check for Linux
  if command -v apt-get >/dev/null 2>&1; then
    TEMPLATE_FILE="${TEMPLATE_DIR}/config-deb.yml"
  elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    TEMPLATE_FILE="${TEMPLATE_DIR}/config-rpm.yml"
  else
    TEMPLATE_FILE="${TEMPLATE_DIR}/config-deb.yml" # Default to Debian template for other Linux
  fi
elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32"* ]]; then
  TEMPLATE_FILE="${TEMPLATE_DIR}/config-win.yml"
else
  # Fallback/General Linux
  TEMPLATE_FILE="${TEMPLATE_DIR}/config-deb.yml"
fi

# Fallback to a single template if the specific one is missing
if [[ ! -f "$TEMPLATE_FILE" ]]; then
  # Assuming config-deb.yml is the most common default template
  TEMPLATE_FILE="${TEMPLATE_DIR}/config-deb.yml"
fi

# --------------------------------------------------
# Display Version
# --------------------------------------------------
show_version() {
  if [[ -f "$VERSION_FILE" ]]; then
    echo "WizardCD version $(cat "$VERSION_FILE")"
    return
  fi

  for base in "/usr/local/Cellar/wizardcd" "/opt/homebrew/Cellar/wizardcd"; do
    # Corrected structure/formatting for reliable Bash execution:
    if [[ -d "$base" ]]; then
      latest=$(ls -1 "$base" | sort -V | tail -1)
      if [[ -f "$base/$latest/wizardcd/VERSION" ]]; then
        echo "WizardCD version $(cat "$base/$latest/wizardcd/VERSION")"
        return
      fi
    fi
  done

  echo "WizardCD version 1.0.0"
}

# --------------------------------------------------
# Display Help
# --------------------------------------------------
show_help() {
cat <<'EOF'
Usage: wizard [command] [options]

Commands:
  deploy --target <platform> --app <app_name> --env <environment>
      Run a full deployment pipeline for the selected platform.

WizardCD Deployment Targets:
  direct_vm    Deploy directly to remote VM via SSH/SCP
  azure        Deploy via Azure DevOps pipeline (CI/CD automation)
  aws          Deploy via AWS CodePipeline (requires AWS credentials)
  gcp          Deploy via Google Cloud Build (requires GCP service account)

Token Management:
  auth [add|list|show|remove]
      Manage encrypted tokens (e.g., Azure PATs stored in WizardCD vault)

Pipeline Operations:
  pipeline [trigger|status]
      Manually trigger or check status of Azure DevOps pipelines

General Options:
  --check-deps               Check environment dependencies
  --show-config-template     Display sample YAML configuration
  --update-config            Generate a new editable config at ~/.wizardcd/deployment-config.yml
  --validate-config          Validate YAML structure and syntax
  --help                     Show this help message
  --version                  Show WizardCD version
  --banner                   Show installation banner

Examples:
  wizard deploy --target azure --app my-service-ms --env uat
  wizard deploy --target direct_vm --app my-service-ms --env uat
  wizard deploy --target aws --app my-service-ms --env prod
  wizard deploy --target gcp --app my-service-ms --env test

  wizard auth add
  wizard pipeline trigger my-service-ms uat
  wizard --validate-config
EOF
}

# --------------------------------------------------
# Optional: Print installation banner (manual trigger)
# --------------------------------------------------
if [[ "$1" == "--banner" ]]; then
    if [[ ! -f "$VERSION_FILE" ]]; then
        VERSION_FILE="$(dirname "$0")/../VERSION"
    fi

    cat <<EOF
                                                                                                                                                                       
                                                                                                                    dddddddd                                          
                                           iiii                                                                     d::::::d        CCCCCCCCCCCCCDDDDDDDDDDDDD        
                                          i::::i                                                                    d::::::d     CCC::::::::::::CD::::::::::::DDD     
                                           iiii                                                                     d::::::d   CC:::::::::::::::CD:::::::::::::::DD   
                                                                                                                    d:::::d   C:::::CCCCCCCC::::CDDD:::::DDDDD:::::D  
wwwwwww           wwwww           wwwwwwwiiiiiii zzzzzzzzzzzzzzzzz  aaaaaaaaaaaaa   rrrrr   rrrrrrrrr       ddddddddd:::::d  C:::::C       CCCCCC  D:::::D    D:::::D 
 w:::::w         w:::::w         w:::::w i:::::i z:::::::::::::::z  a::::::::::::a  r::::rrr:::::::::r    dd::::::::::::::d C:::::C                D:::::D     D:::::D
  w:::::w       w:::::::w       w:::::w   i::::i z::::::::::::::z   aaaaaaaaa:::::a r:::::::::::::::::r  d::::::::::::::::d C:::::C                D:::::D     D:::::D
   w:::::w     w:::::::::w     w:::::w    i::::i zzzzzzzz::::::z             a::::a rr::::::rrrrr::::::rd:::::::ddddd:::::d C:::::C                D:::::D     D:::::D
    w:::::w   w:::::w:::::w   w:::::w     i::::i       z::::::z       aaaaaaa:::::a  r:::::r     r:::::rd::::::d    d:::::d C:::::C                D:::::D     D:::::D
     w:::::w w:::::w w:::::w w:::::w      i::::i      z::::::z      aa::::::::::::a  r:::::r     rrrrrrrd:::::d     d:::::d C:::::C                D:::::D     D:::::D
      w:::::w:::::w   w:::::w:::::w       i::::i     z::::::z      a::::aaaa::::::a  r:::::r            d:::::d     d:::::d C:::::C                D:::::D     D:::::D
       w:::::::::w     w:::::::::w        i::::i    z::::::z      a::::a    a:::::a  r:::::r            d:::::d     d:::::d  C:::::C       CCCCCC  D:::::D    D:::::D 
        w:::::::w       w:::::::w        i::::::i  z::::::zzzzzzzza::::a    a:::::a  r:::::r            d::::::ddddd::::::dd  C:::::CCCCCCCC::::CDDD:::::DDDDD:::::D  
         w:::::w         w:::::w         i::::::i z::::::::::::::za:::::aaaa::::::a  r:::::r             d:::::::::::::::::d   CC:::::::::::::::CD:::::::::::::::DD   
          w:::w           w:::w          i::::::iz:::::::::::::::z a::::::::::aa:::a r:::::r              d:::::::::ddd::::d     CCC::::::::::::CD::::::::::::DDD     
           www             www           iiiiiiiizzzzzzzzzzzzzzzzz  aaaaaaaaaa  aaaa rrrrrrr               ddddddddd   ddddd        CCCCCCCCCCCCCDDDDDDDDDDDDD        



==============================================
WizardCD ::  (v$(cat "$VERSION_FILE" 2>/dev/null || echo '1.0.0'))
One config. One command. Continuous magic.
https://wizardcd.com
==============================================


EOF
    exit 0
fi

# --------------------------------------------------
# New: Show Config Template (Uses pre-validated file)
# --------------------------------------------------
if [[ "$1" == "--show-config-template" ]]; then
  if [[ ! -f "$TEMPLATE_FILE" ]]; then
    printf "[ERROR] Selected configuration template file not found: %s\n" "$TEMPLATE_FILE" >&2
    exit 1
  fi

  # Print the raw, pre-validated YAML content from the selected template
  cat "$TEMPLATE_FILE"
  exit 0
fi

# --------------------------------------------------
# Update Config Command (Debian-safe)
# --------------------------------------------------
if [[ "$1" == "--update-config" ]]; then
  CONFIG_DIR="${HOME}/.wizardcd"
  CONFIG_FILE="${CONFIG_DIR}/deployment-config.yml"

  mkdir -p "$CONFIG_DIR"

  if [[ ! -f "$TEMPLATE_FILE" ]]; then
    printf "[ERROR] Selected configuration template file not found: %s\n" "$TEMPLATE_FILE" >&2
    exit 1
  fi

  # Generate YAML header
  printf "# WizardCD deployment config generated on %s\n" "$(date)" > "$CONFIG_FILE"
  printf "# ---------------------------------------------------------------\n\n" >> "$CONFIG_FILE"

  # Append the pre-validated, platform-specific template content
  cat "$TEMPLATE_FILE" >> "$CONFIG_FILE"

  echo
  echo "[SUCCESS] Editable config created at: $CONFIG_FILE"
  echo

  # Editor selection (same as before)
  EDITOR_CMD=""
  if [[ -n "${EDITOR:-}" ]]; then
    EDITOR_CMD="$EDITOR"
  elif [[ -n "${VISUAL:-}" ]]; then
    EDITOR_CMD="$VISUAL"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v open >/dev/null 2>&1; then
      EDITOR_CMD="open -e"
    else
      EDITOR_CMD="vi"
    fi
  elif [[ "$OSTYPE" == "linux"* ]]; then
    if command -v vi >/dev/null 2>&1; then
      EDITOR_CMD="vi"
    elif command -v nano >/dev/null 2>&1; then
      EDITOR_CMD="nano"
    fi
  elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32"* ]]; then
    EDITOR_CMD="notepad"
  fi

  if [[ -n "${CI:-}" ]]; then
    echo "[INFO] CI environment detected — skipping interactive editor."
    echo "Edit the config manually if needed:"
    echo "  $CONFIG_FILE"
    exit 0
  fi

  if [[ -n "$EDITOR_CMD" ]]; then
    echo "[INFO] Opening configuration file in your preferred editor: ($EDITOR_CMD)"
    echo "[TIP] You can set a custom editor permanently via:"
    echo "      export EDITOR='code -w'"
    echo "      export EDITOR='vim'"
    echo
    sleep 1
    $EDITOR_CMD "$CONFIG_FILE"
  else
    echo "[WARN] No supported text editor found on this system."
    echo
    echo "You can install one using:"
    echo "  Debian/Ubuntu:   sudo apt install nano"
    echo "  RHEL/Fedora:     sudo dnf install nano"
    echo "  macOS:           brew install nano"
    echo "  Windows:         install Notepad++ or VS Code"
    echo
    echo "Or manually open and edit the file here:"
    echo "  $CONFIG_FILE"
  fi

  echo
  echo "[TIP] Once done editing, validate your YAML file with:"
  echo "  wizard --validate-config"
  echo
  exit 0
fi

# --------------------------------------------------
# Validate Config Command (universal cross-platform logic)
# --------------------------------------------------
if [[ "$1" == "--validate-config" ]]; then
  CONFIG_FILE="${HOME}/.wizardcd/deployment-config.yml"

  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "[ERROR] No deployment-config.yml found at $CONFIG_FILE"
    echo "Run: wizard --update-config first."
    exit 1
  fi

  VALID_SYNTAX=false
  YQ_CMD=""

  # --- Attempt to locate yq in all common paths ---
  for path in $(which yq 2>/dev/null) /usr/local/bin/yq /usr/bin/yq /snap/bin/yq /opt/homebrew/bin/yq; do
    if [[ -x "$path" ]]; then
      YQ_CMD="$path"
      break
    fi
  done

  # --- Try yq validation first (preferred) ---
  if [[ -n "$YQ_CMD" ]]; then
    if "$YQ_CMD" eval '.' "$CONFIG_FILE" >/dev/null 2>&1; then
      VALID_SYNTAX=true
    fi
  fi

  # --- Fallback: Python-based validation if yq unavailable or failed ---
  if [[ "$VALID_SYNTAX" != true ]]; then
    if command -v python3 >/dev/null 2>&1; then
      if python3 -c "import yaml, sys; yaml.safe_load(open('$CONFIG_FILE'))" >/dev/null 2>&1; then
        VALID_SYNTAX=true
      fi
    fi
  fi

  # --- If both checks failed ---
  if [[ "$VALID_SYNTAX" != true ]]; then
    echo "[ERROR] Invalid YAML syntax detected or no supported validator found!"
    echo
    echo "To fix this:"
    echo "  - Option 1: Install yq (recommended)"
    echo "      Debian/Ubuntu: sudo apt install yq -y  (or sudo snap install yq)"
    echo "      RHEL/Fedora:   sudo dnf install yq -y"
    echo "      macOS:         brew install yq"
    echo
    echo "  - Option 2: Ensure Python3 + PyYAML are installed"
    echo "      sudo apt install python3-yaml -y"
    echo
    exit 1
  fi

  echo "[OK] YAML syntax valid."

  # --- Structural checks for important keys ---
  REQUIRED_KEYS=("apps" "vm_host" "vm_path" "app_jar")
  for key in "${REQUIRED_KEYS[@]}"; do
    if ! grep -q "$key" "$CONFIG_FILE"; then
      echo "[WARN] Missing key: $key"
    fi
  done

  echo "[SUCCESS] Configuration structure validated successfully."
  exit 0
fi

# --------------------------------------------------
# Command Dispatcher
# --------------------------------------------------
if [[ $# -eq 0 ]]; then
  show_help
  exit 0
fi

if [[ "$1" == "--help" ]]; then
  show_help
elif [[ "$1" == "--version" ]]; then
  show_version
elif [[ "$1" == "--check-deps" ]]; then
  bash "${CORE_DIR}/deploy.sh" --check-deps
elif [[ "$1" == "deploy" ]]; then
  shift
  bash "${CORE_DIR}/deploy.sh" "$@"
elif [[ "$1" == "--app" ]]; then
  echo "[WARN] The --app flag is deprecated. Use 'wizard deploy --target <platform> --app <app_name> --env <environment>' instead."
  bash "${CORE_DIR}/deploy.sh" "$@"
elif [[ "$1" == "auth" ]]; then
  shift
  bash "${CORE_DIR}/wizard-auth.sh" "$@"
elif [[ "$1" == "pipeline" ]]; then
  shift
  bash "${CORE_DIR}/trigger-azure-pipeline.sh" "$@"
else
  echo "Unknown command: $1"
  echo "Run 'wizard --help' for available options."
  exit 1
fi

exit 0
