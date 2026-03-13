#!/bin/bash
# =============================================================================
# WizardCD — Runner Service AWS EC2 Deployment Guide
# =============================================================================
# Service  : runner-service-ms (Spring Boot 3.x, Java 21)
# Platform : AWS EC2 (Ubuntu 22.04 LTS, t2.micro — Free Tier)
# Deploy   : /opt/wizardcd/
# Port     : 8081
# Log      : /opt/wizardcd/logs/runner-service-ms.log
# Managed  : systemd (wizardcd-runner.service)
# Users    : ubuntu (EC2 admin) | wizard (service user)
#
# This file documents every step to deploy and operate the runner service
# on AWS EC2 — from SSH key generation on Mac to a running verified service.
# It is intended as a reference — run commands individually, not as a script.
#
# Phase 1  : Runner VM  — this file
# Phase 2  : Client VM  — see deploying-to-client-vm-aws-ec2.sh (coming)
#
# Updated  : 2026-03-11
# =============================================================================


# =============================================================================
# FREE TIER NOTES
# =============================================================================
#
#   Resource        Free Tier Limit           What we use
#   ─────────────────────────────────────────────────────────────────
#   EC2             750 hrs/month × 12 months  2 × t2.micro
#   Storage         30 GB EBS                  ~20 GB per instance
#   Data transfer   1 GB/month outbound        Minimal for testing
#
#   WARNING: Running 2 × t2.micro simultaneously = ~1,440 hrs/month.
#   Stop the CLIENT VM when not in use to stay within free tier.
#   The runner VM can remain running.


# =============================================================================
# PART 1 — ONE-TIME MAC SETUP
# =============================================================================
# Run once on your MacBook. Keys persist across all environments.
# If keys already exist from a previous setup, skip to Part 2.


# -----------------------------------------------------------------------------
# 1.1  Generate the SSH key pair used by your Mac to access the runner VM
# -----------------------------------------------------------------------------

ssh-keygen -t ed25519 \
  -f ~/.ssh/id_ed25519_wizardcd_runner_vm \
  -C "wizardcd-runner@macbook" \
  -N ""

chmod 600 ~/.ssh/id_ed25519_wizardcd_runner_vm
chmod 644 ~/.ssh/id_ed25519_wizardcd_runner_vm.pub


# -----------------------------------------------------------------------------
# 1.2  Generate per-environment SSH keys
#
#      These keys are used by the runner service to SSH into client/target VMs.
#      One key pair per environment — SIT, UAT, PROD.
# -----------------------------------------------------------------------------

ssh-keygen -t ed25519 \
  -f ~/.ssh/wizardcd_sit_ed25519 \
  -C "wizardcd-sit@runner" \
  -N ""

ssh-keygen -t ed25519 \
  -f ~/.ssh/wizardcd_uat_ed25519 \
  -C "wizardcd-uat@runner" \
  -N ""

ssh-keygen -t ed25519 \
  -f ~/.ssh/wizardcd_prod_ed25519 \
  -C "wizardcd-prod@runner" \
  -N ""

chmod 600 ~/.ssh/wizardcd_sit_ed25519 \
          ~/.ssh/wizardcd_uat_ed25519 \
          ~/.ssh/wizardcd_prod_ed25519

chmod 644 ~/.ssh/wizardcd_sit_ed25519.pub \
          ~/.ssh/wizardcd_uat_ed25519.pub \
          ~/.ssh/wizardcd_prod_ed25519.pub


# -----------------------------------------------------------------------------
# 1.3  Verify all 8 key files are present
# -----------------------------------------------------------------------------

ls -la ~/.ssh/id_ed25519_wizardcd_runner_vm* \
       ~/.ssh/wizardcd_sit_ed25519* \
       ~/.ssh/wizardcd_uat_ed25519* \
       ~/.ssh/wizardcd_prod_ed25519*

# Expected output — 8 files (4 private + 4 public):
#   -rw-------  id_ed25519_wizardcd_runner_vm
#   -rw-r--r--  id_ed25519_wizardcd_runner_vm.pub
#   -rw-------  wizardcd_sit_ed25519
#   -rw-r--r--  wizardcd_sit_ed25519.pub
#   -rw-------  wizardcd_uat_ed25519
#   -rw-r--r--  wizardcd_uat_ed25519.pub
#   -rw-------  wizardcd_prod_ed25519
#   -rw-r--r--  wizardcd_prod_ed25519.pub


# =============================================================================
# PART 2 — AWS CONSOLE SETUP
# =============================================================================
# These steps are performed in the AWS Console (browser).
# Commands below are helpers — steps must be completed in the console first.


# -----------------------------------------------------------------------------
# 2.1  Import your SSH public key into AWS as a Key Pair
#
#      Console: EC2 → Key Pairs → Actions → Import key pair
#        Name         : wizardcd-runner-key
#        Key material : paste output of the command below
# -----------------------------------------------------------------------------

cat ~/.ssh/id_ed25519_wizardcd_runner_vm.pub


# -----------------------------------------------------------------------------
# 2.2  Create a Security Group
#
#      Console: EC2 → Security Groups → Create security group
#        Name        : wizardcd-runner-sg
#        Description : WizardCD Runner VM security group
#        VPC         : Default VPC
#
#      Inbound rules:
#        Type        Protocol  Port  Source   Purpose
#        SSH         TCP       22    My IP    SSH from Mac
#        Custom TCP  TCP       8081  My IP    UI → Runner API
#
#      Outbound rules: leave as default (all traffic allowed)
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# 2.3  Launch the EC2 Instance
#
#      Console: EC2 → Instances → Launch instances
#        Name           : wizardcd-runner
#        AMI            : Ubuntu Server 22.04 LTS (Free tier eligible)
#        Architecture   : 64-bit (x86)
#        Instance type  : t3.micro (Free tier eligible)
#        Key pair       : wizardcd-runner-key
#        Security group : wizardcd-runner-sg (existing)
#        Storage        : 20 GiB  gp2
#
#      Wait until: Instance state = Running, Status check = 2/2 passed
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# 2.4  Allocate and attach an Elastic IP (recommended — keeps IP stable)
#
#      Console: EC2 → Elastic IPs → Allocate Elastic IP address → Allocate
#      Select the new IP → Actions → Associate Elastic IP address
#        Instance : wizardcd-runner
#
#      Note your stable public IP — used in all commands below as <EC2-PUBLIC-IP>
# -----------------------------------------------------------------------------


# =============================================================================
# PART 3 — MAC SSH CONFIG
# =============================================================================
# Replace <EC2-PUBLIC-IP> with your actual Elastic IP before running.


# -----------------------------------------------------------------------------
# 3.1  Add SSH config aliases
#
#      wizardcd-runner-admin  →  ubuntu user automatically created by AWS (EC2 default admin, setup only) 
#      wizardcd-runner        →  wizard user  (service user, day-to-day)
# -----------------------------------------------------------------------------

cat >> ~/.ssh/config << 'EOF'

# WizardCD Runner VM — AWS EC2 admin access (ubuntu = default EC2 user)
# AWS automatically creates it when the instance launches. It is the built-in EC2 admin user for Ubuntu AMIs.
Host wizardcd-runner-admin
  # HostName     <EC2-PUBLIC-IP>
  HostName     54.144.235.55
  User         ubuntu
  IdentityFile ~/.ssh/id_ed25519_wizardcd_runner_vm
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new

# WizardCD Runner VM — wizard service user (day-to-day operations)
Host wizardcd-runner
  # HostName     <EC2-PUBLIC-IP>
  HostName     54.144.235.55
  User         wizard
  IdentityFile ~/.ssh/id_ed25519_wizardcd_runner_vm
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF

chmod 600 ~/.ssh/config


# -----------------------------------------------------------------------------
# 3.2  Verify connection to EC2 instance
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin "echo connected as ubuntu OK"


# =============================================================================
# PART 4 — SERVER SETUP
# =============================================================================


# -----------------------------------------------------------------------------
# 4.1  Update system packages
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin "sudo apt update && sudo apt upgrade -y"


# -----------------------------------------------------------------------------
# 4.2  Install Java 21 (Adoptium Temurin)
#
#      Using Adoptium's official repository — recommended over the default
#      openjdk package. Provides Temurin JDK 21 LTS.
# -----------------------------------------------------------------------------

# Add Adoptium repository
ssh wizardcd-runner-admin "
  sudo apt update &&
  sudo apt install -y wget apt-transport-https gpg &&
  wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
    | sudo gpg --dearmor -o /usr/share/keyrings/adoptium.gpg &&
  echo 'deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb jammy main' \
    | sudo tee /etc/apt/sources.list.d/adoptium.list
"

# Install Temurin 21 JDK
ssh wizardcd-runner-admin "
  sudo apt update &&
  sudo apt install -y temurin-21-jdk
"

# Set JAVA_HOME for the wizard user (interactive sessions)
ssh wizardcd-runner "
  echo '' >> ~/.bashrc &&
  echo 'export JAVA_HOME=/usr/lib/jvm/temurin-21-jdk-amd64' >> ~/.bashrc &&
  echo 'export PATH=\$JAVA_HOME/bin:\$PATH' >> ~/.bashrc
"

# Verify
ssh wizardcd-runner "
  source ~/.bashrc &&
  java -version &&
  javac -version &&
  echo \$JAVA_HOME
"


# -----------------------------------------------------------------------------
# 4.3  Install required tools (unzip + curl + yq)
#
#      unzip  — used by start-runner.sh to read profile from inside the JAR
#      yq     — used by runner scripts to parse YAML config
#               pinned to v4.44.3 for deterministic parsing
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin "
  sudo apt install -y unzip curl &&
  sudo wget -qO /usr/local/bin/yq \
    https://github.com/mikefarah/yq/releases/download/v4.44.3/yq_linux_amd64 &&
  sudo chmod +x /usr/local/bin/yq &&
  yq --version
"


# -----------------------------------------------------------------------------
# 4.4  Create the wizard user
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin \
  "sudo adduser --disabled-password --gecos '' wizard"


# -----------------------------------------------------------------------------
# 4.5  Grant scoped passwordless sudo to wizard
#      Limited to service management commands only
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin "sudo tee /etc/sudoers.d/wizardcd-runner > /dev/null << 'EOF'
wizard ALL=(ALL) NOPASSWD: /bin/systemctl start wizardcd-runner
wizard ALL=(ALL) NOPASSWD: /bin/systemctl stop wizardcd-runner
wizard ALL=(ALL) NOPASSWD: /bin/systemctl restart wizardcd-runner
wizard ALL=(ALL) NOPASSWD: /bin/systemctl status wizardcd-runner
wizard ALL=(ALL) NOPASSWD: /bin/systemctl enable wizardcd-runner
wizard ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
wizard ALL=(ALL) NOPASSWD: /bin/tee /etc/systemd/system/wizardcd-runner.service
wizard ALL=(ALL) NOPASSWD: /bin/journalctl
EOF
sudo chmod 440 /etc/sudoers.d/wizardcd-runner"

# Alternative — full sudo access (simpler for dev/test):
# wizard ALL=(ALL) NOPASSWD:ALL


# -----------------------------------------------------------------------------
# 4.6  Set up SSH access for the wizard user
#      Copies authorized_keys from ubuntu into wizard's home
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin "
  sudo mkdir -p /home/wizard/.ssh &&
  sudo cp ~/.ssh/authorized_keys /home/wizard/.ssh/authorized_keys &&
  sudo chown -R wizard:wizard /home/wizard/.ssh &&
  sudo chmod 700 /home/wizard/.ssh &&
  sudo chmod 600 /home/wizard/.ssh/authorized_keys
"

# Verify direct access as wizard
ssh wizardcd-runner "echo connected as wizard OK"


# -----------------------------------------------------------------------------
# 4.7  Create the application directory structure
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin "
  sudo mkdir -p /opt/wizardcd/{runner,workspace/jobs,logs} &&
  sudo chown -R wizard:wizard /opt/wizardcd &&
  sudo chmod 750 /opt/wizardcd
"

# Verify
ssh wizardcd-runner "ls -la /opt/wizardcd/"


# =============================================================================
# PART 5 — BUILD  (run on MacBook)
# =============================================================================

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms

./mvnw clean package -DskipTests

# Output JAR: target/runner-service-ms-0.0.1-SNAPSHOT.jar

ls -lh target/runner-service-ms-0.0.1-SNAPSHOT.jar


# =============================================================================
# PART 6 — DEPLOY FILES TO EC2
# =============================================================================


# -----------------------------------------------------------------------------
# 6.1  Copy the JAR
# -----------------------------------------------------------------------------

scp /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms/target/runner-service-ms-0.0.1-SNAPSHOT.jar \
    wizardcd-runner:/opt/wizardcd/


# -----------------------------------------------------------------------------
# 6.2  Copy runner scripts (includes start-runner.sh and all deployment scripts)
# -----------------------------------------------------------------------------

scp -r /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner/ \
    wizardcd-runner:/opt/wizardcd/

ssh wizardcd-runner "chmod +x /opt/wizardcd/runner/*.sh"


# -----------------------------------------------------------------------------
# 6.3  Copy per-environment SSH keys to the runner VM
#
#      These keys are used by the runner service to SSH into client/target VMs.
#      Private keys: chmod 600  |  Public keys: chmod 644
# -----------------------------------------------------------------------------

scp \
  ~/.ssh/wizardcd_sit_ed25519 \
  ~/.ssh/wizardcd_sit_ed25519.pub \
  ~/.ssh/wizardcd_uat_ed25519 \
  ~/.ssh/wizardcd_uat_ed25519.pub \
  ~/.ssh/wizardcd_prod_ed25519 \
  ~/.ssh/wizardcd_prod_ed25519.pub \
  wizardcd-runner:~/.ssh/

ssh wizardcd-runner "
  chmod 600 ~/.ssh/wizardcd_*_ed25519 &&
  chmod 644 ~/.ssh/wizardcd_*_ed25519.pub
"


# -----------------------------------------------------------------------------
# 6.4  Verify all files are in place
# -----------------------------------------------------------------------------

ssh wizardcd-runner "
  echo '=== JAR ===' &&
  ls -lh /opt/wizardcd/*.jar &&
  echo '=== Scripts ===' &&
  ls /opt/wizardcd/runner/*.sh &&
  echo '=== Directories ===' &&
  ls /opt/wizardcd/ &&
  echo '=== SSH Keys ===' &&
  ls -la ~/.ssh/wizardcd_*
"


# =============================================================================
# PART 7 — SYSTEMD SERVICE
# =============================================================================


# -----------------------------------------------------------------------------
# 7.1  Create the service unit
#
#      ExecStart points to start-runner.sh which:
#        - Reads spring.profiles.active from inside the JAR automatically
#        - Exports it as SPRING_PROFILES_ACTIVE
#        - Launches the JAR with the correct profile
#
#      No hardcoded profile in the systemd unit — the JAR drives its own config.
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin "sudo tee /etc/systemd/system/wizardcd-runner.service > /dev/null << 'EOF'
[Unit]
Description=WizardCD Runner Service
After=network.target

[Service]
User=wizard
WorkingDirectory=/opt/wizardcd
ExecStart=/opt/wizardcd/runner/start-runner.sh
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF"


# -----------------------------------------------------------------------------
# 7.2  Enable and start the service
# -----------------------------------------------------------------------------

ssh wizardcd-runner "
  sudo systemctl daemon-reload &&
  sudo systemctl enable wizardcd-runner &&
  sudo systemctl start wizardcd-runner
"

# =============================================================================
# PART 8 — VERIFY
# =============================================================================

# Service status
ssh wizardcd-runner "sudo systemctl status wizardcd-runner"

# Confirm profile was auto-resolved from JAR (not hardcoded)
ssh wizardcd-runner \
  "sudo journalctl -u wizardcd-runner -n 10 | grep -E 'start-runner|profile is active'"

# Tail live application log file
ssh wizardcd-runner "tail -n 100 -f /opt/wizardcd/logs/runner-service-ms.log"

# Health check via actuator
ssh wizardcd-runner "curl -s http://localhost:8081/actuator/health"

# Expected outputs:
#   [start-runner] Active profile resolved: uat
#   The following 1 profile is active: "uat"
#   {"status":"UP"}

# Health check from your Mac
curl -s http://<EC2-PUBLIC-IP>:8081/actuator/health
curl -s http://54.144.235.55:8081/actuator/health

# Verify per-environment SSH keys are accessible to the runner
curl -s http://<EC2-PUBLIC-IP>:8081/runner/public-keys | python3 -m json.tool
curl -s http://54.144.235.55:8081/runner/public-keys | python3 -m json.tool

# Expected outputs:
#   [start-runner] Active profile resolved: uat
#   The following 1 profile is active: "uat"
#   {"status":"UP"}
#   { "SIT": "ssh-ed25519 AAAA...", "UAT": "ssh-ed25519 AAAA...", "PROD": "ssh-ed25519 AAAA..." }


# =============================================================================
# PART 9 — POINT THE UI AT THE EC2 RUNNER
# =============================================================================
# Replace <EC2-PUBLIC-IP> with your actual Elastic IP.


# -----------------------------------------------------------------------------
# 9.1  Update the UI environment config
# -----------------------------------------------------------------------------

cat > /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/ui/.env.local << EOF
VITE_API_BASE_URL=http://<EC2-PUBLIC-IP>:8081
VITE_APP_ENV=UAT
EOF


# -----------------------------------------------------------------------------
# 9.2  Restart the UI dev server
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/ui
npm run dev

# Open http://localhost:5173 — UI is now talking to the runner on AWS EC2


# =============================================================================
# PART 10 — DAY-TO-DAY OPERATIONS
# =============================================================================


# -----------------------------------------------------------------------------
# 10.1  Redeploy a new JAR (build → stop → copy → start)
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms
./mvnw clean package -DskipTests

ssh wizardcd-runner "sudo systemctl stop wizardcd-runner"

scp target/runner-service-ms-0.0.1-SNAPSHOT.jar \
    wizardcd-runner:/opt/wizardcd/

ssh wizardcd-runner "sudo systemctl start wizardcd-runner"


# -----------------------------------------------------------------------------
# 10.2  Restart / Stop / Start
# -----------------------------------------------------------------------------

ssh wizardcd-runner "sudo systemctl restart wizardcd-runner"
ssh wizardcd-runner "sudo systemctl stop    wizardcd-runner"
ssh wizardcd-runner "sudo systemctl start   wizardcd-runner"
ssh wizardcd-runner "sudo systemctl status  wizardcd-runner"


# -----------------------------------------------------------------------------
# 10.3  View logs
# -----------------------------------------------------------------------------

# Live file log (last 100 lines + follow)
ssh wizardcd-runner "tail -n 100 -f /opt/wizardcd/logs/runner-service-ms.log"

# journald — captures startup errors before the file log is ready
ssh wizardcd-runner "sudo journalctl -u wizardcd-runner -n 100 -f"


# =============================================================================
# REFERENCE
# =============================================================================

# SSH aliases:
#
#   wizardcd-runner-admin   ubuntu user  — admin / setup tasks only
#   wizardcd-runner         wizard user  — service management / day-to-day

# Key paths on the runner VM:
#
#   /opt/wizardcd/runner-service-ms-0.0.1-SNAPSHOT.jar   Application JAR
#   /opt/wizardcd/runner/                                 Deployment shell scripts
#   /opt/wizardcd/runner/start-runner.sh                  Service startup script
#   /opt/wizardcd/runner/deploy.sh                        Main deployment orchestrator
#   /opt/wizardcd/workspace/jobs/                         Job working directories
#   /opt/wizardcd/logs/runner-service-ms.log              Active application log
#   /opt/wizardcd/logs/runner-service-ms.yyyy-MM-dd.N.gz  Rolled logs (30-day retention)
#   /home/wizard/.ssh/wizardcd_*_ed25519                  Per-environment SSH key pairs
#   /etc/systemd/system/wizardcd-runner.service           systemd unit file
#   /etc/sudoers.d/wizardcd-runner                        Scoped sudo rules

# Key paths on your Mac:
#
#   ~/.ssh/id_ed25519_wizardcd_runner_vm        Mac → Runner VM access key
#   ~/.ssh/wizardcd_sit_ed25519                 SIT per-env key (runner → SIT target)
#   ~/.ssh/wizardcd_uat_ed25519                 UAT per-env key (runner → UAT target)
#   ~/.ssh/wizardcd_prod_ed25519                PROD per-env key (runner → PROD target)

# Profile resolution order (highest → lowest priority):
#
#   1. JVM arg          --spring.profiles.active=X      (manual override)
#   2. Env var          SPRING_PROFILES_ACTIVE           (set by start-runner.sh from JAR)
#   3. application.yaml spring.profiles.active           (bundled default inside JAR)

# AWS EC2 vs Vagrant — key differences:
#
#   EC2             Admin user = ubuntu  (injected by AWS at launch via key pair)
#   Vagrant         Admin user = vagrant (injected via vagrant ssh bootstrap)
#
#   EC2             No bootstrap needed — key injected at instance launch
#   Vagrant         Must inject key manually via: vagrant ssh -- "echo '...' >> authorized_keys"
#
#   EC2             Public IP changes on stop/start unless Elastic IP is attached
#   Vagrant         IP is static (defined in Vagrantfile)
