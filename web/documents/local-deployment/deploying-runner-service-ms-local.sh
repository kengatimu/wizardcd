#!/bin/bash
# =============================================================================
# WizardCD — Runner Service LOCAL (MacBook) Setup Guide
# =============================================================================
# Service  : runner-service-ms (Spring Boot 3.x, Java 21)
# Platform : macOS — native (Apple Silicon or Intel)
# Deploy   : ~/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms
# Port     : 8081 (bound to localhost only)
# Log      : <repo>/web/logs/runner-service-ms.log
# Managed  : Foreground (`./mvnw spring-boot:run`) OR launchd (optional)
# Profile  : dev   (matches the WizardCD UI's DEV environment)
# Database : Local PostgreSQL — :5432 (already installed)
# Target   : Docker container (see deploying-to-client-vm-local.sh)
#
# This file documents every step to run the runner service NATIVELY on your
# MacBook — replacing the AWS EC2 runner VM. It is intended as a reference;
# run commands individually, not as a script.
#
# Profile choice — why "dev" not "local":
#   The WizardCD UI exposes four environments — DEV, SIT, UAT, PROD. The
#   Spring profile names should mirror the UI names so the wiring is obvious
#   end-to-end. Local MacBook development = DEV environment = `dev` profile.
#   The runner JAR ships a corresponding application-dev.yaml that uses
#   repo-relative paths under ${user.dir}/.. so it Just Works on any Mac.
#
# Why local?
#   • Zero AWS cost (was ~$15–20/mo for the runner EC2 alone)
#   • 5–10s iteration loop instead of 60–90s (build → SCP → restart)
#   • Native logs in your IDE, native breakpoints, faster Phase 4 schema work
#
# Companion file: deploying-to-client-vm-local.sh (Docker target)
# Production file: deploying-runner-service-ms-aws-ec2.sh (still valid for push)
#
# Updated  : 2026-05-11
# =============================================================================


# =============================================================================
# ALIGNMENT NOTE — LOCAL vs AWS (read once)
# =============================================================================
#
# As of 2026-05-11 the following alignment exists between local and AWS:
#
#   Runner shell scripts (deploy.sh, application-deployment.sh, etc.)
#       LOCAL ≡ AWS   — identical (sha256 verified)
#
#   Runner Java code (runner-service-ms source)
#       LOCAL > AWS   — local is ~6 weeks ahead of the AWS JAR.
#       All recent UI/backend session work (Apr 23 build vs Mar 24 AWS JAR)
#       is in local source but has not been pushed to AWS.
#
#   Spring profile YAMLs
#       application.yaml         present (sets default profile = sit)
#       application-sit.yaml     present
#       application-uat.yaml     present
#       application-dev.yaml     ADDED 2026-05-11 — for local Mac dev (this guide)
#       application-prod.yaml    not present — UI exposes PROD but no backend
#                                profile yet. Add later if PROD becomes a real
#                                target with paths that differ from UAT.
#
# Two follow-up actions are RECOMMENDED but not blocking for local dev:
#
#   1. Push the local JAR to AWS so the runner VM gets the 6 weeks of changes.
#      See PART 9 of this guide. Do this whenever you next need AWS to be
#      current — but local dev works regardless of AWS state.
#
#   2. Add application-prod.yaml when PROD becomes an actual deployment target.
#      For now the UI's PROD environment is for show; no backend profile
#      means the JAR effectively falls back to the bundled default (sit).


# =============================================================================
# PHILOSOPHY — WHAT CHANGES vs AWS
# =============================================================================
#
#   AWS                                  Local
#   ──────────────────────────────────────────────────────────────────────────
#   EC2 t3.micro Ubuntu 22.04            macOS native (your laptop)
#   ssh wizardcd-runner-admin            (none — runs in terminal/IDE)
#   /opt/wizardcd/runner-service-ms.jar  <repo>/web/runner-service-ms/target/…
#   /opt/wizardcd/runner/*.sh            <repo>/web/runner/*.sh (already there)
#   /opt/wizardcd/workspace/jobs/        <repo>/web/workspace/jobs/
#   /opt/wizardcd/logs/                  <repo>/web/logs/
#   /home/wizard/.ssh/wizardcd_*         ~/.ssh/wizardcd_*  (Mac home)
#   systemd wizardcd-runner.service      foreground OR launchd plist
#   Elastic IP 54.144.235.55:8081        localhost:8081
#   apt install yq (auto)                Pre-installed via direct binary
#   apt install temurin-21-jdk           brew / SDKMAN
#   PostgreSQL on runner VM              PostgreSQL on Mac (already installed)
#
#   The Spring Boot code, the deploy.sh scripts, the SSH+SCP flow, and the
#   workspace conventions are all UNCHANGED. Only paths and runtime host move.


# =============================================================================
# PART 1 — ONE-TIME MAC SETUP
# =============================================================================
# Run once on your MacBook. Skip any step that's already done.


# -----------------------------------------------------------------------------
# 1.1  Install Java 21 (Adoptium Temurin)
#
#      The runner service requires Java 21. Two equally good install paths:
#
#        (a) SDKMAN (recommended — easy multi-version switching)
#        (b) Homebrew (simpler if you only ever need one Java)
#
#      Pick ONE.
# -----------------------------------------------------------------------------

# --- Option (a) — SDKMAN ---
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"

sdk install java 21.0.5-tem      # latest Temurin 21 LTS
sdk default java 21.0.5-tem

# Verify
java -version
# Expected: openjdk version "21.0.5" ...

echo "JAVA_HOME=$JAVA_HOME"
# Expected: $HOME/.sdkman/candidates/java/current


# --- Option (b) — Homebrew ---
brew install --cask temurin@21

# Set JAVA_HOME (add to ~/.zshrc or ~/.bashrc)
# Apple Silicon:
#   export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
# Intel:
#   export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home
# (same path on both architectures — installed via /Library/Java)

echo 'export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home' >> ~/.zshrc
echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.zshrc
source ~/.zshrc

java -version


# -----------------------------------------------------------------------------
# 1.2  Install yq v4.44.3 (pinned to match production)
#
#      IMPORTANT — must be EXACTLY v4.44.3.
#
#      deploy.sh has an auto-installer that detects "wrong version" and tries
#      to download v4.44.3 via apt/yum. On Mac that auto-installer fails (no
#      apt). So we install v4.44.3 directly via binary download — the same way
#      the runner VM does it.
#
#      If you already have yq from Homebrew (e.g. v4.48.x), pin v4.44.3 first;
#      Homebrew's `yq` will still be on PATH if you want a newer version for
#      other projects — just make sure the project-shadowed v4.44.3 wins.
# -----------------------------------------------------------------------------

# Determine your architecture
uname -m
#   x86_64  →  Intel Mac     →  yq_darwin_amd64
#   arm64   →  Apple Silicon →  yq_darwin_arm64

# Apple Silicon (M1/M2/M3/M4):
sudo curl -L -o /usr/local/bin/yq \
  https://github.com/mikefarah/yq/releases/download/v4.44.3/yq_darwin_arm64
sudo chmod +x /usr/local/bin/yq

# Intel Mac:
sudo curl -L -o /usr/local/bin/yq \
  https://github.com/mikefarah/yq/releases/download/v4.44.3/yq_darwin_amd64
sudo chmod +x /usr/local/bin/yq

# Verify version is EXACTLY v4.44.3
yq --version
# Expected: yq (https://github.com/mikefarah/yq/) version v4.44.3

# If Homebrew yq shadows /usr/local/bin/yq, check which one is first on PATH:
which -a yq
# Make sure /usr/local/bin/yq is the FIRST result, or adjust PATH in ~/.zshrc.


# -----------------------------------------------------------------------------
# 1.3  PostgreSQL — create the wizardcd user and database
#
#      You already have PostgreSQL running locally. Just need to create the
#      app user and database. This will be needed for Phase 4 onwards;
#      Phases 1–3 still use file-based storage, so this is forward prep.
# -----------------------------------------------------------------------------

# Check PostgreSQL is running
pg_isready -h localhost -p 5432
# Expected: localhost:5432 - accepting connections

# Create the wizardcd user + database (run via psql as your superuser)
psql -U "$USER" -d postgres -c "CREATE USER wizardcd WITH PASSWORD 'localdev';"
psql -U "$USER" -d postgres -c "CREATE DATABASE wizardcd OWNER wizardcd;"
psql -U "$USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE wizardcd TO wizardcd;"

# Verify connection as the wizardcd user
psql -U wizardcd -h localhost -d wizardcd -c "SELECT current_user, current_database();"
# Expected:
#   current_user | current_database
#   wizardcd     | wizardcd

# Optional — create a connection alias in ~/.pgpass for password-free psql later:
echo "localhost:5432:wizardcd:wizardcd:localdev" >> ~/.pgpass
chmod 600 ~/.pgpass


# -----------------------------------------------------------------------------
# 1.4  Per-environment SSH keys (auto-generated by the runner — no action needed)
#
#      The runner service's SshKeyServiceImpl auto-generates ED25519 keys at
#      ~/.ssh/wizardcd_<env>_ed25519 on first access (DEV/SIT/UAT/PROD).
#
#      If you have these keys already from the AWS setup, they're reused.
#      If you don't, the runner creates them on first start — no action here.
#
#      Verify what's already present (optional):
# -----------------------------------------------------------------------------

ls -la ~/.ssh/wizardcd_*_ed25519* 2>/dev/null || echo "No keys yet — will be auto-generated on first runner start."


# =============================================================================
# PART 2 — WORKSPACE DIRECTORY SETUP
# =============================================================================
# On AWS the runner writes into /opt/wizardcd/{workspace,logs}. Locally we
# use repo-relative paths under web/ so everything sits next to the source
# code and is easy to inspect, gitignore, and wipe.


# -----------------------------------------------------------------------------
# 2.1  Create the workspace and logs directories (idempotent)
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web

mkdir -p workspace/jobs logs config

# Verify
ls -la workspace logs config


# -----------------------------------------------------------------------------
# 2.2  Confirm gitignore covers these directories
#      (they're working data — should never be committed)
# -----------------------------------------------------------------------------

grep -E "^(workspace|logs|config)/" .gitignore 2>/dev/null || cat <<'EOF'
NOTE: Add the following to web/.gitignore if not already present:
  workspace/
  logs/
  config/
EOF


# =============================================================================
# PART 3 — SPRING PROFILE FOR LOCAL DEV  (dev profile)
# =============================================================================
# The runner JAR bundles application.yaml (default profile = sit) plus four
# environment overlays: application-{dev,sit,uat,prod}.yaml. For local Mac
# development we select the dev overlay — which uses repo-relative paths
# (${user.dir}/..) and binds the server to 127.0.0.1 only.
#
# Why "dev" matches the UI:
#   WizardCD UI environments  : DEV  SIT  UAT  PROD
#   Spring profile yaml files : dev  sit  uat  prod   ← same names, end-to-end
#
# The dev yaml ships with the source code — no manual file creation needed.


# -----------------------------------------------------------------------------
# 3.1  Verify application-dev.yaml is in place
#
#      The dev profile yaml ships with the source. Verify it sits next to its
#      sit/uat siblings:
# -----------------------------------------------------------------------------

ls -la /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms/src/main/resources/application-*.yaml

# Expected — at minimum:
#   application.yaml           ← base config (default profile = sit)
#   application-dev.yaml       ← local Mac dev  (THIS profile — repo-relative paths)
#   application-sit.yaml       ← AWS SIT  (Linux paths under /opt/wizardcd/)
#   application-uat.yaml       ← AWS UAT  (Linux paths, default for AWS deployment)


# -----------------------------------------------------------------------------
# 3.2  Inspect the dev profile (read-only — no editing for first use)
# -----------------------------------------------------------------------------

cat /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms/src/main/resources/application-dev.yaml

# Key dev-only overrides (vs sit/uat — which use hardcoded /opt/wizardcd/ paths):
#
#   server.address       : 127.0.0.1                       (loopback only)
#   runner.scriptsDir    : ${user.dir}/../runner           (instead of /opt/wizardcd/runner)
#   runner.workspaceRoot : ${user.dir}/../workspace/jobs   (instead of /opt/wizardcd/workspace/jobs)
#   logging.file.path    : ${user.dir}/../logs             (instead of /opt/wizardcd/logs)
#   runner.public-ip     : 127.0.0.1                       (UI Firewall panel shows this)
#   logging.level com.ebb.wizardcd.runner: DEBUG           (verbose for active dev)
#
# Phase 4 (database) will extend this file with a spring.datasource block
# pointing at localhost:5432. Until Phase 4 ships, no DB is required to run.


# -----------------------------------------------------------------------------
# 3.3  Path resolution — ${user.dir} must be runner-service-ms/
#
#      ${user.dir} resolves to the JVM's current working directory at launch.
#      For the dev paths to resolve correctly to web/runner, web/workspace, etc.,
#      you MUST launch the runner from runner-service-ms/. For example:
#
#        cd <repo>/web/runner-service-ms
#        ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
#
#      IntelliJ's default working dir is the module root (= runner-service-ms/),
#      so running from the IDE Just Works.
#
#      If you accidentally launch from <repo>/web/ instead, ${user.dir}/../runner
#      will resolve to <repo>/runner (one level too high). You'll see startup
#      errors about missing deploy.sh. Fix: cd into runner-service-ms/ and rerun.
# -----------------------------------------------------------------------------


# =============================================================================
# PART 4 — BUILD (same as AWS)
# =============================================================================
# Same Maven command, same output JAR. Nothing local-specific here.


cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms

./mvnw clean package -DskipTests

# Output JAR: target/runner-service-ms-0.0.1-SNAPSHOT.jar
ls -lh target/runner-service-ms-0.0.1-SNAPSHOT.jar


# =============================================================================
# PART 5 — RUN THE RUNNER
# =============================================================================
# Two options — pick what fits your workflow.


# -----------------------------------------------------------------------------
# 5.1  Option A — Foreground via Maven (recommended for active development)
#
#      Fast iteration: edit code, Ctrl+C, re-run. Logs stream to the terminal.
#      Auto-restart on code change if you use spring-boot-devtools.
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms

./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# Press Ctrl+C to stop.


# -----------------------------------------------------------------------------
# 5.2  Option B — Foreground via packaged JAR (closer to production behavior)
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms

java -jar target/runner-service-ms-0.0.1-SNAPSHOT.jar \
  --spring.profiles.active=dev


# -----------------------------------------------------------------------------
# 5.3  Option C — Background via launchd (optional — for keeping it always-on)
#
#      Use only if you want the runner to start on Mac boot and run quietly
#      in the background. For active development, Option A is better.
# -----------------------------------------------------------------------------

cat > ~/Library/LaunchAgents/com.ebb.wizardcd.runner.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ebb.wizardcd.runner</string>

  <key>WorkingDirectory</key>
  <string>/Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms</string>

  <key>ProgramArguments</key>
  <array>
    <string>/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home/bin/java</string>
    <string>-jar</string>
    <string>target/runner-service-ms-0.0.1-SNAPSHOT.jar</string>
    <string>--spring.profiles.active=dev</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/logs/launchd-stdout.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/logs/launchd-stderr.log</string>
</dict>
</plist>
EOF

# Load and start
launchctl load ~/Library/LaunchAgents/com.ebb.wizardcd.runner.plist

# Stop / unload
launchctl unload ~/Library/LaunchAgents/com.ebb.wizardcd.runner.plist


# =============================================================================
# PART 6 — VERIFY
# =============================================================================
# Same health checks as production — just pointed at localhost.


# Service is up — actuator health
curl -s http://localhost:8081/actuator/health
# Expected: {"status":"UP"}

# Runner public IP — UI uses this for the firewall panel
curl -s http://localhost:8081/runner/info | python3 -m json.tool
# Expected: { "publicIp": "127.0.0.1" }   ← from wizardcd.runner.public-ip override

# Per-environment public keys — these are auto-generated on first start
curl -s http://localhost:8081/runner/public-keys | python3 -m json.tool
# Expected:
#   {
#     "DEV":  "ssh-ed25519 AAAA...",
#     "SIT":  "ssh-ed25519 AAAA...",
#     "UAT":  "ssh-ed25519 AAAA...",
#     "PROD": "ssh-ed25519 AAAA..."
#   }

# Confirm profile is "dev"
curl -s http://localhost:8081/actuator/env | python3 -m json.tool | grep -A1 "activeProfiles"
# Expected: includes "dev"

# Confirm logs are being written
ls -lh /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/logs/
tail -n 50 /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/logs/runner-service-ms.log


# =============================================================================
# PART 7 — POINT THE UI AT THE LOCAL RUNNER
# =============================================================================


# -----------------------------------------------------------------------------
# 7.1  Update the UI environment config
# -----------------------------------------------------------------------------

cat > /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/ui/.env.local << 'EOF'
VITE_API_BASE_URL=http://localhost:8081
VITE_APP_ENV=DEV
EOF


# -----------------------------------------------------------------------------
# 7.2  Restart the UI dev server
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/ui
npm run dev

# Open http://localhost:5173 — UI is now talking to the local runner on :8081


# =============================================================================
# PART 8 — DAY-TO-DAY OPERATIONS
# =============================================================================


# -----------------------------------------------------------------------------
# 8.1  Rebuild after code changes
#
#      If you're using Option A (./mvnw spring-boot:run with devtools), hot
#      reload handles most changes automatically. For changes that require
#      a full restart (config, dependencies, schema), Ctrl+C and rerun.
# -----------------------------------------------------------------------------

# Quick restart loop (Option A, foreground):
#   1. Ctrl+C the running runner
#   2. ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# Full rebuild + restart (Option B, JAR):
cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms
./mvnw clean package -DskipTests
# Ctrl+C the running JAR, then:
java -jar target/runner-service-ms-0.0.1-SNAPSHOT.jar --spring.profiles.active=dev


# -----------------------------------------------------------------------------
# 8.2  Health checks
# -----------------------------------------------------------------------------

curl -s http://localhost:8081/actuator/health                            # Service up?
curl -s http://localhost:8081/runner/info | python3 -m json.tool         # Runner IP
curl -s http://localhost:8081/runner/public-keys | python3 -m json.tool  # SSH pubkeys


# -----------------------------------------------------------------------------
# 8.3  View live logs
# -----------------------------------------------------------------------------

tail -n 100 -f /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/logs/runner-service-ms.log


# -----------------------------------------------------------------------------
# 8.4  Inspect the workspace (job working directories)
# -----------------------------------------------------------------------------

ls -la /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/workspace/jobs/

# Detailed view of a specific job
ls -la /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/workspace/jobs/<job-uuid>/


# -----------------------------------------------------------------------------
# 8.5  Inspect / reset PostgreSQL
# -----------------------------------------------------------------------------

# Connect interactively
psql -U wizardcd -h localhost -d wizardcd

# Drop + recreate for a clean slate (DANGER — loses all data)
psql -U "$USER" -d postgres -c "DROP DATABASE wizardcd;"
psql -U "$USER" -d postgres -c "CREATE DATABASE wizardcd OWNER wizardcd;"


# -----------------------------------------------------------------------------
# 8.6  Wipe local job history (without touching the DB)
# -----------------------------------------------------------------------------

rm -rf /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/workspace/jobs/*
rm    /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/logs/*.log


# =============================================================================
# PART 9 — PUSH TO AWS (when ready to ship)
# =============================================================================
# When you've finished local work and want to deploy to the AWS runner VM,
# follow the original AWS guide — same JAR, different host.


# -----------------------------------------------------------------------------
# 9.1  Build the JAR
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms
./mvnw clean package -DskipTests


# -----------------------------------------------------------------------------
# 9.2  Push to AWS using the production guide
#
#      The application-dev.yaml profile is bundled in the JAR but only active
#      when --spring.profiles.active=dev. AWS resolves to its own profile (uat)
#      via start-runner.sh reading the bundled application.yaml — pushing the
#      JAR from local does NOT cause AWS to switch to the dev profile.
#
#      See: deploying-runner-service-ms-aws-ec2.sh  PART 10 (Day-to-day)
# -----------------------------------------------------------------------------

# Reminder: AWS uses these aliases (already in your ~/.ssh/config)
#   wizardcd-runner-admin  →  ubuntu user (admin)
#   wizardcd-runner        →  wizard user (service)

# One-liner for AWS push:
cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms && \
./mvnw clean package -DskipTests && \
ssh wizardcd-runner-admin "sudo systemctl stop wizardcd-runner" && \
scp target/runner-service-ms-0.0.1-SNAPSHOT.jar wizardcd-runner:/tmp/ && \
ssh wizardcd-runner-admin "
  sudo mv /tmp/runner-service-ms-0.0.1-SNAPSHOT.jar /opt/wizardcd/ &&
  sudo chown wizard:wizard /opt/wizardcd/runner-service-ms-0.0.1-SNAPSHOT.jar &&
  sudo systemctl start wizardcd-runner
" && \
sleep 5 && \
curl -s http://54.144.235.55:8081/actuator/health


# =============================================================================
# REFERENCE
# =============================================================================

# Key paths on your Mac (local runner):
#
#   <repo>/web/runner-service-ms/                           Source + Maven project
#   <repo>/web/runner-service-ms/target/runner-service-ms-0.0.1-SNAPSHOT.jar
#                                                           Built JAR
#   <repo>/web/runner/                                      Deployment shell scripts
#   <repo>/web/runner/deploy.sh                             Main deploy orchestrator
#   <repo>/web/workspace/jobs/                              Per-job working directories
#   <repo>/web/logs/runner-service-ms.log                   Active app log
#   <repo>/web/runner-service-ms/src/main/resources/application-dev.yaml
#                                                           Dev Spring profile (this guide)
#   <repo>/web/runner-service-ms/src/main/resources/application-sit.yaml
#                                                           SIT Spring profile (AWS)
#   <repo>/web/runner-service-ms/src/main/resources/application-uat.yaml
#                                                           UAT Spring profile (AWS, default)
#   ~/.ssh/wizardcd_dev_ed25519                             DEV per-env key
#   ~/.ssh/wizardcd_sit_ed25519                             SIT per-env key
#   ~/.ssh/wizardcd_uat_ed25519                             UAT per-env key
#   ~/.ssh/wizardcd_prod_ed25519                            PROD per-env key
#   /usr/local/bin/yq                                       yq v4.44.3 (pinned)
#   ~/Library/LaunchAgents/com.ebb.wizardcd.runner.plist    Optional launchd unit

# Local-vs-AWS endpoint cheat sheet:
#
#   Local                                  AWS
#   ─────────────────────────────────────────────────────────────────────
#   http://localhost:8081/                 http://54.144.235.55:8081/
#   psql -h localhost wizardcd             psql -h localhost wizardcd (on runner VM)
#   <repo>/web/workspace/jobs/             /opt/wizardcd/workspace/jobs/
#   <repo>/web/logs/runner-service-ms.log  /opt/wizardcd/logs/runner-service-ms.log
#   spring.profiles.active=dev             spring.profiles.active=uat
#   profile yaml = application-dev.yaml    profile yaml = application-uat.yaml

# Spring profile resolution order (highest → lowest):
#
#   1. CLI arg          --spring.profiles.active=dev         (local Mac dev)
#   2. Env var          SPRING_PROFILES_ACTIVE=dev           (alt for local)
#   3. application.yaml spring.profiles.active=sit           (bundled default)
#                                                            (start-runner.sh overrides to uat on AWS)

# When you're done with AWS for the day:
#   Don't terminate the EC2 — STOP it. Keeps your EBS volume + Elastic IP.
#   AWS Console → EC2 → Instances → select wizardcd-runner → Instance State → Stop
#   Cost while stopped: ~$1/month for the EBS volume + EIP.
#   Resume in 30s when you next need to push: Instance State → Start.


# =============================================================================
# TROUBLESHOOTING
# =============================================================================
#
# Q: "yq: command not found" or "yq: wrong version"
# A: Check `which -a yq` — make sure /usr/local/bin/yq (v4.44.3) is first on PATH.
#    Re-run the download in §1.2 if missing.
#
# Q: "Connection refused localhost:5432"
# A: PostgreSQL isn't running. On Mac:
#      brew services start postgresql@16   (or whichever version you installed)
#
# Q: "Port 8081 already in use"
# A: Another instance is running. Find + kill it:
#      lsof -ti:8081 | xargs kill -9
#
# Q: deploy.sh fails with "permission denied"
# A: chmod +x <repo>/web/runner/*.sh
#
# Q: "Address already in use: bind 0.0.0.0:8081"
# A: Your application-dev.yaml didn't load — server.address fell back to 0.0.0.0
#    instead of 127.0.0.1. Verify the active profile with:
#      curl -s http://localhost:8081/actuator/env | grep activeProfiles
#    Must show "dev". If it shows "sit" or anything else, you didn't pass
#    --spring.profiles.active=dev (or -Dspring-boot.run.profiles=dev for mvnw).
#
# Q: Runner auto-generated keys at ~/.ssh/wizardcd_* but Docker target rejects them
# A: After first runner start, copy the new pubkeys into the Docker target.
#    See deploying-to-client-vm-local.sh PART 5.
#
# Q: "Could not connect to runner" from UI
# A: Check .env.local has VITE_API_BASE_URL=http://localhost:8081 and restart Vite.
