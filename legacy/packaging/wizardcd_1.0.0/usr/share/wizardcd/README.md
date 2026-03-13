# WizardCd
**Simple. Portable. Config-driven deployments.**

WizardCd is a lightweight deployment framework designed for teams who want repeatable deployments without the complexity of tools like Ansible or Terraform.
It works with Bash, SSH, and YAML configs, making it portable across any environment — from on-prem servers to cloud VMs.

## Features
- Config-driven: No hardcoded values, all app/env details live in YAML.
- Lightweight: No Docker, no agents, just Bash + SSH + SCP.
- Portable: runs anywhere with Bash + SSH.
- Extensible: Start with Tanuki/Java services, extend later to systemd, Docker, or Kubernetes.
- Pluggable: One framework, many apps: just edit deployment-config.yml.
- CI/CD ready: Works with GitHub Actions, Jenkins, Azure DevOps, or manual runs.

## Repository Structure

wizardcd/
├── wrappers/
│   └── tanuki/
│       ├── bin/
│       │   ├── wrapper.sh.template        # Tanuki wrapper script template (base)
│       │   └── wrapper                    # Native Tanuki binary
│       ├── conf/
│       │   └── default.conf.template      # Tanuki config template (base)
│       ├── lib/
│       │   ├── wrapper.jar                # Tanuki Java service wrapper JAR
│       │   └── libwrapper.so              # Native wrapper library (Linux)
│       ├── configs/                       # Auto-generated wrapper.conf + wrapper.sh per app/env
│       │   ├── my-service-1-wrapper.sh
│       │   ├── my-service-1-uat.conf
│       │   └── ...
│       └── logs/                          # Runtime logs for Tanuki services
│           ├── my-service-1.log
│           └── ...
│
├── bin/
│   ├── deploy.sh                          # Main orchestrator – full deploy flow
│   ├── package-artifacts.sh               # Packages app, libs, and Tanuki components
│   ├── application-deployment.sh          # Executes on target VM via SSH
│   ├── generate-tanuki-wrapper-conf.sh    # Generates wrapper.conf and wrapper.sh dynamically
│   ├── helpers.sh                         # Shared logging + utilities
│   └── cleanup-framework.sh               # Cleans build artifacts and temporary files
│
├── config/
│   └── deployment-config.yml              # Application + environment definitions (YAML)
│
├── logs/                                  # Centralized deployment logs
│   ├── deploy-2025-10-11_1535-my-service-uat.log
│   └── deploy-2025-10-11_1610-my-service-prod.log
│
├── build/
│   └── packages/                          # Temporary build artifacts and tarballs
│       ├── my-service/uat/
│       ├── my-service/prod/
│       └── my-service-uat.tar.gz
│
├── docs/
│   ├── quickstart.md                      # Setup and first-run instructions
│   ├── architecture.md                    # End-to-end flow + diagrams
│   └── extending.md                       # How to extend WizardCD (plugins, CI/CD)
│
├── examples/
│   ├── github-actions.yml                 # GitHub Actions pipeline sample
│   ├── azure-pipelines.yml                # Azure DevOps pipeline sample
│   └── jenkins-pipeline.groovy            # Jenkins declarative pipeline
│
└── README.md                              # Project documentation and overview

## Quickstart

### 1. Clone the repo
Clone the repo

```bash
	git clone https://github.com/your-org/wizardcd.git
	cd wizardcd
```

### 2. Check dependencies (first step)
Before deploying, verify that all required tools are installed:
	i. bash
	ii. ssh
	iii. scp
	iv. yq (YAML parser)

Run:

```bash
./bin/deploy.sh --check-deps

```

If a dependency is missing, WizardCd will print install commands for both Debian/Ubuntu and RHEL/CentOS/Fedora.
Example for a missing dependency:

```yaml
	ERROR: Missing dependency 'yq'. Please install it:

	HINT: Debian/Ubuntu:
	  sudo apt-get update
	  sudo apt-get install yq

	HINT: RHEL/CentOS/Fedora:
	  sudo yum install yq        # RHEL/CentOS 7
	  sudo dnf install yq        # RHEL 8/9, Fedora
```

### 3. Define your app in YAML
Edit config/deployment-config.yml to describe your app and environment:

```yaml

	apps:
	  my-service:
		uat:
		  vm_host: 192.168.56.10
		  vm_path: /opt/my-service/uat
		  server_port: 8080
		  java_version: 25
		  run_as_user: deploy

```

### 4. Deploy your app
Once dependencies are installed and config is ready, deploy with:

```bash
./bin/deploy.sh --app my-service --env uat

```

WizardCd will:
	- Load the configuration for my-service in uat.
	- Package artifacts (package-artifacts.sh).
	- Deploy them remotely (application-deployment.sh).
	- Print a clear summary of what it’s doing.

## License
WizardCd is released under the MIT License.


