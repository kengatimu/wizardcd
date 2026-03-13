#!/bin/bash
set -euo pipefail

# ===============================================================
# WizardCD - Azure Pipeline Generator
# ===============================================================
# Reads deployment-config.yml and fills the Azure pipeline
# template to produce a ready-to-run azure-pipelines.yml
# ===============================================================

APP="${1:-}"
ENV="${2:-}"

if [[ -z "$APP" || -z "$ENV" ]]; then
  echo "Usage: $0 <app_name> <environment>"
  exit 1
fi

# ---------------------------------------------------------------
# Locate core directories
# ---------------------------------------------------------------
CORE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_FILE="${CORE_DIR}/../../cloud_workflows/templates/azure/azure-pipeline-template.yml"
CONFIG_FILE="${HOME}/.wizardcd/deployment-config.yml"

echo "'${HOME}'"

# Fallback to local config if ~/.wizardcd not found
if [[ ! -f "$CONFIG_FILE" ]]; then
  CONFIG_FILE="${CORE_DIR}/../../config/deployment-config.yml"
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "[ERROR] No deployment-config.yml found in ~/.wizardcd or ./config/"
  exit 1
fi

OUTPUT_DIR="${CORE_DIR}/../../../pipelines/generated"
OUTPUT_FILE="${OUTPUT_DIR}/azure-pipelines-${APP}-${ENV}.yml"
mkdir -p "$OUTPUT_DIR"

# ---------------------------------------------------------------
# Ensure yq portable
# ---------------------------------------------------------------
if ! command -v yq >/dev/null 2>&1; then
  echo "[INFO] Installing yq portable..."
  mkdir -p "${CORE_DIR}/.tools"
  curl -L "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64" \
    -o "${CORE_DIR}/.tools/yq"
  chmod +x "${CORE_DIR}/.tools/yq"
  export PATH="${CORE_DIR}/.tools:$PATH"
fi

# ---------------------------------------------------------------
# Extract values from config YAML
# ---------------------------------------------------------------
JAVA_VERSION=$(yq -r ".apps.${APP}.${ENV}.java_version" "$CONFIG_FILE")
KEYVAULT_NAME=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.keyvault.name // \"kv-${ENV}-omnichannel\"" "$CONFIG_FILE")
ARTIFACT_NAME=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.artifact_name // \"${ENV}_drop\"" "$CONFIG_FILE")
PROJECT_BASE_PATH=$(yq -r ".apps.${APP}.${ENV}.project_base_path // \"/tmp/${APP}\"" "$CONFIG_FILE")

# ---------------------------------------------------------------
# New fields introduced in v2.2
# ---------------------------------------------------------------
ORG_URL=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.organization_url" "$CONFIG_FILE")
PROJECT=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.project" "$CONFIG_FILE")
REPO_NAME=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.repo_name // \"\"" "$CONFIG_FILE")
PIPELINE_NAME=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.pipeline_name" "$CONFIG_FILE")
BRANCH=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.branch" "$CONFIG_FILE")

# ---------------------------------------------------------------
# Compute repository URL (safe even if repo_name missing)
# ---------------------------------------------------------------
if [[ -n "$REPO_NAME" ]]; then
  REPO_URL="${ORG_URL}/${PROJECT}/_git/${REPO_NAME}"
else
  REPO_URL="${ORG_URL}/${PROJECT}"
fi

# ---------------------------------------------------------------
# Display summary for verification
# ---------------------------------------------------------------
echo "[INFO] Generating Azure pipeline YAML for app=${APP}, env=${ENV}"
echo "[INFO] Repository: ${REPO_URL}"
echo "[INFO] Pipeline: ${PIPELINE_NAME} (branch: ${BRANCH})"

# ---------------------------------------------------------------
# Generate pipeline file from template
# ---------------------------------------------------------------
sed \
  -e "s|#{APP_NAME}#|${APP}|g" \
  -e "s|#{ENVIRONMENT}#|${ENV}|g" \
  -e "s|#{JAVA_VERSION}#|${JAVA_VERSION}|g" \
  -e "s|#{KEYVAULT_NAME}#|${KEYVAULT_NAME}|g" \
  -e "s|#{ARTIFACT_NAME}#|${ARTIFACT_NAME}|g" \
  -e "s|#{PROJECT_BASE_PATH}#|${PROJECT_BASE_PATH}|g" \
  -e "s|#{REPO_URL}#|${REPO_URL}|g" \
  "$TEMPLATE_FILE" > "$OUTPUT_FILE"

# ---------------------------------------------------------------
# Sync a copy to repo root for Azure detection
# ---------------------------------------------------------------
REPO_ROOT="$(pwd)"
TARGET_FILE="${REPO_ROOT}/azure-pipelines.yml"

echo "[INFO] Copying generated pipeline to repo root..."
cp "$OUTPUT_FILE" "$TARGET_FILE"

# Add explicit informational log
echo "[INFO] azure-pipelines.yml synced to repo root."
echo "[INFO] NOTE: This does NOT auto-trigger Azure builds (trigger: none)."
echo "[INFO] The file is placed here for Azure UI detection and future automation."

# ---------------------------------------------------------------
# Programmatic update of Azure pipeline definition
# ---------------------------------------------------------------
PAT_NAME=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.token_ref // \"azure-global-pat\"" "$CONFIG_FILE")
VAULT_PATH="${HOME}/.wizardcd/secure/vault.enc"

if [[ -f "$VAULT_PATH" && -n "$PAT_NAME" ]]; then
  echo "[INFO] Attempting to decrypt PAT '${PAT_NAME}' from WizardCD vault..."
  if command -v openssl >/dev/null 2>&1; then
    DECRYPT_KEY_FILE="${HOME}/.wizardcd/secure/key"
    if [[ -f "$DECRYPT_KEY_FILE" ]]; then
      PAT=$(openssl enc -aes-256-cbc -d -a -in "$VAULT_PATH" -pass file:"$DECRYPT_KEY_FILE" 2>/dev/null | grep "^${PAT_NAME}:" | cut -d':' -f2- || true)
    fi
  fi
fi

if [[ -z "${PAT:-}" ]]; then
  echo "[WARN] Could not load PAT '${PAT_NAME}' from vault. Skipping Azure pipeline definition update."
else
  ORG_BASE="${ORG_URL%/}"
  PIPELINE_API="${ORG_BASE}/${PROJECT}/_apis/pipelines?api-version=7.0-preview.1"

  echo "[INFO] Checking existing pipeline via Azure DevOps REST API..."
  
  # Capture both HTTP response code and body separately
  TMP_RESP="/tmp/wizardcd_azure_resp.json"
  RESPONSE_CODE=$(curl -sS -u ":${PAT}" -w "%{http_code}" -o "$TMP_RESP" "$PIPELINE_API" || echo "000")
  RESPONSE_BODY="$(cat "$TMP_RESP" 2>/dev/null || true)"

  # Handle empty, HTML, unauthorized, and invalid JSON responses safely
  if [[ "$RESPONSE_CODE" == "401" || "$RESPONSE_CODE" == "403" ]] || echo "$RESPONSE_BODY" | grep -qi "VS403463"; then
    echo "[ERROR] Azure DevOps returned access denied or conditional access failure."
    echo "[DETAIL] Microsoft Entra policy or invalid PAT may have blocked authentication."
    echo "[ACTION] Please log into ${ORG_URL} and ensure your PAT has proper permissions."
    echo "[INFO] Attempting to open Azure DevOps login page..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
      open "${ORG_URL}" >/dev/null 2>&1 &
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
      command -v xdg-open >/dev/null 2>&1 && xdg-open "${ORG_URL}" >/dev/null 2>&1 &
    elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32"* ]]; then
      start "${ORG_URL}" >/dev/null 2>&1
    fi
    PIPELINE_ID=""

  elif [[ "$RESPONSE_CODE" == "000" || -z "$RESPONSE_BODY" ]]; then
    echo "[ERROR] No response from Azure DevOps API — possibly due to interactive password prompt or invalid PAT."
    echo "[HINT] Please ensure your PAT is valid and not expired:"
    echo "       1. Go to ${ORG_URL}"
    echo "       2. Click your profile → Personal Access Tokens"
    echo "       3. Create or renew a PAT with 'Build (Read & Execute)' and 'Code (Read)' scopes."
    echo "[ACTION] After updating your PAT, run: wizard auth add"
    PIPELINE_ID=""

  elif echo "$RESPONSE_BODY" | grep -qi "<!DOCTYPE html"; then
    echo "[ERROR] Azure DevOps authentication failed or HTML login page returned."
    echo "[HINT] Log into ${ORG_URL} in your browser and ensure your PAT has the correct permissions."
    echo "[INFO] Attempting to open Azure DevOps login page..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
      open "${ORG_URL}" >/dev/null 2>&1 &
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
      command -v xdg-open >/dev/null 2>&1 && xdg-open "${ORG_URL}" >/dev/null 2>&1 &
    elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32"* ]]; then
      start "${ORG_URL}" >/dev/null 2>&1
    fi
    PIPELINE_ID=""

  # === NEW robust invalid JSON check ===
  elif ! echo "$RESPONSE_BODY" | jq empty >/dev/null 2>&1; then
    # jq failed to parse body → not valid JSON (e.g., HTML, text, or corrupted content)
    echo "[ERROR] Azure API returned data that is not valid JSON (HTTP ${RESPONSE_CODE})."
    echo "[DETAIL] This often indicates an authentication failure or expired PAT."
    echo "[ACTION] Please verify your PAT '${PAT_NAME}' and ensure it has 'Build (Read & Execute)' and 'Code (Read)' scopes."
    echo "[INFO] Response snippet that caused the jq failure:"
    echo "$RESPONSE_BODY" | head -n 5
    PIPELINE_ID=""

  # === Valid JSON handling ===
  else
    # JSON successfully parsed, safely extract pipeline ID
    PIPELINE_ID=$(echo "$RESPONSE_BODY" | jq -r ".value[] | select(.name==\"${PIPELINE_NAME}\") | .id" || true)
  fi

  # Proceed only if a valid pipeline ID was found
  if [[ -n "$PIPELINE_ID" && "$PIPELINE_ID" != "null" ]]; then
    echo "[INFO] Found existing pipeline '${PIPELINE_NAME}' (ID: ${PIPELINE_ID}). Updating YAML path..."
    UPDATE_PAYLOAD=$(jq -n \
      --arg name "$PIPELINE_NAME" \
      --arg repo_name "$REPO_NAME" \
      --arg path "/azure-pipelines.yml" \
      --arg branch "refs/heads/${BRANCH}" \
      '{name: $name, configuration: {type: "yaml", path: $path, repository: {type: "azureReposGit", name: $repo_name, defaultBranch: $branch}}}')
    UPDATE_URL="${ORG_BASE}/${PROJECT}/_apis/pipelines/${PIPELINE_ID}?api-version=7.0"
    echo "[INFO] PATCH $UPDATE_URL"
    curl -s -u ":${PAT}" -X PATCH -H "Content-Type: application/json" -d "$UPDATE_PAYLOAD" "$UPDATE_URL" \
      && echo "[SUCCESS] Pipeline YAML path updated successfully." \
      || echo "[WARN] Failed to update Azure pipeline definition."
  else
    echo "[WARN] Pipeline '${PIPELINE_NAME}' not found or authentication incomplete. Skipping auto-update."
  fi
fi

# ---------------------------------------------------------------
# Summary
# ---------------------------------------------------------------
echo "[SUCCESS] Azure pipeline YAML generated successfully."
echo "Internal copy: $OUTPUT_FILE"
echo "Repo root copy: $TARGET_FILE"
echo
head -n 12 "$TARGET_FILE"
echo
