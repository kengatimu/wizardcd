#!/bin/bash
set -euo pipefail

# ==================================================
# WizardCD - Trigger Azure DevOps Pipeline
# ==================================================
# Triggers a remote Azure DevOps pipeline run based on
# deployment-config.yml configuration. Handles PAT
# decryption, auto-creation of missing pipelines,
# and conditional access gracefully.
# ==================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${HOME}/.wizardcd/deployment-config.yml"
if [[ ! -f "$CONFIG_FILE" ]]; then
  CONFIG_FILE="config/deployment-config.yml"
fi

# --------------------------------------------------
# Ensure yq is available (portable, non-root)
# --------------------------------------------------
if ! command -v yq >/dev/null 2>&1; then
  echo "[INFO] Installing yq locally..."
  mkdir -p "${SCRIPT_DIR}/.tools"
  curl -L "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64" \
    -o "${SCRIPT_DIR}/.tools/yq"
  chmod +x "${SCRIPT_DIR}/.tools/yq"
  export PATH="${SCRIPT_DIR}/.tools:$PATH"
fi

# --------------------------------------------------
# Read parameters from config
# --------------------------------------------------
APP="$1"
ENV="$2"

if [[ -z "$APP" || -z "$ENV" ]]; then
  echo "Usage: $0 <app_name> <environment>"
  exit 1
fi

ORG_URL=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.organization_url" "$CONFIG_FILE")
PROJECT=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.project" "$CONFIG_FILE")
REPO_NAME=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.repo_name // \"\"" "$CONFIG_FILE")
PIPELINE_NAME=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.pipeline_name" "$CONFIG_FILE")
BRANCH=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.branch" "$CONFIG_FILE")
TOKEN_REF=$(yq -r ".apps.${APP}.${ENV}.deployment_mode.azure.azure_pat_ref" "$CONFIG_FILE")

# --------------------------------------------------
# Display context info
# --------------------------------------------------
echo "[INFO] --------------------------------------------------"
echo "[INFO] Azure DevOps Trigger Context:"
echo "[INFO]   Organization: $ORG_URL"
echo "[INFO]   Project:      $PROJECT"
echo "[INFO]   Repository:   $REPO_NAME"
echo "[INFO]   Pipeline:     $PIPELINE_NAME"
echo "[INFO]   Branch:       $BRANCH"
echo "[INFO] --------------------------------------------------"

# --------------------------------------------------
# Validate configuration
# --------------------------------------------------
if [[ -z "$ORG_URL" || -z "$PROJECT" || -z "$PIPELINE_NAME" ]]; then
  echo "[ERROR] Missing required Azure configuration in deployment-config.yml"
  exit 1
fi

# --------------------------------------------------
# Load secure PAT (AES-256-CBC)
# --------------------------------------------------
VAULT_DIR="${HOME}/.wizardcd/secure"
VAULT_FILE="${VAULT_DIR}/vault.enc"
KEY_FILE="${VAULT_DIR}/key.meta"

if [[ -z "${System_AccessToken:-}" && -z "${AZURE_DEVOPS_PAT:-}" ]]; then
  if [[ -f "$VAULT_FILE" && -f "$KEY_FILE" ]]; then
    echo "[INFO] Attempting to decrypt PAT '$TOKEN_REF' from WizardCD vault..."
    VAULT_JSON=$(base64 --decode < "$VAULT_FILE" | \
      openssl enc -aes-256-cbc -d -pbkdf2 -iter 100000 -salt \
      -k "$(cat "$KEY_FILE")" 2>/dev/null || echo "{}")
    if echo "$VAULT_JSON" | jq -e . >/dev/null 2>&1; then
      TOKEN=$(echo "$VAULT_JSON" | jq -r --arg ref "$TOKEN_REF" '.[$ref].token // empty')
    else
      TOKEN=""
    fi
    if [[ -n "$TOKEN" ]]; then
      export AZURE_DEVOPS_PAT="$TOKEN"
      echo "[INFO] Loaded PAT '$TOKEN_REF' successfully from vault."
    else
      echo "[WARN] No matching PAT found for '$TOKEN_REF'."
    fi
  else
    echo "[WARN] No secure vault found. Run: wizard auth add <PAT>"
  fi
fi

TOKEN="${System_AccessToken:-${AZURE_DEVOPS_PAT:-}}"
if [[ -z "$TOKEN" ]]; then
  echo "[ERROR] No authentication token found!"
  exit 1
fi

# --------------------------------------------------
# Resolve pipeline ID (robust + safe)
# --------------------------------------------------
echo "[Step] Resolving Azure pipeline ID for '${PIPELINE_NAME}'..."
TMP_RESP="/tmp/wizardcd_trigger_resp.json"
PIPELINE_API="${ORG_URL}/${PROJECT}/_apis/pipelines?api-version=7.1-preview.1"

# Capture both HTTP response and body
HTTP_CODE=$(curl -sS -u ":${TOKEN}" -w "%{http_code}" -o "$TMP_RESP" "$PIPELINE_API" || echo "000")
BODY="$(cat "$TMP_RESP" 2>/dev/null || true)"

# --- Handle all non-JSON and auth errors cleanly ---
if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "403" ]] || echo "$BODY" | grep -qi "VS403463"; then
  echo "[ERROR] Azure DevOps denied access or conditional access policy failed."
  echo "[DETAIL] Please log in via browser and approve MFA if required."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "${ORG_URL}" >/dev/null 2>&1 &
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    command -v xdg-open >/dev/null 2>&1 && xdg-open "${ORG_URL}" >/dev/null 2>&1 &
  elif [[ "$OSTYPE" == "msys"* || "$OSTYPE" == "win32"* ]]; then
    start "${ORG_URL}" >/dev/null 2>&1
  fi
  echo "[ACTION] Re-run after authentication."
  exit 1

elif [[ "$HTTP_CODE" == "000" || -z "$BODY" ]]; then
  echo "[ERROR] No response from Azure API (invalid PAT or network failure)."
  echo "[ACTION] Verify connectivity and token validity, then retry."
  exit 1

elif echo "$BODY" | grep -qi "<!DOCTYPE html"; then
  echo "[ERROR] Azure DevOps returned an HTML login or conditional access page."
  echo "[DETAIL] This indicates your PAT is invalid or expired."
  echo "[ACTION] Log into ${ORG_URL}, renew your PAT, then run 'wizard auth add'."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    open "${ORG_URL}" >/dev/null 2>&1 &
  elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    command -v xdg-open >/dev/null 2>&1 && xdg-open "${ORG_URL}" >/dev/null 2>&1 &
  fi
  exit 1

elif ! echo "$BODY" | jq empty >/dev/null 2>&1; then
  echo "[ERROR] Azure API returned data that is not valid JSON (HTTP ${HTTP_CODE})."
  echo "[DETAIL] Likely an authentication or conditional access failure."
  echo "[INFO] Response snippet:"
  echo "$BODY" | head -n 5
  exit 1
fi

# --- Valid JSON: extract pipeline ID safely ---
PIPELINE_ID=$(echo "$BODY" | jq -r ".value[] | select(.name==\"${PIPELINE_NAME}\") | .id" || true)

# --------------------------------------------------
# Auto-create pipeline if not found
# --------------------------------------------------
if [[ -z "$PIPELINE_ID" || "$PIPELINE_ID" == "null" ]]; then
  echo "[WARN] Pipeline '$PIPELINE_NAME' not found — creating automatically..."
  if [[ ! -f "azure-pipelines.yml" ]]; then
    echo "[INFO] No azure-pipelines.yml found — generating via WizardCD..."
    bash "${SCRIPT_DIR}/generate-azure-pipeline.sh" "$APP" "$ENV"
  fi

  REPO_ID=$(curl -s -u ":$TOKEN" \
    "${ORG_URL}/${PROJECT}/_apis/git/repositories/${REPO_NAME}?api-version=7.1-preview.1" |
    jq -r ".id")

  CREATE_PAYLOAD=$(jq -n \
    --arg name "$PIPELINE_NAME" \
    --arg path "/azure-pipelines.yml" \
    --arg repo "$REPO_ID" \
    '{"name":$name,"configuration":{"type":"yaml","path":$path,"repository":{"id":$repo,"type":"azureReposGit"}}}')

  CREATE_RESP=$(curl -s -X POST -u ":$TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CREATE_PAYLOAD" \
    "${ORG_URL}/${PROJECT}/_apis/pipelines?api-version=7.1-preview.1")

  PIPELINE_ID=$(echo "$CREATE_RESP" | jq -r ".id")
  if [[ -n "$PIPELINE_ID" && "$PIPELINE_ID" != "null" ]]; then
    echo "[SUCCESS] Created pipeline '$PIPELINE_NAME' (ID: $PIPELINE_ID)"
  else
    echo "[ERROR] Failed to auto-create pipeline:"
    echo "$CREATE_RESP" | head -n 10
    exit 1
  fi
fi

echo "[INFO] Found pipeline ID: $PIPELINE_ID"

# --------------------------------------------------
# Trigger the pipeline run
# --------------------------------------------------
echo "[Step] Triggering Azure pipeline run..."
RUN_RESPONSE=$(curl -s -X POST -u ":$TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"resources\": {\"repositories\": {\"self\": {\"refName\": \"refs/heads/${BRANCH}\"}}}}" \
  "${ORG_URL}/${PROJECT}/_apis/pipelines/${PIPELINE_ID}/runs?api-version=7.1-preview.1")

RUN_ID=$(echo "$RUN_RESPONSE" | yq -r ".id")
RUN_URL="${ORG_URL}/${PROJECT}/_build/results?buildId=${RUN_ID}"

if [[ "$RUN_ID" == "null" || -z "$RUN_ID" ]]; then
  echo "[ERROR] Failed to trigger pipeline:"
  echo "$RUN_RESPONSE" | head -n 10
  exit 1
fi

echo "[SUCCESS] Pipeline triggered successfully!"
echo "Run ID: $RUN_ID"
echo "Build URL: $RUN_URL"

# --------------------------------------------------
# Poll briefly for pipeline status
# --------------------------------------------------
echo "[Step] Waiting for pipeline to start..."
for i in {1..10}; do
  STATUS=$(curl -s -u ":$TOKEN" \
    "${ORG_URL}/${PROJECT}/_apis/build/builds/${RUN_ID}?api-version=7.1-preview.7" |
    yq -r ".status")
  if [[ "$STATUS" == "inProgress" || "$STATUS" == "completed" ]]; then
    echo "[INFO] Pipeline status: $STATUS"
    break
  fi
  sleep 5
done

echo "[INFO] View full logs at: $RUN_URL"

# --------------------------------------------------
# Securely clear PAT
# --------------------------------------------------
if [[ -n "${AZURE_DEVOPS_PAT:-}" ]]; then
  PAT_LEN=${#AZURE_DEVOPS_PAT}
  AZURE_DEVOPS_PAT=$(printf '%*s' "$PAT_LEN" | tr ' ' 'X')
  unset AZURE_DEVOPS_PAT TOKEN
  echo "[INFO] Azure PAT cleared from memory."
fi
