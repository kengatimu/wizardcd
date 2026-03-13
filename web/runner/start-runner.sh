#!/bin/bash
# =============================================================================
# start-runner.sh
# Reads spring.profiles.active from application.yaml bundled inside the JAR,
# exports it as SPRING_PROFILES_ACTIVE, then launches the runner service.
# =============================================================================

set -euo pipefail

JAR="/opt/wizardcd/runner-service-ms-0.0.1-SNAPSHOT.jar"

# ── Validate JAR exists ──────────────────────────────────────────────────────
if [[ ! -f "$JAR" ]]; then
    echo "[start-runner] ERROR: JAR not found at $JAR" >&2
    exit 1
fi

# ── Extract active profile from application.yaml inside the JAR ──────────────
ACTIVE_PROFILE=$(unzip -p "$JAR" BOOT-INF/classes/application.yaml \
    | yq '.spring.profiles.active' 2>/dev/null || true)

# ── Fallback to uat if yq fails or value is empty/null ───────────────────────
if [[ -z "$ACTIVE_PROFILE" || "$ACTIVE_PROFILE" == "null" ]]; then
    echo "[start-runner] WARN: Could not resolve spring.profiles.active — falling back to 'uat'"
    ACTIVE_PROFILE="uat"
fi

export SPRING_PROFILES_ACTIVE="$ACTIVE_PROFILE"

echo "[start-runner] Active profile resolved: $SPRING_PROFILES_ACTIVE"
echo "[start-runner] Starting runner-service-ms..."

exec java -jar "$JAR"
