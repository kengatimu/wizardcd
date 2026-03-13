#!/bin/bash
# =============================================================================
# WizardCD — Client VM AWS EC2 Setup Guide
# =============================================================================
# Purpose  : Target VM — receives application deployments from the runner
# Platform : AWS EC2 (Ubuntu 22.04 LTS, t3.micro — Free Tier)
# Java     : Temurin 25 JDK  (deployed applications run on Java 25)
# Deploy   : /app/home/deploy/deployments  (configured in WizardCD UI)
# Users    : ubuntu (EC2 admin) | deploy (application owner)
# Access   : Runner SSHes in as deploy using wizardcd_uat_ed25519 key
#
# This file documents every step to set up the WizardCD client VM on AWS EC2.
# The runner service (Phase 1) SSHes into this VM to deploy applications.
# It is intended as a reference — run commands individually, not as a script.
#
# Phase 1  : Runner VM — see deploying-runner-service-ms-aws-ec2.sh  (done)
# Phase 2  : Client VM — this file
#
# Updated  : 2026-03-12
# =============================================================================


# =============================================================================
# FREE TIER NOTES
# =============================================================================
#
#   Resource        Free Tier Limit           What we use
#   ─────────────────────────────────────────────────────────────────
#   EC2             750 hrs/month × 12 months  2 × t3.micro
#   Storage         30 GB EBS                  ~20 GB per instance
#   Data transfer   1 GB/month outbound        Minimal for testing
#
#   WARNING: Running 2 × t3.micro simultaneously = ~1,440 hrs/month.
#   Stop the CLIENT VM when not in use to stay within free tier.
#   The runner VM can remain running as it manages deployments.


# =============================================================================
# PART 1 — ONE-TIME MAC SETUP
# =============================================================================
# Run once on your MacBook. Skip if already done.
# This key is used by your Mac to admin the client VM (SSH troubleshooting only).
# The runner uses its own UAT key (wizardcd_uat_ed25519) to deploy — not this one.


# -----------------------------------------------------------------------------
# 1.1  Generate the SSH key pair used by your Mac to access the client VM
# -----------------------------------------------------------------------------

ssh-keygen -t ed25519 \
  -f ~/.ssh/id_ed25519_wizardcd_client_vm \
  -C "wizardcd-client@macbook" \
  -N ""

chmod 600 ~/.ssh/id_ed25519_wizardcd_client_vm
chmod 644 ~/.ssh/id_ed25519_wizardcd_client_vm.pub


# -----------------------------------------------------------------------------
# 1.2  Verify the key was created
# -----------------------------------------------------------------------------

ls -la ~/.ssh/id_ed25519_wizardcd_client_vm*

# Expected:
#   -rw-------  id_ed25519_wizardcd_client_vm
#   -rw-r--r--  id_ed25519_wizardcd_client_vm.pub


# =============================================================================
# PART 2 — AWS CONSOLE SETUP
# =============================================================================
# These steps are performed in the AWS Console (browser).
# Commands below are helpers — steps must be completed in the console first.


# -----------------------------------------------------------------------------
# 2.1  Import your SSH public key into AWS as a Key Pair
#
#      Console: EC2 → Key Pairs → Actions → Import key pair
#        Name         : wizardcd-client-key
#        Key material : paste output of the command below
# -----------------------------------------------------------------------------

cat ~/.ssh/id_ed25519_wizardcd_client_vm.pub


# -----------------------------------------------------------------------------
# 2.2  Create a Security Group for the client VM
#
#      Console: EC2 → Security Groups → Create security group
#        Name        : wizardcd-client-sg
#        Description : WizardCD Client VM security group
#        VPC         : Default VPC
#
#      Inbound rules:
#        Type        Protocol  Port  Source              Purpose
#        SSH         TCP       22    My IP               Mac → Client admin
#        SSH         TCP       22    54.144.235.55/32    Runner → Client deploy (runner Elastic IP)
#
#      About the 54.144.235.55/32 rule:
#        54.144.235.55 is the runner VM's Elastic IP (public static IP).
#        Using the runner's Elastic IP in this rule is the recommended approach —
#        it is consistent with how external deployment tools (Envoyer, Forge,
#        DeployHQ) work, and it allows the same security group setup regardless
#        of whether the runner and client are in the same VPC or not.
#
#        HOW IT WORKS: When the runner SSHes to the client using the client's
#        public IP (34.201.190.116), the traffic exits the runner's VPC via the
#        internet gateway. The client's security group sees the source as the
#        runner's Elastic IP (54.144.235.55), which matches this /32 rule exactly.
#
#        The /32 suffix means exactly that one IP address — no other server
#        can match this rule and SSH into the client VM.
#
#        HOW TO GET THE RUNNER'S IP FOR THE RULE:
#        The WizardCD UI auto-detects and displays it for you:
#          New Deploy → Step 1: SSH Target → Firewall Setup panel
#          → "Runner Public IP" field → copy the IP
#
#        Alternative — AWS Console:
#          EC2 → Elastic IPs → find the IP associated with wizardcd-runner
#
#      No application port rule is defined here.
#      WizardCD is a generic deployment platform — the applications deployed
#      to this VM are determined by the user at deployment time and can run
#      on any port. Add port rules on demand when you know the application:
#        Console: EC2 → Security Groups → wizardcd-client-sg → Edit inbound rules
#        Add rule: Custom TCP | <port> | My IP (or 0.0.0.0/0 for public access)
#
#      Outbound rules: leave as default (all traffic allowed)
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# 2.3  Launch the EC2 Instance
#
#      Console: EC2 → Instances → Launch instances
#        Name           : wizardcd-client
#        AMI            : Ubuntu Server 22.04 LTS (Free tier eligible)
#        Architecture   : 64-bit (x86)
#        Instance type  : t3.micro (Free tier eligible)
#        Key pair       : wizardcd-client-key
#        Security group : wizardcd-client-sg (existing)
#        Storage        : 20 GiB  gp2
#
#      Wait until: Instance state = Running, Status check = 2/2 passed
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# 2.4  Allocate and attach an Elastic IP (required — keeps public IP stable)
#
#      Console: EC2 → Elastic IPs → Allocate Elastic IP address → Allocate
#      Select the new IP → Actions → Associate Elastic IP address
#        Instance : wizardcd-client
#
#      After allocation, capture the public IP — you will need it in multiple places:
#        Public IP  (Elastic) : 34.201.190.116   ← Mac SSH admin + runner SSH target
#
#      The Elastic IP is stable across stop/start cycles — it only changes if you
#      explicitly disassociate it. This makes it safe to hardcode in the SG rule
#      and in the WizardCD UI.
# -----------------------------------------------------------------------------


# =============================================================================
# PART 3 — MAC SSH CONFIG
# =============================================================================
# Replace <CLIENT-PUBLIC-IP>  with the client VM's Elastic IP.


# -----------------------------------------------------------------------------
# 3.1  Add SSH config aliases
#
#      wizardcd-client-admin  →  ubuntu user  (EC2 default admin, setup only)
#      wizardcd-client        →  deploy user  (application owner, troubleshooting)
# -----------------------------------------------------------------------------

cat >> ~/.ssh/config << 'EOF'

# WizardCD Client VM — AWS EC2 admin access (ubuntu = default EC2 user)
# AWS automatically creates it when the instance launches.
Host wizardcd-client-admin
  # HostName     <CLIENT-PUBLIC-IP>
  HostName     34.201.190.116
  User         ubuntu
  IdentityFile ~/.ssh/id_ed25519_wizardcd_client_vm
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new

# WizardCD Client VM — deploy user (application owner, day-to-day)
Host wizardcd-client
  # HostName     <CLIENT-PUBLIC-IP>
  HostName     34.201.190.116
  User         deploy
  IdentityFile ~/.ssh/id_ed25519_wizardcd_client_vm
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
EOF

chmod 600 ~/.ssh/config


# -----------------------------------------------------------------------------
# 3.2  Verify connection to client VM
# -----------------------------------------------------------------------------

ssh wizardcd-client-admin "echo connected as ubuntu OK"


# =============================================================================
# PART 4 — SERVER SETUP
# =============================================================================


# -----------------------------------------------------------------------------
# 4.1  Update system packages
# -----------------------------------------------------------------------------

ssh wizardcd-client-admin "sudo apt update && sudo apt upgrade -y"


# -----------------------------------------------------------------------------
# 4.2  Install Java 25 (Adoptium Temurin)
#
#      Deployed applications run on Java 25.
#
#      ┌─────────────────────────────────────────────────────────────────────┐
#      │  WizardCD UI — Java configuration for this client VM:              │
#      │                                                                     │
#      │  JAVA_HOME   :  /usr/lib/jvm/temurin-25-jdk-amd64                 │
#      │  Java binary :  /usr/lib/jvm/temurin-25-jdk-amd64/bin/java        │
#      │                                                                     │
#      │  Enter the Java binary path in the WizardCD UI when configuring    │
#      │  a deployment that targets this client VM.                         │
#      └─────────────────────────────────────────────────────────────────────┘
# -----------------------------------------------------------------------------

# Add Adoptium repository
ssh wizardcd-client-admin "
  sudo apt update &&
  sudo apt install -y wget apt-transport-https gpg &&
  wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
    | sudo gpg --dearmor -o /usr/share/keyrings/adoptium.gpg &&
  echo 'deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb jammy main' \
    | sudo tee /etc/apt/sources.list.d/adoptium.list
"

# Install Temurin 25 JDK
ssh wizardcd-client-admin "
  sudo apt update &&
  sudo apt install -y temurin-25-jdk
"

# Confirm the exact Java installation path
ssh wizardcd-client-admin "
  ls /usr/lib/jvm/ &&
  java -version
"

# Expected path: /usr/lib/jvm/temurin-25-jdk-amd64
# Expected java -version output: openjdk version "25" ...


# -----------------------------------------------------------------------------
# 4.3  Install required tools
# -----------------------------------------------------------------------------

ssh wizardcd-client-admin "
  sudo apt install -y unzip curl
"


# -----------------------------------------------------------------------------
# 4.4  Create the deploy user
#
#      This user owns and runs all deployed applications.
#      The runner service SSHes in as this user to deploy.
# -----------------------------------------------------------------------------

ssh wizardcd-client-admin \
  "sudo adduser --disabled-password --gecos '' deploy"


# -----------------------------------------------------------------------------
# 4.5  Set up SSH access for the deploy user (Mac → client troubleshooting)
#
#      Copies ubuntu's authorized_keys into deploy's home so your Mac
#      can SSH in as deploy for direct troubleshooting if needed.
#
#      NOTE: The deployment directory (/app/home/deploy/deployments) is NOT
#      created here. WizardCD creates it automatically during the first
#      deployment using the path you configure in the UI.
# -----------------------------------------------------------------------------

ssh wizardcd-client-admin "
  sudo mkdir -p /home/deploy/.ssh &&
  sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys &&
  sudo chown -R deploy:deploy /home/deploy/.ssh &&
  sudo chmod 700 /home/deploy/.ssh &&
  sudo chmod 600 /home/deploy/.ssh/authorized_keys
"

# Verify direct access as deploy from Mac
ssh wizardcd-client "echo connected as deploy OK"


# =============================================================================
# PART 5 — AUTHORIZE RUNNER SSH KEY
# =============================================================================
# The runner service SSHes into the client VM as the deploy user using
# the per-environment UAT key (wizardcd_uat_ed25519).
#
# The WizardCD UI (New Deploy → Step 1: SSH Target) displays the runner's
# UAT public key and generates a ready-to-run setup script for you.
# Follow the steps below to authorize it on the client VM.
#
# After this part, deploy's authorized_keys will contain TWO keys:
#   1. Mac admin key    (id_ed25519_wizardcd_client_vm.pub)  — from Part 4.5
#   2. Runner UAT key   (wizardcd_uat_ed25519.pub)           — added below


# -----------------------------------------------------------------------------
# 5.1  Get the runner's UAT public key from the WizardCD UI
#
#      In the WizardCD UI:
#        New Deploy → Step 1: SSH Target → SSH Keys Configuration
#
#      You will see the UAT Runner Public Key displayed with two options:
#        Option A — Add Key Manually: copy the key and append it yourself
#        Option B — Setup Script (Recommended): copy the generated script
#
#      Use Option B — the UI generates the exact script needed.
#      Copy the script shown in the UI — it looks like this:
#
#        mkdir -p ~/.ssh && \
#        chmod 700 ~/.ssh && \
#        echo "ssh-ed25519 AAAA...wizardcd-uat@runner" >> ~/.ssh/authorized_keys && \
#        chmod 600 ~/.ssh/authorized_keys
# -----------------------------------------------------------------------------


# -----------------------------------------------------------------------------
# 5.2  SSH into the client VM as deploy and run the script from the UI
# -----------------------------------------------------------------------------

ssh wizardcd-client

# Once connected as deploy, paste and run the script copied from the UI.
# Then exit back to your Mac.

exit


# -----------------------------------------------------------------------------
# 5.3  Verify authorized_keys contains both keys
# -----------------------------------------------------------------------------

ssh wizardcd-client-admin "sudo cat /home/deploy/.ssh/authorized_keys"

# Expected — two lines:
#   ssh-ed25519 AAAA...  wizardcd-client@macbook    ← Mac admin key (Part 4.5)
#   ssh-ed25519 AAAA...  wizardcd-uat@runner        ← Runner UAT key (Part 5.2)


# =============================================================================
# PART 6 — VERIFY RUNNER → CLIENT SSH
# =============================================================================
# Confirm the runner VM can SSH into the client VM as the deploy user.
# Run these commands from your Mac — they proxy through the runner VM.
#
# Client VM public IP (Elastic): 34.201.190.116
#
# The runner connects to the client using the client's PUBLIC IP.
#   Traffic exits the runner's VPC via the internet gateway.
#   The client's security group sees the source as 54.144.235.55 (runner's Elastic IP),
#   which matches the 54.144.235.55/32 inbound SSH rule — connection is allowed.
#
# TIP: The easiest way to verify is to use the WizardCD UI connection test button:
#   New Deploy → Step 1: SSH Target → fill in SSH User / SSH Host / SSH Port
#   → click "Test Connection" → should show "Connection OK ✓"
#   That button uses the runner's UAT key automatically.


# -----------------------------------------------------------------------------
# 6.1  SSH from runner to client using the UAT key
# -----------------------------------------------------------------------------

ssh wizardcd-runner "
  ssh -i ~/.ssh/wizardcd_uat_ed25519 \
    -o StrictHostKeyChecking=accept-new \
    deploy@34.201.190.116 \
    'echo runner connected to client as deploy OK'
"

# Expected:
#   runner connected to client as deploy OK


# -----------------------------------------------------------------------------
# 6.2  Confirm Java 25 is accessible from the deploy user
# -----------------------------------------------------------------------------

ssh wizardcd-runner "
  ssh -i ~/.ssh/wizardcd_uat_ed25519 \
    deploy@34.201.190.116 \
    'java -version && ls /usr/lib/jvm/'
"

# Expected:
#   openjdk version "25" ...
#   temurin-25-jdk-amd64


# =============================================================================
# PART 7 — WIZARDCD UI DEPLOYMENT CONFIGURATION
# =============================================================================
# Enter these values in the WizardCD UI (New Deploy → Step 1: SSH Target)
# when configuring a deployment that targets this client VM.
#
#   Field                  Value
#   ─────────────────────────────────────────────────────────────────────────
#   Environment            UAT
#   SSH User               deploy
#   SSH Host               34.201.190.116         ← client PUBLIC Elastic IP
#   SSH Port               22
#   Target Base Path       /app/home/deploy/deployments
#   Java Binary Path       /usr/lib/jvm/temurin-25-jdk-amd64/bin/java   (Step 3)
#
#   ⚠  SSH Host = the IP or hostname the RUNNER can reach the client at.
#      The right value depends on network topology:
#
#        Same network, private route preferred  → private IP  172.31.25.10  (see note)
#        Public IP route (our setup)            → public IP   34.201.190.116  ← use this
#        Different VPC / different cloud        → public Elastic IP or hostname
#        On-premise / LAN                       → private LAN IP e.g. 192.168.1.50
#
#      WHY public IP in our setup:
#        When the runner SSHes to the client using the client's public Elastic IP
#        (34.201.190.116), traffic exits the runner's VPC through the internet
#        gateway. The client's security group sees the runner's Elastic IP
#        (54.144.235.55) as the source, which matches the 54.144.235.55/32 rule.
#        This is the recommended approach — it works the same way regardless of
#        whether the runner and client are in the same VPC or not, and it is
#        consistent with how external deployment platforms (Envoyer, Forge,
#        DeployHQ) operate.
#
#      NOTE — Private IP alternative (if you prefer to keep traffic inside the VPC):
#        Change SSH Host → 172.31.25.10  (client's private IP)
#        Update SG rule  → 172.31.5.52/32 instead of 54.144.235.55/32
#        Private IPs are static for the lifetime of the EC2 instance.
#
#   FIREWALL SETUP:
#      The WizardCD UI (Step 1: SSH Target → Firewall Setup panel) automatically
#      displays the runner's public IP. Copy it from there when updating the
#      security group. No manual lookup needed.


# =============================================================================
# PART 8 — DAY-TO-DAY OPERATIONS (CLIENT VM)
# =============================================================================


# -----------------------------------------------------------------------------
# 8.1  Check running application processes
# -----------------------------------------------------------------------------

ssh wizardcd-client "ps aux | grep java"
ssh wizardcd-client "ls -la /app/home/deploy/deployments/"


# -----------------------------------------------------------------------------
# 8.2  View deployed application logs
#
#      WizardCD deploys apps to: /app/home/deploy/deployments/<app-name>/<env>/
# -----------------------------------------------------------------------------

# List all log files across all deployments
ssh wizardcd-client "find /app/home/deploy/deployments -name '*.log' | head -20"

# Tail a specific application log (replace <app-name> with your app)
ssh wizardcd-client "tail -n 100 -f /app/home/deploy/deployments/<app-name>/uat/logs/wrapper.log"


# -----------------------------------------------------------------------------
# 8.3  Stop a deployed application (via Tanuki wrapper)
# -----------------------------------------------------------------------------

ssh wizardcd-client "/app/home/deploy/deployments/<app-name>/uat/bin/wrapper stop"


# -----------------------------------------------------------------------------
# 8.4  Start a deployed application (via Tanuki wrapper)
# -----------------------------------------------------------------------------

ssh wizardcd-client "/app/home/deploy/deployments/<app-name>/uat/bin/wrapper start"


# -----------------------------------------------------------------------------
# 8.5  Restart a deployed application
# -----------------------------------------------------------------------------

ssh wizardcd-client "/app/home/deploy/deployments/<app-name>/uat/bin/wrapper restart"


# -----------------------------------------------------------------------------
# 8.6  View all deployments
# -----------------------------------------------------------------------------

ssh wizardcd-client "find /app/home/deploy/deployments -maxdepth 2 -type d"


# =============================================================================
# REFERENCE
# =============================================================================

# SSH aliases (Mac):
#
#   wizardcd-client-admin    ubuntu user  — admin / setup tasks only
#   wizardcd-client          deploy user  — application management / troubleshooting

# Key paths on the client VM:
#
#   /app/home/deploy/deployments/                        Root deployments directory (set in WizardCD UI)
#   /app/home/deploy/deployments/<app>/<env>/            Per-app per-env workspace
#   /app/home/deploy/deployments/<app>/<env>/logs/       Application + wrapper logs
#   /app/home/deploy/deployments/<app>/<env>/bin/        Tanuki wrapper binary
#   /app/home/deploy/deployments/<app>/<env>/conf/       Wrapper config (wrapper.conf)
#   /home/deploy/.ssh/authorized_keys                    Authorized SSH keys for deploy
#   /usr/lib/jvm/temurin-25-jdk-amd64                   Java 25 home (JAVA_HOME)
#   /usr/lib/jvm/temurin-25-jdk-amd64/bin/java          Java 25 binary  ← WizardCD UI field

# Key paths on the runner VM (used during deployment):
#
#   /home/wizard/.ssh/wizardcd_uat_ed25519            UAT key (runner → client SSH)
#   /opt/wizardcd/runner/deploy.sh                    Main deployment orchestrator
#   /opt/wizardcd/runner/wrappers/                    Tanuki wrapper binaries (copied to client)

# Key paths on your Mac:
#
#   ~/.ssh/id_ed25519_wizardcd_client_vm              Mac → Client VM access key
#   ~/.ssh/wizardcd_uat_ed25519                       Runner UAT key (authorized on client)

# WizardCD UI — deployment configuration summary (Step 1: SSH Target):
#
#   Environment     : UAT
#   SSH user        : deploy
#   SSH host        : 34.201.190.116                               (client public Elastic IP)
#   SSH port        : 22
#   Target base path: /app/home/deploy/deployments
#   Java binary     : /usr/lib/jvm/temurin-25-jdk-amd64/bin/java  (Step 3: Java / JVM)

# Security Group summary:
#
#   wizardcd-runner-sg  (Phase 1 — runner VM)
#     TCP   22    My IP                Mac → Runner admin
#     TCP  8081   My IP                UI → Runner API
#
#   wizardcd-client-sg  (Phase 2 — client VM)
#     TCP   22    My IP                Mac → Client admin
#     TCP   22    54.144.235.55/32     Runner → Client deploy  (runner Elastic IP)
#     TCP  <port> My IP (or 0.0.0.0/0)  Add per application on demand (port varies)
#
#   TIP: The runner's Elastic IP (54.144.235.55) is always shown in the
#        WizardCD UI under New Deploy → Step 1: SSH Target → Firewall Setup panel.

# SSH key ownership model:
#
#   Mac key (id_ed25519_wizardcd_client_vm)
#     Mac  ──────────────────────────────►  ubuntu@client   (admin)
#     Mac  ──────────────────────────────►  deploy@client   (troubleshooting)
#
#   Runner UAT key (wizardcd_uat_ed25519)
#     Runner (wizard) ─────────────────►   deploy@client   (deployments)
#
#   deploy user authorized_keys contains BOTH keys — Mac + runner UAT.
