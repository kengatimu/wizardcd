#!/bin/bash
set -euo pipefail

# ==================================================
# WizardCD - Secure Authentication Vault
#
# Supports:
#   wizard auth add <PAT>
#   wizard auth list
#   wizard auth remove <PAT-NAME>
#   wizard auth show <PAT-NAME>
#
# Encrypts and stores Personal Access Tokens (PATs)
# using AES-256-CBC encryption. (NOTE: Original comment specified GCM, 
# but implementation uses CBC, which is portable and kept as is).
#
# Tokens are never stored in plaintext and can be
# referenced in deployment-config.yml via 'token_ref'.
# ==================================================

VAULT_DIR="${HOME}/.wizardcd/secure"
VAULT_FILE="${VAULT_DIR}/vault.enc"
META_FILE="${VAULT_DIR}/meta.json" # Not used in current script, retained for context
KEY_FILE="${VAULT_DIR}/key.meta"

# --------------------------------------------------
# Ensure secure directory exists
# --------------------------------------------------
mkdir -p "$VAULT_DIR"
chmod 700 "$VAULT_DIR"

# --------------------------------------------------
# Generate AES key if missing
# --------------------------------------------------
generate_key() {
  if [[ ! -f "$KEY_FILE" ]]; then
    echo "[INFO] Generating secure AES key for WizardCD vault..."
    openssl rand -base64 32 > "$KEY_FILE"
    chmod 600 "$KEY_FILE"
    echo "[SUCCESS] Key generated and stored at $KEY_FILE"
  fi
}

# --------------------------------------------------
# Encrypt data using AES-256-CBC (portable)
# --------------------------------------------------
encrypt_data() {
  local key
  key=$(cat "$KEY_FILE")
  # Read plaintext JSON from stdin, output base64 ciphertext
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -k "$key" -base64
}

# --------------------------------------------------
# Decrypt data using AES-256-CBC (portable)
# --------------------------------------------------
decrypt_data() {
  local key
  key=$(cat "$KEY_FILE")
  # Read ciphertext from file, decode base64, and decrypt
  base64 --decode < "$VAULT_FILE" | openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 -salt -k "$key" 2>/dev/null
}

# --------------------------------------------------
# Load decrypted vault JSON
# --------------------------------------------------
load_vault() {
  if [[ -f "$VAULT_FILE" ]]; then
    decrypt_data
  else
    echo "{}"
  fi
}

# --------------------------------------------------
# Save encrypted vault JSON
# --------------------------------------------------
save_vault() {
  local json_data="$1"

  # Optional: create backup before overwriting
  if [[ -f "$VAULT_FILE" ]]; then
    cp "$VAULT_FILE" "${VAULT_FILE}.bak"
  fi

  echo "$json_data" | encrypt_data > "$VAULT_FILE"
  chmod 600 "$VAULT_FILE"
}

# --------------------------------------------------
# Add a new PAT securely
# --------------------------------------------------
add_pat() {
  local pat_value
  read -s -p "Enter your Azure Personal Access Token (hidden): " pat_value
  echo

  # Basic validation for PAT length (optional, but good practice)
  if [[ ${#pat_value} -lt 8 ]]; then
    echo "[ERROR] Personal Access Token seems too short. Operation cancelled."
    exit 1
  fi

  echo "[WARN] This will store your Azure PAT locally in encrypted form."
  read -p "Proceed? (y/n): " confirm
  [[ "$confirm" != "y" ]] && { echo "[INFO] Operation cancelled."; exit 0; }

  read -p "Enter a name for this PAT (e.g., 'azure-global-pat'): " pat_name
  [[ -z "$pat_name" ]] && { echo "[ERROR] PAT name cannot be empty."; exit 1; }

  generate_key
  local vault_json
  vault_json=$(load_vault)

  # Check if loading the vault was successful (i.e., not empty/corrupted output)
  if [[ -z "$vault_json" ]] || ! echo "$vault_json" | jq -e . >/dev/null; then
    echo "[ERROR] Failed to load/decrypt existing vault. Key file may be missing/corrupted."
    exit 1
  fi

  # Check for existing PAT
  if echo "$vault_json" | jq -e "has(\"$pat_name\")" >/dev/null; then
    read -p "[WARN] PAT '$pat_name' already exists. Overwrite? (y/n): " overwrite
    [[ "$overwrite" != "y" ]] && { echo "[INFO] Operation cancelled."; exit 0; }
  fi

  local created
  created=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  local updated_vault
  updated_vault=$(echo "$vault_json" | jq --arg name "$pat_name" --arg token "$pat_value" --arg created "$created" '.[$name] = { "token": $token, "created": $created }')

  save_vault "$updated_vault"
  echo "[SUCCESS] PAT '$pat_name' stored securely."
  echo "[INFO] Vault updated at: $VAULT_FILE"
  echo "[INFO] Reference this name in your deployment-config.yml under token_ref: '$pat_name'"
}

# --------------------------------------------------
# List all stored PATs
# --------------------------------------------------
list_pats() {
  if [[ ! -f "$VAULT_FILE" ]]; then
    echo "[INFO] No stored PATs found."
    exit 0
  fi

  local vault_json
  vault_json=$(load_vault)

  # Check if decryption was successful and the output is valid JSON
  if [[ -z "$vault_json" ]] || ! echo "$vault_json" | jq -e . >/dev/null; then
    echo "[ERROR] Failed to decrypt vault. Key file may be missing/corrupted."
    exit 1
  fi
  
  echo "[INFO] Stored PATs:"
  echo "$vault_json" | jq -r 'to_entries[] | "\(.key)  (created: \(.value.created))"'
}

# --------------------------------------------------
# Show PAT details (masked)
# --------------------------------------------------
show_pat() {
  local pat_name="$1"
  [[ -z "$pat_name" ]] && { echo "Usage: wizard auth show <PAT-NAME>"; exit 1; }

  if [[ ! -f "$VAULT_FILE" || ! -f "$KEY_FILE" ]]; then
    echo "[ERROR] No vault or key found."
    exit 1
  fi

  local vault_json
  vault_json=$(load_vault)

  # Check for successful decryption
  if [[ -z "$vault_json" ]] || ! echo "$vault_json" | jq -e . >/dev/null; then
    echo "[ERROR] Failed to decrypt vault."
    exit 1
  fi
  
  if ! echo "$vault_json" | jq -e "has(\"$pat_name\")" >/dev/null; then
    echo "[ERROR] No PAT found with name '$pat_name'."
    exit 1
  fi

  local token created masked
  token=$(echo "$vault_json" | jq -r --arg name "$pat_name" '.[$name].token')
  created=$(echo "$vault_json" | jq -r --arg name "$pat_name" '.[$name].created')

  # Mask token except first/last 4 characters
  local len=${#token}
  if (( len > 8 )); then
    masked="${token:0:4}********${token: -4}"
  else
    masked="****"
  fi

  echo "[INFO] PAT Details:"
  echo "Name:     $pat_name"
  echo "Created:  $created"
  echo "Token:    $masked"
}

# --------------------------------------------------
# Remove PAT by name
# --------------------------------------------------
remove_pat() {
  local pat_name="$1"
  [[ -z "$pat_name" ]] && { echo "Usage: wizard auth remove <PAT-NAME>"; exit 1; }

  if [[ ! -f "$VAULT_FILE" ]]; then
    echo "[ERROR] No vault file found."
    exit 1
  fi

  local vault_json
  vault_json=$(load_vault)

  # Check for successful decryption
  if [[ -z "$vault_json" ]] || ! echo "$vault_json" | jq -e . >/dev/null; then
    echo "[ERROR] Failed to decrypt vault."
    exit 1
  fi

  if ! echo "$vault_json" | jq -e "has(\"$pat_name\")" >/dev/null; then
    echo "[ERROR] No PAT found with name '$pat_name'."
    exit 1
  fi

  local updated_vault
  updated_vault=$(echo "$vault_json" | jq "del(.\"$pat_name\")")

  save_vault "$updated_vault"
  echo "[SUCCESS] PAT '$pat_name' removed from secure vault."
}

# --------------------------------------------------
# Command dispatcher (no case, using if)
# --------------------------------------------------
COMMAND=""
if [[ $# -ge 1 ]]; then
  COMMAND="$1"
  shift
fi

if [[ "$COMMAND" == "add" ]]; then
  add_pat   # no args; interactive secure entry

elif [[ "$COMMAND" == "list" ]]; then
  list_pats

elif [[ "$COMMAND" == "remove" ]]; then
  remove_pat "${1:-}"

elif [[ "$COMMAND" == "show" ]]; then
  show_pat "${1:-}"

else
  echo "Usage:"
  echo "  wizard auth add             # Add and encrypt a new PAT (interactive)"
  echo "  wizard auth list            # List stored PATs"
  echo "  wizard auth show <NAME>     # Show a specific PAT (masked)"
  echo "  wizard auth remove <NAME>   # Remove a specific PAT"
  exit 1
fi
