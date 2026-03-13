DeployMate – Framework Core

Scope
DeployMate is a lightweight, config-driven deployment framework for applications.
Starts with Tanuki/Java microservices,
Later extensible to systemd, Docker, and Kubernetes providers.
Focus: simple, portable deployments using only SSH, SCP, and YAML configs.
Not a replacement for Ansible/Terraform — designed for teams who want fast, pluggable deployments without heavy infra.

Tech Stack
Bash → Core scripts, maximum portability.
YAML configs → Store app/environment details (deployment-config.yml).
yq → Lightweight YAML parser for Bash.
SSH + SCP + tar → Transport and deployment mechanism.
Optional Python wrapper (future) → When Bash + yq parsing becomes limiting.

Repo Structure
deploymate/
├── bin/                        # Scripts
│   ├── deploy.sh               # Entrypoint CLI
│   ├── package-artifacts.sh    # Artifact packaging
│   ├── application-deployment.sh # Remote deployment script
│   └── helpers.sh              # Shared utils (logging, dependency checks)
│
├── config/
│   └── deployment-config.yml   # App + environment definitions
│
├── docs/
│   ├── quickstart.md           # Install & first deployment
│   ├── architecture.md         # How configs + scripts interact
│   └── extending.md            # Adding new providers/backends
│
├── examples/
│   ├── github-actions.yml      # Sample GitHub Actions workflow
│   ├── azure-pipelines.yml     # Sample Azure DevOps pipeline
│   └── jenkins-pipeline.groovy # Sample Jenkins pipeline
│
└── README.md                   # Project overview, vision, usage
