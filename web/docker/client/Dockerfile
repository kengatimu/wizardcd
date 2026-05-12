# =============================================================================
# WizardCD Client VM — local Docker equivalent of the AWS EC2 client
# =============================================================================
# Mirrors deploying-to-client-vm-aws-ec2.sh PART 4 (sections 4.1–4.5) exactly:
#   • Ubuntu 22.04 LTS (same as AWS AMI)
#   • Adoptium Temurin 25 JDK (same as AWS target)
#   • openssh-server, unzip, curl (same package set)
#   • deploy user (same name, same SSH layout)
#   • /app/home/deploy/deployments/ (same target base path)
#
# Build : docker compose build
# Run   : docker compose up -d
# Shell : docker compose exec wizardcd-client bash
#
# Updated: 2026-05-11
# =============================================================================

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# ── 4.1 / 4.3 — System packages (mirrors apt install -y unzip curl) ──
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

# ── 4.2 — Adoptium Temurin 25 JDK (matches AWS exactly) ──
RUN wget -qO - https://packages.adoptium.net/artifactory/api/gpg/key/public \
      | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg \
    && echo 'deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb jammy main' \
      > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt-get install -y temurin-25-jdk \
    && rm -rf /var/lib/apt/lists/*

# ── 4.4 — deploy user (mirrors `adduser --disabled-password deploy`) ──
RUN useradd -m -d /home/deploy -s /bin/bash deploy \
    && passwd -d deploy

# Optional: give deploy passwordless sudo for in-container debugging.
# (Uncomment only if you need to run sudo commands as deploy.)
# RUN echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy \
#     && chmod 440 /etc/sudoers.d/deploy

# ── 4.5 — SSH setup (~/.ssh + authorized_keys for deploy) ──
RUN mkdir -p /var/run/sshd /home/deploy/.ssh \
    && chown -R deploy:deploy /home/deploy/.ssh \
    && chmod 700 /home/deploy/.ssh \
    && touch /home/deploy/.ssh/authorized_keys \
    && chown deploy:deploy /home/deploy/.ssh/authorized_keys \
    && chmod 600 /home/deploy/.ssh/authorized_keys

# Public-key auth on, password auth off (production parity)
RUN sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config \
    && sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Deploy target dir — matches WizardCD UI's "Target Base Path" field
RUN mkdir -p /app/home/deploy/deployments \
    && chown -R deploy:deploy /app/home

EXPOSE 22

# Start sshd in the foreground (so Docker can track the process)
CMD ["/usr/sbin/sshd", "-D", "-e"]
