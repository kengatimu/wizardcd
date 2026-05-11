#!/bin/bash
# =============================================================================
# WizardCD — Client VM LOCAL (Docker) Setup Guide
# =============================================================================
# Purpose  : Target "VM" — receives application deployments from the local runner
# Platform : Docker container (Ubuntu 22.04 LTS) running on macOS
# Java     : Temurin 25 JDK  (deployed applications run on Java 25)
# Deploy   : /app/home/deploy/deployments (inside container, mounted to host)
# Users    : root (container admin) | deploy (application owner)
# Access   : ssh -p 2222 deploy@localhost  (port 22 mapped to host 2222)
#
# This file documents every step to spin up the WizardCD client VM as a Docker
# container on your MacBook — replacing the AWS EC2 client VM. The runner
# service (running natively on the same Mac) SSHes into the container as
# the deploy user, exactly as it does to the AWS EC2 client.
#
# Companion file: deploying-runner-service-ms-local.sh
# Production file: deploying-to-client-vm-aws-ec2.sh (still valid for push)
#
# Why a Docker container (not localhost as your Mac user)?
#   • Real Linux: Tanuki Service Wrapper Linux binaries (.so) work unchanged.
#   • Real `deploy` user: matches production permissions exactly.
#   • Linux paths: /app/home/deploy/deployments/ — same as AWS.
#   • Zero code changes to deploy.sh — the same scripts run.
#   • When you push to AWS, nothing has been adapted — it just works.
#
# Updated  : 2026-05-10
# =============================================================================


# =============================================================================
# PHILOSOPHY — WHAT CHANGES vs AWS
# =============================================================================
#
#   AWS                                  Local (Docker)
#   ──────────────────────────────────────────────────────────────────────────
#   EC2 t3.micro Ubuntu 22.04            ubuntu:22.04 Docker image
#   Public Elastic IP 34.201.190.116     localhost (port 22 mapped to host 2222)
#   Security group + SG rules            None — localhost only
#   ssh wizardcd-client-admin             ssh wizardcd-client-local-admin
#   ssh wizardcd-client                   ssh wizardcd-client-local
#   sudo apt install temurin-25-jdk       Same — runs inside container
#   /usr/lib/jvm/temurin-25-jdk-amd64     Same — installed via apt in container
#   /home/deploy/.ssh/authorized_keys     Same — populated at container build
#   /app/home/deploy/deployments/         Same — mounted to host ~/wizardcd-deploys
#   Stop EC2 when not in use             docker stop wizardcd-client
#
#   The runner code, deploy.sh, application-deployment.sh, Tanuki wrapper
#   templates, SSH+SCP commands — ALL unchanged. The container looks exactly
#   like a tiny AWS Ubuntu 22.04 EC2 instance from the runner's point of view.


# =============================================================================
# PART 1 — ONE-TIME MAC SETUP
# =============================================================================


# -----------------------------------------------------------------------------
# 1.1  Install Docker
#
#      Three good options on macOS (any of them works):
#        Docker Desktop  — easiest GUI, ~600MB RAM idle, free for personal use
#        OrbStack        — lighter alternative, faster file I/O, ~$8/mo or free trial
#        Colima          — open source, CLI-only, free, ~100MB RAM idle
#
#      Pick ONE. The commands below work identically across all three because
#      they all expose the standard `docker` CLI.
# -----------------------------------------------------------------------------

# --- Option (a) — Docker Desktop ---
brew install --cask docker
# Then open Docker.app once to complete first-run setup.

# --- Option (b) — OrbStack ---
brew install --cask orbstack
# Then open OrbStack.app once.

# --- Option (c) — Colima (CLI only) ---
brew install colima docker docker-compose
colima start --memory 4 --cpu 2 --disk 20

# Verify Docker is up
docker --version          # Expected: Docker version 24.x or newer
docker ps                 # Expected: empty list (no error)


# -----------------------------------------------------------------------------
# 1.2  Create a directory on your Mac to hold the container's deployments
#
#      We mount this directory into the container so you can browse deployed
#      apps from Finder — exactly like SSH'ing in and ls'ing /app/home/deploy.
# -----------------------------------------------------------------------------

mkdir -p ~/wizardcd-deploys
ls -ld ~/wizardcd-deploys
# Expected: drwxr-xr-x ... ~/wizardcd-deploys


# =============================================================================
# PART 2 — BUILD THE CLIENT CONTAINER IMAGE
# =============================================================================


# -----------------------------------------------------------------------------
# 2.1  Create the Dockerfile
#
#      Mirrors the AWS Ubuntu 22.04 setup step-for-step:
#        • Same base OS (Ubuntu 22.04 LTS)
#        • Same JDK (Adoptium Temurin 25)
#        • Same `deploy` user, same authorized_keys layout
#        • Same SSH server, same port (mapped to host 2222 to avoid Mac port 22)
#        • Same tools (unzip, curl)
# -----------------------------------------------------------------------------

mkdir -p /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/docker/client

cat > /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/docker/client/Dockerfile << 'EOF'
# WizardCD Client VM — local Docker equivalent of the AWS EC2 client
# Mirrors deploying-to-client-vm-aws-ec2.sh sections 4.1–4.5 exactly.
#
# Build : docker build -t wizardcd-client:local .
# Run   : see docker-compose.yml in the same directory.

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ── 4.1 / 4.3 — System packages ────────────────────────────────────
RUN apt-get update && apt-get install -y \
      openssh-server \
      sudo \
      curl \
      wget \
      unzip \
      apt-transport-https \
      gpg \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── 4.2 — Install Temurin 25 JDK (matches AWS exactly) ─────────────
RUN wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
      | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg \
    && echo 'deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb jammy main' \
      > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt-get install -y temurin-25-jdk \
    && rm -rf /var/lib/apt/lists/*

# ── 4.4 — Create the deploy user ───────────────────────────────────
RUN useradd -m -d /home/deploy -s /bin/bash deploy \
    && passwd -d deploy

# Optional: grant deploy passwordless sudo (uncomment if needed for debugging)
# RUN echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy \
#     && chmod 440 /etc/sudoers.d/deploy

# ── 4.5 — SSH setup ────────────────────────────────────────────────
RUN mkdir -p /var/run/sshd /home/deploy/.ssh \
    && chown -R deploy:deploy /home/deploy/.ssh \
    && chmod 700 /home/deploy/.ssh \
    && touch /home/deploy/.ssh/authorized_keys \
    && chown deploy:deploy /home/deploy/.ssh/authorized_keys \
    && chmod 600 /home/deploy/.ssh/authorized_keys

# Allow public-key auth, disable password auth (security match for prod)
RUN sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config \
    && sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Deploy target dir (matches /app/home/deploy/deployments in WizardCD UI)
RUN mkdir -p /app/home/deploy/deployments \
    && chown -R deploy:deploy /app/home/deploy

# Expose SSH
EXPOSE 22

# Start sshd in the foreground
CMD ["/usr/sbin/sshd", "-D", "-e"]
EOF


# -----------------------------------------------------------------------------
# 2.2  Create docker-compose.yml for easy start/stop
# -----------------------------------------------------------------------------

cat > /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/docker/client/docker-compose.yml << 'EOF'
# WizardCD Client VM — local Docker compose
# Mirrors a single AWS EC2 client VM.
#
# Start : docker compose up -d
# Stop  : docker compose stop
# Logs  : docker compose logs -f
# Shell : docker compose exec wizardcd-client bash

services:
  wizardcd-client:
    build:
      context: .
      dockerfile: Dockerfile
    image: wizardcd-client:local
    container_name: wizardcd-client
    hostname: wizardcd-client-local
    ports:
      # host:container — SSH on host port 2222 (Mac already uses 22 if Remote Login enabled)
      - "127.0.0.1:2222:22"
    volumes:
      # Mount the deployment dir so you can inspect from Finder / outside the container
      - ${HOME}/wizardcd-deploys:/app/home/deploy/deployments
    restart: unless-stopped
EOF


# -----------------------------------------------------------------------------
# 2.3  Build the image (one-time, ~3 min depending on bandwidth)
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/docker/client

docker compose build

# Verify the image exists
docker images | grep wizardcd-client


# =============================================================================
# PART 3 — START THE CLIENT CONTAINER
# =============================================================================


# -----------------------------------------------------------------------------
# 3.1  Start the container
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/docker/client

docker compose up -d

# Confirm it's running
docker compose ps
# Expected: wizardcd-client   ... Up ... 127.0.0.1:2222->22/tcp


# -----------------------------------------------------------------------------
# 3.2  Verify Java 25 inside the container
# -----------------------------------------------------------------------------

docker compose exec wizardcd-client java -version
# Expected: openjdk version "25" ...

docker compose exec wizardcd-client ls /usr/lib/jvm/
# Expected: temurin-25-jdk-amd64


# =============================================================================
# PART 4 — MAC SSH CONFIG (FOR DIRECT DEBUGGING)
# =============================================================================
# The runner connects to the container internally (localhost:2222) using its
# per-environment keys — no special SSH config needed for runner→client traffic.
# But you'll often want to ssh in yourself for debugging. These aliases give
# you the same admin / deploy split as production.


# -----------------------------------------------------------------------------
# 4.1  Generate a Mac → container admin key (one-time)
# -----------------------------------------------------------------------------

ssh-keygen -t ed25519 \
  -f ~/.ssh/id_ed25519_wizardcd_client_local \
  -C "wizardcd-client-local@macbook" \
  -N ""

chmod 600 ~/.ssh/id_ed25519_wizardcd_client_local
chmod 644 ~/.ssh/id_ed25519_wizardcd_client_local.pub


# -----------------------------------------------------------------------------
# 4.2  Authorize your Mac admin key on the container
# -----------------------------------------------------------------------------

cat ~/.ssh/id_ed25519_wizardcd_client_local.pub | \
  docker compose exec -T wizardcd-client \
    bash -c "cat >> /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys"


# -----------------------------------------------------------------------------
# 4.3  Add SSH config aliases to your Mac
# -----------------------------------------------------------------------------

cat >> ~/.ssh/config << 'EOF'

# WizardCD Client (Local Docker) — deploy user (application owner)
Host wizardcd-client-local
  HostName       127.0.0.1
  Port           2222
  User           deploy
  IdentityFile   ~/.ssh/id_ed25519_wizardcd_client_local
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  UserKnownHostsFile /dev/null
  LogLevel       ERROR
EOF

chmod 600 ~/.ssh/config


# -----------------------------------------------------------------------------
# 4.4  Verify direct access as deploy from your Mac
# -----------------------------------------------------------------------------

ssh wizardcd-client-local "echo connected as deploy OK && whoami && java -version"
# Expected:
#   connected as deploy OK
#   deploy
#   openjdk version "25" ...


# =============================================================================
# PART 5 — AUTHORIZE RUNNER SSH KEYS ON THE CLIENT
# =============================================================================
# The runner service (running natively on Mac) SSHes into the container as
# the deploy user using the per-environment keys at ~/.ssh/wizardcd_<env>_ed25519.
#
# All 4 environment keys (DEV/SIT/UAT/PROD) need to be authorized on the
# container's deploy user — even though for local dev you'll mostly use DEV.
# This way switching envs in the UI just works.


# -----------------------------------------------------------------------------
# 5.1  Make sure the runner has generated all per-env keys
#
#      Start the runner once (see deploying-runner-service-ms-local.sh PART 5).
#      On first start, SshKeyServiceImpl generates any missing keys.
#      Then confirm the public keys exist on your Mac:
# -----------------------------------------------------------------------------

ls -la ~/.ssh/wizardcd_*_ed25519.pub

# Expected — 4 pubkeys (one per env):
#   ~/.ssh/wizardcd_dev_ed25519.pub
#   ~/.ssh/wizardcd_sit_ed25519.pub
#   ~/.ssh/wizardcd_uat_ed25519.pub
#   ~/.ssh/wizardcd_prod_ed25519.pub

# Alternative — fetch them from the running runner's API:
curl -s http://localhost:8081/runner/public-keys | python3 -m json.tool


# -----------------------------------------------------------------------------
# 5.2  Authorize all 4 runner pubkeys on the container's deploy user
#
#      Option A — bulk-append all 4 keys at once (one-liner)
# -----------------------------------------------------------------------------

cat ~/.ssh/wizardcd_dev_ed25519.pub \
    ~/.ssh/wizardcd_sit_ed25519.pub \
    ~/.ssh/wizardcd_uat_ed25519.pub \
    ~/.ssh/wizardcd_prod_ed25519.pub | \
  docker compose exec -T wizardcd-client \
    bash -c "cat >> /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys && chown deploy:deploy /home/deploy/.ssh/authorized_keys"


#      Option B — use the WizardCD UI's generated setup script (per env)
#
#      In the UI:
#        New Deploy → Step 1: SSH Target → SSH Keys Configuration
#        → "Setup Script" (Recommended) → copy the script
#
#      Then SSH in as deploy and paste:

ssh wizardcd-client-local
# Paste the script from the UI, then exit.


# -----------------------------------------------------------------------------
# 5.3  Verify all keys are present in authorized_keys
# -----------------------------------------------------------------------------

docker compose exec wizardcd-client cat /home/deploy/.ssh/authorized_keys

# Expected — at least 5 lines:
#   ssh-ed25519 AAAA... wizardcd-client-local@macbook    ← Mac admin key (§4.2)
#   ssh-ed25519 AAAA... wizardcd-dev@runner              ← Runner DEV key
#   ssh-ed25519 AAAA... wizardcd-sit@runner              ← Runner SIT key
#   ssh-ed25519 AAAA... wizardcd-uat@runner              ← Runner UAT key
#   ssh-ed25519 AAAA... wizardcd-prod@runner             ← Runner PROD key


# =============================================================================
# PART 6 — VERIFY RUNNER → CLIENT SSH
# =============================================================================
# Confirm the runner can SSH into the container as the deploy user.
# These commands run from your Mac and use the runner's per-env keys directly.


# -----------------------------------------------------------------------------
# 6.1  SSH as deploy using each environment key
# -----------------------------------------------------------------------------

for env in dev sit uat prod; do
  echo "── Testing $env key ────────────────────"
  ssh -i ~/.ssh/wizardcd_${env}_ed25519 \
      -o StrictHostKeyChecking=accept-new \
      -o UserKnownHostsFile=/dev/null \
      -o LogLevel=ERROR \
      -p 2222 \
      deploy@127.0.0.1 \
      "echo $env key works: \$(whoami)@\$(hostname)"
done

# Expected for each env:
#   dev key works: deploy@wizardcd-client-local
#   sit key works: deploy@wizardcd-client-local
#   uat key works: deploy@wizardcd-client-local
#   prod key works: deploy@wizardcd-client-local


# -----------------------------------------------------------------------------
# 6.2  Easier — use the WizardCD UI's "Test Connection" button
#
#      New Deploy → Step 1: SSH Target →
#        Environment   : DEV  (or any)
#        SSH User      : deploy
#        SSH Host      : 127.0.0.1
#        SSH Port      : 2222
#        Target Base Path : /app/home/deploy/deployments
#      → click "Test Connection"
#
#      Expected: "✓ Runner can reach the server successfully — ready to continue."
#      The Java auto-detection should then find /usr/lib/jvm/temurin-25-jdk-amd64/bin/java.
# -----------------------------------------------------------------------------


# =============================================================================
# PART 7 — WIZARDCD UI DEPLOYMENT CONFIGURATION (LOCAL)
# =============================================================================
# Enter these values in the UI (New Deploy → Step 1: SSH Target) when targeting
# the local Docker client.
#
#   Field                  Value
#   ─────────────────────────────────────────────────────────────────────────
#   Environment            DEV  (or any — all 4 keys are authorized)
#   SSH User               deploy
#   SSH Host               127.0.0.1                          ← localhost
#   SSH Port               2222                               ← host port mapping
#   Target Base Path       /app/home/deploy/deployments
#   Java Binary Path       /usr/lib/jvm/temurin-25-jdk-amd64/bin/java
#
#   FIREWALL panel will show: Runner Public IP = 127.0.0.1
#   (overridden via wizardcd.runner.public-ip in application-local.yml)
#
#   No security group, no firewall rules — everything is localhost.


# =============================================================================
# PART 8 — DAY-TO-DAY OPERATIONS (LOCAL CLIENT)
# =============================================================================


# -----------------------------------------------------------------------------
# 8.1  Start / stop the container
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/docker/client

docker compose start    # bring it up (after `down` or first boot)
docker compose stop     # halt it (keeps state)
docker compose restart  # full restart
docker compose down     # stop and remove (volumes preserved)
docker compose up -d    # build (if needed) + start in background


# -----------------------------------------------------------------------------
# 8.2  Check running applications inside the container
# -----------------------------------------------------------------------------

docker compose exec wizardcd-client ps aux | grep java
docker compose exec wizardcd-client ls -la /app/home/deploy/deployments/

# Or via SSH (matches AWS workflow exactly):
ssh wizardcd-client-local "ps aux | grep java"
ssh wizardcd-client-local "ls -la /app/home/deploy/deployments/"


# -----------------------------------------------------------------------------
# 8.3  View deployed application logs
# -----------------------------------------------------------------------------

# All log files across all deployments
ssh wizardcd-client-local "find /app/home/deploy/deployments -name '*.log' | head -20"

# Tail a specific app's wrapper log (replace <app-name>)
ssh wizardcd-client-local "tail -n 100 -f /app/home/deploy/deployments/<app-name>/dev/logs/wrapper.log"

# OR — browse from Finder/Terminal on your Mac (volume mount):
ls -la ~/wizardcd-deploys/
tail -f ~/wizardcd-deploys/<app-name>/dev/logs/wrapper.log


# -----------------------------------------------------------------------------
# 8.4  Stop / start / restart a deployed application (via Tanuki wrapper)
# -----------------------------------------------------------------------------

ssh wizardcd-client-local "/app/home/deploy/deployments/<app-name>/dev/bin/wrapper stop"
ssh wizardcd-client-local "/app/home/deploy/deployments/<app-name>/dev/bin/wrapper start"
ssh wizardcd-client-local "/app/home/deploy/deployments/<app-name>/dev/bin/wrapper restart"


# -----------------------------------------------------------------------------
# 8.5  Reset the client to a clean slate
#
#      Two levels of "clean":
#        Light  — drop deployments, keep the container
#        Hard   — drop the container, rebuild from scratch
# -----------------------------------------------------------------------------

# --- Light — wipe deployments ---
rm -rf ~/wizardcd-deploys/*
docker compose restart wizardcd-client

# --- Hard — destroy and rebuild ---
cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/docker/client
docker compose down --rmi local --volumes
docker compose up -d --build

# Note: after a hard reset, you must re-run §4.2 and §5.2 to re-authorize keys.


# -----------------------------------------------------------------------------
# 8.6  Exposing an application port to your Mac
#
#      Production: you add an inbound SG rule in AWS Console.
#      Locally:    add a port mapping in docker-compose.yml.
#
#      Example — expose a deployed app listening on port 8080 inside the
#      container as port 8080 on your Mac:
# -----------------------------------------------------------------------------

# Edit docker-compose.yml — add to ports list:
#   ports:
#     - "127.0.0.1:2222:22"
#     - "127.0.0.1:8080:8080"   ← add this

# Then apply
docker compose up -d           # recreates with new port mapping

# Test
curl -s http://localhost:8080/actuator/health


# =============================================================================
# PART 9 — PUSH TO AWS (when ready)
# =============================================================================
# Once you've validated locally, the AWS client VM still exists (stopped).
# Start the AWS EC2 client, then deploy from the UI as normal — pointing at
# the AWS Elastic IP (34.201.190.116:22) instead of localhost:2222.
#
# See deploying-to-client-vm-aws-ec2.sh PART 7 for the full AWS UI config.
#
# No code changes — only the UI's SSH Target fields change.


# =============================================================================
# REFERENCE
# =============================================================================

# SSH aliases (Mac):
#
#   wizardcd-client-local   deploy user on the local Docker client
#                           (use ssh wizardcd-client-local from any terminal)

# Key paths INSIDE the container (deploy user):
#
#   /app/home/deploy/deployments/                        WizardCD deploy root
#   /app/home/deploy/deployments/<app>/<env>/            Per-app per-env workspace
#   /app/home/deploy/deployments/<app>/<env>/logs/       Application + wrapper logs
#   /app/home/deploy/deployments/<app>/<env>/bin/        Tanuki wrapper binary
#   /app/home/deploy/deployments/<app>/<env>/conf/       Wrapper config
#   /home/deploy/.ssh/authorized_keys                    Authorized SSH keys
#   /usr/lib/jvm/temurin-25-jdk-amd64                    Java 25 home
#   /usr/lib/jvm/temurin-25-jdk-amd64/bin/java           Java 25 binary

# Key paths on your Mac:
#
#   ~/wizardcd-deploys/                                  Host-side view of deployments
#                                                        (mounted into the container)
#   ~/.ssh/id_ed25519_wizardcd_client_local              Mac → container admin key
#   ~/.ssh/wizardcd_dev_ed25519                          Runner DEV key (authorized)
#   ~/.ssh/wizardcd_sit_ed25519                          Runner SIT key (authorized)
#   ~/.ssh/wizardcd_uat_ed25519                          Runner UAT key (authorized)
#   ~/.ssh/wizardcd_prod_ed25519                         Runner PROD key (authorized)
#   <repo>/web/docker/client/Dockerfile                  Container image definition
#   <repo>/web/docker/client/docker-compose.yml          Container start/stop config

# WizardCD UI deployment configuration summary (Local):
#
#   Environment      : DEV (or any)
#   SSH user         : deploy
#   SSH host         : 127.0.0.1                                  ← localhost
#   SSH port         : 2222                                       ← host mapping
#   Target base path : /app/home/deploy/deployments
#   Java binary      : /usr/lib/jvm/temurin-25-jdk-amd64/bin/java

# Local vs AWS — quick reference:
#
#   Field         Local                                       AWS (UAT)
#   ──────────────────────────────────────────────────────────────────
#   Environment   DEV (any)                                   UAT
#   SSH host      127.0.0.1                                   34.201.190.116
#   SSH port      2222                                        22
#   Java binary   /usr/lib/jvm/temurin-25-jdk-amd64/bin/java  (same)
#   Target path   /app/home/deploy/deployments                (same)
#   Container OS  Ubuntu 22.04 (Docker image)                 Ubuntu 22.04 (EC2 AMI)

# SSH key ownership model (local):
#
#   Mac key (id_ed25519_wizardcd_client_local)
#     Mac → deploy@localhost:2222   (direct troubleshooting)
#
#   Runner per-env keys (wizardcd_<env>_ed25519)
#     Local Runner (Java process) → deploy@localhost:2222   (all deployments)
#
#   /home/deploy/.ssh/authorized_keys contains all 5 keys: Mac admin + 4 runner pubkeys.


# =============================================================================
# TROUBLESHOOTING
# =============================================================================
#
# Q: "docker: command not found"
# A: Docker isn't running. Open Docker.app / OrbStack.app, or:
#      colima start    (if using Colima)
#
# Q: "Cannot connect to the Docker daemon"
# A: Same — make sure Docker Desktop / OrbStack is running, OR `colima start`.
#
# Q: "ssh: connect to host 127.0.0.1 port 2222: Connection refused"
# A: Container isn't running. Check:
#      docker compose ps
#    If not "Up", run:
#      docker compose up -d
#
# Q: "Permission denied (publickey)"
# A: Your SSH key isn't authorized. Re-run §4.2 (Mac key) or §5.2 (runner keys).
#    Verify with:
#      docker compose exec wizardcd-client cat /home/deploy/.ssh/authorized_keys
#
# Q: "Test Connection" in UI says firewall blocked
# A: The runner's IP detection sees 127.0.0.1 → 127.0.0.1, which is fine.
#    If it still fails, check the runner can resolve "localhost:2222":
#      ssh -p 2222 deploy@127.0.0.1 "echo ok"
#
# Q: Container starts then immediately stops
# A: Check logs for errors:
#      docker compose logs wizardcd-client
#    Most common cause: SSH config typo. Rebuild:
#      docker compose down --rmi local
#      docker compose up -d --build
#
# Q: Apple Silicon — slow performance
# A: ubuntu:22.04 has both arm64 and amd64 variants. Docker picks arm64
#    natively on M1/M2/M3 — should be fast. If you see "platform mismatch"
#    warnings, force the architecture in docker-compose.yml:
#      platform: linux/arm64
#    (or linux/amd64 if you need to test x86 compatibility)
#
# Q: Deployed Java app inside container starts but fails health check
# A: That's a runtime problem with the deployed app, not the platform.
#    Inspect:
#      ssh wizardcd-client-local "tail -n 100 /app/home/deploy/deployments/<app>/dev/logs/wrapper.log"
#
# Q: Want to use a different image (e.g. Debian, AlmaLinux)
# A: Change FROM ubuntu:22.04 in the Dockerfile. The Adoptium repo path needs
#    to match your distro (the 'jammy' codename in the repo line is Ubuntu-specific).
#    For Debian bookworm: change 'jammy main' → 'bookworm main'.
#
# Q: How do I get the same setup but with a 2nd container (multi-VM testing)?
# A: Add a second service to docker-compose.yml with a different name + port:
#      wizardcd-client-2:
#        ...
#        ports: ["127.0.0.1:2223:22"]
#    Then in the UI, point a different env at 127.0.0.1:2223.
