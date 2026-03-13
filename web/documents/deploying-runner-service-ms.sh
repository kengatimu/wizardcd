#!/bin/bash
# =============================================================================
# WizardCD — Runner Service Deployment Guide
# =============================================================================
# Service  : runner-service-ms (Spring Boot 3.x, Java 21)
# Deploy   : /opt/wizardcd/
# Port     : 8081
# Log      : /opt/wizardcd/logs/runner-service-ms.log
# Managed  : systemd (wizardcd-runner.service)
#
# This file documents every step to deploy and operate the runner service
# on either a Vagrant VM or a standard Linux VM.
# It is intended as a reference — run commands individually, not as a script.
#
# Updated  : 2026-03-07
# =============================================================================



# =============================================================================
# PART 1 — ONE-TIME MAC SETUP  (run once, applies to both VM types)
# =============================================================================

# -----------------------------------------------------------------------------
# 1.1  Generate the SSH key pair used to access the runner VM
# -----------------------------------------------------------------------------

ssh-keygen -t ed25519 \
  -f ~/.ssh/id_ed25519_wizardcd_runner_vm \
  -C "wizardcd-runner@macbook" \
  -N ""

chmod 600 ~/.ssh/id_ed25519_wizardcd_runner_vm
chmod 644 ~/.ssh/id_ed25519_wizardcd_runner_vm.pub


# -----------------------------------------------------------------------------
# 1.2  Add SSH config aliases
#
#      wizardcd-runner-admin  →  initial admin/setup access
#      wizardcd-runner        →  day-to-day deploy user access
#
#      Replace <admin-user> with:
#        Vagrant VM      → vagrant
#        Standard VM     → your existing sudo-enabled user
# -----------------------------------------------------------------------------

cat >> ~/.ssh/config <<'EOF'

# WizardCD Runner VM — admin access (initial setup only)
Host wizardcd-runner-admin
  HostName 192.168.56.9
  User <admin-user>
  IdentityFile ~/.ssh/id_ed25519_wizardcd_runner_vm
  IdentitiesOnly yes

# WizardCD Runner VM — deploy user (day-to-day operations)
Host wizardcd-runner
  HostName 192.168.56.9
  User deploy
  IdentityFile ~/.ssh/id_ed25519_wizardcd_runner_vm
  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config



# =============================================================================
# PART 2A — SSH KEY SETUP: VAGRANT VM
#
# Vagrant disables password auth by default so ssh-copy-id will not work.
# Use "vagrant ssh" to inject the key — it handles auth automatically.
# =============================================================================

# Navigate to your Vagrantfile directory first
cd /path/to/your/vagrant/project

# Inject your public key via vagrant's built-in SSH access
vagrant ssh -- "mkdir -p ~/.ssh && \
  echo '$(cat ~/.ssh/id_ed25519_wizardcd_runner_vm.pub)' >> ~/.ssh/authorized_keys && \
  chmod 700 ~/.ssh && \
  chmod 600 ~/.ssh/authorized_keys"

# Verify key auth works without a password
ssh wizardcd-runner-admin "echo connected as vagrant OK"



# =============================================================================
# PART 2B — SSH KEY SETUP: STANDARD LINUX VM
#
# Password auth is enabled by default on standard VMs.
# ssh-copy-id works immediately — you will be prompted for the user password once.
# =============================================================================

ssh-copy-id -i ~/.ssh/id_ed25519_wizardcd_runner_vm.pub <admin-user>@192.168.56.9

# Verify key auth works without a password
ssh wizardcd-runner-admin "echo connected OK"



# =============================================================================
# PART 3 — SERVER SETUP  (identical for both VM types)
# =============================================================================

# -----------------------------------------------------------------------------
# 3.1  Create the deploy user
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin \
  "sudo adduser --disabled-password --gecos '' deploy"


# -----------------------------------------------------------------------------
# 3.2  Grant permissions
#      - Adds deploy to the sudo group
#      - Scoped passwordless sudo for service management only
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin "sudo usermod -aG sudo deploy"

ssh wizardcd-runner-admin "sudo tee /etc/sudoers.d/wizardcd-runner > /dev/null <<'EOF'
deploy ALL=(ALL) NOPASSWD: /bin/systemctl start wizardcd-runner
deploy ALL=(ALL) NOPASSWD: /bin/systemctl stop wizardcd-runner
deploy ALL=(ALL) NOPASSWD: /bin/systemctl restart wizardcd-runner
deploy ALL=(ALL) NOPASSWD: /bin/systemctl status wizardcd-runner
deploy ALL=(ALL) NOPASSWD: /bin/systemctl enable wizardcd-runner
deploy ALL=(ALL) NOPASSWD: /bin/systemctl daemon-reload
deploy ALL=(ALL) NOPASSWD: /bin/tee /etc/systemd/system/wizardcd-runner.service
deploy ALL=(ALL) NOPASSWD: /bin/journalctl
EOF
sudo chmod 440 /etc/sudoers.d/wizardcd-runner"

or for all permssions - deploy ALL=(ALL) NOPASSWD:ALL

# -----------------------------------------------------------------------------
# 3.3  Set up SSH access for the deploy user
#      Copies the authorized_keys from the admin user into deploy's home
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin \
  "sudo mkdir -p /home/deploy/.ssh && \
   sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys && \
   sudo chown -R deploy:deploy /home/deploy/.ssh && \
   sudo chmod 700 /home/deploy/.ssh && \
   sudo chmod 600 /home/deploy/.ssh/authorized_keys"

# Verify — all remaining commands use this alias (deploy user)
ssh wizardcd-runner "echo connected as deploy OK"


# -----------------------------------------------------------------------------
# 3.4  Create the application directory structure
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin \
  "sudo mkdir -p /opt/wizardcd/{runner,workspace/jobs,logs} && \
   sudo chown -R deploy:deploy /opt/wizardcd && \
   sudo chmod 750 /opt/wizardcd"


# -----------------------------------------------------------------------------
# 3.5  Verify Java 21 is installed
# -----------------------------------------------------------------------------

ssh wizardcd-runner "java -version"

# If not installed:
ssh wizardcd-runner-admin "sudo apt update && sudo apt install -y openjdk-21-jdk"



# =============================================================================
# PART 4 — BUILD  (run on MacBook)
# =============================================================================

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms

./mvnw clean package -DskipTests

# Output JAR: target/runner-service-ms-0.0.1-SNAPSHOT.jar



# =============================================================================
# PART 5 — DEPLOY FILES TO VM
# =============================================================================

# -----------------------------------------------------------------------------
# 5.1  Copy the JAR
# -----------------------------------------------------------------------------

scp /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms/target/runner-service-ms-0.0.1-SNAPSHOT.jar \
    wizardcd-runner:/opt/wizardcd/


# -----------------------------------------------------------------------------
# 5.2  Copy runner scripts (includes start-runner.sh and deployment scripts)
# -----------------------------------------------------------------------------

scp -r /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner/ \
    wizardcd-runner:/opt/wizardcd/runner/

ssh wizardcd-runner "chmod +x /opt/wizardcd/runner/*.sh"


# -----------------------------------------------------------------------------
# 5.3  Copy per-environment SSH keys
#
#      These keys are used by the runner to SSH into target deployment servers.
#      They were generated on the MacBook with:
#        ssh-keygen -t ed25519 -f ~/.ssh/wizardcd_<env>_ed25519 -N "" -C "wizardcd-<env>@runner"
# -----------------------------------------------------------------------------

scp \
  ~/.ssh/wizardcd_sit_ed25519 \
  ~/.ssh/wizardcd_sit_ed25519.pub \
  ~/.ssh/wizardcd_uat_ed25519 \
  ~/.ssh/wizardcd_uat_ed25519.pub \
  ~/.ssh/wizardcd_prod_ed25519 \
  ~/.ssh/wizardcd_prod_ed25519.pub \
  wizardcd-runner:~/.ssh/

ssh wizardcd-runner \
  "chmod 600 ~/.ssh/wizardcd_*_ed25519 && \
   chmod 644 ~/.ssh/wizardcd_*_ed25519.pub"



# =============================================================================
# PART 6 — SYSTEMD SERVICE
# =============================================================================

# -----------------------------------------------------------------------------
# 6.1  Create the service unit
#
#      ExecStart points to start-runner.sh which:
#        - Reads spring.profiles.active from inside the JAR automatically
#        - Exports it as SPRING_PROFILES_ACTIVE
#        - Launches the JAR with the correct profile
#
#      No hardcoded profile in the systemd unit — the JAR drives its own config.
# -----------------------------------------------------------------------------

ssh wizardcd-runner-admin "sudo tee /etc/systemd/system/wizardcd-runner.service > /dev/null <<'EOF'
[Unit]
Description=WizardCD Runner Service
After=network.target

[Service]
User=deploy
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
# 6.2  Enable and start the service
# -----------------------------------------------------------------------------

ssh wizardcd-runner \
  "sudo systemctl daemon-reload && \
   sudo systemctl enable wizardcd-runner && \
   sudo systemctl start wizardcd-runner"



# =============================================================================
# PART 7 — VERIFY
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



# =============================================================================
# PART 8 — DAY-TO-DAY OPERATIONS
# =============================================================================

# -----------------------------------------------------------------------------
# 8.1  Redeploy a new JAR (build → stop → copy → start)
# -----------------------------------------------------------------------------

cd /Users/bishop/Desktop/Bishop/Personal/EBB_Systems/WizardCd/web/runner-service-ms
./mvnw clean package -DskipTests

ssh wizardcd-runner "sudo systemctl stop wizardcd-runner"

scp target/runner-service-ms-0.0.1-SNAPSHOT.jar \
    wizardcd-runner:/opt/wizardcd/

ssh wizardcd-runner "sudo systemctl start wizardcd-runner"


# -----------------------------------------------------------------------------
# 8.2  Restart / Stop / Start
# -----------------------------------------------------------------------------

ssh wizardcd-runner "sudo systemctl restart wizardcd-runner"
ssh wizardcd-runner "sudo systemctl stop    wizardcd-runner"
ssh wizardcd-runner "sudo systemctl start   wizardcd-runner"
ssh wizardcd-runner "sudo systemctl status   wizardcd-runner"


# -----------------------------------------------------------------------------
# 8.3  View logs
# -----------------------------------------------------------------------------

# Live file log (last 100 lines + follow)
ssh wizardcd-runner "tail -n 100 -f /opt/wizardcd/logs/runner-service-ms.log"

# journald — captures startup errors before the file log is ready
ssh wizardcd-runner "sudo journalctl -u wizardcd-runner -n 100 -f"



# =============================================================================
# REFERENCE
# =============================================================================

# Key paths on the VM:
#
#   /opt/wizardcd/runner-service-ms-0.0.1-SNAPSHOT.jar   Application JAR
#   /opt/wizardcd/runner/                                 Deployment shell scripts
#   /opt/wizardcd/runner/start-runner.sh                  Service startup script
#   /opt/wizardcd/workspace/jobs/                         Job working directories
#   /opt/wizardcd/logs/runner-service-ms.log              Active application log
#   /opt/wizardcd/logs/runner-service-ms.yyyy-MM-dd.N.gz  Rolled logs (30-day retention)
#   /home/deploy/.ssh/wizardcd_*_ed25519                  Per-environment deploy keys
#   /etc/systemd/system/wizardcd-runner.service           systemd unit file

# Profile resolution order (highest → lowest priority):
#
#   1. JVM arg          --spring.profiles.active=X      (manual command-line override)
#   2. Env var          SPRING_PROFILES_ACTIVE           (set by start-runner.sh from JAR)
#   3. application.yaml spring.profiles.active           (bundled default inside JAR)

# Vagrant vs Standard VM — only difference:
#
#   Vagrant        →  vagrant ssh -- "echo '<pub-key>' >> ~/.ssh/authorized_keys"
#   Standard Linux →  ssh-copy-id -i ~/.ssh/id_ed25519_wizardcd_runner_vm.pub user@host
