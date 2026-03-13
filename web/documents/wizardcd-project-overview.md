# WizardCD — Project Overview & Architecture

> **Version:** 1.0 &nbsp;|&nbsp; **Updated:** 2026-03-11

---

## Table of Contents

1. [What is WizardCD?](#1-what-is-wizardcd)
2. [Name Suggestions](#2-name-suggestions)
3. [System Architecture](#3-system-architecture)
4. [End-to-End Deployment Flow](#4-end-to-end-deployment-flow)
5. [Deployment Package on Target VM](#5-deployment-package-on-target-vm)
6. [Component Reference](#6-component-reference)
7. [Environment Configuration](#7-environment-configuration)
8. [Key File Paths](#8-key-file-paths)

---

## 1. What is WizardCD?

WizardCD is a **self-hosted Java application deployment framework** built for teams that deploy Spring Boot (and other Java) applications directly to Linux VMs — without Docker, Kubernetes, or CI/CD pipelines like Jenkins.

It gives teams a clean web UI to configure, trigger, track, and audit deployments across multiple environments (SIT, UAT, PROD) in a controlled, repeatable way.

> ℹ️ **WizardCD is not a SaaS.** It is installed on your own infrastructure. The runner service sits inside your network and has SSH access to your target servers. Think of it as a lightweight, self-contained alternative to tools like Rundeck or Ansible Tower — purpose-built for Java VM deployments.

### Key Characteristics

- Self-hosted and network-contained
- Multi-environment aware — SIT / UAT / PROD
- Java and Spring Boot focused
- VM-based deployments via SSH — no container orchestration required
- Tanuki Service Wrapper for process lifecycle management on target VMs
- Per-environment ED25519 SSH key isolation
- Real-time job tracking and log streaming
- Backup-before-deploy with configurable retention

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DEVELOPER'S MACHINE                             │
│                                                                         │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  WizardCD UI  (React 19 + Vite  :5173)                           │  │
│   │                                                                  │  │
│   │   ┌──────────┐  ┌──────────┐  ┌─────────────┐  ┌────────────┐  │  │
│   │   │Dashboard │  │  Deploy  │  │  Job Detail │  │  Settings  │  │  │
│   │   │          │  │  Wizard  │  │  + Logs     │  │            │  │  │
│   │   └──────────┘  └──────────┘  └─────────────┘  └────────────┘  │  │
│   └─────────────────────────┬────────────────────────────────────────┘  │
│                             │  HTTP/REST  (VITE_API_BASE_URL)            │
└─────────────────────────────┼───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    RUNNER VM  (192.168.56.9)                            │
│                                                                         │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │  runner-service-ms  (Spring Boot 3.x  :8081)                     │  │
│   │                                                                  │  │
│   │   POST /jobs               → accepts JAR + JSON config           │  │
│   │   GET  /jobs               → list all jobs                       │  │
│   │   GET  /jobs/:id/status    → job lifecycle state                 │  │
│   │   GET  /jobs/:id/logs      → tail deployment logs                │  │
│   │   POST /jobs/:id/abort     → kill running job                    │  │
│   │   GET  /runner/public-keys → per-env SSH public keys             │  │
│   │   POST /ssh/test           → test SSH connectivity to target     │  │
│   │                                                                  │  │
│   │   Job State Machine:                                             │  │
│   │   CREATED → VALIDATING → PREPARING_WORKSPACE → RUNNING          │  │
│   │                                     └──► SUCCESS                │  │
│   │                                     └──► FAILED                 │  │
│   │                                     └──► ABORT_REQUESTED        │  │
│   │                                               └──► ABORTED      │  │
│   └──────────────────────┬───────────────────────────────────────────┘  │
│                          │  executes                                     │
│   ┌──────────────────────▼───────────────────────────────────────────┐  │
│   │  Shell Scripts  (/opt/wizardcd/runner/)                          │  │
│   │                                                                  │  │
│   │   deploy.sh                       ← main orchestrator           │  │
│   │   generate-tanuki-wrapper-conf.sh ← builds Tanuki wrapper cfg   │  │
│   │   package-artifacts.sh            ← stages + tarballs the app   │  │
│   │   application-deployment.sh       ← runs remotely on target VM  │  │
│   │   helpers.sh                      ← shared logging utilities    │  │
│   └──────────────────────┬───────────────────────────────────────────┘  │
│                          │                                               │
│   ~/.ssh/wizardcd_uat_ed25519  (per-env ED25519 private key)            │
│                          │  SCP + SSH                                    │
└─────────────────────────────────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
┌─────────────────────┐     ┌─────────────────────┐
│  Client VM : UAT    │     │  Client VM : PROD   │
│  (192.168.56.10)    │     │  (192.168.x.x)      │
│                     │     │                     │
│  deploy user        │     │  deploy user        │
│  /opt/wizardcd/     │     │  /opt/wizardcd/     │
│  deployments/       │     │  deployments/       │
│                     │     │                     │
│  App running via    │     │  App running via    │
│  Tanuki Wrapper     │     │  Tanuki Wrapper     │
└─────────────────────┘     └─────────────────────┘
```

---

## 3. End-to-End Deployment Flow

```
USER                  UI                RUNNER SERVICE      SCRIPTS         TARGET VM
 │                     │                      │                 │                │
 │  Opens Deploy page  │                      │                 │                │
 │────────────────────▶│                      │                 │                │
 │                     │ GET /runner/public-keys                │                │
 │                     │─────────────────────▶│                 │                │
 │                     │ { UAT: "ssh-ed25519" }                 │                │
 │  See UAT public key │◀─────────────────────│                 │                │
 │◀────────────────────│                      │                 │                │
 │                     │                      │                 │                │
 │  Fill wizard:       │                      │                 │                │
 │  • App name / env   │                      │                 │                │
 │  • Java version     │                      │                 │                │
 │  • JVM settings     │                      │                 │                │
 │  • SSH target       │                      │                 │                │
 │  • Upload JAR       │                      │                 │                │
 │                     │                      │                 │                │
 │  POST /ssh/test     │─────────────────────▶│                 │                │
 │                     │                      │  ssh -i wizardcd_uat_ed25519 ───▶│
 │  ✅ Connected       │◀─────────────────────│                 │       ok       │
 │◀────────────────────│                      │                 │                │
 │                     │                      │                 │                │
 │  Click Deploy       │                      │                 │                │
 │────────────────────▶│                      │                 │                │
 │                     │ POST /jobs           │                 │                │
 │                     │ • request (JSON)     │                 │                │
 │                     │ • artifact (JAR)     │                 │                │
 │                     │─────────────────────▶│                 │                │
 │                     │                      │ Validate request│                │
 │                     │                      │ Generate YAML   │                │
 │                     │                      │ Prepare workspace                │
 │                     │ { jobId, RUNNING }   │                 │                │
 │  Job accepted       │◀─────────────────────│                 │                │
 │◀────────────────────│                      │                 │                │
 │                     │                      │ Execute deploy.sh               │
 │                     │                      │────────────────▶│                │
 │                     │                      │                 │ Parse YAML     │
 │                     │                      │                 │ Gen Tanuki cfg │
 │                     │                      │                 │ Package tar.gz │
 │                     │                      │                 │ SCP tarball ──▶│
 │                     │                      │                 │ SSH: run       │
 │                     │                      │                 │ app-deploy.sh ▶│
 │                     │                      │                 │                │ Extract
 │                     │                      │                 │                │ Backup
 │                     │                      │                 │                │ Install
 │                     │                      │                 │                │ Start app
 │                     │                      │◀────────────────│   exit 0       │
 │                     │                      │ → SUCCESS       │                │
 │                     │                      │                 │                │
 │  Polling status     │ GET /jobs/:id/status │                 │                │
 │────────────────────▶│─────────────────────▶│                 │                │
 │  ✅ SUCCESS         │◀─────────────────────│                 │                │
 │◀────────────────────│                      │                 │                │
 │                     │                      │                 │                │
 │  View logs          │ GET /jobs/:id/logs   │                 │                │
 │────────────────────▶│─────────────────────▶│                 │                │
 │  Full deploy log    │◀─────────────────────│                 │                │
 │◀────────────────────│  (reads from job     │                 │                │
 │                     │   workspace)         │                 │                │
```

---

## 4. Deployment Package on Target VM

When a deployment completes, the following structure is created on the target VM:

```
/opt/wizardcd/deployments/
└── myapp/
    ├── bin/
    │   ├── myapp.jar                  ← the application JAR
    │   ├── myapp-wrapper.sh           ← Tanuki start/stop/restart script
    │   └── wrapper                    ← Tanuki native binary
    ├── conf/
    │   └── myapp-uat.conf             ← JVM + logging config (auto-generated)
    ├── lib/
    │   ├── wrapper.jar
    │   └── libwrapper.so
    └── backup/
        └── myapp-uat-20260311.tar.gz  ← previous version archive
```

The application runs as a **Tanuki Service Wrapper** process, which provides:

- Automatic restart on crash
- JVM memory and tuning control
- Log rotation with configurable size and retention
- Clean start / stop / restart lifecycle
- No systemd unit required per deployed application

---

## 5. Component Reference

### UI Pages

| Page | Purpose |
|---|---|
| **Dashboard** | Job metrics and trends — total, running, successful, failed, aborted |
| **Deploy Wizard** | 4-step form: App Identity → Java/JVM → Runtime → SSH Target |
| **Job Detail** | Live status, execution state, full log viewer, abort button |
| **Settings** | Application-level configuration |

### Runner API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/jobs` | Submit a deployment — multipart (JSON config + JAR artifact) |
| `GET` | `/jobs` | List all jobs — optional `?status=` filter |
| `GET` | `/jobs/:id/status` | Fetch current lifecycle and execution state |
| `GET` | `/jobs/:id/logs` | Tail last N log lines from deploy.log |
| `POST` | `/jobs/:id/abort` | Request abort of a running job |
| `GET` | `/jobs/summary` | Dashboard metrics — totals and trends |
| `GET` | `/runner/public-keys` | Per-environment SSH public keys (SIT / UAT / PROD) |
| `POST` | `/ssh/test` | Test SSH connectivity from runner to a target VM |

### Job Lifecycle States

| State | Description |
|---|---|
| `CREATED` | Job accepted by the runner, not yet validated |
| `VALIDATING` | Input YAML and parameter validation in progress |
| `PREPARING_WORKSPACE` | Job workspace directories and input files being staged |
| `RUNNING` | `deploy.sh` is currently executing |
| `SUCCESS` | Deployment completed successfully (exit code 0) |
| `FAILED` | Deployment failed — non-zero exit code or exception |
| `ABORT_REQUESTED` | Abort requested while job is in RUNNING state |
| `ABORTED` | Process terminated following abort request |

### SSH Key Model

One ED25519 key pair per environment, auto-generated by the runner on first use.

| Environment | Private Key Location (Runner VM) | Purpose |
|---|---|---|
| SIT | `~/.ssh/wizardcd_sit_ed25519` | SSH into SIT target servers |
| UAT | `~/.ssh/wizardcd_uat_ed25519` | SSH into UAT target servers |
| PROD | `~/.ssh/wizardcd_prod_ed25519` | SSH into PROD target servers |

> ⚠️ The private key **never leaves the runner VM**. Only the public key is authorised on target servers. The UI only ever displays the public key.

---

## 6. Environment Configuration

| Environment | UI Colour | Runner VM | Client VM |
|---|---|---|---|
| SIT | 🔵 Blue | 192.168.56.9:8081 | Local / dev machine |
| UAT | 🟡 Yellow | 192.168.56.9:8081 | 192.168.56.10 |
| PROD | 🟣 Purple | 192.168.56.9:8081 | 192.168.x.x (TBD) |

### Profile Resolution Order

Priority highest → lowest:

1. JVM argument — `--spring.profiles.active=X`
2. Environment variable — `SPRING_PROFILES_ACTIVE` *(set automatically by `start-runner.sh`)*
3. Bundled default — `spring.profiles.active` inside `application.yaml` within the JAR

---

## 7. Key File Paths

### Runner VM — `/opt/wizardcd/`

| Path | Description |
|---|---|
| `runner-service-ms-0.0.1-SNAPSHOT.jar` | Application JAR |
| `runner/deploy.sh` | Main deployment orchestrator |
| `runner/application-deployment.sh` | Remote execution script (runs on target VM via SSH) |
| `runner/generate-tanuki-wrapper-conf.sh` | Generates Tanuki wrapper `.conf` and `.sh` files |
| `runner/start-runner.sh` | Service startup — auto-resolves active profile from JAR |
| `workspace/jobs/<jobId>/input/` | Job input — JAR + generated YAML config |
| `workspace/jobs/<jobId>/build/` | Packaged deployment tarball |
| `workspace/jobs/<jobId>/logs/` | `deploy.log`, `package.log`, `ssh.log` |
| `logs/runner-service-ms.log` | Runner service log (rolling, 30-day retention) |
| `/home/deploy/.ssh/wizardcd_*_ed25519` | Per-environment SSH key pairs |
| `/etc/systemd/system/wizardcd-runner.service` | systemd service unit |

### Target VM — `/opt/wizardcd/deployments/<appname>/`

| Path | Description |
|---|---|
| `bin/<appname>.jar` | The deployed application JAR |
| `bin/<appname>-wrapper.sh` | Tanuki start / stop / restart script |
| `bin/wrapper` | Tanuki native binary |
| `conf/<appname>-<env>.conf` | Auto-generated Tanuki wrapper configuration |
| `lib/wrapper.jar` | Tanuki Java library |
| `lib/libwrapper.so` | Tanuki native shared library |
| `backup/` | Previous deployment archives |
