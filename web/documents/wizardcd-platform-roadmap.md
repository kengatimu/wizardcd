# WizardCD Platform Roadmap — Full Build Plan

**Created:** 2026-03-23
**Updated:** 2026-04-23
**Status:** Active — Ready to start Phase 4 (Phases 1–3 complete, light theme confirmed)
**Tagline:** One Config. One Command. Continuous Magic.

---

## What We Have Today (Phases 1–3 Complete)

WizardCD is a self-hosted Java deployment framework that deploys Spring Boot apps to Linux VMs via SSH. No Docker, no Kubernetes, no CI/CD pipelines.

### Completed Capabilities

| Capability | Status |
|-----------|--------|
| 4-step deploy wizard (Target → App → Options → Review) | ✅ |
| JAR manifest parsing (app name, main class, port, profile detection) | ✅ |
| Fat JAR / Thin JAR detection + lib ZIP upload | ✅ |
| Per-environment SSH key isolation (ED25519, auto-generated) — DEV/SIT/UAT/PROD | ✅ |
| Java auto-detection from target VM | ✅ |
| SSH pre-flight checks (connectivity, firewall, keys, disk, permissions) | ✅ |
| Profile mismatch warning (JAR profile vs selected environment) | ✅ |
| Real-time log streaming with structured phases | ✅ |
| Tanuki Service Wrapper for process lifecycle | ✅ |
| Backup-before-deploy with configurable retention (1–5 releases) | ✅ |
| Configurable stability window (5–120s health monitoring) | ✅ |
| Re-deploy flow (new JAR, reuse stored config) | ✅ |
| Rollback flow (restore last-successful backup) | ✅ |
| Job type tracking (deploy / redeploy / rollback) | ✅ |
| Dashboard with metrics, filters, search | ✅ |
| Job detail with phase breakdown + sectioned log viewer | ✅ |
| Application view page (per-app env cards + history) | ✅ |
| Notification system (job-type-aware, localStorage persistence) | ✅ |
| Live field validation with error banners | ✅ |
| Draft save/restore with user choice banner | ✅ |
| JVM configuration (GC selector, container mode, workload profiles) | ✅ |
| Certificate + extra directory deployment | ✅ |
| MissionControl sidebar with step-contextual info | ✅ |

### Current Architecture

```
Mac (UI React/Vite :5173)
  │ HTTP/REST
  ▼
Runner VM (Spring Boot :8081)  ← file-based job storage
  │ SSH/SCP (per-env ED25519 key)
  ▼
Client VM (deploy user, Tanuki-managed Java apps)
```

### Current Limitations

| Limitation | Impact |
|-----------|--------|
| File-based storage (JSON + workspace dirs) | No queries, no relationships, no ACID |
| No authentication | Anyone with network access can deploy to PROD |
| No user identity | No audit trail — "who deployed what?" |
| No app registry | Re-enter SSH details every time |
| Single deployment strategy (in-place) | Downtime on every deploy |
| No secret management | DB passwords, API keys hardcoded in app configs |
| No environment promotion | No DEV → SIT → UAT → PROD pipeline |
| No approval gates | No two-person rule for PROD |
| Single runner | No horizontal scaling |
| Java-only | Excludes .NET, Python, Node.js, Go teams |
| No TLS/HTTPS | API traffic in plaintext — credentials exposed on the wire |
| No rate limiting | API can be hammered — denial of service risk |
| No input sanitisation | Potential shell injection via form fields into deploy.sh |
| No artifact integrity checks | JARs accepted without checksum/signing verification |
| No intrusion detection | No alerting on suspicious patterns (off-hours deploys, brute force) |
| No vulnerability scanning | No CVE detection on deployed artifacts or platform dependencies |

> **Security limitations addressed by:** Phase 6 (auth + input sanitisation), Phase 7 (secrets + encryption), Phase 11.5 (TLS, rate limiting, scanning, intrusion detection, file integrity). Security measures are also woven into every other phase — see [Security Touchpoints](#security-philosophy--woven-into-every-phase).

### Platform Positioning

**Category:** Application Release Orchestration / Continuous Deployment Platform

**One-liner:** *"The deployment platform for teams that run applications on servers, not containers."*

**Niche:** For teams deploying applications to Linux VMs who want structured, auditable, zero-friction deployments WITHOUT requiring Docker, Kubernetes, CI pipelines, or agents on target servers.

**Why this niche is massive:**
- ~65-70% of enterprise workloads still run on VMs, not containers (Gartner)
- Most deployment tools have pivoted to Kubernetes-first, leaving VM-based teams behind
- The alternatives are: write bash scripts, use Jenkins (complex), or use Ansible (learning curve)

**Core differentiators:**
1. **Agentless** — SSH-based, nothing to install on target VMs
2. **Manual upload first-class** — drag, drop, deploy (no pipeline required)
3. **Smart artifact analysis** — auto-detects app name, port, profiles, runtime type
4. **Multi-runtime** — Java, .NET, Python, Node.js, Go, Custom (Phase 12)
5. **Multi-provider secrets** — Built-in, AWS, Vault, Azure, GCP (Phase 7)
6. **Self-hosted, free forever** — no per-user/per-target pricing

**Closest competitor:** Octopus Deploy (requires agents, paid at scale)

---

## Security Philosophy — Woven Into Every Phase

> Security is NOT a single phase. It is a continuous concern woven into every phase of the platform, PLUS a dedicated hardening phase (11.5) that addresses cross-cutting security concerns that don't belong to any single feature.

### Security Touchpoints Per Phase

| Phase | Security Measures Built Into That Phase |
|-------|----------------------------------------|
| **4 — Database** | Parameterised queries (JPA — no SQL injection), DB credentials in separate `/etc/wizardcd/db.env` file (root:root 600), connection pool limits (DoS prevention), Flyway migration checksums (tamper detection) |
| **5 — App Registry** | Input validation on all app/env fields (whitelist characters, length limits), prevent shell metacharacter injection in appName/envName (these flow into bash scripts), unique constraints prevent name collision attacks |
| **6 — Auth & OAuth2** | JWT with expiry + refresh rotation, CSRF protection (Spring Security default), session timeout, OAuth state parameter (prevents CSRF on OAuth flow), brute-force lockout on failed logins, `Secure` + `HttpOnly` + `SameSite` cookie flags |
| **7 — Secrets** | AES-256-GCM envelope encryption, MEK file separation from DB creds, no-reveal API policy (values never returned), secret audit log (every read/write), log masking (secrets never in deploy logs), per-env isolation |
| **8 — Strategies** | Health check verification before traffic switch (Blue-Green), automatic rollback on canary failure, load balancer credential encryption, deployment lock prevents concurrent conflicting operations |
| **9 — Pipelines** | Approval gates for PROD (two-person rule), deployment window enforcement (no PROD deploys at 3am unless overridden), artifact integrity tracking across promotions, audit trail for approvals/rejections |
| **10 — Integrations** | Webhook signature verification (HMAC-SHA256) for GitHub/Azure/GitLab/Bitbucket, webhook secrets encrypted at rest, outbound webhook retry with exponential backoff (not infinite), Slack/Teams token encryption |
| **11 — Analytics** | Immutable audit log (append-only), audit log hash chaining (tamper detection), admin-only access to usage data, anomaly baseline creation (feeds Phase 11.5 intrusion detection), PII masking in logs |
| **12 — Multi-Language** | Per-runtime input validation (different rules for .NET vs Python vs Node.js), artifact scanning applies to all runtimes (not just JAR), process isolation per deployment user |
| **13 — Parallel Jobs** | Concurrency locks prevent race conditions, app+env isolation (can't deploy same app to same env simultaneously), queue poisoning prevention (validated before enqueue) |
| **14 — Multi-Runner** | Mutual TLS between runners (future), runner identity verification, shared storage access controls, advisory lock timeout (prevents deadlocks) |
| **15 — Subscriptions** | Payment data NEVER stored (Stripe handles all PCI), subscription state validated server-side (not client-side), rate limiting per tier |

---

## Phase 4 — Data Foundation

**Goal:** Replace file-based storage with a relational database. Everything else depends on this.

**Duration:** 4–5 days

### What We Build

#### 4.1 Database Setup
- Spring Data JPA + Flyway migrations
- **PostgreSQL everywhere** — runner VM runs PostgreSQL (persists across restarts, reboots, EC2 stop/start)
- Connection pooling via HikariCP (Spring Boot default)
- H2 in-memory used **only** inside `src/test/` for integration tests (never as a runtime database)

#### 4.1.1 PostgreSQL on Runner VM
```bash
# Install on runner VM (Ubuntu)
sudo apt install postgresql postgresql-contrib
sudo -u postgres createuser wizardcd
sudo -u postgres createdb wizardcd -O wizardcd
# Connection: jdbc:postgresql://localhost:5432/wizardcd
```
- DB runs locally on the same VM as runner-service-ms (no network hop)
- Spring profile: `application-uat.yml` → `spring.datasource.url=jdbc:postgresql://localhost:5432/wizardcd`
- Credentials stored in `/etc/wizardcd/db.env` (root:root 600), read by systemd `EnvironmentFile=`
- **Security:** DB user has minimum privilege (no SUPERUSER, no CREATEDB), scoped to `wizardcd` database only

#### 4.1.2 Development & Testing Strategy

| Context | Where it runs | Database | Purpose |
|---------|--------------|----------|---------|
| **Your Mac** (coding) | Mac terminal | No DB needed | You edit code, build JAR, SCP to runner VM |
| **Runner VM** (runtime) | EC2 54.144.235.55 | PostgreSQL (local) | All real data — apps, deployments, secrets, users |
| **Integration tests** | Mac via `./mvnw test` | H2 in-memory (auto) | Validates JPA mappings, Flyway migrations, service logic before deploying |

Integration tests are optional but recommended starting Phase 4 — they catch SQL/JPA bugs on your Mac before you deploy to the runner VM. They run with `./mvnw test`, use H2 in-memory (auto-disposed), and require zero setup.

#### 4.2 Core Schema

```sql
-- Applications — the central registry
CREATE TABLE applications (
    id          UUID PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Environment configs — per-app, per-env connection + runtime settings
CREATE TABLE environment_configs (
    id              UUID PRIMARY KEY,
    app_id          UUID NOT NULL REFERENCES applications(id),
    env_name        VARCHAR(20) NOT NULL,  -- DEV, SIT, UAT, PROD
    ssh_user        VARCHAR(100) NOT NULL,
    ssh_host        VARCHAR(255) NOT NULL,
    ssh_port        INTEGER NOT NULL DEFAULT 22,
    java_command    VARCHAR(500) NOT NULL,
    java_version    VARCHAR(10),
    target_base_path VARCHAR(500) NOT NULL,
    run_as_user     VARCHAR(100) NOT NULL,
    server_port     INTEGER NOT NULL,
    main_class      VARCHAR(500),
    jar_name        VARCHAR(255),
    lib_path        VARCHAR(255) DEFAULT '',
    xms             VARCHAR(20),
    xmx             VARCHAR(20),
    extra_jvm_opts  TEXT,  -- JSON array
    max_log_size    VARCHAR(20) DEFAULT '10m',
    max_log_files   INTEGER DEFAULT 10,
    perform_backup  BOOLEAN DEFAULT TRUE,
    max_backups     INTEGER DEFAULT 5,
    stability_window INTEGER DEFAULT 20,
    deployment_strategy VARCHAR(30) DEFAULT 'in_place',  -- future: blue_green, canary, rolling
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(app_id, env_name)
);

-- Deployments — every job ever run
CREATE TABLE deployments (
    id              UUID PRIMARY KEY,
    app_id          UUID REFERENCES applications(id),
    env_config_id   UUID REFERENCES environment_configs(id),
    app_name        VARCHAR(100) NOT NULL,
    env_name        VARCHAR(20) NOT NULL,
    job_type        VARCHAR(20) NOT NULL DEFAULT 'deploy',  -- deploy, redeploy, rollback
    status          VARCHAR(30) NOT NULL,  -- CREATED, VALIDATING, RUNNING, SUCCESS, FAILED, ABORTED
    config_snapshot JSONB,  -- full DeploymentRequest at time of deploy
    jar_name        VARCHAR(255),
    source_job_id   UUID,  -- for redeploy/rollback: which job this came from
    workspace_path  VARCHAR(500),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMP,
    created_by      VARCHAR(255)  -- NULL until auth is added (Phase 6)
);

-- Deployment state history — tracks state transitions
CREATE TABLE deployment_states (
    id              BIGSERIAL PRIMARY KEY,
    deployment_id   UUID NOT NULL REFERENCES deployments(id),
    status          VARCHAR(30) NOT NULL,
    timestamp       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Audit log — who did what when
CREATE TABLE audit_events (
    id          BIGSERIAL PRIMARY KEY,
    action      VARCHAR(50) NOT NULL,  -- DEPLOY, REDEPLOY, ROLLBACK, ABORT, CONFIG_CHANGE, etc.
    resource    VARCHAR(100),           -- e.g. "eureka-registry-ms/UAT"
    details     JSONB,
    created_by  VARCHAR(255),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 4.3 Migration Layer
- Scan existing `workspace/jobs/` directories
- Import `metadata.json` + `status.json` + `request.json` into DB tables
- Workspace dirs remain for artifacts + log files (not moved to DB)
- Backward compatible: if DB entry exists, use it; if not, fall back to file read

#### 4.4 Repository + Service Layer
- `ApplicationRepository`, `EnvironmentConfigRepository`, `DeploymentRepository`
- `ApplicationService` — CRUD + search
- `DeploymentPersistenceService` — replaces `RunnerJobStateServiceImpl` file I/O
- `AuditService` — writes to `audit_events` on every significant action

### What It Unlocks
- Query deployments by app, env, status, date range
- Relationships between apps, envs, and deployments
- Audit trail foundation
- Storage for app registry (Phase 5)
- `created_by` column ready for auth (Phase 6)

### UI Acceptance Tests — Phase 4

> After completing Phase 4, run these tests from the UI to verify nothing broke and the database layer works correctly.

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 4.1 | **Fresh deploy (full wizard)** | Open New Deploy → fill all 4 steps → upload JAR → Deploy | Job succeeds. Dashboard shows the job. Job detail shows logs + phases. All identical to pre-database behavior. |
| 4.2 | **Dashboard loads existing jobs** | Navigate to Dashboard | All previously file-based jobs appear (migrated from workspace dirs). Columns: ID, App, Env, Status, Duration, Completed — all populated. |
| 4.3 | **Job detail for migrated job** | Click any old job in Dashboard | Job detail page loads: metadata, phases, logs. No errors, no missing fields. |
| 4.4 | **Re-deploy from dashboard** | Find a successful job → click Re-deploy → upload new JAR → submit | New redeploy job created in DB. Dashboard shows it with `jobType: redeploy`. Logs stream correctly. |
| 4.5 | **Rollback from dashboard** | Find a successful job → click Rollback → confirm | Rollback job created. Preflight shows backup info. Rollback completes. Dashboard shows `jobType: rollback`. |
| 4.6 | **Abort a running job** | Start a deploy → immediately click Abort | Job transitions to ABORT_REQUESTED → ABORTED. Dashboard reflects aborted status. |
| 4.7 | **Filter + search on dashboard** | Use environment dropdown, status dropdown, and search box | Filters work — results match. Search by app name returns correct jobs. |
| 4.8 | **Notifications still work** | Deploy an app → check bell icon | Notification appears with correct job type label and app/env info. |
| 4.9 | **Runner VM restart persistence** | SSH to runner → `sudo systemctl restart wizardcd-runner` → refresh Dashboard | All jobs still visible. No data loss. This confirms PostgreSQL persistence. |
| 4.10 | **Application page** | Navigate to `/apps/<appName>` | App page shows environment cards and deployment history from DB. |

**Pass criteria:** All 10 tests pass. The UI behaves identically to the file-based version, but data survives runner restarts.

---

## Phase 5 — Application & Environment Registry + Live Config

**Goal:** Apps and environments become **saved, reusable, click-to-select entities**. Stop re-entering SSH details. Config files become **independent of the JAR build** — users can add, edit, and delete configuration in the UI, and changes can be **pushed to the running app in seconds** without a JAR rebuild and (in most cases) without a redeploy. Foundation for organizations & teams.

**Duration:** 8–10 days (was 6–8 — extended for Live Config Push, capability detection, and the modern-UX commitments below)

**Depends on:** Phase 4 (database)

**Design influences:** Vercel (zero-friction deploys), Linear (keyboard-first command palette), Stripe (smart-default forms), Argo CD (visual diff before sync), Spring Cloud Config (refresh mechanics), Heroku (drag-drop simplicity).

---

### 5.0 UI/UX Principles — The Phase 5 Manifesto

Every screen, dialog, and form built in Phase 5 has to honour these eight principles. This isn't aspirational; it's the acceptance bar.

| # | Principle | What it means in practice |
|---|---|---|
| **1** | **Select, don't type** | If a value is one of a known set (env, app, JVM version, GC, injection method), the user **picks** from a dropdown / chip / autocomplete — never types from scratch. Free-text only when the value is genuinely unique (app name on creation, override description). |
| **2** | **Auto-detect over ask** | When WizardCD can know the answer (Java version from JAR manifest, build system from `META-INF/maven/`, server port from `application.yml`, actuator presence from `BOOT-INF/lib/`), it detects and pre-fills. The user *confirms* or *overrides*; they don't *originate*. |
| **3** | **Show capability before action** | A button that won't work (or works degraded) **shows the user why before they click it** — capability badges (✓ Live push available · ⚠ Restart required · ✗ Actuator missing) are visible at the moment of decision, not surfaced after failure. |
| **4** | **Progressive disclosure** | Advanced fields (extra JVM flags, custom inject methods, target paths other than defaults) live under "Advanced" sections collapsed by default. 95% of users never expand them. |
| **5** | **Diff before destruction** | Anything that mutates a running system — deploy, push-live, rollback, delete — shows a **side-by-side diff** ("before / after") and a one-line summary ("3 properties will change · 1 requires restart") before the user confirms. |
| **6** | **Optimistic with a safety net** | UI updates instantly on user action (chip turns green the moment they click Save). The actual server call happens in the background. On failure, a toast appears with **Undo** and the UI rolls back. |
| **7** | **One keystroke to anywhere** | `⌘K` / `Ctrl+K` opens a command palette: type "deploy eureka" → land on the wizard with the app pre-selected. Type "uat logs" → land on the latest UAT job's log viewer. Every primary action and every named entity is reachable in two keystrokes. |
| **8** | **Accessibility first** | Every interactive element keyboard-reachable. WCAG AA contrast (already enforced in `globals.css`). Screen-reader landmarks. `Esc` always closes the topmost overlay. `Enter` always confirms the primary action. |

These principles apply to **every** new component built in Phase 5. They also apply retroactively to anything we touch — if we're already editing a panel for Phase 5 reasons, we bring it up to these standards.

---

### What We Build

#### 5.1 Application Management REST API

The data foundation. Pure backend; doesn't change anything the user sees. Phase 5.2 onwards consumes this.

```
POST   /applications                                  — Create new app
GET    /applications                                  — List all apps (with deploy summary per env)
GET    /applications/:id                              — App detail (app + envs + capability)
PUT    /applications/:id                              — Update name / description
DELETE /applications/:id                              — Soft-delete (sets deleted_at)

POST   /applications/:id/environments                 — Add env config
GET    /applications/:id/environments                 — List env configs
PUT    /applications/:id/environments/:envId          — Update env config
DELETE /applications/:id/environments/:envId          — Remove env config

POST   /applications/:id/environments/:envId/test-connection
                                                      — SSH-probe the target; returns liveness + Java installations
GET    /applications/:id/capability                   — Live config push capability snapshot
                                                      — (see §5.5 — derived from JAR static check + last runtime probe)
```

**URL convention:** No `/api/` prefix — matches existing `/jobs`, `/ssh/test`, `/runner/info` endpoints. Single URL space.

**Schema additions** (Flyway `V2__phase5_registry.sql`):

```sql
-- Soft delete on applications (per §5.0 principle 6 — Undo / safety net)
ALTER TABLE applications ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE applications ADD COLUMN description TEXT;          -- already present; here for clarity

-- Capability cache — populated by Phase 5.5's runtime probe.
-- Avoids re-running the SSH probe on every page load.
ALTER TABLE applications ADD COLUMN live_config_capability VARCHAR(20);
                                       -- ENABLED / DEGRADED / MISSING / UNKNOWN / PROBING
ALTER TABLE applications ADD COLUMN capability_last_checked TIMESTAMP WITH TIME ZONE;
ALTER TABLE applications ADD COLUMN capability_details JSONB;  -- actuator version, refresh endpoint, etc.
```

**Test coverage:** MockMvc integration tests per controller verifying request → DB row → audit event.

---

#### 5.2 UI — Application Management Pages

Three pages, each honouring the §5.0 principles.

##### 5.2.a Applications List — `/applications`

A grid of cards. Sortable, filterable, searchable. Built for scanning, not reading.

```
╭────────────────────────────────────────────────────────────────────────────╮
│  APPLICATIONS                                                               │
│  ┌────────────────────────────────────────┐  ┌────────────────────────┐    │
│  │ 🔍 Find an app…  (⌘K)                  │  │ + Register App         │    │
│  └────────────────────────────────────────┘  └────────────────────────┘    │
│  ▾ Sort: Most recent  ▾ Team: All  ▾ Status: All                            │
│                                                                              │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │ eureka-registry-ms              │  │ payments-gateway                 │  │
│  │ Service discovery — Netflix Eureka │  │ Stripe-backed checkout flow     │  │
│  │                                  │  │                                  │  │
│  │ ▮ DEV  ▮ SIT  ▮ UAT  ▮ PROD     │  │ ▮ DEV  ▮ SIT  ▢ UAT  ▢ PROD     │  │
│  │ 16 deploys · last: 12 min ago   │  │ 4 deploys · last: 3 hours ago   │  │
│  │ Live push: ✓ Enabled             │  │ Live push: ⚠ Setup needed       │  │
│  │                                  │  │                                  │  │
│  │ [Deploy ▸]  [View]  [⋯]         │  │ [Deploy ▸]  [View]  [⋯]         │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
╰────────────────────────────────────────────────────────────────────────────╯
```

- **Empty state:** Big illustration + single CTA "Register your first application" — not a blank page (§5.0 / Onboarding §5.7).
- **Search box:** Typeahead over name + description + env names. Highlights matched substring.
- **Env badges:** Coloured per last deploy result (green / amber / red / grey for "no deploys yet").
- **Live push badge:** Plain English at a glance — `✓ Enabled` / `⚠ Setup needed` / `↻ Probing…`.
- **Deploy button:** Goes straight to the deploy wizard with this app pre-selected (Principle 1: select, don't type).

##### 5.2.b Application Detail — `/apps/:appName`

The current page gets a major upgrade. Replaces the read-only deployment list with a **live, editable env-cards layout**.

```
╭────────────────────────────────────────────────────────────────────────────╮
│  eureka-registry-ms                                          [⋯ Edit · Delete] │
│  Service discovery — Netflix Eureka                                          │
│  Live push: ✓ Enabled  ·  4 environments  ·  16 deploys                     │
│                                                                              │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────────┐│
│  │ DEV                    [Deploy ▸] │  │ SIT                   [Deploy ▸] ││
│  │ deploy@127.0.0.1:2222            │  │ deploy@10.0.5.3:22               ││
│  │ Java 17 (Temurin)                │  │ Java 17 (Temurin)                ││
│  │ Port 8765                         │  │ Port 8765                         ││
│  │                                   │  │                                   ││
│  │ 8 deploys · last: 12 min ago ✓   │  │ 4 deploys · last: 2 days ago ✓   ││
│  │ Overrides: 2  ·  Files: 1         │  │ Overrides: 0  ·  Files: 0         ││
│  │                                   │  │                                   ││
│  │ [Configure ▾]                     │  │ [Configure ▾]                     ││
│  └──────────────────────────────────┘  └──────────────────────────────────┘│
│                                                                              │
│  ┌──────────────────────────────────┐  ┌──────────────────────────────────┐│
│  │ + Add UAT environment             │  │ + Add PROD environment            ││
│  └──────────────────────────────────┘  └──────────────────────────────────┘│
│                                                                              │
│  ─── Recent deploys ────────────────────────────────────────────────────── │
│  [ existing dashboard-style job table filtered to this app ]                │
╰────────────────────────────────────────────────────────────────────────────╯
```

- **Env cards** show the most-important config at a glance (SSH target, Java, port). Click the card → expand to full config + overrides + files panels.
- **Add environment slots** for missing envs (DEV/SIT/UAT/PROD) are explicit, click-to-fill — discoverability without clutter.
- **`Configure ▾` dropdown** lists: Edit env config · Manage overrides · Manage config files · Test connection · View deploy history · Delete env.
- **`Deploy ▸` button** lands on the wizard with `app + env` pre-selected — the user only needs to upload a JAR.

##### 5.2.c Application Setup Wizard — `/applications/new`

Replaces the "fill 20 fields in one form" pattern with a **smart 4-step wizard** that auto-detects every value it can.

| Step | What user does | What WizardCD does for them |
|---|---|---|
| **1. App basics** | Type app name; pick team (single-org → no team picker) | Generates `slug` from name; checks for duplicates inline as they type |
| **2. Pick environments** | Multi-select chips: DEV · SIT · UAT · PROD · Custom… | Pre-checks the envs most teams use (defaults: SIT + UAT) |
| **3. Configure each env** | Per env: choose existing target VM from dropdown (if any past deploys exist) OR enter new SSH host | If host matches a previous deploy → **all SSH/Java/runtime fields auto-fill** from history. User just confirms. |
| **4. Test & save** | Click "Test all" → live SSH probe per env → save | Shows green/red checkmark per env; on failure, jumps straight to the failing env's edit panel with the specific error |

**Principle 1 in action:** The only fields the user types from scratch in the entire wizard are the app name and the description. Everything else is selected, auto-detected, or carried over from history.

---

#### 5.3 Deploy Wizard Transformation — Step 1 becomes "Select"

Today Step 1 of the deploy wizard is a wall of SSH/runtime inputs. Phase 5 reduces it to **two dropdowns + a confirmation panel**.

##### Before vs after

| | **Today** | **After 5.3** |
|---|---|---|
| Step 1 fields | SSH user, host, port, env, target path, Java command, run-as user, server port, JVM heap, ~15 more | **Application dropdown** + **Environment dropdown** + (collapsed) "Customise for this deploy" |
| Free-text inputs | ~15 | **0** |
| Time to complete | 60–120 seconds | **5–10 seconds** for the common case |
| New-app path | (impossible from here) | "+ Register new app" inline → opens 5.2.c wizard → returns here with everything filled |

##### What Step 1 looks like

```
╭────────────────────────────────────────────────────────────────────╮
│  STEP 1 — Pick where to deploy                                       │
│                                                                       │
│  Application                                                          │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ ▼ eureka-registry-ms     Service discovery — Netflix Eureka  │     │
│  └────────────────────────────────────────────────────────────┘     │
│  (Recent: eureka-registry-ms · payments-gateway · + Register new)   │
│                                                                       │
│  Environment                                                          │
│  [ DEV ]  [ SIT ✓ ]  [ UAT ]  [ PROD ]                              │
│                                                                       │
│  ┌─ Will deploy to ──────────────────────────────────────────┐      │
│  │ Target:    deploy@10.0.5.3:22                                │      │
│  │ Java:      Temurin 17 · /usr/lib/jvm/temurin-17-jdk/bin/java │      │
│  │ App path:  /opt/eureka-registry-ms                           │      │
│  │ Port:      8765                                              │      │
│  │ Heap:      Xmx 1024m                                         │      │
│  │ Overrides: 2 active (logging.level.root=DEBUG, …)            │      │
│  │ Files:     1 active (application-uat.yml)                    │      │
│  │ Live push: ✓ Enabled — config changes are hot-reloadable     │      │
│  │                                                              │      │
│  │ [ Customise for this deploy ▾ ]    (advanced — 0 changes)    │      │
│  └──────────────────────────────────────────────────────────────┘      │
│                                                                       │
│  [ ← Back ]                                            [ Next → ]     │
╰────────────────────────────────────────────────────────────────────╯
```

##### Customise-for-this-deploy (collapsed by default)

Under the "Customise" disclosure, the user can override any value **for this one deploy only**. Modified fields show a **🟡 changed** badge with a one-click "revert to saved" link. After deploy, if any value was customised, a non-blocking toast appears: *"Save these settings as the new default for SIT?"* → one click and the env config updates.

##### App selector — typeahead, recent-first, keyboard-first

- ⌘K-style fuzzy search; ↑↓ + Enter to pick (Principle 7)
- Recent apps (last 5) shown at top
- "+ Register new app" always at the bottom — clicking it opens the 5.2.c wizard in a modal, returns to this point on save

---

#### 5.4 Config Versioning + Side-by-Side Diff

Each deploy already stores `config_snapshot` (JSONB). Phase 5 surfaces the value.

##### Endpoint

```
GET /applications/:id/environments/:envId/config-diff?from=<jobId>&to=<jobId>
    → Returns JSON diff: { changed: [...], added: [...], removed: [...] }
```

##### "What changed since last deploy?" panel — Job Detail page

```
╭────────────────────────────────────────────────────────────────────╮
│  CHANGES SINCE LAST DEPLOY (job a1b2…  →  this deploy)              │
│                                                                       │
│  ╔═══════════════════════╦══════════════╦══════════════════════╗   │
│  ║ Field                 ║ Before        ║ After                 ║   │
│  ╠═══════════════════════╬══════════════╬══════════════════════╣   │
│  ║ xmx                   ║ 1024m         ║ 2048m  ▲ (heap raised) ║   │
│  ║ logging.level.root    ║ INFO          ║ DEBUG  ▲ (override)    ║   │
│  ║ stabilityWindow       ║ 20            ║ 30     ▲                ║   │
│  ╚═══════════════════════╩══════════════╩══════════════════════╝   │
│                                                                       │
│  3 fields changed. No new/removed config files.                      │
│  [ Compare with a different deploy ▾ ]                                │
╰────────────────────────────────────────────────────────────────────╯
```

- **Compare with a different deploy:** dropdown of every past deploy of the same app/env → side-by-side diff to that specific one.
- **Diff highlights** semantic changes ("heap raised", "override added") in plain English when WizardCD can infer it.
- **No noise:** unchanged fields aren't shown.

---

#### 5.5 Configuration Management & **Live Config Push** ⭐

> **The category shift.** This is the stage that moves WizardCD from *"VM deploy tool"* to **"deploy + config management platform."** The user's mental model flips: config changes become *editorial*, not *engineering*. An ops engineer flips a feature flag at 11pm without filing a ticket against the dev team. A DBA rotates a connection string without a deploy. No JAR rebuilds, no git commits for *"bumped log level to DEBUG."*
>
> **The mechanism.** Users add, edit, and delete configuration **without rebuilding the JAR** and — in most cases — **without redeploying**. Changes hot-reload into the running app in <1 second when conditions allow, or apply via a 3–10 s JVM restart (no deploy pipeline) when they don't.

##### 5.5.1 The Three Tiers

| Tier | What changes | Time to apply | Downtime | Requires |
|---|---|---|---|---|
| **1 — Live refresh** | Log levels, `@RefreshScope` properties, `@ConfigurationProperties` classes, feature flags read per-request | <1 s | **Zero** | `spring-boot-starter-actuator` + `/actuator/refresh` exposed |
| **2 — Live restart** | Anything else (server.port, security filters, DataSource URL, JMS connections) | 3–10 s | 3–10 s (JVM restart, **no deploy pipeline**) | Tanuki wrapper (already required) |
| **3 — Full redeploy** | Java code changes, new dependencies, classpath additions | ~30 s | ~30 s | Everything WizardCD already does today |

**Phase 5 fully delivers Tiers 1 and 2.** Tier 3 only fires when the user actually changes code (which they aren't doing when they're just editing config).

##### 5.5.2 Architecture overview — how config decouples from build

```
┌────────────────────────────────────────────────────────────────────┐
│  AT FIRST DEPLOY (one-time externalization)                          │
│                                                                       │
│  /app/home/deploy/deployments/eureka-registry-ms/                    │
│  ├── bin/eureka-registry-ms.jar       ← user's JAR (baked YAML in)    │
│  ├── conf/                                                            │
│  │   ├── eureka-registry-ms-UAT.conf  ← Tanuki wrapper                │
│  │   ├── application-uat.yml          ← MANAGED BY WIZARDCD ◀──┐     │
│  │   └── logback-uat.xml              ← MANAGED BY WIZARDCD ◀──┤     │
│  └── lib/                                                       │     │
│                                                                  │     │
│  Tanuki conf includes:                                          │     │
│    wrapper.java.additional.10=                                  │     │
│      --spring.config.additional-location=optional:file:/app/.../conf/ │
│  → Spring loads the WizardCD-managed YAML at HIGHER PRIORITY    │     │
│    than the JAR-bundled one. Same JAR, different config.        │     │
└──────────────────────────────────────────────────────────────────┼──┘
                                                                   │
                                                                   │ AT CONFIG CHANGE TIME
                                                                   │ (no deploy pipeline)
                                                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│  PUSH LIVE — surgical update                                          │
│                                                                       │
│  1. User edits override in UI, clicks "Push Live"                    │
│  2. WizardCD SSH ─── scp new application-uat.yml ───► target VM       │
│     (atomic rename — never half-written)                              │
│  3. WizardCD inspects the change:                                     │
│     • logback only?            → done (logback auto-reloads on scan)  │
│     • only refreshable props?   → POST /actuator/refresh → <1 s, 0 dt│
│     • includes hard-restart key?→ wrapper.sh stop && start → 3–10 s   │
│  4. Audit log: { action: CONFIG_PUSHED_LIVE, restart: false, … }      │
└────────────────────────────────────────────────────────────────────┘
```

The JAR **never changes**. The config does. The user **never re-uploads a JAR** to change configuration.

##### 5.5.3 Capability detection — three checkpoints, surfaced in the UI

WizardCD checks "can this app receive live config pushes?" at three moments so the user is never surprised mid-action.

| Checkpoint | When | How | What the user sees |
|---|---|---|---|
| **A — JAR upload** | Step 2 of the deploy wizard | Peek into `BOOT-INF/lib/` for `spring-boot-actuator-*.jar` + parse `application.yml` for `management.endpoints.web.exposure.include` | Green / amber / red banner under the upload success message |
| **B — Runtime probe** | After stability check, on every deploy | Runner SSHes to target, curls `localhost:<mgmt-port>/actuator/refresh` with OPTIONS | Result persisted on `applications.live_config_capability` |
| **C — Push Live click** | When user actually pushes config | Consults the saved capability + classifies which props changed | Push-Live dialog shows path forward (Live / Restart / Enable Actuator / Defer) |

##### 5.5.4 The "Push Live" dialog — full UI spec

```
╭────────────────────────────────────────────────────────────────────╮
│  Push 3 config changes to UAT                                        │
│  ────────────────────────────────────────────────────────────────── │
│                                                                       │
│  CHANGES                                                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ + logging.level.root         INFO → DEBUG       hot-refresh ✓│   │
│  │ + feature.checkout-v2        true → false       hot-refresh ✓│   │
│  │ + server.port                8765 → 8766        needs restart ⚠│   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  IMPACT                                                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ⚠ 1 change requires a JVM restart                              │   │
│  │ Push Live will rewrite config + briefly restart the app (~5 s).│   │
│  │                                                                │   │
│  │ Recommended for DEV/SIT.                                       │   │
│  │ For PROD, schedule during a maintenance window.                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  ┌─ Push Live with Restart ─┐  ┌─ Defer until next deploy ─┐         │
│  │ Recommended              │  │                            │         │
│  └─────────────────┬────────┘  └─────────────────┬─────────┘         │
│                    │                              │                    │
│                    │                              └─ Save the changes  │
│                    │                                 without applying  │
│                    │                                 (apply on next    │
│                    │                                  deploy)          │
│                    │                                                   │
│                    └─ Replace config file on target → kill+start       │
│                       wrapper. App reachable in ~5 s.                 │
│                                                                       │
│  [ Cancel ]                                                           │
╰────────────────────────────────────────────────────────────────────╯
```

##### 5.5.5 The "Capability Missing" dialog — build-system aware

When the user clicks Push Live on an app without actuator:

```
╭────────────────────────────────────────────────────────────────────╮
│  Live push isn't available yet                                       │
│  ────────────────────────────────────────────────────────────────── │
│                                                                       │
│  spring-boot-starter-actuator is missing from this JAR.              │
│                                                                       │
│  Your options:                                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ▷ Push & Restart now                                          │    │
│  │   3–10 s downtime, no deploy pipeline needed                  │    │
│  │   Best for: one-off urgent change                              │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ ▷ Enable Live Push (one-time JAR rebuild)                     │    │
│  │   After this you'll get zero-downtime config changes forever  │    │
│  │   We'll show you the exact code to add                        │    │
│  ├─────────────────────────────────────────────────────────────┤    │
│  │ ▷ Save & wait for next deploy                                 │    │
│  │   Changes saved in WizardCD; applied automatically on next    │    │
│  │   deploy of this app/env                                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                       │
│  [ Cancel ]                                                           │
╰────────────────────────────────────────────────────────────────────╯
```

##### 5.5.6 The "Enable Live Push" walkthrough — build-system aware

WizardCD detects the build system (Maven by looking for `META-INF/maven/<group>/<artifact>/pom.xml` in the JAR, Gradle by other markers) and shows the right snippets:

```
╭────────────────────────────────────────────────────────────────────╮
│  Enable Live Config Push — one-time setup (~ 5 minutes)              │
│  ────────────────────────────────────────────────────────────────── │
│                                                                       │
│  Detected: Maven · Spring Boot 3.2.2 · Java 17                        │
│                                                                       │
│  1. Add to pom.xml:                                          [Copy]   │
│     ┌────────────────────────────────────────────────────────┐       │
│     │ <dependency>                                            │       │
│     │   <groupId>org.springframework.boot</groupId>           │       │
│     │   <artifactId>spring-boot-starter-actuator</artifactId>│       │
│     │ </dependency>                                           │       │
│     └────────────────────────────────────────────────────────┘       │
│                                                                       │
│  2. Add to application.yml:                                   [Copy]  │
│     ┌────────────────────────────────────────────────────────┐       │
│     │ management:                                              │       │
│     │   endpoints:                                             │       │
│     │     web:                                                 │       │
│     │       exposure:                                          │       │
│     │         include: refresh                                 │       │
│     └────────────────────────────────────────────────────────┘       │
│                                                                       │
│  3. (Optional) Mark beans whose properties hot-refresh:        [Copy] │
│     ┌────────────────────────────────────────────────────────┐       │
│     │ @RestController                                         │       │
│     │ @RefreshScope    // ← add this annotation               │       │
│     │ public class MyController {                             │       │
│     │     @Value("${feature.checkout-v2}")                    │       │
│     │     private boolean useV2;                              │       │
│     │ }                                                       │       │
│     └────────────────────────────────────────────────────────┘       │
│                                                                       │
│  4. Rebuild:  mvn clean package                                       │
│                                                                       │
│  5. Upload the new JAR via Re-deploy. From then on, every config     │
│     change is instant — no more rebuilds.                            │
│                                                                       │
│  After setup, capability will flip to ✓ ENABLED automatically.       │
│                                                                       │
│  [ Got it — I'll do this later ]    [ Open Re-deploy ▸ ]              │
╰────────────────────────────────────────────────────────────────────╯
```

##### 5.5.7 Five injection methods — picker, not free-text

When the user adds a config override, they pick the injection method from a 5-option selector (Principle 1):

| Method | What WizardCD does at deploy | When the user picks this |
|---|---|---|
| `JVM_PROPERTY` *(default)* | Emits `-D<key>=<value>` in Tanuki wrapper conf | Single keys (log level, feature flag) |
| `SPRING_CONFIG` | SCPs file to `target_path` + adds `--spring.config.additional-location` | Whole-YAML replacement |
| `SPRING_PROFILE` | Emits `-Dspring.profiles.active=<env>` | App already ships `application-<env>.yml` profiles |
| `ENV_VAR` | Writes to `/app/.../conf/<app>.env`; wrapper sources it | 12-factor / containerised apps |
| `FILE_DROP` | SCPs file to any path on target, no flag added | Logback configs, nginx files, anything not Spring-aware |

WizardCD **auto-suggests** the right method based on what the user is adding (key looks like `logging.level.*` → `JVM_PROPERTY`; uploaded file ends in `.yml` and starts with `application-` → `SPRING_CONFIG`; etc.). The user can override.

##### 5.5.8 Database schema (Flyway `V3__config_overrides_and_files.sql`)

```sql
CREATE TABLE config_overrides (
    id                UUID PRIMARY KEY,
    app_id            UUID NOT NULL REFERENCES applications(id),
    env_name          VARCHAR(20) NOT NULL,
    config_key        VARCHAR(500) NOT NULL,           -- "logging.level.root"
    config_value      TEXT NOT NULL,                    -- "DEBUG"
    value_type        VARCHAR(20) DEFAULT 'STRING',    -- STRING / NUMBER / BOOLEAN / JSON
    injection_method  VARCHAR(30) DEFAULT 'JVM_PROPERTY',
    is_sensitive      BOOLEAN DEFAULT FALSE,           -- masks in UI; real secret encryption is Phase 7
    description       TEXT,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(app_id, env_name, config_key)
);

CREATE TABLE config_files (
    id                UUID PRIMARY KEY,
    app_id            UUID NOT NULL REFERENCES applications(id),
    env_name          VARCHAR(20) NOT NULL,
    file_name         VARCHAR(255) NOT NULL,           -- "application-uat.yml"
    file_content      TEXT NOT NULL,                    -- ≤ 1 MB; larger → filesystem (future)
    file_size         BIGINT NOT NULL,
    target_path       VARCHAR(500) NOT NULL,           -- "/app/conf/"
    injection_method  VARCHAR(30) NOT NULL,            -- SPRING_CONFIG / FILE_DROP / ENV_FILE
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(app_id, env_name, file_name)
);

CREATE INDEX idx_config_overrides_app_env ON config_overrides(app_id, env_name);
CREATE INDEX idx_config_files_app_env     ON config_files(app_id, env_name);
```

##### 5.5.9 New REST endpoints

```
GET    /applications/:id/environments/:envId/overrides
POST   /applications/:id/environments/:envId/overrides
PUT    /applications/:id/environments/:envId/overrides/:overrideId
DELETE /applications/:id/environments/:envId/overrides/:overrideId

GET    /applications/:id/environments/:envId/files
POST   /applications/:id/environments/:envId/files       (multipart upload)
PUT    /applications/:id/environments/:envId/files/:fileId
DELETE /applications/:id/environments/:envId/files/:fileId

POST   /applications/:id/environments/:envId/push-live
       Body: { overrideIds: [...], fileIds: [...], restart: 'auto'|'never'|'always' }
       Response: { pushed: N, restartRequired: true|false, refreshedKeys: [...], elapsedMs: N }

GET    /applications/:id/environments/:envId/pending-changes
       Returns the unpushed overrides + files since last successful push
```

##### 5.5.10 Push pipeline (new bash + Java)

- **`LiveConfigPushService`** (Java) — orchestrates: pull pending changes, classify, SSH+scp file, optional actuator refresh, optional wrapper restart. Returns audit-ready result.
- **`runner/live-push-config.sh`** (new) — runs on the target VM. Atomically replaces files (`tmpfile + mv`), curls `localhost:<port>/actuator/refresh`, restarts wrapper if needed. Returns structured exit codes the Java side parses.
- **Property classification registry** — a static `live-config-classification.yml` in the runner classpath maps key patterns to behaviour:
  ```yaml
  refreshable:
    - "logging.level.*"
    - "feature.*"
    - "spring.cloud.*"
  hard-restart:
    - "server.port"
    - "server.address"
    - "spring.datasource.*"
    - "spring.security.*"
  conservative-default: hard-restart   # unknown keys assume restart needed
  ```
  The UI shows each changed key's classification before the user clicks Push Live.

##### 5.5.11 Drift detection

Each successful push records a hash of the deployed config. The Application Detail page shows a chip if drift is detected:

```
SIT  ⚠ Config drift detected — last push 2h ago doesn't match deploy 4d ago
     [ Re-push to align ]    [ Pull live state to local ]
```

##### 5.5.12 Secrets — honest warning, Phase 7 will solve properly

```
┌──────────────────────────────────────────────────────────────────┐
│ ⚠ Do not put secrets here yet                                     │
│                                                                    │
│ Overrides are stored as plain text in the WizardCD database AND   │
│ appear in the target VM's process command line. Use environment   │
│ variables + Phase 7's secret management (coming soon) for         │
│ passwords, API keys, and certs.                                   │
│                                                                    │
│ [ Mark as sensitive (masks in UI only) ]                          │
└──────────────────────────────────────────────────────────────────┘
```

Per-row `is_sensitive` flag masks the value (`••••••••`) in the UI but **doesn't encrypt** — banner makes that clear. Phase 7 is when secrets become real.

---

#### 5.6 Multi-Tenancy Foundation (Organizations & Teams)

> **Why here:** Organizations and teams must exist BEFORE auth (Phase 6) so RBAC can be scoped to orgs, and BEFORE billing (Phase 15) so subscriptions attach to organizations.

Schema (Flyway `V4__organizations_teams.sql`):

```sql
CREATE TABLE organizations (
    id              UUID PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    owner_user_id   UUID,
    plan            VARCHAR(30) DEFAULT 'FREE',
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE teams (
    id              UUID PRIMARY KEY,
    org_id          UUID NOT NULL REFERENCES organizations(id),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(org_id, name)
);

CREATE TABLE team_members (
    team_id         UUID NOT NULL REFERENCES teams(id),
    user_id         UUID NOT NULL,
    role            VARCHAR(30) DEFAULT 'MEMBER',
    joined_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, user_id)
);

ALTER TABLE applications ADD COLUMN org_id  UUID REFERENCES organizations(id);
ALTER TABLE applications ADD COLUMN team_id UUID REFERENCES teams(id);

-- Single-org seed
INSERT INTO organizations (id, name, slug, plan)
VALUES (gen_random_uuid(), 'Default Organization', 'default', 'FREE');

-- Back-fill existing apps to the default org
UPDATE applications SET org_id = (SELECT id FROM organizations WHERE slug = 'default');
```

- **Single-org mode (default):** Onboarding wizard renames the default org to whatever the user types. No org picker in UI until Phase 15 multi-org lands.
- **Team picker** in the Application setup wizard is hidden when only one team exists (Principle 4: progressive disclosure).
- **No new pages built in Phase 5** — orgs/teams are schema + minimal Settings panel for renaming. Full team management UI is Phase 6 territory (needs users).

---

#### 5.7 Onboarding, In-App Help, and Modern UX Patterns

A modern-CD tool's first 60 seconds matter more than its 60th day. Phase 5 ships every one of these as a first-class capability — not "nice-to-have" deferred work.

##### 5.7.1 First-time setup wizard

Auto-runs on fresh install (no applications + no completed setup). 3 steps, fully auto-detecting wherever possible:

```
Step 1 — Organization
  Name: [____________]   (auto-suggested from hostname / git config)
  Your role: ADMIN (first user — auto-assigned)

Step 2 — Register your first app
  App name: [____________]   (suggests from JAR manifest if user has one)
  ┌─ Drop your JAR here, or skip to do it later ─┐
  │                                                │
  │  Drag & drop · click to browse                 │
  │                                                │
  └────────────────────────────────────────────────┘
  ↳ (on drop) Detected: spring-boot 3.2.2 · java 17 · server.port 8765
              Live config push: ✓ ready

  Target host:    [____________]   Port: [22]
  SSH user:       [____________]
  [ Test connection ]   (live progress bar)

Step 3 — Deploy
  [ Deploy with these settings ▸ ]
  ↳ Lands on the deploy wizard with everything filled in.
```

- **Skip option** on every step ("I'll explore on my own" → skips to Dashboard with prominent CTAs).
- **Auto-detect everywhere:** hostname → org name suggestion, JAR → app name + main class + Java version + server port + actuator presence, etc.
- **Resumable:** Quitting halfway saves state; banner on Dashboard ("Resume setup ▸") until completed or dismissed.

##### 5.7.2 Command palette — `⌘K` / `Ctrl+K`

The single most impactful productivity feature in modern apps. Phase 5 ships it.

```
╭──────────────────────────────────────────────────────────────╮
│ 🔍 Type a command or search…                                   │
│ ────────────────────────────────────────────────────────────── │
│  ✨ DEPLOY                                                      │
│      Deploy eureka-registry-ms to UAT                ⏎         │
│      Deploy payments-gateway to SIT                   ⏎         │
│      Deploy a new app                                  ⏎         │
│                                                                │
│  🚀 APPS                                                       │
│      Open eureka-registry-ms                          ⏎         │
│      Open payments-gateway                            ⏎         │
│                                                                │
│  📜 LOGS                                                       │
│      Latest UAT logs (eureka)                         ⏎         │
│                                                                │
│  ⚙ ACTIONS                                                     │
│      Push live config (eureka / UAT)                  ⏎         │
│      Open Settings                                    ⌘,        │
│      Toggle theme                                              │
╰──────────────────────────────────────────────────────────────╯
```

- Fuzzy search across **every entity** (apps, envs, jobs, settings, docs sections).
- Recent commands at top.
- Every navigation action exists here.

##### 5.7.3 Contextual help — popovers, not just tooltips

Hover/click `?` icons on technical fields. Popovers (not tooltips) so they can contain examples + links.

```
[Stability Window]  [?]
                   ┌──────────────────────────────────────┐
                   │ Stability Window                       │
                   │ ────────────────────────────────────── │
                   │ Seconds the deploy waits after the app │
                   │ binds its port, watching for crashes.  │
                   │                                         │
                   │ Recommended: 20 s for stateless APIs,  │
                   │ 60 s for apps that warm caches at      │
                   │ startup, 120 s for heavy migrations.   │
                   │                                         │
                   │ [Read more about deploy phases ▸]      │
                   └──────────────────────────────────────┘
```

##### 5.7.4 Empty states with one-click CTAs

Every empty page has a friendly illustration + the single most-likely action.

| Page | Empty state |
|---|---|
| Applications (none) | *"Register your first app to start deploying in seconds."* [Register App ▸] |
| Dashboard (no jobs) | *"No deployments yet — let's make your first one."* [New Deploy ▸] |
| Application detail (no envs) | *"This app has no environments configured. Add one to start deploying."* [Add Environment ▸] |
| Config Overrides (none) | *"No overrides yet. Add one to change config without rebuilding."* [Add Override ▸] [Learn how ▸] |
| Job logs (job pending) | Skeleton loader, not blank pane |

##### 5.7.5 Keyboard-shortcut overlay — `?`

Pressing `?` anywhere shows a cheat-sheet overlay grouped by context:

```
⌘K   Command palette          /     Focus search
g d  Go to Dashboard          g a   Go to Applications
g n  New Deploy               g s   Settings
↑ ↓  Navigate lists           ⏎     Open / confirm
Esc  Close overlay            ⌘,    Settings
n    New (context-dependent: new app / new env / new override / new deploy)
```

##### 5.7.6 In-app documentation drawer

`?` icon in the header → slide-in right drawer with searchable docs.

- **Topics** (Phase 5): Getting Started · Register an App · Config Overrides · Live Config Push · SSH Key Setup · Re-deploy & Rollback
- **Context-aware:** Page-aware default topic; the drawer opens to the topic relevant to where you are
- **Copy-paste-able:** Code snippets have one-click Copy buttons
- **Phase 10:** Links to Swagger UI for API exploration

##### 5.7.7 First-visit tour — re-triggerable

Animated pointer highlighting: Dashboard → New Deploy → Step 1 → Step 4 → Push Live demo. Skippable on first show; re-triggerable from Settings → "Show me the tour again".

##### 5.7.8 Toast notification + undo

Every destructive or mutating action shows a toast with **Undo** for 5 seconds:

- *"Override deleted — Undo"*
- *"App archived — Undo"*
- *"Config pushed live — View result"*

---

### What It Unlocks

- **Pick-don't-type deploys** — five seconds from intent to running deploy
- **Zero JAR rebuilds for config changes** — for the lifetime of every app
- **Hot config reloads in <1 s** for actuator-enabled apps; live restarts in 3–10 s otherwise; never a deploy pipeline for a config-only change
- **Per-env config divergence** — UAT can log DEBUG while PROD logs WARN, from the same JAR
- **Audit trail per config edit** — every override change is a row in `audit_events`
- **Build-system-aware help** — Maven vs Gradle vs unknown all get the right snippets
- **Drift detection** — UI surfaces when the live config no longer matches what's saved
- **Config history & diff** — every deploy stores a snapshot; diff any two
- **Single-org foundation** — multi-tenancy plumbing ready for Phase 6 (auth) and Phase 15 (billing) without schema migration
- **Onboarding wizard, command palette, in-app help** — first-day users productive in minutes, power users keyboard-first

---

### Build Order Within Phase 5

Each block ends with a working runner + a committable checkpoint. Roughly 1 sub-stage per day.

| Order | Stage | Why this order | Effort |
|---|---|---|---|
| 1 | **5.1** REST API (apps + envs) + `V2` migration | Pure backend; foundation for everything else. No UI risk. | 1 d |
| 2 | **5.6** Orgs + teams + `V4` migration + default-org seed | Cheaper to add the `org_id` column to apps NOW than back-fill later. Single-org mode keeps UI identical. | 0.5 d |
| 3 | **5.2** Application UI pages (List, Detail, Setup Wizard) | First Phase-5 capability the user sees. Honours §5.0 principles. | 2 d |
| 4 | **5.3** Deploy wizard Step-1 transformation | Big behavioural shift; biggest single perception change. | 1.5 d |
| 5 | **5.4** Config versioning + diff panel | Cheap, high-trust feature on data we already store. | 0.5 d |
| 6 | **5.5** Config overrides + files + `V3` migration + Live Push pipeline + capability detection + all the dialogs | The headline. Most code, most testing. | 3 d |
| 7 | **5.7** Onboarding wizard, command palette, contextual help, empty states, keyboard shortcuts, docs drawer | Polish layer once everything else exists. | 1.5 d |

**Total: 9.5 days** (rounded to 8–10 in the header).

---

### UI Acceptance Tests — Phase 5

> Test the registry, the live-push pipeline, capability detection, and every modern-UX commitment.

#### Registry & Wizard (5.1 – 5.12)

| # | Test | Steps | Expected |
|---|---|---|---|
| 5.1 | **Register new application** | Applications → "Register App" → wizard step 1: type name → next | App row in `applications`; appears in list with empty env badges |
| 5.2 | **Add environment via wizard** | Setup wizard step 3 → fill SSH/Java → Test Connection → Save | `environment_configs` row created; connection passes; env badge on app card |
| 5.3 | **Add multiple envs** | Add DEV + SIT + UAT + PROD | All 4 env cards on detail page; each with distinct host/port/Java |
| 5.4 | **Deploy via app selection** | New Deploy → app dropdown → env chip → Next | Wizard Step 2+ pre-filled from saved env; **zero free-text inputs in Step 1** |
| 5.5 | **Inline new-app registration** | New Deploy → "+ Register new app" | Setup wizard opens in modal; on save, returns to deploy wizard with values filled |
| 5.6 | **Override saved config for one deploy** | Deploy from saved app → expand "Customise" → change xmx → Deploy | Deployment uses overridden value; **🟡 changed badge** shown on the field |
| 5.7 | **Save customised settings post-deploy** | After 5.6 → click "Save as default for SIT" in the post-deploy toast | `environment_configs` updated; next deploy shows new xmx as default |
| 5.8 | **Config diff between two deploys** | Job detail → "Changes since last deploy" → Compare to a different deploy | Side-by-side diff; only changed fields shown; plain-English annotations where inferable |
| 5.9 | **Edit env config** | App detail → env card → Configure → Edit env → change SSH host → Save | Config updated; next deploy uses new host |
| 5.10 | **Soft-delete app** | App detail → ⋯ → Archive (with confirm) → Undo via toast within 5 s | First click sets `deleted_at`; Undo clears it; permanent delete after toast expires |
| 5.11 | **Quick-deploy from env card** | App detail → env card → Deploy ▸ | Lands on wizard Step 2 (skip Step 1); only JAR upload needed |
| 5.12 | **Applications list overview** | `/applications` | Cards show name · description · env badges (coloured by last deploy) · deploy count · live-push state |

#### Live Config Push (5.13 – 5.24)

| # | Test | Steps | Expected |
|---|---|---|---|
| 5.13 | **Add key-value override** | App detail → env → Configure → Manage overrides → add `logging.level.root` = `DEBUG` | Row in `config_overrides`; injection method auto-suggested as `JVM_PROPERTY` |
| 5.14 | **Override applied on next deploy** | After 5.13 → deploy this app → ssh target → cat Tanuki conf | Tanuki conf contains `-Dlogging.level.root=DEBUG`; app logs at DEBUG |
| 5.15 | **Upload per-env config file** | env → Manage files → upload `application-uat.yml` → confirm target path `/app/conf/` | Row in `config_files`; injection method auto-suggested as `SPRING_CONFIG` |
| 5.16 | **Config file deployed to target** | After 5.15 → deploy → ssh target → ls `/app/conf/` | File present at target path; JVM args include `--spring.config.additional-location=…` |
| 5.17 | **Push Live — hot-refresh only** | Edit `logging.level.root` from DEBUG to INFO → Push Live | Push dialog says "1 change · hot-refresh ✓"; SSH+scp file + POST `/actuator/refresh`; app log level changes in <1 s; **no JVM restart**; audit row `CONFIG_PUSHED_LIVE` |
| 5.18 | **Push Live — restart required** | Change `server.port` 8765 → 8766 → Push Live | Dialog says "requires restart"; choose Push & Restart; wrapper.sh restart; app reachable in ~5 s; audit row `CONFIG_PUSH_RESTARTED` |
| 5.19 | **Capability badge on JAR upload — actuator present** | Step 2 of wizard → upload JAR that contains actuator + exposes `/refresh` | Green banner: "Live push: ✓ AVAILABLE" |
| 5.20 | **Capability badge — actuator missing** | Upload JAR without actuator | Amber banner explaining what's missing + "Show me how" CTA |
| 5.21 | **Capability badge — partial (no refresh endpoint)** | Upload JAR with actuator but without `management.endpoints.web.exposure.include: refresh` | Amber banner showing the YAML snippet to add + Copy button |
| 5.22 | **"Show me how" walkthrough — Maven** | Click "Show me how" on a Maven-detected JAR | Modal shows pom.xml + application.yml snippets, both with Copy; rebuild instruction; redeploy CTA |
| 5.23 | **"Show me how" walkthrough — Gradle** | Same as 5.22 but JAR is Gradle-built | Same modal but with Gradle snippets |
| 5.24 | **Defer push to next deploy** | Push Live dialog → "Save & wait" | Changes stay pending in DB; banner on app detail: "3 pending changes will apply on next deploy"; next deploy applies them |
| 5.25 | **Drift detection** | Manually `ssh target && echo "logging.level.root=WARN" >> /app/conf/application-uat.yml` → reload app detail | Drift banner: "Config drift detected"; offer Re-push or Pull |
| 5.26 | **Override diff between envs** | UAT has `logging.level=DEBUG`, PROD has `WARN` → app detail → "Compare envs" | Side-by-side override list; differences highlighted |
| 5.27 | **Sensitive override masked in UI** | Add override marked `is_sensitive` = true | UI shows `••••••••` instead of value; Copy still works for admin |
| 5.28 | **Push Live with no actuator → restart fallback** | App without actuator → Push Live → choose Push & Restart | Capability-missing dialog appears first; wrapper restart succeeds; audit row records `restart: true, reason: NO_ACTUATOR` |
| 5.29 | **Runtime probe persists capability** | First deploy of an actuator-enabled app → wait for stability check → check DB | `applications.live_config_capability = 'ENABLED'`; `capability_last_checked` populated |

#### Multi-Tenancy (5.30 – 5.31)

| # | Test | Steps | Expected |
|---|---|---|---|
| 5.30 | **Default org auto-created on first run** | Fresh install | One row in `organizations` named "Default Organization"; all apps back-filled with its `org_id` |
| 5.31 | **Rename org via Settings** | Settings → Organization → edit name → Save | `organizations.name` updated; sidebar header reflects new name |

#### Onboarding & Modern UX (5.32 – 5.40)

| # | Test | Steps | Expected |
|---|---|---|---|
| 5.32 | **First-time setup wizard fires** | Fresh install with no apps → open `/` | Setup wizard auto-appears; 3 steps with skip option |
| 5.33 | **JAR auto-detect during setup** | Setup step 2 → drop JAR | Banner shows detected: Spring Boot version · Java version · server.port · actuator capability |
| 5.34 | **Resume interrupted setup** | Quit halfway → reload | Banner on Dashboard: "Resume setup ▸" |
| 5.35 | **Command palette opens with ⌘K** | Press ⌘K anywhere | Palette opens; type "deploy euk" → first hit is "Deploy eureka-registry-ms to SIT"; Enter navigates with state pre-set |
| 5.36 | **Keyboard shortcut overlay** | Press `?` | Overlay shows all shortcuts grouped by context; Esc closes |
| 5.37 | **Contextual help popover** | Hover/click `?` next to "Stability Window" field | Popover shows explanation + recommended values + "Read more" link |
| 5.38 | **Empty state CTA — Applications** | Fresh install → `/applications` | Illustration + "Register your first application" button (single primary CTA) |
| 5.39 | **Toast undo — delete override** | Delete an override → Undo within 5 s | Row restored; no actual DELETE hit the DB until toast expires |
| 5.40 | **Docs drawer context-aware** | Open docs drawer from Config Overrides page | Drawer opens to "Config Overrides" topic |

**Pass criteria:** All 40 tests pass. Users register apps once and deploy by selecting from dropdowns. Config changes apply live without JAR rebuilds (hot-refresh when possible, fast restart otherwise — never a deploy pipeline for config-only changes). The first-day experience is guided and skippable; the daily experience is keyboard-first.

---

## Phase 6 — Authentication & OAuth2 + Enterprise SSO

**Goal:** Know who is deploying. Protect production. Enable multi-user access. Support OAuth (GitHub/Google/Azure), SAML 2.0, and LDAP for enterprise teams.

**Duration:** 6–8 days

**Depends on:** Phase 4 (database), Phase 5 (app registry for role scoping)

### What We Build

#### 6.1 OAuth2 + Enterprise SSO Integration
- Spring Security OAuth2 Login + JWT Resource Server
- Supported OAuth providers (configurable):
  - **GitHub** — OAuth App (`client_id` + `client_secret`)
  - **Google** — OAuth 2.0 credentials
  - **Microsoft Azure AD** — App registration (enterprise SSO)
- Enterprise SSO (for larger organisations):
  - **SAML 2.0** — Okta, PingFederate, ADFS, OneLogin (via `spring-security-saml2-service-provider`)
  - **LDAP / Active Directory** — direct bind authentication for on-prem teams (via `spring-security-ldap`)
- OAuth flow: UI redirects to provider → callback to backend → JWT issued → stored in browser
- SAML flow: UI redirects to IdP → SAML assertion → backend validates → JWT issued
- LDAP flow: UI posts credentials → backend binds to LDAP server → JWT issued
- **Settings UI:** Auth provider configuration panel — enable/disable providers, configure endpoints/keys

#### 6.2 User Management

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    name            VARCHAR(255),
    avatar_url      VARCHAR(500),
    oauth_provider  VARCHAR(30) NOT NULL,  -- github, google, azure
    oauth_id        VARCHAR(255) NOT NULL,
    role            VARCHAR(30) NOT NULL DEFAULT 'VIEWER',
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login      TIMESTAMP
);

CREATE TABLE user_sessions (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES users(id),
    refresh_token   VARCHAR(500) NOT NULL,
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 6.3 Role-Based Access Control (RBAC)

| Role | DEV | SIT | UAT | PROD | Admin |
|------|-----|-----|-----|------|-------|
| VIEWER | Read-only | Read-only | Read-only | Read-only | — |
| DEPLOYER | Deploy + Rollback | Deploy + Rollback | Deploy + Rollback | View-only | — |
| RELEASE_MANAGER | Deploy + Rollback | Deploy + Rollback | Deploy + Rollback | Deploy + Rollback + Approve | — |
| ADMIN | Full | Full | Full | Full | Manage users, apps, settings |

#### 6.4 UI Changes
- **Login page**: provider buttons (GitHub / Google / Azure) with branded icons
- **Header**: user avatar + name + role badge (replaces static UAT badge)
- **Role-gated UI**: PROD deploy button hidden for DEPLOYER, approval buttons for RELEASE_MANAGER only
- **User management page** (ADMIN only): list users, change roles, deactivate
- **"Deployed by"** column in dashboard + job detail

#### 6.5 API Security
- All API endpoints require valid JWT (except `/health`, `/login`, `/oauth/callback`)
- JWT contains: `userId`, `email`, `role`, `exp`
- Refresh token rotation (silent renewal)
- Session timeout configurable (default 8 hours)
- CSRF protection via Spring Security `CsrfTokenRequestAttributeHandler`
- `Secure`, `HttpOnly`, `SameSite=Lax` flags on all cookies
- OAuth `state` parameter to prevent CSRF on OAuth redirect flow
- Brute-force protection: 5 failed login attempts → 15-minute lockout (configurable)
- Security response headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`

#### 6.6 Input Sanitisation (Shell Injection Prevention)
- **Critical:** `appName`, `envName`, `sshUser`, `sshHost`, `targetBasePath`, `jarName` all flow into bash commands via deploy.sh
- Validation regex whitelist: `appName` → `^[a-zA-Z0-9._-]{1,100}$`, `envName` → `^(DEV|SIT|UAT|PROD)$`
- `sshUser` → `^[a-z_][a-z0-9_-]{0,31}$` (Linux username rules)
- `sshHost` → IP address or hostname regex (no semicolons, pipes, backticks)
- `targetBasePath` → `^/[a-zA-Z0-9._/-]{1,500}$` (absolute path, safe characters only)
- `jarName` → `^[a-zA-Z0-9._-]{1,255}\.jar$`
- **Double validation:** Spring `@Pattern` annotations on DTO fields + `DeploymentValidatorService` pre-launch check
- These validations are introduced in Phase 6 because Phase 6 establishes the validation framework — but apply to all endpoints including pre-auth ones

### What It Unlocks
- Multi-user access with identity
- Complete audit trail ("bishop deployed eureka-registry-ms to UAT at 10:22")
- PROD protection (only RELEASE_MANAGER can deploy)
- Foundation for approval gates (Phase 8)

### UI Acceptance Tests — Phase 6

> Test authentication, role-based access, and user identity across all pages.

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 6.1 | **Login with GitHub** | Open WizardCD (not logged in) → redirected to login page → click "Sign in with GitHub" | Redirected to GitHub OAuth → authorize → redirected back to WizardCD → Dashboard loads. Header shows your GitHub avatar + name. |
| 6.2 | **Login with Google** | Login page → click "Sign in with Google" | Google OAuth flow → redirected back → logged in. Header shows Google avatar + name. |
| 6.3 | **Login with Azure AD** | Login page → click "Sign in with Microsoft" | Azure AD OAuth flow → redirected back → logged in. Header shows Microsoft account name. |
| 6.4 | **Unauthenticated access blocked** | Open Dashboard URL directly without logging in | Redirected to login page. No data exposed. |
| 6.5 | **VIEWER role — read only** | Log in as VIEWER → navigate Dashboard, Job Detail, App pages | All pages load (read-only). Deploy button is hidden/disabled. Re-deploy and Rollback buttons hidden. |
| 6.6 | **DEPLOYER role — SIT/UAT deploy** | Log in as DEPLOYER → deploy to UAT | Deploy wizard works. Deployment succeeds. "Deployed by \<your name\>" shown in job detail. |
| 6.7 | **DEPLOYER role — PROD blocked** | Log in as DEPLOYER → try to deploy to PROD | PROD option is disabled/hidden in environment selector. If URL-hacked, API returns 403 Forbidden. |
| 6.8 | **RELEASE_MANAGER — PROD deploy** | Log in as RELEASE_MANAGER → deploy to PROD | PROD deployment allowed. Succeeds. Job shows "Deployed by" with user identity. |
| 6.9 | **ADMIN — user management** | Log in as ADMIN → navigate to User Management page | User list visible. Can change roles (VIEWER → DEPLOYER). Can deactivate users. |
| 6.10 | **Role change takes effect** | ADMIN changes user from VIEWER to DEPLOYER | User refreshes → deploy button now visible. Can deploy to SIT/UAT. |
| 6.11 | **"Deployed by" on dashboard** | After deploying, check Dashboard table | New "Deployed By" column shows user name/avatar for all new deploys. Old (pre-auth) deploys show "—". |
| 6.12 | **Session expiry** | Wait for session timeout (or manually expire JWT) → perform any action | Redirected to login page. After re-login, returns to previous page. |
| 6.13 | **Logout** | Click user avatar → Logout | Session cleared. Redirected to login page. Back button doesn't restore access. |
| 6.14 | **First user auto-ADMIN** | Fresh install with empty users table → first OAuth login | First user automatically assigned ADMIN role. Subsequent users get VIEWER by default. |
| 6.15 | **SAML 2.0 login** | Configure SAML IdP (Okta) in Settings → Login page → click "Sign in with SSO" | SAML redirect → IdP login → assertion → redirected back → logged in. User created from SAML attributes. |
| 6.16 | **LDAP login** | Configure LDAP server in Settings → Login page → enter AD credentials | LDAP bind succeeds → JWT issued → logged in. User created from LDAP attributes (name, email, groups). |
| 6.17 | **Auth provider configuration** | Admin → Settings → Authentication → enable GitHub + disable Google | Login page shows only enabled providers. Disabled provider button not visible. |
| 6.18 | **Team assignment** | Admin → User Management → assign user to "Backend Team" (created in Phase 5) | User appears in team member list. User sees only apps owned by their team(s). |

**Pass criteria:** All 18 tests pass. Authentication is enforced on every page, roles restrict actions correctly, user identity is tracked on all deployments, and enterprise SSO (SAML/LDAP) works alongside OAuth.

---

## Phase 7 — Secret Management

**Goal:** Securely store, inject, and manage application secrets (DB passwords, API keys, tokens) per environment — with both a built-in encrypted vault and external vault provider options.

**Duration:** 13–15 days

**Depends on:** Phase 4 (database), Phase 5 (app/env registry), Phase 6 (auth — who can see/edit secrets)

### Architecture: Provider-Based Secret Management

Users choose their secret provider in Settings. The same injection pipeline works regardless of where secrets are stored:

```
Settings → Secret Provider Selection
                    │
    ┌───────────┬───┼───────────┬──────────────┐
    ▼           ▼   ▼           ▼              ▼
 WizardCD    AWS    HashiCorp   Azure        GCP
 Vault       SM     Vault       Key Vault    Secret Mgr
 (default)
    │           │   │           │              │
    └───────────┴───┼───────────┴──────────────┘
                    ▼
          SecretProvider interface
          getSecret(app, env, key) → plaintext
                    │
                    ▼
          Same injection pipeline
          Same audit logging
          Same log masking
          Same UI for mapping secrets to apps
```

### What We Build

#### 7.1 SecretProvider Interface (Day 1 — Built From the Start)

```java
public interface SecretProvider {
    /** Retrieve a single secret value (decrypted/plaintext). */
    String getSecret(String appName, String envName, String secretKey);

    /** List all secret keys for an app+env (keys only, never values). */
    List<String> listSecretKeys(String appName, String envName);

    /** Store a secret (built-in only — external vaults manage their own). */
    void putSecret(String appName, String envName, String secretKey, String value);

    /** Delete a secret. */
    void deleteSecret(String appName, String envName, String secretKey);

    /** Check if this provider supports write operations from WizardCD UI. */
    boolean isWritable();  // true for built-in, false for external vaults

    /** Test connectivity to the secret backend. */
    ProviderHealthStatus healthCheck();
}
```

**Why build the interface first:** If we hardcode the built-in vault and bolt on external providers later, we'd have to refactor every service that touches secrets. By coding to the interface from day one, swapping providers is just a config change — zero code changes.

#### 7.2 Built-in Provider: WizardCD Vault (DatabaseSecretProvider)

The default provider — WizardCD stores, encrypts, and manages secrets in its own PostgreSQL database.

```sql
-- Secrets — encrypted at rest, scoped to app + env
CREATE TABLE secrets (
    id              UUID PRIMARY KEY,
    app_id          UUID NOT NULL REFERENCES applications(id),
    env_name        VARCHAR(20) NOT NULL,          -- DEV, SIT, UAT, PROD (or * for all envs)
    secret_key      VARCHAR(255) NOT NULL,          -- e.g. DB_PASSWORD, API_KEY
    encrypted_value BYTEA NOT NULL,                 -- AES-256-GCM ciphertext
    encrypted_dek   BYTEA NOT NULL,                 -- DEK encrypted by MEK
    iv              BYTEA NOT NULL,                 -- Initialization vector (unique per encryption)
    injection_method VARCHAR(30) NOT NULL DEFAULT 'ENV_VAR',  -- ENV_VAR, SYS_PROP, CONFIG_TEMPLATE, FILE_DROP
    target_path     VARCHAR(500),                   -- for FILE_DROP: path on target VM
    description     TEXT,
    version         INTEGER NOT NULL DEFAULT 1,
    created_by      UUID REFERENCES users(id),
    updated_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(app_id, env_name, secret_key)
);

-- Data Encryption Keys — one per app (encrypted by MEK)
CREATE TABLE encryption_keys (
    id              UUID PRIMARY KEY,
    app_id          UUID NOT NULL REFERENCES applications(id),
    encrypted_dek   BYTEA NOT NULL,     -- DEK encrypted by master key
    algorithm       VARCHAR(30) NOT NULL DEFAULT 'AES-256-GCM',
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    rotated_at      TIMESTAMP,
    UNIQUE(app_id)
);

-- Secret access log — audit every read/write/inject
CREATE TABLE secret_audit_log (
    id              BIGSERIAL PRIMARY KEY,
    secret_id       UUID REFERENCES secrets(id),
    secret_key      VARCHAR(255),        -- denormalized for deleted secrets
    app_name        VARCHAR(100),
    env_name        VARCHAR(20),
    action          VARCHAR(20) NOT NULL,  -- CREATE, UPDATE, DELETE, INJECT, ROTATE, BULK_IMPORT
    performed_by    UUID REFERENCES users(id),
    deployment_id   UUID,                 -- if accessed during a deployment
    provider_type   VARCHAR(30),          -- 'built_in', 'aws', 'vault', 'azure'
    ip_address      VARCHAR(45),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 7.3 Envelope Encryption Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  MASTER ENCRYPTION KEY (MEK)                                 │
│                                                               │
│  Source: /etc/wizardcd/master.key (root:root 600)            │
│  Format: 256-bit hex (64 characters)                         │
│  Generated: openssl rand -hex 32                             │
│  NEVER stored in database. NEVER logged. NEVER in any API.  │
│  NEVER an environment variable. NEVER in /proc/<pid>/environ │
│                                                               │
│  Read by Spring Boot at startup via file path config:        │
│    wizardcd.encryption.master-key-file=/etc/wizardcd/master.key │
│  Lives ONLY in EncryptionService.masterKey (Java field)      │
└──────────────────────┬───────────────────────────────────────┘
                       │ encrypts
┌──────────────────────▼───────────────────────────────────────┐
│  DATA ENCRYPTION KEY (DEK) — one per application             │
│                                                               │
│  Generated: SecureRandom 256-bit AES key                     │
│  Stored in DB: encrypted by MEK (encrypted_dek column)       │
│  Decrypted in memory only when needed → used → discarded     │
└──────────────────────┬───────────────────────────────────────┘
                       │ encrypts
┌──────────────────────▼───────────────────────────────────────┐
│  SECRET VALUES                                                │
│                                                               │
│  Stored in DB: AES-256-GCM ciphertext + unique IV per secret │
│  Decrypted ONLY at deploy time, in JVM memory                │
│  Injected into Tanuki conf / JVM args / file on target VM    │
│  NEVER returned by any API endpoint (no-reveal policy)       │
└──────────────────────────────────────────────────────────────┘
```

Java implementation: `javax.crypto.Cipher` with `AES/GCM/NoPadding` (128-bit auth tag)

#### 7.4 Master Key Hardening — Separated Files

**Critical principle:** The master encryption key and database credentials are stored in **separate files in separate locations**. Compromising one file does NOT grant access to secrets.

**On the Runner VM (production):**
```bash
# ── File 1: Master encryption key (MOST SENSITIVE) ──────────────
# This key decrypts all secrets. Stored alone. Read via file path, NOT env var.
sudo mkdir -p /etc/wizardcd
openssl rand -hex 32 | sudo tee /etc/wizardcd/master.key > /dev/null
sudo chmod 600 /etc/wizardcd/master.key
sudo chown root:root /etc/wizardcd/master.key

# ── File 2: Database credentials (SENSITIVE) ────────────────────
# Separate from master key. systemd loads as env var.
sudo tee /etc/wizardcd/db.env > /dev/null <<EOF
WIZARDCD_DB_PASSWORD=<postgres-password>
WIZARDCD_DB_URL=jdbc:postgresql://localhost:5432/wizardcd
EOF
sudo chmod 600 /etc/wizardcd/db.env
sudo chown root:root /etc/wizardcd/db.env

# ── File 3: Non-sensitive app config ────────────────────────────
# Safe to be group-readable. No secrets here.
sudo tee /opt/wizardcd/app.env > /dev/null <<EOF
WIZARDCD_DB_USER=wizardcd
SPRING_PROFILES_ACTIVE=production
EOF
sudo chmod 640 /opt/wizardcd/app.env
sudo chown root:wizardcd /opt/wizardcd/app.env

# ── systemd service configuration ───────────────────────────────
# File: /etc/systemd/system/wizardcd-runner.service
[Service]
User=wizard
EnvironmentFile=/etc/wizardcd/db.env       # DB creds as env var (acceptable)
EnvironmentFile=/opt/wizardcd/app.env      # Non-sensitive config
# NOTE: master.key is NOT loaded via EnvironmentFile
# Spring Boot reads it directly from file via:
#   wizardcd.encryption.master-key-file=/etc/wizardcd/master.key
```

**How Spring Boot reads the master key (NOT via env var):**
```java
@Component
public class EncryptionService {
    private final byte[] masterKey;

    public EncryptionService(
        @Value("${wizardcd.encryption.master-key-file}") String keyFile
    ) {
        // Read key from file — NOT from environment variable
        this.masterKey = hexDecode(Files.readString(Path.of(keyFile)).trim());
        // Key now lives ONLY in JVM heap memory:
        // - NOT in /proc/<pid>/environ (never was an env var)
        // - NOT in any log framework
        // - NOT in crash dumps (not a system property)
    }
}
```

**Why separate files matter:**

| Attack Scenario | Single file (BAD) | Separated files (OUR APPROACH) |
|----------------|-------------------|-------------------------------|
| Attacker reads master.key only | Has MEK + DB password = game over | Has MEK only — useless without DB access |
| Attacker reads db.env only | Has MEK + DB password = game over | Has DB access but data is encrypted — useless without MEK |
| Attacker reads app.env only | Has MEK + DB password = game over | Has DB username + profile — no secrets exposed |
| DB backup leaked | Exposes everything | Exposes ciphertext only — useless without MEK |
| Log accidentally prints env vars | Could expose MEK | MEK is NOT an env var — can never leak via logs |

**Security layers protecting the master key:**

| Layer | What it does | Attacker must... |
|-------|-------------|-----------------|
| Separate file (root:root 600) | MEK isolated from DB creds | Compromise TWO files to decrypt secrets |
| File-read (not env var) | MEK never in `/proc/<pid>/environ` | Attach debugger or dump JVM heap |
| systemd user separation | `wizard` user runs JVM but can't read root-owned files | Have root access |
| EBS encryption (AWS) | Disk-level encryption at rest | Steal physical disk AND have AWS KMS access |
| Fail2ban + key-only SSH | Brute force protection, no password auth | Have the correct SSH private key |
| PostgreSQL localhost-only | DB listens on `127.0.0.1`, not `0.0.0.0` | Be on the VM to connect to the database |

**Master key rotation (documented process):**
```bash
# 1. Generate new master key
NEW_KEY=$(openssl rand -hex 32)

# 2. Call admin rotation endpoint (re-encrypts all DEKs with new MEK)
curl -X POST http://localhost:8081/admin/rotate-master-key \
  -H "Authorization: Bearer <admin-jwt>" \
  -d "{\"newKey\": \"$NEW_KEY\"}"
# This: decrypts every DEK with old MEK → re-encrypts with new MEK → updates DB

# 3. Update ONLY the master key file (DB creds are in a separate file)
echo "$NEW_KEY" | sudo tee /etc/wizardcd/master.key > /dev/null

# 4. Restart service (picks up new key from file)
sudo systemctl restart wizardcd-runner

# 5. Verify
curl -s http://localhost:8081/actuator/health | jq .
```

**Risk matrix — honest assessment:**

| Attack Scenario | Secrets Exposed? | Why |
|----------------|-----------------|-----|
| Database stolen (backup, SQL injection) | ❌ No | Ciphertext without MEK is useless |
| Master key file stolen alone | ❌ No | MEK without DB access is useless |
| db.env stolen alone | ❌ No | DB has only ciphertext — useless without MEK |
| master.key + db.env both compromised | ✅ Yes | Attacker has DB access + decryption key |
| Full VM root access | ✅ Yes | Can read all files — this is the fundamental risk of any single-VM setup |
| Non-root VM access (wizard user) | ❌ No | Can't read `/etc/wizardcd/master.key` or `/etc/wizardcd/db.env` (root:root 600) |
| JVM env var leak (log, /proc) | ❌ No | MEK is NOT an env var — read from file into Java field only |

**How this compares to industry:**

| Platform | DB-only breach safe? | VM-compromised safe? | Notes |
|----------|---------------------|---------------------|-------|
| **WizardCD (Phase 7)** | ✅ Yes | ❌ No | Same as Octopus Deploy, better than Jenkins |
| **GitHub Actions** | ✅ Yes | N/A (SaaS) | Secrets in libsodium sealed boxes |
| **Octopus Deploy** | ✅ Yes | ❌ No | AES-256 + master key on disk — same trade-off |
| **Jenkins** | ⚠️ Weak | ❌ No | AES-128, key in `$JENKINS_HOME` (jenkins-readable) |
| **Kubernetes Secrets** | ❌ No (base64) | ❌ No | Not encrypted by default — worse than WizardCD |
| **HashiCorp Vault** | ✅ Yes | ✅ Yes (with HSM) | Gold standard — Shamir's Secret Sharing + HSM |
| **AWS Secrets Manager** | ✅ Yes | ✅ Yes | KMS-backed, hardware HSMs |

> **Bottom line:** WizardCD's built-in vault is on par with Octopus Deploy and significantly better than Jenkins and Kubernetes. For users who need HSM-grade security, the external provider option (AWS KMS, HashiCorp Vault) closes the gap.

#### 7.5 External Providers (Built Alongside Built-in)

##### 7.5.1 AWS Secrets Manager Provider

```java
public class AwsSecretsManagerProvider implements SecretProvider {
    // Secret naming convention: wizardcd/<appName>/<envName>/<secretKey>
    // Auth: IAM role attached to runner VM EC2 instance
    // No credentials in WizardCD — uses instance metadata

    String getSecret(String app, String env, String key) {
        // AWS SDK: secretsManager.getSecretValue("wizardcd/my-app/uat/DB_PASSWORD")
        // Returns plaintext from AWS KMS-encrypted storage
    }

    boolean isWritable() { return false; }
    // Users create/manage secrets in AWS Console — WizardCD only reads at deploy time
}
```

**Setup in WizardCD Settings:**
- Select "AWS Secrets Manager" as provider
- Configure: AWS region, secret name prefix (default: `wizardcd/`)
- Connection test: attempts to list secrets with prefix → shows count
- Requires: EC2 IAM role with `secretsmanager:GetSecretValue` + `secretsmanager:ListSecrets`

##### 7.5.2 HashiCorp Vault Provider

```java
public class VaultSecretProvider implements SecretProvider {
    // Secret path convention: secret/data/wizardcd/<appName>/<envName>
    // Auth: Vault token or AppRole

    String getSecret(String app, String env, String key) {
        // HTTP: GET https://vault.company.com/v1/secret/data/wizardcd/my-app/uat
        // Extracts key from response JSON: data.data.<key>
    }

    boolean isWritable() { return false; }
    // Users create/manage secrets in Vault UI/CLI — WizardCD only reads
}
```

**Setup in WizardCD Settings:**
- Select "HashiCorp Vault" as provider
- Configure: Vault server URL, auth method (Token / AppRole), secret engine path
- Connection test: attempts vault health check + list accessible secrets
- Requires: Vault policy allowing read on `secret/data/wizardcd/*`

##### 7.5.3 Azure Key Vault Provider

```java
public class AzureKeyVaultProvider implements SecretProvider {
    // Secret naming: wizardcd-<appName>-<envName>-<secretKey>
    // Auth: Azure AD client credentials (tenant ID + client ID + client secret)

    String getSecret(String app, String env, String key) {
        // Azure SDK: secretClient.getSecret("wizardcd-my-app-uat-DB-PASSWORD")
    }

    boolean isWritable() { return false; }
}
```

**Setup in WizardCD Settings:**
- Select "Azure Key Vault" as provider
- Configure: Vault URL, Tenant ID, Client ID, Client Secret
- Connection test: attempts to list secrets → shows count

##### 7.5.4 GCP Secret Manager Provider

```java
public class GcpSecretManagerProvider implements SecretProvider {
    // Secret naming: wizardcd-<appName>-<envName>-<secretKey>
    // Auth: GCP Service Account (JSON key file or Workload Identity)

    String getSecret(String app, String env, String key) {
        // GCP SDK: secretManagerClient.accessSecretVersion(
        //   "projects/<project>/secrets/wizardcd-my-app-uat-DB-PASSWORD/versions/latest"
        // )
    }

    boolean isWritable() { return false; }
}
```

**Setup in WizardCD Settings:**
- Select "GCP Secret Manager" as provider
- Configure: GCP Project ID, Service Account key file path (or rely on instance metadata for GCE VMs)
- Connection test: attempts to list secrets with `wizardcd-` prefix → shows count
- Requires: IAM role `roles/secretmanager.secretAccessor` on the service account

##### 7.5.5 Provider Comparison (Shown in Settings UI)

```
┌─────────────────────────────────────────────────────────────────────┐
│  SECRET PROVIDER                                                     │
│                                                                       │
│  ● WizardCD Vault (built-in)                              DEFAULT   │
│    AES-256-GCM encrypted, stored in WizardCD database                │
│    ✅ Create/edit secrets in WizardCD UI                              │
│    ✅ Zero external dependencies                                      │
│    ✅ Works out of the box                                            │
│    ⚠️ Master key on runner VM disk (root-only, separate file)       │
│                                                                       │
│  ○ AWS Secrets Manager                              ⭐ RECOMMENDED   │
│    Secrets stored in AWS, encrypted by KMS (hardware HSMs)           │
│    ✅ HSM-grade encryption (master key never on disk)                │
│    ✅ Automatic rotation support                                      │
│    ✅ CloudTrail audit logging included                               │
│    ⚠️ Manage secrets in AWS Console (read-only from WizardCD)       │
│    ⚠️ Requires IAM role on EC2 instance                             │
│    💰 ~$0.40/secret/month + API call costs                          │
│    📌 Best choice if your runner is on AWS EC2 (like ours)          │
│                                                                       │
│  ○ HashiCorp Vault                                                   │
│    Secrets stored in Vault server, optional HSM backing              │
│    ✅ Dynamic secrets, lease-based TTLs                              │
│    ✅ Industry gold standard for enterprises                         │
│    ⚠️ Manage secrets in Vault UI/CLI (read-only from WizardCD)     │
│    ⚠️ Requires running Vault server + auth config                   │
│                                                                       │
│  ○ Azure Key Vault                                                   │
│    Secrets stored in Azure, FIPS 140-2 Level 2 HSMs                  │
│    ✅ HSM-grade encryption                                           │
│    ✅ Azure AD integration                                           │
│    ⚠️ Manage secrets in Azure Portal (read-only from WizardCD)     │
│    ⚠️ Requires Azure AD app registration                            │
│                                                                       │
│  ○ GCP Secret Manager                                                │
│    Secrets stored in Google Cloud, encrypted by Google-managed keys   │
│    ✅ Google Cloud IAM integration                                   │
│    ✅ Automatic replication across regions                            │
│    ⚠️ Manage secrets in GCP Console (read-only from WizardCD)      │
│    ⚠️ Requires GCP Service Account                                  │
│    💰 ~$0.06/10k access operations                                  │
│                                                                       │
│  [Test Connection]  [Save]                                           │
└─────────────────────────────────────────────────────────────────────┘
```

> **Key UX distinction:** When using built-in vault, users create/edit secrets in WizardCD UI. When using external providers, users manage secrets in the external tool — WizardCD UI shows secret keys (read-only) and maps them to injection methods.

#### 7.6 Security Hardening (All Providers)

**No-reveal policy (GitHub / Octopus model):**
- Once a secret is saved, its value is **never returned** by the API — not even to ADMIN
- UI shows: key name, env, method, last-updated, version — but value field shows `••••••••`
- To "see" a value, you must replace it (set a new one)
- This applies to built-in vault only — external vaults manage their own reveal policies

**Log redaction (GitHub / Azure model):**
- deploy.sh + application-deployment.sh actively scan output for known secret values
- Any match replaced with `[REDACTED]` before writing to deploy.log
- Runner-service-ms does a second pass on log lines before streaming to UI
- Redaction uses exact-match against the decrypted values loaded for that deployment
- Works identically regardless of which provider supplied the secret

**Secrets on target VM — known limitation (all providers):**
- Tanuki conf (`set.ENV_VAR=value`) and file drops contain plaintext on disk
- Mitigation: file permissions set to `600`, owned by `run_as_user` only
- This is the same trade-off Octopus Deploy and AWS CodeDeploy make for VM-based targets
- The provider choice doesn't change this — the secret must reach the target VM eventually

**Rotation reminders (built-in vault):**
- Track `updated_at` per secret
- Dashboard warning when secrets unchanged for >90 days (configurable)
- Not auto-rotation (requires app-specific logic) — but visible nudge to update stale credentials
- External providers: rotation managed by the external tool (AWS auto-rotation, Vault dynamic secrets)

#### 7.7 Secret Injection Methods (All Providers)

Secrets are injected at deployment time. The user configures HOW each secret is delivered:

| Method | How It Works | Use Case |
|--------|-------------|----------|
| **Environment Variable** | Injected into Tanuki wrapper conf as `set.ENV_VAR=value` | Spring Boot `${DB_PASSWORD}` |
| **System Property** | Added as `-Dkey=value` in JVM opts | `@Value("${db.password}")` |
| **Config File Template** | Render `application-{env}.yml` from template with secret placeholders | Full config file injection |
| **File Drop** | Write secret to a file on target (e.g. `/etc/app/secrets/db-password`) | File-based secret loading |

#### 7.8 Deployment Flow with Secrets

```
1. User configures secret KEY NAMES + injection methods in WizardCD UI (per app + env)
2. During deploy, runner-service-ms:
   a. Calls secretProvider.getSecret(app, env, key) for each configured secret
      - Built-in: decrypts from PostgreSQL using MEK → DEK → plaintext
      - AWS: calls AWS SDK → KMS decrypts → plaintext returned
      - Vault: calls Vault HTTP API → token-authenticated → plaintext returned
      - Azure: calls Azure SDK → Key Vault returns plaintext
   b. Based on injection method:
      - ENV_VAR → adds wrapper.java.additional entries to Tanuki conf
      - SYS_PROP → adds to JVM extra opts
      - CONFIG_TEMPLATE → renders template, SCPs result to target
      - FILE_DROP → creates temp file, SCPs to target path, sets permissions 600
   c. Secrets never logged (masked as ******* in deploy.log)
   d. Secret audit log entry created for each INJECT action (regardless of provider)
3. On target VM: secrets exist only in process memory or restricted files
```

#### 7.9 Secret API

```
POST   /api/applications/:id/secrets                  — Create secret (built-in only; value encrypted, never returned)
GET    /api/applications/:id/secrets                  — List secrets (keys + metadata only, NEVER values)
GET    /api/applications/:id/secrets/:secretId        — Get secret metadata (key, env, method, version — NO value)
PUT    /api/applications/:id/secrets/:secretId        — Replace secret value (built-in) or update injection config (external)
DELETE /api/applications/:id/secrets/:secretId        — Soft-delete secret
POST   /api/applications/:id/secrets/validate         — Dry-run: check all secrets resolve for a given env
POST   /api/applications/:id/secrets/sync             — Sync keys from external provider (list available keys)

GET    /api/settings/secret-provider                  — Current provider config
PUT    /api/settings/secret-provider                  — Change provider (ADMIN only)
POST   /api/settings/secret-provider/test             — Test connection to selected provider
POST   /admin/rotate-master-key                       — Re-encrypt all DEKs with new MEK (built-in only, ADMIN)

# NOTE: No /reveal endpoint exists. Values are write-only.
# Decryption only happens server-side during deployment injection.
```

#### 7.10 UI — Secret Management

**Secrets tab on Application Detail page:**
- Secret list: key name, injection method, env scope, last updated, version — value always shows `••••••••`
- **Built-in vault mode:**
  - Create modal: key, value (password field — cleared after save), injection method, env scope, description
  - Update modal: enter new value only (old value never shown — write-only, like GitHub)
  - Bulk import: paste `.env` file format (`KEY=VALUE` per line) — values encrypted immediately
- **External vault mode:**
  - "Sync from Vault" button → lists available secret keys from external provider
  - User maps keys to injection methods (how to deliver, not what the value is)
  - No value field shown — managed externally
- **Rotation warning**: amber badge on secrets unchanged for >90 days (built-in only)
- **Secret references in deploy wizard**: Step 3 shows "N secrets will be injected" info
- **Review step**: lists secret keys (not values) that will be injected

**Provider Settings page (ADMIN only):**
- Provider picker (visual cards with comparison info)
- Provider-specific config fields (AWS region, Vault URL, Azure tenant, etc.)
- Connection test button → shows success/failure with details
- Migration warning when switching providers: "Switching from Built-in to AWS. Ensure all secrets exist in AWS before switching."

### Build Order Within Phase 7

| Sub-phase | What | Days |
|-----------|------|------|
| 7.1 | `SecretProvider` interface + `DatabaseSecretProvider` (built-in vault) | 2 |
| 7.2 | Encryption service (AES-256-GCM, envelope encryption, MEK hardening) | 1 |
| 7.3 | Secret CRUD API + database tables + Flyway migrations | 1 |
| 7.4 | Secret management UI (create, update, delete, bulk import, per-env scoping) | 2 |
| 7.5 | Injection pipeline (env var, JVM arg, file drop, config template, log masking) | 2 |
| 7.6 | Audit logging + rotation reminders | 1 |
| 7.7 | `AwsSecretsManagerProvider` implementation + AWS config UI | 1–2 |
| 7.8 | `VaultSecretProvider` (HashiCorp) implementation + Vault config UI | 1–2 |
| 7.9 | `AzureKeyVaultProvider` implementation + Azure config UI | 1 |
| 7.10 | `GcpSecretManagerProvider` implementation + GCP config UI | 1 |
| 7.11 | Provider selection Settings page + connection tests + migration warnings | 1 |

### What It Unlocks
- No more hardcoded passwords in application configs
- Per-environment secret isolation (SIT and PROD use different DB creds)
- Audit trail for every secret access (regardless of provider)
- Secure secret injection during deployment (4 methods)
- Users choose their trust level: built-in for simplicity, external for HSM-grade security
- Enterprise users can use their existing Vault/AWS/Azure/GCP infrastructure
- 5 providers shipped: Built-in, AWS Secrets Manager, HashiCorp Vault, Azure Key Vault, GCP Secret Manager
- Foundation ready from day one — no retrofitting when adding providers

### UI Acceptance Tests — Phase 7

> Test secret creation, viewing, injection during deployment, provider selection, and access controls.

#### Built-in Vault Tests

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 7.1 | **Create a secret** | App detail → Secrets tab → "Add Secret" → key: `DB_PASSWORD`, value: `mypass123`, env: UAT, method: Environment Variable → Save | Secret created. List shows key name, env scope, injection method, and "just now" timestamp. Value shows `••••••••` — **never visible again after save**. |
| 7.2 | **Create secrets for multiple envs** | Add `DB_PASSWORD` for DEV (value: `dev-pass`), SIT (value: `sit-pass`), UAT (value: `uat-pass`), PROD (value: `prod-pass`) | Four separate entries in secret list. Each scoped to its environment. No values shown. |
| 7.3 | **Value is never retrievable** | After saving a secret, try every UI path to see the value | No reveal button exists. API `GET /secrets/:id` returns metadata only (key, env, method, version — no value). This matches GitHub/Octopus model. |
| 7.4 | **Update a secret (replace value)** | Click "Update" on existing secret → enter new value → Save | Secret version incremented (v1 → v2). Updated timestamp shown. To "see" a value, you must set it again. |
| 7.5 | **DEPLOYER cannot manage PROD secrets** | Log in as DEPLOYER → navigate to app secrets → try to create/edit PROD secret | Create/edit buttons hidden for PROD env. API returns 403 if URL-hacked. Only RELEASE_MANAGER/ADMIN can manage PROD secrets. |
| 7.6 | **Deploy with secrets (env var method)** | Create secret `DB_PASSWORD` (env var) for UAT → Deploy app to UAT | Deploy succeeds. On target VM, check Tanuki conf: `set.DB_PASSWORD=mypass123` present. Deploy logs show `DB_PASSWORD=*******` (masked). |
| 7.7 | **Deploy with secrets (system property)** | Create secret `db.password` (system property) → Deploy | Tanuki conf includes `-Ddb.password=mypass123` in JVM args. Value masked in logs. |
| 7.8 | **Deploy with secrets (file drop)** | Create secret with method: File Drop, path: `/app/secrets/db-pass` → Deploy | File exists on target at specified path with correct value. File permissions restricted (600). |
| 7.9 | **Secrets shown in review step** | Fill wizard → reach Step 4 Review | Review panel shows: "3 secrets will be injected" with key names listed (no values). |
| 7.10 | **Bulk import secrets** | Secrets tab → "Import" → paste `.env` content: `API_KEY=abc123\nDB_URL=jdbc:...` | Two secrets created. Keys and injection methods pre-filled. User confirms before save. |
| 7.11 | **Validate secrets before deploy** | App has secrets configured for UAT but not SIT → try deploy to SIT | Warning: "2 secrets configured for UAT are missing for SIT." Deploy allowed but user is warned. |
| 7.12 | **Secret audit trail** | Create and inject secrets → check audit log | All actions logged: CREATE by user X, INJECT during deployment Z. Timestamps, IPs, and provider type recorded. |
| 7.13 | **Delete a secret** | Delete a secret → confirm | Secret soft-deleted. No longer appears in list. Not injected on future deploys. Audit log records DELETE. |
| 7.14 | **Master key rotation** | SSH to runner VM → generate new key → call `/admin/rotate-master-key` → update key file → restart | All secrets still decrypt correctly with new key. Audit log shows ROTATE event. |
| 7.15 | **Runner restart — secrets persist** | `sudo systemctl restart wizardcd-runner` → deploy an app with secrets | Secrets still inject correctly after restart. Database encryption intact. |

#### External Provider Tests

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 7.16 | **Select AWS Secrets Manager** | Settings → Secret Provider → select AWS → enter region → Test Connection | Connection test passes (if IAM role configured). Shows number of available secrets with `wizardcd/` prefix. |
| 7.17 | **Sync keys from AWS** | App Secrets tab → "Sync from AWS" | Lists available secret keys from AWS. User maps each to injection method. No values shown in WizardCD. |
| 7.18 | **Deploy with AWS secrets** | Configure secret mappings → Deploy | WizardCD fetches values from AWS at deploy time → injects into Tanuki conf. Logs show `[REDACTED]`. Audit log records INJECT with provider: `aws`. |
| 7.19 | **Select HashiCorp Vault** | Settings → Secret Provider → select Vault → enter URL + token → Test Connection | Connection test passes. Shows vault health status and accessible secret paths. |
| 7.20 | **Deploy with Vault secrets** | Configure secret mappings → Deploy | WizardCD fetches from Vault at deploy time → injects correctly. Audit log records provider: `vault`. |
| 7.21 | **Select Azure Key Vault** | Settings → Secret Provider → select Azure → enter vault URL + credentials → Test Connection | Connection test passes. Shows available secrets count. |
| 7.22 | **Select GCP Secret Manager** | Settings → Secret Provider → select GCP → enter project ID + service account path → Test Connection | Connection test passes. Shows available secrets with `wizardcd-` prefix. |
| 7.23 | **Deploy with GCP secrets** | Configure GCP secret mappings → Deploy | WizardCD fetches values from GCP at deploy time → injects correctly. Audit log records provider: `gcp`. |
| 7.24 | **Provider switch warning** | Switch from Built-in to AWS | Warning modal: "Ensure all secrets exist in AWS before switching. Built-in secrets will not be accessible while AWS is active." User confirms → provider switched. |
| 7.25 | **External provider down — deploy fails gracefully** | Configure AWS provider → simulate AWS unreachable → Deploy | Deploy fails with clear error: "Cannot retrieve secrets: AWS Secrets Manager unreachable." No partial deployment. No secrets left in temp files. |
| 7.26 | **Create button hidden for external providers** | Switch to AWS provider → open Secrets tab | "Add Secret" button hidden. "Sync from AWS" button shown instead. Hint: "Manage secret values in AWS Console." |

**Pass criteria:** All 26 tests pass. Built-in vault encrypts and injects correctly. All 4 external providers fetch and inject correctly. Log masking works for all providers. Audit trail captures all access regardless of provider. Provider switching works with clear warnings.

---

## Phase 8 — Deployment Strategies

**Goal:** Zero-downtime deployment options. Move beyond in-place stop-start.

**Duration:** 8–10 days

**Depends on:** Phase 4 (database), Phase 5 (multi-host env config), Phase 7 (secrets for LB configs)

### What We Build

#### 8.1 Strategy Model

```sql
-- Target hosts — multiple hosts per environment (for blue-green, canary, rolling)
CREATE TABLE target_hosts (
    id              UUID PRIMARY KEY,
    env_config_id   UUID NOT NULL REFERENCES environment_configs(id),
    host            VARCHAR(255) NOT NULL,
    ssh_port        INTEGER DEFAULT 22,
    role            VARCHAR(30) DEFAULT 'primary',  -- primary, blue, green, canary, pool
    is_active       BOOLEAN DEFAULT TRUE,           -- for blue-green: which set is live
    health_endpoint VARCHAR(255),                    -- e.g. /actuator/health
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Load balancer config — per environment
CREATE TABLE load_balancers (
    id              UUID PRIMARY KEY,
    env_config_id   UUID NOT NULL REFERENCES environment_configs(id),
    lb_type         VARCHAR(30) NOT NULL,  -- nginx, haproxy, alb
    lb_host         VARCHAR(255),          -- SSH host where Nginx/HAProxy runs
    lb_ssh_user     VARCHAR(100),
    lb_ssh_port     INTEGER DEFAULT 22,
    config_path     VARCHAR(500),          -- e.g. /etc/nginx/conf.d/app-upstream.conf
    reload_command  VARCHAR(500),          -- e.g. "sudo nginx -s reload"
    health_check_url VARCHAR(500),         -- e.g. http://lb-host/health
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

#### 8.2 Strategy Implementations

**In-Place (default — current behavior):**
```
Single VM. Stop → Deploy → Start → Health check.
Downtime: yes (duration = stop + deploy + start + stability window).
Rollback: restore from backup.
```

**Blue-Green:**
```
Two VM sets (blue + green). Only one is live at a time.

1. Identify inactive set (check DB: is_active=false)
2. Deploy to ALL hosts in inactive set (parallel SSH)
3. Health check each host in inactive set
4. If all healthy:
   a. SSH to load balancer
   b. Update upstream config: swap blue ↔ green
   c. Reload LB (nginx -s reload)
   d. Mark new set as active in DB
5. If unhealthy: fail — active set untouched, zero impact

Rollback: swap LB config back (instant, <1s).
```

**Canary:**
```
Deploy to canary host(s), gradually shift traffic.

1. Deploy to canary hosts only
2. Health check canary
3. If healthy: adjust LB weights (canary: 10%, stable: 90%)
4. Monitoring phase (configurable 5–30 min):
   - Poll canary health endpoint every 10s
   - Check HTTP status, response time, error rate
5. If monitoring passes:
   - Increase weight: 25% → 50% → 100%
   - Deploy to remaining hosts
   - Reset LB weights to equal
6. If monitoring fails:
   - Route 100% back to stable
   - Stop canary host
   - Mark deployment FAILED

Rollback: automatic on health failure.
```

**Rolling:**
```
N hosts behind load balancer. Deploy one at a time.

For each host in pool (sequential):
  1. Remove from LB pool (drain connections, configurable 30s)
  2. Deploy (stop → replace → start → health check)
  3. If healthy: re-add to LB pool
  4. If unhealthy: stop, rollback this host, abort remaining
  5. Move to next host

Rollback: re-deploy previous version to updated hosts.
```

#### 8.3 New Runner Scripts

```bash
runner/
├── strategies/
│   ├── in-place.sh           # Current deploy.sh logic (extracted)
│   ├── blue-green.sh         # Orchestrates blue-green swap
│   ├── canary.sh             # Canary deployment + monitoring
│   ├── rolling.sh            # Rolling deployment across pool
│   ├── lb-swap.sh            # Nginx/HAProxy upstream management
│   ├── health-check.sh       # HTTP health endpoint checking
│   └── drain-connections.sh  # Graceful connection draining
```

#### 8.4 UI — Strategy Selection

- **Environment setup**: strategy picker (visual cards with architecture diagrams)
- **Blue-Green setup**: configure blue hosts + green hosts + load balancer
- **Canary setup**: configure canary hosts + stable hosts + monitoring duration + weight schedule
- **Deploy wizard**: strategy shown in review step, strategy-specific progress UI
- **Live deployment view**:
  - Blue-Green: shows active/standby sets, swap animation
  - Canary: traffic split percentage bar, health status, auto-promote countdown
  - Rolling: per-host progress list (Host 1 ✓, Host 2 ⟳, Host 3 ○)

### What It Unlocks
- Zero-downtime deployments
- Production-grade deployment patterns
- Multi-VM application support
- Gradual rollout with automatic rollback

### UI Acceptance Tests — Phase 8

> Test each deployment strategy end-to-end. Requires multi-VM setup for blue-green, canary, and rolling tests.

**Pre-requisite setup:** You need at least 2 target VMs (or 2 ports on same VM simulating separate instances) and an Nginx/HAProxy load balancer configured.

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 8.1 | **In-place deploy (unchanged)** | Select app with single-host env → Deploy (strategy: In-Place) | Behaves exactly as before. Stop → deploy → start → stability check. Brief downtime during deploy. |
| 8.2 | **Configure blue-green environment** | App detail → edit env → add 2 host sets (blue + green) + load balancer config | Env config shows: Blue hosts, Green hosts, LB type/host/config path. Active set highlighted. |
| 8.3 | **Blue-green deploy** | Deploy with strategy: Blue-Green | Job detail shows: "Deploying to inactive set (green)" → "Health checking green hosts" → "Swapping load balancer" → "Green is now active". Zero downtime during swap. |
| 8.4 | **Blue-green verify zero downtime** | During blue-green deploy, continuously curl the app through LB | All requests succeed (200 OK) throughout the entire deployment. No 502/503 errors. |
| 8.5 | **Blue-green instant rollback** | After blue-green deploy → click Rollback | LB swaps back to previous active set. Rollback completes in <5 seconds. App serves old version immediately. |
| 8.6 | **Configure canary environment** | App detail → edit env → mark 1 host as "canary", others as "stable" + LB config | Env config shows: canary host(s), stable host(s), monitoring duration, weight schedule. |
| 8.7 | **Canary deploy — happy path** | Deploy with strategy: Canary, monitoring: 5 min | Job detail shows: "Deploying to canary" → "Canary healthy — routing 10% traffic" → "Monitoring 1m/5m" → "Promoting to 25% → 50% → 100%" → "Deploying to remaining hosts" → SUCCESS. |
| 8.8 | **Canary deploy — auto-rollback** | Deploy a broken JAR with Canary strategy | Canary health check fails → "Canary unhealthy — rolling back" → traffic restored to 100% stable → FAILED. Stable hosts untouched. |
| 8.9 | **Canary live progress UI** | During canary deploy, watch job detail page | Traffic split bar updates: 10% → 25% → 50% → 100%. Health status shown. Monitoring countdown visible. |
| 8.10 | **Configure rolling environment** | App detail → edit env → add 3+ hosts as "pool" + LB config | Env config shows: pool hosts, drain timeout, LB config. |
| 8.11 | **Rolling deploy** | Deploy with strategy: Rolling (3 hosts) | Job detail shows per-host progress: "Host 1: deploying... ✓" → "Host 2: deploying... ✓" → "Host 3: deploying... ✓" → SUCCESS. Each host removed from LB before deploy, re-added after health check. |
| 8.12 | **Rolling deploy — partial failure** | Deploy broken JAR with Rolling strategy (3 hosts) | Host 1 deploys, health fails → "Host 1 failed — rolling back Host 1" → "Aborting remaining hosts" → FAILED. Hosts 2 and 3 untouched. |
| 8.13 | **Strategy shown in review step** | Fill wizard with blue-green app → Step 4 Review | Review panel shows: "Strategy: Blue-Green", target hosts listed, LB info shown. |
| 8.14 | **Strategy in dashboard** | After deploying with different strategies, check Dashboard | Strategy column or badge visible: "In-Place", "Blue-Green", "Canary", "Rolling". |

**Pass criteria:** All 14 tests pass. Each strategy deploys correctly, handles failures gracefully, and the UI shows real-time strategy-specific progress.

---

## Phase 9 — Environment Promotion, Pipelines & Scheduled Deployments

**Goal:** Promote the same artifact across environments with approval gates for production. Schedule deployments for maintenance windows.

**Duration:** 7–9 days

**Depends on:** Phase 5 (app registry), Phase 6 (auth + roles), Phase 7 (per-env secrets)

### What We Build

#### 9.1 Artifact Storage

```sql
CREATE TABLE artifacts (
    id          UUID PRIMARY KEY,
    app_id      UUID NOT NULL REFERENCES applications(id),
    version     VARCHAR(100),           -- e.g. 1.2.3-SNAPSHOT
    jar_name    VARCHAR(255) NOT NULL,
    jar_hash    VARCHAR(64) NOT NULL,   -- SHA-256 for integrity
    jar_size    BIGINT NOT NULL,
    storage_path VARCHAR(500) NOT NULL, -- filesystem path
    jar_type    VARCHAR(10) NOT NULL,   -- fat, thin
    lib_hash    VARCHAR(64),            -- SHA-256 of lib ZIP (thin JARs)
    lib_storage_path VARCHAR(500),
    uploaded_by UUID REFERENCES users(id),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

- JARs stored in `/opt/wizardcd/artifacts/<app>/<version>/`
- Deploy by version: "Deploy eureka-registry-ms v1.2.3 to PROD"
- Artifact retention policy (keep last N versions per app, configurable)
- Every manual upload and webhook-downloaded JAR is automatically registered as an artifact

#### 9.1.1 Artifact Source Selection (Deploy Wizard Step 2)

The deploy wizard Step 2 evolves from a single JAR upload to a **three-source artifact picker**. Manual upload remains the default — the other sources are additive options.

```
┌──────────────────────────────────────────────────────────────┐
│  ARTIFACT SOURCE                                              │
│                                                                │
│  ● Upload JAR file                              DEFAULT       │
│    Drag & drop or browse — deploy any JAR from your machine   │
│    [  Drop JAR here or click to browse  ]                     │
│                                                                │
│  ○ Select from artifact registry                              │
│    Pick a previously deployed version                          │
│    ┌──────────────────────────────────────────────────────┐   │
│    │  v1.2.3   thin JAR  ·  deployed to UAT 2h ago       │   │
│    │  v1.2.2   thin JAR  ·  deployed to PROD 3d ago  ★   │   │
│    │  v1.2.1   fat JAR   ·  deployed to SIT 1w ago       │   │
│    └──────────────────────────────────────────────────────┘   │
│    No re-upload needed — same binary, different env config     │
│                                                                │
│  ○ Download from URL                                          │
│    Fetch JAR from Nexus, GitHub Releases, S3, Artifactory     │
│    URL: [_____________________________________________]       │
│    Auth: [None ▾]  (or: Bearer token, Basic auth, AWS IAM)   │
│    [Validate URL]                                              │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

**How each source feeds the pipeline:**

| Source | How JAR arrives | When to use |
|--------|----------------|-------------|
| **Manual upload** (default) | Browser file upload → multipart POST to runner | Building locally, hotfixes, first-time deploys, no CI/CD, vendor JARs, air-gapped networks |
| **Artifact registry** | Already on runner filesystem → no transfer needed | Re-deploy, promotion (same binary across envs), rollback to known version |
| **URL download** | Runner downloads JAR via HTTP GET → stores as artifact | CI/CD webhook trigger, Nexus/Artifactory integration, GitHub Release deploys |

**For webhook-triggered deploys (Phase 10):** The webhook payload specifies the artifact source automatically — either `artifactUrl` (download from URL) or reuse latest artifact from registry. No wizard UI involved — fully automated.

**Key principle: Manual upload is NEVER removed.** It is WizardCD's core differentiator. Most platforms (ArgoCD, Spinnaker, CodeDeploy) require a CI/CD pipeline. WizardCD always offers: "Upload a JAR, click deploy."

#### 9.2 Promotion Flow

```
DEV (auto-deploy on upload — optional, fastest feedback loop)
 │
 ├── Success ──→ "Promote to SIT" button
 │                    │
 │                    ▼
SIT (same artifact, SIT env config + SIT secrets)
 │
 ├── Success ──→ "Promote to UAT" button
 │                    │
 │                    ▼
 │               UAT (same artifact, UAT env config + UAT secrets)
 │                    │
 │                    ├── Success ──→ "Promote to PROD" button
 │                    │                    │
 │                    │                    ▼
 │                    │           Approval Request created
 │                    │           Notification → RELEASE_MANAGERs
 │                    │                    │
 │                    │              ┌─────┴─────┐
 │                    │              │           │
 │                    │           Approve     Reject
 │                    │              │           │
 │                    │              ▼           ▼
 │                    │         PROD deploy   Blocked
 │                    │              │
 │                    │              ▼
 │                    │         Success/Fail
```

#### 9.3 Approval Gates

```sql
CREATE TABLE approval_requests (
    id              UUID PRIMARY KEY,
    deployment_id   UUID NOT NULL REFERENCES deployments(id),
    app_id          UUID NOT NULL REFERENCES applications(id),
    env_name        VARCHAR(20) NOT NULL,
    artifact_id     UUID REFERENCES artifacts(id),
    requested_by    UUID NOT NULL REFERENCES users(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED, EXPIRED
    decided_by      UUID REFERENCES users(id),
    decision_comment TEXT,
    requested_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    decided_at      TIMESTAMP,
    expires_at      TIMESTAMP  -- auto-expire after configurable period
);
```

#### 9.4 Pipeline Visualization UI
- Horizontal pipeline view: `DEV ──→ SIT ──→ UAT ──→ PROD`
- Each stage: version badge, deploy status, who/when, promote button
- Approval pending: amber indicator with "Approve / Reject" actions
- History: which version went through which stages and when

#### 9.5 Deployment Windows

```sql
CREATE TABLE deployment_windows (
    id              UUID PRIMARY KEY,
    app_id          UUID REFERENCES applications(id),  -- NULL = global
    env_name        VARCHAR(20),                        -- NULL = all envs
    day_of_week     VARCHAR(10),                        -- MON, TUE, ... or * for any
    start_time      TIME NOT NULL,                      -- e.g. 02:00
    end_time        TIME NOT NULL,                      -- e.g. 06:00
    timezone        VARCHAR(50) DEFAULT 'UTC',
    is_active       BOOLEAN DEFAULT TRUE
);
```

- Block deployments outside window (ADMIN can override with reason)
- UI shows: "PROD deployments allowed: Sat–Sun 02:00–06:00 UTC"

#### 9.6 Scheduled Deployments

> **"Deploy this to PROD at 2:00 AM Sunday"** — for maintenance windows, off-hours releases, and timezone-aware scheduling.

```sql
CREATE TABLE scheduled_deployments (
    id              UUID PRIMARY KEY,
    app_id          UUID NOT NULL REFERENCES applications(id),
    env_name        VARCHAR(20) NOT NULL,
    artifact_id     UUID NOT NULL REFERENCES artifacts(id),
    scheduled_by    UUID NOT NULL REFERENCES users(id),
    scheduled_at    TIMESTAMP NOT NULL,              -- when to deploy (UTC)
    timezone        VARCHAR(50) DEFAULT 'UTC',       -- display timezone
    status          VARCHAR(20) DEFAULT 'SCHEDULED', -- SCHEDULED, EXECUTING, COMPLETED, FAILED, CANCELLED
    job_id          UUID REFERENCES jobs(id),        -- populated when deploy starts
    config_snapshot JSONB NOT NULL,                   -- full DeploymentRequest frozen at schedule time
    notify_on_start BOOLEAN DEFAULT TRUE,
    notify_on_complete BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    cancelled_at    TIMESTAMP,
    cancelled_by    UUID REFERENCES users(id)
);
```

**How it works:**
1. User completes the deploy wizard normally (Steps 1–3)
2. On Step 4 (Review), instead of "Deploy Now", user clicks **"Schedule Deploy"**
3. Date/time picker with timezone selection appears
4. Config + artifact reference frozen at schedule time (no drift)
5. Background scheduler (`@Scheduled(fixedRate = 30000)`) checks for due deployments every 30s
6. When `scheduled_at <= NOW()`: creates job, executes via normal pipeline
7. Notifications sent on start + completion (Slack/Teams/email if configured)
8. Scheduled deploys respect deployment windows (if scheduled outside window → blocked with warning at schedule time)
9. Any user can cancel their own scheduled deploy; ADMIN/RELEASE_MANAGER can cancel anyone's

**UI — Schedule Deploy Panel (Step 4 — Review):**
```
┌──────────────────────────────────────────────────────┐
│  DEPLOY TIMING                                        │
│                                                        │
│  ● Deploy now                                          │
│  ○ Schedule for later                                  │
│                                                        │
│  ┌──────────────────────────────────────────────┐     │
│  │ Date: [2026-04-15]   Time: [02:00]           │     │
│  │ Timezone: [UTC ▼]                             │     │
│  │                                                │     │
│  │ ℹ That's Sun 15 Apr 2026 at 02:00 UTC         │     │
│  │   (04:00 your local time — Africa/Johannesburg)│     │
│  │                                                │     │
│  │ ☑ Notify me when deployment starts             │     │
│  │ ☑ Notify me when deployment completes          │     │
│  └──────────────────────────────────────────────┘     │
│                                                        │
│  [ Schedule Deploy → ]                                 │
└──────────────────────────────────────────────────────┘
```

**Dashboard — Scheduled Deploys:**
- New "Scheduled" tab in dashboard showing upcoming deployments
- Countdown timer: "Deploys in 3h 42m"
- Cancel button per scheduled deploy
- Clock icon badge on app cards showing scheduled deploys

### What It Unlocks
- Full CI/CD pipeline visualization
- Safe PROD deployments with approval gates
- Artifact traceability (same binary across all envs)
- Compliance-friendly deployment windows
- **Off-hours deployments** — schedule and go home; platform handles the rest
- **Timezone-aware scheduling** — teams in different timezones see their local times

### UI Acceptance Tests — Phase 9

> Test the full promotion pipeline, approval gates, artifact management, and deployment windows.

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 9.1 | **Deploy to SIT → Promote button appears** | Deploy app to SIT → wait for SUCCESS | Job detail shows green "Promote to UAT" button. Dashboard row also shows promote action. |
| 9.2 | **Promote SIT → UAT** | Click "Promote to UAT" on successful SIT job | New UAT deployment created using same JAR artifact. UAT env config + UAT secrets applied. Deploy runs and succeeds. |
| 9.3 | **Promoted deploy uses same artifact** | Check UAT job detail after promotion | Shows: "Promoted from SIT job \<id\>". JAR hash matches SIT deploy. No re-upload required. |
| 9.4 | **Promote UAT → PROD (approval required)** | Click "Promote to PROD" on successful UAT job (logged in as DEPLOYER) | Approval request created. DEPLOYER sees "Awaiting approval" status. Notification sent to RELEASE_MANAGERs. |
| 9.5 | **Approve PROD deployment** | Log in as RELEASE_MANAGER → Approvals page or notification → click "Approve" with optional comment | PROD deployment starts automatically. Job detail shows: "Approved by \<name\> — \<comment\>". Deploys to PROD successfully. |
| 9.6 | **Reject PROD deployment** | Create another PROD promotion → RELEASE_MANAGER clicks "Reject" with reason | Deployment blocked. Status: REJECTED. Reason shown. DEPLOYER notified of rejection. |
| 9.7 | **Approval expiry** | Create PROD promotion → don't approve → wait past expiry | Approval request auto-expires. Status: EXPIRED. DEPLOYER notified. Must re-request to promote. |
| 9.8 | **Pipeline visualization** | Navigate to app detail → Pipeline view | Horizontal pipeline: DEV (v1.2.3 ✓) → SIT (v1.2.3 ✓ by bishop) → UAT (v1.2.3 ✓ by bishop) → PROD (v1.2.3 pending approval). Visual flow with arrows. |
| 9.9 | **Deploy by version** | App detail → Artifacts tab → find v1.2.3 → "Deploy to UAT" | Deployment starts using stored artifact. No file upload. Version tracked in job metadata. |
| 9.10 | **Artifact retention** | Upload 10 versions → check artifacts list (retention set to 5) | Oldest 5 artifacts auto-cleaned. Latest 5 available. Warning shown before deletion if artifact was deployed to PROD. |
| 9.11 | **Deployment window — blocked** | Set PROD window: Sat–Sun 02:00–06:00 UTC → try PROD deploy on Wednesday | Deploy blocked. Error: "PROD deployments only allowed Sat–Sun 02:00–06:00 UTC. Next window in X hours." |
| 9.12 | **Deployment window — ADMIN override** | Same as above but logged in as ADMIN → click "Override window" | Prompt for reason → enter reason → deploy proceeds. Audit log records: "Window override by ADMIN: \<reason\>". |
| 9.13 | **Promotion history** | App detail → Pipeline view → click on a stage | Shows full promotion chain: DEV (job A) → SIT (job B) → UAT (job C) → PROD (job D). Times, users, and approval info for each stage. |
| 9.14 | **Artifact source — manual upload (default)** | New Deploy → Step 2 → "Upload JAR file" selected by default → drag & drop JAR → deploy | Exact same behaviour as current wizard. JAR uploaded, deployed, AND automatically registered in artifact registry for future reuse. |
| 9.15 | **Artifact source — registry selection** | New Deploy → Step 2 → select "From artifact registry" → pick v1.2.2 from list → deploy | Deployment uses stored artifact. No file upload. Job detail shows: "Artifact: v1.2.2 (from registry)". |
| 9.16 | **Artifact source — URL download** | New Deploy → Step 2 → select "Download from URL" → paste Nexus URL → Validate → deploy | Runner downloads JAR from URL. Deployment runs. JAR registered in artifact registry. Job detail shows: "Artifact: downloaded from \<url\>". |
| 9.17 | **Manual upload always available** | After configuring webhook triggers (Phase 10) → open deploy wizard manually | Upload JAR option is still the default. Webhook automation does NOT remove or hide the manual path. |
| 9.18 | **Schedule a deployment** | Complete wizard → Step 4 → select "Schedule for later" → set date/time → Schedule | Scheduled deployment created. Shows in Dashboard "Scheduled" tab with countdown timer. Confirmation toast: "Deployment scheduled for Sun 15 Apr 02:00 UTC". |
| 9.19 | **Scheduled deploy executes on time** | Schedule a deploy for 2 minutes from now → wait | Deploy auto-starts at scheduled time. Notification sent: "Scheduled deployment started". Job appears in dashboard as RUNNING. Completes normally. |
| 9.20 | **Cancel scheduled deploy** | Schedule a deploy → go to Scheduled tab → click Cancel | Status changes to CANCELLED. Deploy does not execute. Audit log records cancellation. |
| 9.21 | **Schedule outside deployment window** | Set PROD window Sat-Sun 02:00-06:00 → try scheduling for Wednesday 10:00 | Warning: "Scheduled time is outside deployment window". Deployment blocked unless ADMIN overrides. |
| 9.22 | **Scheduled deploy timezone display** | Schedule for 02:00 UTC while in Africa/Johannesburg timezone | Shows both: "02:00 UTC (04:00 your local time — Africa/Johannesburg)". Dashboard countdown uses local time. |

**Pass criteria:** All 22 tests pass. Three artifact sources work (manual upload, registry, URL download). Manual upload remains the default. Artifacts flow from DEV → SIT → UAT → PROD with approval gates, deployment windows enforce safe PROD schedules, and scheduled deployments execute at the specified time.

---

## Phase 10 — Integrations, CLI & API Documentation

**Goal:** Connect WizardCD to the tools teams already use — any Git platform, any CI/CD tool, any chat app. Plus CLI for terminal-based deployments and Swagger API docs for self-service integration.

**Duration:** 9–11 days

**Depends on:** Phase 6 (auth for webhook secrets), Phase 9 (pipeline for CI triggers)

### What We Build

#### 10.1 Inbound Webhooks — Generic + Platform-Specific

**Generic webhook (works with ANY CI/CD tool):**
```
POST /api/webhooks/deploy
  Headers: X-Webhook-Secret: <per-app secret>
  Body: {
    appName: "eureka-registry-ms",
    envName: "SIT",
    artifactUrl?: "https://nexus.company.com/repo/my-app-1.2.3.jar",   // download JAR from URL
    version?: "1.2.3",
    triggeredBy?: "GitHub Actions / Azure Pipelines / Jenkins / manual"
  }
```

Any tool that can send an HTTP POST can trigger a WizardCD deployment. This is the universal integration point.

**Platform-specific webhook receivers (parse native event formats):**

```
POST /api/webhooks/github     — GitHub push, PR merge, release events
POST /api/webhooks/azure      — Azure DevOps push, PR completion, release events
POST /api/webhooks/gitlab     — GitLab push, merge request merge events
POST /api/webhooks/bitbucket  — Bitbucket push, PR merge events
```

Each receiver parses the platform's native webhook payload and maps it to a WizardCD deploy trigger.

##### 10.1.1 GitHub Integration

```
GitHub repo → Settings → Webhooks → Add webhook
  URL: https://wizardcd.company.com/api/webhooks/github
  Secret: <from WizardCD app config>
  Events: Push, Pull Request, Release

WizardCD receives:
  push to main        → auto-deploy to DEV/SIT (configurable)
  PR merged to main   → auto-deploy to DEV/SIT
  release published   → auto-deploy to UAT (or trigger promotion)
```

**Outbound:** WizardCD posts deployment status back to GitHub:
- Commit status check: "Deployed to UAT ✓" or "Deploy to UAT ✗"
- PR comment: "Deployed to SIT by WizardCD — [View Job](link)"
- Deployment API: creates GitHub Deployment + DeploymentStatus records

##### 10.1.2 Azure DevOps Integration

```
Azure DevOps → Project Settings → Service Hooks → Web Hooks
  URL: https://wizardcd.company.com/api/webhooks/azure
  Events: Code pushed, Pull request merged, Release deployment completed

WizardCD receives:
  push to main          → auto-deploy to DEV/SIT
  PR completed (merged) → auto-deploy to DEV/SIT
  release completed     → trigger promotion to next env

Azure Pipelines trigger (alternative — call WizardCD from pipeline YAML):
  - task: InvokeRestAPI@1
    inputs:
      serviceConnection: 'WizardCD'
      method: POST
      url: 'https://wizardcd.company.com/api/webhooks/deploy'
      headers: '{"X-Webhook-Secret": "$(WIZARDCD_SECRET)"}'
      body: '{"appName":"my-app","envName":"SIT","version":"$(Build.BuildNumber)"}'
```

**Outbound:** WizardCD updates Azure DevOps:
- Post deployment status to Azure DevOps Release gate (via service hook callback)
- Update work item with deployment link

##### 10.1.3 GitLab Integration

```
GitLab → Project → Settings → Webhooks
  URL: https://wizardcd.company.com/api/webhooks/gitlab
  Secret Token: <from WizardCD app config>
  Trigger: Push events, Merge request events, Tag push events

WizardCD receives:
  push to main               → auto-deploy to DEV/SIT
  merge request merged       → auto-deploy to DEV/SIT
  tag pushed (e.g. v1.2.3)   → auto-deploy to UAT / trigger promotion

GitLab CI trigger (alternative — call WizardCD from .gitlab-ci.yml):
  deploy_to_sit:
    stage: deploy
    script:
      - curl -X POST "$WIZARDCD_URL/api/webhooks/deploy"
        -H "X-Webhook-Secret: $WIZARDCD_SECRET"
        -d '{"appName":"my-app","envName":"SIT","version":"'$CI_COMMIT_TAG'"}'
```

##### 10.1.4 Bitbucket Integration

```
Bitbucket → Repository → Settings → Webhooks
  URL: https://wizardcd.company.com/api/webhooks/bitbucket
  Events: Repository push, Pull request merged

WizardCD receives:
  push to main         → auto-deploy to DEV/SIT
  PR merged to main    → auto-deploy to DEV/SIT

Bitbucket Pipelines trigger (alternative):
  - step:
      name: Deploy to SIT
      script:
        - curl -X POST "$WIZARDCD_URL/api/webhooks/deploy"
          -H "X-Webhook-Secret: $WIZARDCD_SECRET"
          -d '{"appName":"my-app","envName":"SIT"}'
```

##### 10.1.5 Artifact Download from URL

When `artifactUrl` is provided in the webhook payload, WizardCD downloads the JAR instead of requiring file upload:

```
Supported artifact sources:
  - GitHub Releases:  https://github.com/org/repo/releases/download/v1.2.3/my-app.jar
  - Azure Artifacts:  https://pkgs.dev.azure.com/org/project/_apis/packaging/feeds/...
  - GitLab Packages:  https://gitlab.com/api/v4/projects/:id/packages/maven/...
  - Nexus / Artifactory: https://nexus.company.com/repository/releases/com/example/my-app/1.2.3/my-app-1.2.3.jar
  - AWS S3:           https://my-bucket.s3.amazonaws.com/artifacts/my-app-1.2.3.jar
  - Any direct URL:   WizardCD downloads via HTTP GET (with optional auth header)
```

Download authentication (configured per app in Integrations tab):
- **GitHub**: Personal access token or GitHub App token
- **Azure**: Azure DevOps PAT
- **GitLab**: Private token or deploy token
- **Nexus/Artifactory**: Basic auth credentials
- **S3**: AWS credentials (or IAM role if runner is on EC2)
- **Custom**: Configurable `Authorization` header value

##### 10.1.6 Webhook Event Mapping (Configurable Per App)

```sql
CREATE TABLE webhook_triggers (
    id              UUID PRIMARY KEY,
    app_id          UUID NOT NULL REFERENCES applications(id),
    source_platform VARCHAR(30) NOT NULL,  -- github, azure, gitlab, bitbucket, generic
    event_type      VARCHAR(50) NOT NULL,  -- push, pr_merged, release, tag_pushed
    branch_filter   VARCHAR(255),          -- e.g. "main", "release/*", "*" (default: main)
    target_env      VARCHAR(20) NOT NULL,  -- DEV, SIT, UAT, PROD
    auto_deploy     BOOLEAN DEFAULT TRUE,  -- false = create pending deployment, require manual trigger
    artifact_url_template VARCHAR(500),    -- optional: URL pattern with ${version} placeholder
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**UI — Webhook Trigger Configuration:**
```
┌──────────────────────────────────────────────────────────────┐
│  DEPLOY TRIGGERS                                              │
│                                                                │
│  ┌── GitHub ─────────────────────────────────────────────┐   │
│  │  Event: PR merged to main    → Deploy to: SIT (auto)  │   │
│  │  Event: Release published    → Deploy to: UAT (auto)  │   │
│  │  Webhook URL: https://wizardcd.../api/webhooks/github │   │
│  │  Secret: ••••••••  [Copy]  [Regenerate]               │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌── Azure DevOps ───────────────────────────────────────┐   │
│  │  Event: Push to main         → Deploy to: DEV (auto)  │   │
│  │  Event: PR completed         → Deploy to: SIT (auto)  │   │
│  │  Webhook URL: https://wizardcd.../api/webhooks/azure  │   │
│  │  Secret: ••••••••  [Copy]  [Regenerate]               │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  [+ Add Trigger]                                              │
└──────────────────────────────────────────────────────────────┘
```

#### 10.2 Outbound Webhooks (Notifications)

```sql
CREATE TABLE webhook_configs (
    id          UUID PRIMARY KEY,
    app_id      UUID REFERENCES applications(id),
    event_type  VARCHAR(50) NOT NULL,  -- DEPLOY_STARTED, DEPLOY_SUCCESS, DEPLOY_FAILED, APPROVAL_NEEDED
    target_url  VARCHAR(500) NOT NULL,
    secret      VARCHAR(255),
    headers     JSONB,                  -- custom headers (e.g. for Teams, Discord, PagerDuty)
    is_active   BOOLEAN DEFAULT TRUE
);
```

Outbound webhooks fire on deploy events. Compatible with:
- Slack (incoming webhook URL)
- Microsoft Teams (incoming webhook connector)
- Discord (webhook URL)
- PagerDuty (events API)
- Opsgenie (alert API)
- Any custom HTTP endpoint

#### 10.3 Slack Integration
- Incoming webhook for notifications (deploy started/success/fail)
- Slash command: `/wizardcd deploy <app> <env>`
- Interactive messages: approve PROD deploys from Slack
- Channel per app or per environment (configurable)

#### 10.4 Microsoft Teams Integration
- Incoming webhook connector for notifications
- Adaptive Cards for rich deploy status messages
- Actionable messages: approve/reject PROD deploys from Teams
- Channel per app or per environment (configurable)

#### 10.5 Email Notifications
- Deploy summary on completion (success/failure)
- Approval request emails with one-click approve/reject links
- Daily digest option: "3 deploys yesterday, 1 failed"
- Configurable per user: email, in-app, both, none

#### 10.6 Git Platform Status Feedback

| Platform | What WizardCD Posts Back |
|----------|------------------------|
| **GitHub** | Commit status check ("Deployed to UAT ✓"), PR comment with job link, Deployment API record |
| **Azure DevOps** | Release gate status, work item update with deployment link |
| **GitLab** | Commit status, merge request comment with job link |
| **Bitbucket** | Build status on commit |

#### 10.7 CLI Tool (`wizardcd`)

> **Developers want to deploy from the terminal.** The CLI is a lightweight wrapper around the REST API — same auth, same permissions, same pipeline.

```bash
# Install
npm install -g @wizardcd/cli    # or: brew install wizardcd

# Login (opens browser for OAuth, stores JWT)
wizardcd login --server https://runner:8443

# Deploy (manual JAR upload — same as UI drag & drop)
wizardcd deploy --app eureka-registry-ms --env UAT --jar ./target/eureka-registry-ms-1.2.3.jar

# Deploy from artifact registry (no file upload)
wizardcd deploy --app eureka-registry-ms --env PROD --version 1.2.3

# Promote (same binary, new env)
wizardcd promote --job <job-id> --to PROD

# Rollback
wizardcd rollback --app eureka-registry-ms --env UAT

# Status
wizardcd status --job <job-id>          # single job
wizardcd status --app eureka-registry-ms  # all envs for this app

# Health
wizardcd health                          # all apps, all envs
wizardcd health --app eureka-registry-ms  # single app

# List
wizardcd apps                            # list all apps
wizardcd jobs --last 10                  # recent jobs
wizardcd jobs --app eureka-registry-ms --env UAT  # filtered

# Schedule
wizardcd deploy --app my-api --env PROD --jar ./my-api.jar --schedule "2026-04-15T02:00:00Z"

# Abort
wizardcd abort --job <job-id>
```

**Implementation:**
- Written in TypeScript (Node.js) — single binary via `pkg` or distributed via npm
- Authenticates via OAuth browser flow (stores refresh token in `~/.wizardcd/config.json`)
- All commands map 1:1 to REST API endpoints
- Outputs JSON (for scripting) or human-friendly tables (for terminal)
- Exit codes: 0=success, 1=deploy failed, 2=auth error, 3=validation error

**CI/CD integration example:**
```yaml
# GitHub Actions — deploy on merge to main
- name: Deploy to SIT
  run: |
    wizardcd deploy \
      --app ${{ github.event.repository.name }} \
      --env SIT \
      --jar ./target/*.jar \
      --wait  # blocks until deploy completes
    echo "Deploy exit code: $?"
```

#### 10.8 API Documentation (OpenAPI / Swagger)

- **Swagger UI** at `https://runner:8443/swagger-ui.html` — interactive API explorer
- **OpenAPI 3.0 spec** at `https://runner:8443/v3/api-docs` — machine-readable
- Auto-generated from Spring Boot controller annotations (`springdoc-openapi`)
- JWT auth integrated — "Authorize" button in Swagger UI
- Every endpoint documented: description, parameters, request/response schemas, example payloads
- Rate limit info in API docs (limits per endpoint)

### What It Unlocks
- **Any Git platform** can trigger deployments (GitHub, Azure DevOps, GitLab, Bitbucket)
- **Any CI/CD tool** can trigger via generic webhook (Jenkins, CircleCI, TeamCity, Bamboo, etc.)
- **Artifact download** from any source (GitHub Releases, Nexus, Artifactory, S3, Azure Artifacts)
- Team visibility (Slack + Teams notifications)
- Approval workflow from Slack/Teams (no need to open WizardCD UI)
- Deployment status flows back to the Git platform (commit checks, PR comments)
- **CLI tool**: deploy from terminal, script CI/CD pipelines, automate workflows
- **API documentation**: self-service integration for developers, always up-to-date

### UI Acceptance Tests — Phase 10

> Test webhook triggers from multiple platforms, Slack/Teams integration, email notifications, and status feedback.

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 10.1 | **Configure outbound webhook** | App detail → Integrations tab → Add webhook → URL: `https://webhook.site/...` → events: DEPLOY_SUCCESS, DEPLOY_FAILED → Save | Webhook saved. Shows in list with target URL and event types. |
| 10.2 | **Webhook fires on deploy** | Deploy app → check webhook.site | POST received with JSON body: `{ app, env, status, jobId, deployedBy, timestamp }`. Correct event type. |
| 10.3 | **Generic webhook triggers deploy** | `curl -X POST .../api/webhooks/deploy -H "X-Webhook-Secret: <secret>" -d '{"appName":"my-app","envName":"SIT"}'` | SIT deployment starts automatically using latest saved config + latest artifact. Job appears in dashboard. |
| 10.4 | **GitHub webhook on push** | Configure GitHub webhook → push to main branch | WizardCD receives push event → auto-triggers DEV/SIT deploy (per config). Dashboard shows triggered job with source: "GitHub push". |
| 10.5 | **GitHub webhook on PR merge** | Configure GitHub webhook → merge PR to main | WizardCD receives PR merge event → auto-triggers configured env deploy. Job shows "Triggered by: GitHub PR #42 merge". |
| 10.6 | **Azure DevOps webhook on push** | Configure Azure DevOps service hook → push to main | WizardCD receives push event → auto-triggers deploy. Dashboard shows source: "Azure DevOps push". |
| 10.7 | **Azure DevOps webhook on PR merge** | Configure Azure DevOps service hook → complete PR | WizardCD receives PR completed event → auto-triggers deploy. Job shows "Triggered by: Azure DevOps PR #15". |
| 10.8 | **GitLab webhook on merge** | Configure GitLab webhook → merge MR to main | WizardCD receives merge event → auto-triggers deploy. Dashboard shows source: "GitLab MR !23 merge". |
| 10.9 | **Bitbucket webhook on push** | Configure Bitbucket webhook → push to main | WizardCD receives push event → auto-triggers deploy. Dashboard shows source: "Bitbucket push". |
| 10.10 | **Artifact download from URL** | Send webhook with `artifactUrl` pointing to GitHub Release JAR | WizardCD downloads JAR from URL → deploys using downloaded artifact. No manual upload. |
| 10.11 | **Invalid webhook secret rejected** | `curl` with wrong secret header | 401 Unauthorized. No deployment triggered. Audit log records failed webhook attempt. |
| 10.12 | **Configure Slack integration** | Settings → Integrations → Slack → paste incoming webhook URL → select channels | Slack config saved. Test message sent to channel: "WizardCD connected!" |
| 10.13 | **Slack notification on deploy** | Deploy app to UAT → check Slack channel | Message posted: "eureka-registry-ms deployed to UAT by bishop (23s)" with link to job detail. |
| 10.14 | **Slack notification on failure** | Deploy broken JAR → check Slack | Message posted: "eureka-registry-ms FAILED on UAT by bishop" with link to job detail. |
| 10.15 | **Slack approval flow** | Promote to PROD → check Slack | Interactive message: "PROD approval needed for eureka-registry-ms v1.2.3" with Approve/Reject buttons. Click Approve → PROD deploy starts. |
| 10.16 | **Teams notification on deploy** | Settings → Integrations → Teams → paste webhook URL → deploy app | Teams card posted: app, env, status, duration, link to job detail. |
| 10.17 | **Teams approval flow** | Promote to PROD → check Teams | Actionable card with Approve/Reject buttons. Click Approve → PROD deploy starts. |
| 10.18 | **Email notification on deploy** | User settings → enable email notifications → deploy | Email received: deploy summary with app, env, status, duration, link to job detail. |
| 10.19 | **Email approval request** | Promote to PROD → check email | Email to RELEASE_MANAGERs: "Approval needed" with one-click approve/reject links. Clicking approve triggers deployment. |
| 10.20 | **GitHub status check posted** | Configure GitHub integration → deploy app | GitHub commit shows deployment status: "Deployed to UAT ✓" or "Deploy to UAT ✗". Links back to WizardCD job. |
| 10.21 | **Azure DevOps status posted** | Configure Azure integration → deploy app | Azure DevOps shows deployment gate status. |
| 10.22 | **GitLab commit status posted** | Configure GitLab integration → deploy app | GitLab commit shows pipeline status from WizardCD. |
| 10.23 | **Webhook trigger configuration UI** | App detail → Integrations → Deploy Triggers | Shows per-platform trigger cards. Can configure: event type, branch filter, target env, auto-deploy toggle. Webhook URL + secret shown for each platform. |
| 10.24 | **Disable notifications per user** | User settings → disable email, keep in-app only | No emails sent for subsequent deploys. In-app bell notifications still work. |
| 10.25 | **Webhook delivery log** | App detail → Integrations → Delivery Log | Shows recent webhook deliveries: timestamp, event, status code, response time. Failed deliveries highlighted. Retry button for failed deliveries. |
| 10.26 | **CLI login** | `wizardcd login --server https://runner:8443` | Browser opens OAuth flow → authorize → CLI stores token → "Logged in as bishop@ebb.com (ADMIN)". |
| 10.27 | **CLI deploy with JAR** | `wizardcd deploy --app eureka-registry-ms --env SIT --jar ./target/eureka-registry-ms.jar --wait` | Upload + deploy runs. Progress output in terminal. Exits 0 on success. Job URL printed. |
| 10.28 | **CLI deploy from registry** | `wizardcd deploy --app eureka-registry-ms --env UAT --version 1.2.3` | Deploy from stored artifact. No file upload. Exits 0 on success. |
| 10.29 | **CLI rollback** | `wizardcd rollback --app eureka-registry-ms --env UAT` | Rollback executes. Progress output. Exits 0 on success. |
| 10.30 | **CLI status** | `wizardcd status --app eureka-registry-ms` | Table output showing status per env: DEV ✓, SIT ✓, UAT ✓, PROD —. JSON output with `--json` flag. |
| 10.31 | **CLI health** | `wizardcd health` | Table showing all apps × all envs with health status (🟢/🔴/🟡). |
| 10.32 | **Swagger UI accessible** | Navigate to `https://runner:8443/swagger-ui.html` | Swagger UI loads. All endpoints listed with descriptions. "Authorize" button for JWT. Try-it-out works for GET endpoints. |
| 10.33 | **OpenAPI spec download** | `curl https://runner:8443/v3/api-docs` | JSON OpenAPI 3.0 spec returned. All endpoints, schemas, and examples included. Can be imported into Postman. |

**Pass criteria:** All 33 tests pass. Deployments can be triggered from GitHub, Azure DevOps, GitLab, Bitbucket, any CI/CD tool, and the CLI. Deploy outcomes are broadcast to Slack, Teams, email, and status feedback flows back to the originating Git platform. CLI provides full deployment lifecycle from the terminal. API documentation is always up-to-date and interactive.

---

## Phase 11 — Observability, Analytics, Health & Platform Administration (7–9 days)

**Goal:** Deployment intelligence + platform usage visibility + service health monitoring + audit trail — everything teams need to understand health, trends, usage, and operational status across the organization.

**Duration:** 7–9 days

**Depends on:** Phase 4 (database for queries), Phase 6 (per-user metrics + RBAC)

### What We Build

#### 11.1 Deployment Analytics Dashboard
- **Deploy frequency**: per app, per env, per user (bar chart, daily/weekly/monthly)
- **Success/failure rate**: trend line over time
- **Mean deploy time**: per app, per strategy
- **Mean time to recovery (MTTR)**: time between failure and next successful deploy
- **DORA metrics** (if GitHub integration active):
  - Deployment frequency
  - Lead time for changes
  - Change failure rate
  - Time to restore service

#### 11.2 Deployment Comparison
- Side-by-side diff: config changes between two deployments
- Log comparison: phase durations, which phase is getting slower
- "What changed since last successful deploy?"

#### 11.3 Post-Deploy Health Monitoring
- Extended monitoring after deploy (configurable 5–60 minutes)
- Poll health endpoint: `/actuator/health` or custom URL
- Auto-rollback if health degrades within monitoring window
- Health status displayed in job detail page

#### 11.4 Structured Log Search
- Deployment logs stored in DB (searchable)
- Filter: "all deploys where phase 'Remote Deployment' failed"
- Full-text search across deploy logs
- Log retention policy (configurable per env)

#### 11.5 Platform Usage Dashboard (ADMIN only)

Real-time and historical visibility into how the platform is being used.

**Real-Time Activity Panel:**
```
┌──────────────────────────────────────────────────────────────┐
│ 🟢 LIVE ACTIVITY                                    Now      │
│                                                               │
│ Online Users: 7                                               │
│ ┌──────────────────────────────────────────────────────┐     │
│ │ ● john.doe@company.com      Deploying my-api → UAT  │     │
│ │ ● jane.smith@company.com    Viewing dashboard        │     │
│ │ ● mike.chen@company.com     Configuring deploy       │     │
│ │ ○ sarah.park@company.com    Idle (last: 3m ago)      │     │
│ │ ○ dev-team@company.com      Idle (last: 8m ago)      │     │
│ └──────────────────────────────────────────────────────┘     │
│                                                               │
│ Active Deployments: 2 / 5 capacity                           │
│ ┌──────────────────────────────────────────────────────┐     │
│ │ ⟳ my-api → UAT        by john.doe    Phase 4/5  42s │     │
│ │ ⟳ payment-svc → SIT   by mike.chen   Phase 2/5  11s │     │
│ └──────────────────────────────────────────────────────┘     │
│                                                               │
│ Queued: 1  │  Today's deploys: 14  │  Success rate: 92%      │
└──────────────────────────────────────────────────────────────┘
```

**Implementation:**
- WebSocket connection from UI → runner for real-time updates
- Server tracks active sessions via JWT token heartbeat (ping every 30s)
- Session state: `ACTIVE` (page interaction within last 2 min), `IDLE` (2–15 min), `OFFLINE` (>15 min)
- Current page/action tracked: "Viewing dashboard", "Configuring deploy", "Deploying X → Y"

**Database schema:**
```sql
CREATE TABLE user_sessions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    session_token   VARCHAR(64) NOT NULL,
    status          VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE | IDLE | OFFLINE
    current_page    VARCHAR(100),                   -- '/dashboard', '/deploy', '/jobs/uuid'
    current_action  VARCHAR(200),                   -- 'Deploying my-api → UAT'
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(500),
    started_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    last_heartbeat  TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMP
);

CREATE INDEX idx_user_sessions_status ON user_sessions(status) WHERE status != 'OFFLINE';
```

**Platform Usage Metrics (historical):**
```
┌──────────────────────────────────────────────────────────────┐
│ PLATFORM USAGE                           Last 30 days ▼      │
│                                                               │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│ │   247    │  │    18    │  │   89%    │  │   42s    │     │
│ │ Deploys  │  │  Users   │  │ Success  │  │ Avg Time │     │
│ └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│                                                               │
│ Deployments by User           │  Deployments by App          │
│ ┌────────────────────────┐    │  ┌────────────────────────┐  │
│ │ john.doe      ████ 52  │    │  │ payment-svc  ██████ 78 │  │
│ │ jane.smith    ███  38  │    │  │ my-api       ████  51  │  │
│ │ mike.chen     ██   24  │    │  │ auth-svc     ██    29  │  │
│ │ dev-team      █    12  │    │  │ frontend     █     18  │  │
│ └────────────────────────┘    │  └────────────────────────┘  │
│                                                               │
│ Deployments by Environment    │  Peak Usage Hours            │
│ DEV  ████████████  112        │  ┌─────────────────────┐    │
│ SIT  ██████        64         │  │    ▄▄ ██ ██ ▄▄      │    │
│ UAT  █████         51         │  │  ▄▄██ ██ ██ ██▄▄    │    │
│ PROD ██            20         │  │  06  09  12  15  18  │    │
│                               │  └─────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

**API endpoints:**
```
GET  /admin/usage/live         → { onlineUsers[], activeJobs[], queued, todayStats }
GET  /admin/usage/summary      → { period, totalDeploys, uniqueUsers, successRate, avgDuration }
GET  /admin/usage/by-user      → [{ userId, name, deploys, lastDeploy, successRate }]
GET  /admin/usage/by-app       → [{ appName, deploys, lastDeploy, successRate, avgDuration }]
GET  /admin/usage/by-env       → [{ env, deploys, successRate }]
GET  /admin/usage/peak-hours   → [{ hour, deployCount }]
GET  /admin/usage/trends       → [{ date, deploys, users, successRate }]
```

#### 11.6 Audit Log Viewer (ADMIN only)

Searchable audit trail of all platform actions for compliance and security.

```
Admin → Audit Log

┌──────────────────────────────────────────────────────────────┐
│ AUDIT LOG                    Filter: All ▼  Last 7 days ▼    │
│                                                               │
│ 10:42  john.doe     DEPLOY     my-api → UAT        SUCCESS  │
│ 10:38  john.doe     CONFIG     my-api → UAT        Updated  │
│ 10:15  jane.smith   LOGIN      OAuth (GitHub)       OK       │
│ 09:55  admin        PLAN_CHG   Org: Acme  Team→Bus  OK      │
│ 09:30  mike.chen    SECRET     DB_PASSWORD → UAT    Created  │
│ 09:12  admin        USER_ADD   sarah@co  DEPLOYER   OK       │
│ 08:45  jane.smith   ROLLBACK   payment-svc → SIT   SUCCESS  │
│                                                               │
│ [Export CSV]  [Export JSON]                                    │
└──────────────────────────────────────────────────────────────┘
```

**Database schema:**
```sql
CREATE TABLE audit_log (
    id              BIGSERIAL PRIMARY KEY,
    org_id          BIGINT REFERENCES organizations(id),
    user_id         BIGINT REFERENCES users(id),
    user_email      VARCHAR(255),
    action          VARCHAR(50) NOT NULL,   -- DEPLOY, ROLLBACK, LOGIN, SECRET_CREATE, USER_ADD, PLAN_CHANGE, CONFIG_UPDATE, etc.
    resource_type   VARCHAR(50),            -- 'job', 'app', 'secret', 'user', 'subscription'
    resource_id     VARCHAR(255),
    description     VARCHAR(500),
    metadata        JSONB,                  -- action-specific details
    ip_address      VARCHAR(45),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org_date ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);
```

#### 11.7 Service Health & Status Page

> **Every user wants to know: "Are my apps healthy right now?"** This is a continuous monitoring view — not just the post-deploy stability window, but ongoing health visibility for ALL deployed applications.

**Status Overview Page (all users):**

```
┌──────────────────────────────────────────────────────────────────┐
│  SERVICE STATUS                                    Last check: 8s│
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ 🟢 All Systems Operational              7 of 7 healthy     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ SERVICE              DEV    SIT    UAT    PROD   UPTIME  │    │
│  │─────────────────────────────────────────────────────────│    │
│  │ eureka-registry-ms   🟢     🟢     🟢     🟢    99.98%  │    │
│  │ payment-service      🟢     🟢     🟢     🟢    99.95%  │    │
│  │ api-gateway          🟢     🟢     🔴     🟢    99.12%  │    │
│  │ config-server        🟢     🟢     🟢     🟢    100%    │    │
│  │ notification-svc     🟢     🟢     🟡     —     98.50%  │    │
│  │ batch-processor      🟢     🟢     🟢     🟢    99.99%  │    │
│  │ auth-service         🟢     🟢     🟢     🟢    99.97%  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  🟢 Healthy  🟡 Degraded  🔴 Down  — Not deployed                │
│                                                                   │
│  INCIDENTS (last 7 days)                                          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ 🔴 api-gateway UAT  Down since 10:42 today (23m)        │    │
│  │    Last deploy: 10:38 by john.doe — FAILED               │    │
│  │    [View Job] [Quick Rollback]                           │    │
│  │                                                           │    │
│  │ 🟡 notification-svc UAT  Degraded since 08:15 (2h 50m)  │    │
│  │    Response time: 2.4s (normal: <200ms)                  │    │
│  │    [View Details]                                         │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  UPTIME HISTORY (last 30 days)                                    │
│  eureka-registry-ms  ████████████████████████████████ 99.98%     │
│  payment-service     ███████████████████████████████░ 99.95%     │
│  api-gateway         █████████████████████████████░░░ 99.12%     │
└──────────────────────────────────────────────────────────────────┘
```

**How health checking works:**

```sql
-- Health check configuration per app+env
CREATE TABLE health_checks (
    id              UUID PRIMARY KEY,
    app_id          UUID NOT NULL REFERENCES applications(id),
    env_name        VARCHAR(20) NOT NULL,
    check_type      VARCHAR(20) NOT NULL DEFAULT 'HTTP',  -- HTTP, TCP, PROCESS
    endpoint_url    VARCHAR(500),                          -- e.g. /actuator/health
    expected_status INTEGER DEFAULT 200,
    timeout_ms      INTEGER DEFAULT 5000,
    interval_seconds INTEGER DEFAULT 30,                   -- check every 30s
    consecutive_failures INTEGER DEFAULT 3,               -- unhealthy after 3 failures
    consecutive_successes INTEGER DEFAULT 2,              -- healthy after 2 successes
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(app_id, env_name)
);

-- Health check results (rolling window — keep last 24h)
CREATE TABLE health_check_results (
    id              BIGSERIAL PRIMARY KEY,
    health_check_id UUID NOT NULL REFERENCES health_checks(id),
    status          VARCHAR(20) NOT NULL,     -- HEALTHY, UNHEALTHY, DEGRADED, TIMEOUT
    response_time_ms INTEGER,
    status_code     INTEGER,
    error_message   TEXT,
    checked_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_results_check ON health_check_results(health_check_id, checked_at DESC);

-- Uptime tracking (daily aggregation)
CREATE TABLE uptime_daily (
    id              BIGSERIAL PRIMARY KEY,
    app_id          UUID NOT NULL REFERENCES applications(id),
    env_name        VARCHAR(20) NOT NULL,
    date            DATE NOT NULL,
    total_checks    INTEGER NOT NULL,
    healthy_checks  INTEGER NOT NULL,
    uptime_pct      DECIMAL(5,2) NOT NULL,   -- e.g. 99.95
    avg_response_ms INTEGER,
    max_response_ms INTEGER,
    incidents       INTEGER DEFAULT 0,
    UNIQUE(app_id, env_name, date)
);
```

**Health check types:**

| Type | How | Best for |
|------|-----|----------|
| **HTTP** | `GET <host>:<port>/<endpoint>` — expects 200 OK | Spring Boot (`/actuator/health`), any web app |
| **TCP** | TCP connect to `<host>:<port>` — connection succeeds | Apps without health endpoint, databases |
| **Process** | SSH → check PID file exists + process alive + port bound | Non-web apps, batch processors |

**Status determination:**
- 🟢 **Healthy**: last N consecutive checks passed
- 🟡 **Degraded**: checks passing but response time > threshold (e.g. >2x average)
- 🔴 **Down**: last N consecutive checks failed
- **—** Not deployed: no deployment found for this app+env

**Auto-configuration:**
- When a Spring Boot app is deployed, WizardCD auto-creates a health check: `HTTP GET :<serverPort>/actuator/health`
- For .NET apps (Phase 12): auto-creates `HTTP GET :<port>/health`
- For Node.js: auto-creates `HTTP GET :<port>/health`
- User can override endpoint, interval, thresholds in App Settings

**Notifications on status change:**
- 🟢→🔴 **DOWN**: immediate notification via Slack/Teams/email (if Phase 10 configured)
- 🔴→🟢 **RECOVERY**: notification with downtime duration
- 🟢→🟡 **DEGRADED**: notification (lower priority than DOWN)

**API endpoints:**
```
GET  /api/status                      → all apps, all envs, current status
GET  /api/status/:appId               → single app, all envs
GET  /api/status/:appId/:env          → single app+env, detailed (response times, uptime history)
GET  /api/status/incidents            → active + recent incidents
GET  /api/health-checks/:appId/:env   → health check configuration
PUT  /api/health-checks/:appId/:env   → update health check config
```

**Sidebar navigation:** New "Status" page — accessible to ALL users (not admin-only). This is the most user-facing page after Dashboard.

### What It Unlocks
- Data-driven deployment decisions
- Performance trend detection
- Automatic rollback on health degradation
- Compliance-ready audit + log retention
- **Real-time visibility**: who is online, who is deploying, platform capacity at a glance
- **Usage accountability**: per-user and per-app deployment metrics for team management
- **Audit compliance**: searchable, exportable log of every platform action
- **Service health visibility**: every user can see if their apps are healthy across all environments
- **Incident correlation**: "api-gateway went down 4 minutes after john.doe's deploy" — immediate cause→effect visibility
- **Uptime tracking**: 30-day uptime percentages per app per environment

### Build Order Within Phase 11

| Sub-phase | What | Days |
|-----------|------|------|
| 11.1 | Deployment analytics dashboard (frequency, success rate, MTTR, DORA) | 1 |
| 11.2 | Deployment comparison + "what changed?" | 0.5 |
| 11.3 | Post-deploy health monitoring + auto-rollback | 1 |
| 11.4 | Structured log search (DB storage + full-text search) | 0.5 |
| 11.5 | Platform usage dashboard (live activity + historical metrics + user sessions) | 1 |
| 11.6 | Audit log viewer + export | 0.5 |
| 11.7 | Service health & status page (health checks, uptime tracking, incident view, auto-config) | 2 |

### UI Acceptance Tests — Phase 11

> Test analytics dashboards, deployment comparisons, health monitoring, log search, platform usage, and audit trail.

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 11.1 | **Analytics dashboard loads** | Navigate to Analytics page (after 10+ deploys exist) | Charts render: deploy frequency bar chart (daily/weekly), success/failure trend line, mean deploy time by app. |
| 11.2 | **Filter analytics by app** | Select specific app in analytics filter | Charts update to show only that app's data. Totals recalculate. |
| 11.3 | **Filter analytics by date range** | Set date range: "Last 7 days" → "Last 30 days" → custom range | Charts update with correct data for each range. |
| 11.4 | **DORA metrics display** | Analytics → DORA tab (requires GitHub integration from Phase 10) | Shows: deployment frequency, lead time for changes, change failure rate, time to restore service. Benchmark labels (Elite/High/Medium/Low). |
| 11.5 | **Deployment comparison** | Job detail → "Compare with previous" (or select 2 jobs) | Side-by-side view: config diff (fields that changed), phase duration comparison (which phase got slower/faster), status comparison. |
| 11.6 | **"What changed?" shortcut** | Job detail for a failed deploy → "What changed since last success?" | Shows diff against the last successful deploy of same app + env. Highlights likely culprit changes. |
| 11.7 | **Post-deploy health monitoring** | Configure health endpoint `/actuator/health` for app → Deploy → watch job detail | After stability window passes, extended monitoring begins: "Monitoring health: 5m/30m ✓". Health status polled every 10s. Green pulses shown. |
| 11.8 | **Auto-rollback on health failure** | Deploy app → health endpoint starts returning 503 within monitoring window | WizardCD detects unhealthy response → "Health degraded — auto-rolling back" → rollback job created and executed → notification sent. |
| 11.9 | **Structured log search** | Analytics → Log Search → query: "Remote Deployment" + status: FAILED | Results show all deployments where the "Remote Deployment" phase failed. Clickable links to each job. |
| 11.10 | **Full-text log search** | Log Search → query: "OutOfMemoryError" | Finds all deploy logs containing that text. Shows matching lines with context. |
| 11.11 | **Mean time to recovery (MTTR)** | After a failed deploy + subsequent successful redeploy → check analytics | MTTR calculated: time between failure and recovery. Shown per app and as overall average. |
| 11.12 | **Deploy time trends** | Analytics → "Deploy Duration" chart → look at trend over time | Line chart shows deploy duration trending up/down. Anomalies highlighted (deploy took 3x longer than average). |
| 11.13 | **Live activity panel** | Admin → Platform Usage → Live Activity (while another user is deploying) | Shows online users with status (Active/Idle), current page/action. Active deployments with progress. Updates in real-time via WebSocket. |
| 11.14 | **Online user count** | 3 users logged in, 1 deploying, 1 browsing, 1 idle | Live panel shows 3 online: 2 active (green dot), 1 idle (grey dot). Deploying user shows "Deploying my-api → UAT". |
| 11.15 | **Usage metrics by user** | Admin → Platform Usage → By User tab | Table shows each user: name, deploy count, last deploy, success rate. Sortable columns. Leaderboard-style layout. |
| 11.16 | **Usage metrics by app** | Admin → Platform Usage → By App tab | Table shows each app: name, total deploys, avg duration, success rate. Most-deployed app at top. |
| 11.17 | **Peak usage hours** | Admin → Platform Usage (after 2+ weeks of deploys) | Heat map / bar chart showing deploy count by hour of day. Helps plan maintenance windows. |
| 11.18 | **Audit log displays actions** | Admin → Audit Log (after various actions: deploy, login, secret create, user add) | All actions listed chronologically: timestamp, user, action type, resource, status. Filterable by action type and date. |
| 11.19 | **Audit log search** | Audit Log → filter by action: "DEPLOY" + user: "john.doe" | Shows only john.doe's deploys. Click through to job detail works. |
| 11.20 | **Audit log export** | Audit Log → Export CSV | CSV file downloads with all visible log entries. Columns match table. |
| 11.21 | **Status page loads** | Navigate to Status page (after deploying 3+ apps) | Service status grid: app names as rows, environments as columns, health indicators (🟢/🟡/🔴/—). Overall banner: "All Systems Operational" or "X services degraded". |
| 11.22 | **Health check auto-configured** | Deploy a Spring Boot app → navigate to Status page | Health check auto-created for `GET :<port>/actuator/health`. Status shows 🟢 if app is healthy. No manual configuration needed. |
| 11.23 | **App goes down — status updates** | Deploy an app → stop it on target VM (`wrapper.sh stop`) → wait 90s (3 × 30s checks) | Status changes from 🟢 to 🔴. Incident appears: "Down since HH:MM". Notification sent (if configured). |
| 11.24 | **App recovers — status updates** | Restart the stopped app → wait 60s (2 × 30s checks) | Status changes from 🔴 to 🟢. Incident resolved. Notification: "Recovered after X minutes". |
| 11.25 | **Degraded detection** | Deploy app → simulate slow responses (>2x normal) | Status shows 🟡 Degraded. Response time shown: "2.4s (normal: <200ms)". |
| 11.26 | **Uptime history** | Status page → click on an app → uptime section | 30-day uptime bar chart. Percentage shown: e.g. "99.95%". Incidents highlighted in red on timeline. |
| 11.27 | **Incident correlation** | Deploy broken app → it goes down → check Status page incident | Incident shows: "Down since 10:42". Below: "Last deploy: 10:38 by john.doe — FAILED". Quick Rollback button available. |
| 11.28 | **Custom health check endpoint** | App Settings → Health Check → change endpoint from `/actuator/health` to `/api/ping` → Save | Health check uses new endpoint. Status updates based on new endpoint response. |
| 11.29 | **Status visible to all users** | Log in as VIEWER → navigate to Status page | Status page loads with full health grid. No admin restriction. All users can see health of all apps they have access to. |

**Pass criteria:** All 29 tests pass. Analytics provide actionable insights, health monitoring catches post-deploy issues, log search enables rapid debugging, live activity gives real-time platform visibility, audit log provides compliance-ready records, and service health status gives every user real-time visibility into application health across all environments.

---

## Phase 11.5 — Security Hardening, Compliance & Platform DR (8–10 days)

**Goal:** Harden the platform against attacks, detect intrusions, verify artifact integrity, ensure platform disaster recovery, and provide compliance-ready security controls. This phase addresses cross-cutting security concerns that don't belong to any single feature phase.

**Duration:** 8–10 days

**Depends on:** Phase 4 (database for security event storage), Phase 6 (auth for identity-aware detection), Phase 7 (encryption infrastructure), Phase 11 (audit log + anomaly baselines)

> **Why now?** By Phase 11, WizardCD has authentication, encryption, audit logging, and anomaly baselines. Phase 11.5 builds ON those foundations to add active security monitoring, vulnerability scanning, and compliance tooling. Delaying further risks shipping multi-language support (Phase 12) and parallel jobs (Phase 13) without proper hardening.

### What We Build

#### 11.5.1 TLS/HTTPS Everywhere

```
┌──────────────────────────────────────────────────────────┐
│  BEFORE (current)                                        │
│  UI :5173 ──HTTP──▶ Runner :8081 ──SSH──▶ Target VM     │
│            plaintext API traffic                         │
│                                                          │
│  AFTER (Phase 11.5)                                      │
│  UI :443 ──HTTPS──▶ Runner :8443 ──SSH──▶ Target VM    │
│           TLS 1.2+  (cert auto-renewal)                 │
└──────────────────────────────────────────────────────────┘
```

- **Spring Boot TLS:** `server.ssl.enabled=true`, `server.ssl.key-store`, `server.port=8443`
- **Certificate options:**
  - Let's Encrypt via certbot (automated renewal via cron)
  - Self-signed for internal/dev (auto-generated on first boot)
  - Custom CA cert (enterprise — uploaded via Settings)
- **HSTS header:** `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- **HTTP → HTTPS redirect:** port 8081 auto-redirects to 8443
- **UI:** Vite proxy config updated; `.env` uses `https://` URL
- **Settings UI:** TLS configuration panel — cert upload, auto-renewal status, expiry warning (30 days before)

#### 11.5.2 Rate Limiting & DoS Protection

```java
@Component
public class RateLimitFilter extends OncePerRequestFilter {
    // Per-user rate limits (authenticated)
    private static final int DEPLOY_PER_MINUTE = 5;
    private static final int API_PER_MINUTE = 60;
    private static final int LOGIN_PER_MINUTE = 10;

    // Global rate limits (unauthenticated)
    private static final int GLOBAL_PER_MINUTE = 200;
}
```

| Endpoint category | Limit | Window | Action on exceed |
|-------------------|-------|--------|-----------------|
| `/jobs` POST (deploy) | 5 per user | 1 minute | 429 Too Many Requests |
| `/ssh/test` POST | 10 per user | 1 minute | 429 + cooldown warning |
| `/login`, `/oauth` | 10 per IP | 1 minute | 429 + 15-min lockout after 20 |
| All other API | 60 per user | 1 minute | 429 |
| Unauthenticated | 200 per IP | 1 minute | 429 + IP temporary ban (1hr) |

- **Implementation:** Bucket4j (token bucket algorithm) with PostgreSQL backend for distributed rate limiting
- **Headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response
- **Admin override:** ADMIN role can configure limits per user/role in Settings
- **Whitelist:** Runner's own IP + configured trusted IPs exempt from limits

#### 11.5.3 Artifact Integrity Verification

```
┌──────────────────────────────────────────────────────────┐
│  ARTIFACT VERIFICATION PIPELINE                          │
│                                                          │
│  Upload JAR ──▶ SHA-256 checksum computed + stored       │
│                    │                                      │
│                    ▼                                      │
│  Optional: GPG signature verification                    │
│  (if .asc/.sig file uploaded alongside JAR)              │
│                    │                                      │
│                    ▼                                      │
│  Optional: Dependency vulnerability scan                 │
│  (OWASP dependency-check on JAR/lib contents)            │
│                    │                                      │
│                    ▼                                      │
│  Security gate: PASS/WARN/BLOCK                          │
│  (configurable per env — PROD can block on CRITICAL)     │
└──────────────────────────────────────────────────────────┘
```

**Checksum verification:**
```sql
CREATE TABLE artifact_checksums (
    id              UUID PRIMARY KEY,
    job_id          UUID NOT NULL REFERENCES jobs(id),
    file_name       VARCHAR(255) NOT NULL,
    file_size       BIGINT NOT NULL,
    sha256          VARCHAR(64) NOT NULL,         -- hex-encoded SHA-256
    gpg_signature   TEXT,                          -- ASCII-armored GPG signature (optional)
    gpg_verified    BOOLEAN,                       -- null = not checked, true/false = result
    gpg_signer      VARCHAR(255),                  -- "Bishop <bishop@ebb.com>" from GPG key
    scan_status     VARCHAR(20) DEFAULT 'PENDING', -- PENDING, CLEAN, WARNING, CRITICAL, SKIPPED
    scan_report     JSONB,                         -- vulnerability scan results
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Vulnerability scanning:**
- Integrated OWASP dependency-check (runs on uploaded JARs + lib ZIPs)
- Scans against NVD (National Vulnerability Database) + GitHub Advisory Database
- Results categorised: CRITICAL / HIGH / MEDIUM / LOW
- **Per-environment policy:**

| Environment | CRITICAL | HIGH | MEDIUM | LOW |
|-------------|----------|------|--------|-----|
| DEV | Warn | Pass | Pass | Pass |
| SIT | Warn | Warn | Pass | Pass |
| UAT | Block | Warn | Warn | Pass |
| PROD | Block | Block | Warn | Pass |

- **UI:** Scan results shown in Step 4 Review panel before deploy; red banner for BLOCK; amber for WARN
- **Settings:** Scan toggle per environment, policy configuration, NVD API key (for faster scanning)

**GPG signing (optional):**
- Upload `.asc` file alongside JAR
- Runner verifies signature against configured trusted GPG keys
- `gpg_verified: true` badge on job detail page
- PROD can require signed artifacts (configurable)

#### 11.5.4 Intrusion Detection & Anomaly Monitoring

```sql
CREATE TABLE security_events (
    id              BIGSERIAL PRIMARY KEY,
    event_type      VARCHAR(50) NOT NULL,   -- See event types below
    severity        VARCHAR(20) NOT NULL,   -- INFO, WARNING, CRITICAL, ALERT
    user_id         BIGINT REFERENCES users(id),
    user_email      VARCHAR(255),
    ip_address      VARCHAR(45),
    description     VARCHAR(500) NOT NULL,
    metadata        JSONB,                  -- event-specific payload
    acknowledged    BOOLEAN DEFAULT FALSE,
    acknowledged_by BIGINT REFERENCES users(id),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_events_severity ON security_events(severity, created_at DESC);
CREATE INDEX idx_security_events_type ON security_events(event_type, created_at DESC);
```

**Event types and detection rules:**

| Event Type | Detection Logic | Severity | Auto-action |
|------------|----------------|----------|-------------|
| `BRUTE_FORCE_LOGIN` | 5+ failed logins from same IP in 5 min | CRITICAL | IP locked out 1 hour |
| `OFF_HOURS_PROD_DEPLOY` | PROD deploy outside configured business hours | WARNING | Notification to all ADMIN + RELEASE_MANAGER |
| `RAPID_REDEPLOY` | 3+ deploys to same app+env in 10 min | WARNING | Notification to deployer's manager (if configured) |
| `FAILED_DEPLOY_BURST` | 3+ consecutive failures for same app+env | WARNING | Auto-pause deploys for that app+env (15 min cooldown) |
| `UNKNOWN_IP_DEPLOY` | Deploy from IP not seen in last 30 days for this user | INFO | Log + notification to ADMIN |
| `PRIVILEGE_ESCALATION` | User attempts action above their role (403 response) | WARNING | Log + notification after 3 attempts |
| `SSH_KEY_CHANGE` | SSH key regenerated or replaced | CRITICAL | Notification to all ADMIN |
| `ARTIFACT_CHECKSUM_MISMATCH` | Uploaded JAR checksum doesn't match expected (re-deploy) | ALERT | Deploy blocked, all ADMIN notified |
| `VULNERABILITY_CRITICAL` | Critical CVE found in deployed artifact | ALERT | Notification to all ADMIN + RELEASE_MANAGER |
| `CONFIG_TAMPERING` | request.json or deployment-config.yml modified outside normal flow | ALERT | Deploy blocked, forensic snapshot created |
| `MASS_ROLLBACK` | 3+ rollbacks across different apps in 30 min | WARNING | "Possible incident" alert to all ADMIN |
| `SESSION_HIJACK_SUSPECT` | Same JWT used from 2+ distinct IP addresses | CRITICAL | Session invalidated, user forced re-login |

**Business hours configuration:**
```
Settings → Security → Business Hours
┌─────────────────────────────────────────────┐
│ PROD Deployment Window                       │
│ Monday–Friday:  08:00 – 18:00  [timezone ▼] │
│ Weekend:        ☐ Allow  ☑ Block            │
│ Override:       RELEASE_MANAGER can override │
│                 with reason (logged)          │
└─────────────────────────────────────────────┘
```

#### 11.5.5 Emergency Controls

**Kill Switch — Halt All Deployments:**
```
Admin → Security → Emergency Controls

┌──────────────────────────────────────────────────────┐
│ ⚠ EMERGENCY DEPLOYMENT HALT                          │
│                                                       │
│ Status: ● ACTIVE — all deployments allowed            │
│                                                       │
│ [ HALT ALL DEPLOYMENTS ]  ← big red button            │
│                                                       │
│ When activated:                                       │
│ • All running deploys complete (not aborted)          │
│ • All new deploy requests return 503                   │
│ • All queued deploys are paused                       │
│ • All users see banner: "Deployments paused by ADMIN" │
│ • Only ADMIN can resume                               │
│                                                       │
│ History:                                              │
│ 2026-04-15 14:22  HALTED   by admin@ebb.com          │
│                   Reason: "Investigating breach"       │
│ 2026-04-15 15:45  RESUMED  by admin@ebb.com          │
└──────────────────────────────────────────────────────┘
```

**Implementation:**
```java
@Service
public class EmergencyControlService {
    private final AtomicBoolean deploymentHalted = new AtomicBoolean(false);
    // Also persisted to DB for multi-runner scenarios (Phase 14)

    public void haltDeployments(UUID adminUserId, String reason) {
        deploymentHalted.set(true);
        auditService.log(EMERGENCY_HALT, adminUserId, reason);
        notificationService.notifyAllUsers("Deployments paused by administrator");
        securityEventService.create(EMERGENCY_HALT, ALERT, ...);
    }

    public boolean isDeploymentAllowed() {
        return !deploymentHalted.get();
    }
}
```

**Forensic Export:**
- Admin → Security → Export Forensic Bundle
- Generates ZIP containing: last 30 days of audit log, security events, deploy logs, session log, configuration snapshots
- For incident response and external security review
- Hash-signed manifest inside the ZIP (integrity verification)

#### 11.5.6 File Integrity Monitoring (Runner VM)

Monitor critical files on the runner VM for tampering:

| Monitored path | What | Alert on |
|----------------|------|----------|
| `/opt/wizardcd/runner/*.sh` | Deployment scripts | Any modification (checksum change) |
| `/opt/wizardcd/runner-service-ms-*.jar` | Runner service | Unexpected modification |
| `/home/wizard/.ssh/wizardcd_*_ed25519` | SSH private keys | Modification, deletion, permission change |
| `/etc/wizardcd/master.key` | Encryption master key | Any access outside runner-service-ms process |
| `/etc/wizardcd/db.env` | DB credentials | Any modification |

**Implementation:**
- `FileIntegrityService` computes SHA-256 of all monitored files on startup
- Background scheduler re-checks every 5 minutes
- Checksum mismatch → `ALERT` security event + notification to all ADMIN
- Stored checksums also in DB (so tampering the file AND the local checksum store is harder)

#### 11.5.7 Platform Disaster Recovery

> **Who backs up WizardCD?** We back up deployed apps, but if the runner VM dies or PostgreSQL crashes, the entire platform is gone. This section ensures WizardCD can recover from infrastructure failures.

**Automated Database Backups:**
```bash
# Cron job on runner VM (installed during Phase 4 setup)
# Runs daily at 01:00 UTC — keeps last 30 days
0 1 * * * /opt/wizardcd/scripts/backup-db.sh

# backup-db.sh:
#!/bin/bash
BACKUP_DIR="/opt/wizardcd/backups/db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump -U wizardcd -Fc wizardcd > "$BACKUP_DIR/wizardcd_${TIMESTAMP}.dump"
# Retain last 30 backups
ls -t "$BACKUP_DIR"/*.dump | tail -n +31 | xargs rm -f
# Optional: upload to S3
# aws s3 cp "$BACKUP_DIR/wizardcd_${TIMESTAMP}.dump" s3://wizardcd-backups/db/
```

**Configuration Export/Import:**
```
Admin → Settings → Platform Backup

┌──────────────────────────────────────────────────────────┐
│ PLATFORM BACKUP & RECOVERY                                │
│                                                            │
│ Database Backup                                            │
│ ┌────────────────────────────────────────────────────┐    │
│ │ Last backup: 2026-04-15 01:00 UTC (14h ago)        │    │
│ │ Backup size: 42 MB                                  │    │
│ │ Backups retained: 30 days                           │    │
│ │ Location: /opt/wizardcd/backups/db/                 │    │
│ │ S3 sync: ✓ Enabled (s3://wizardcd-backups/db/)     │    │
│ │                                                      │    │
│ │ [ Backup Now ]  [ Download Latest ]                  │    │
│ └────────────────────────────────────────────────────┘    │
│                                                            │
│ Configuration Export                                       │
│ ┌────────────────────────────────────────────────────┐    │
│ │ Exports: apps, env configs, secrets (encrypted),    │    │
│ │ user roles, webhook configs, health checks,         │    │
│ │ deployment windows, pipeline configs                 │    │
│ │                                                      │    │
│ │ [ Export Config Bundle (.zip) ]                      │    │
│ │ [ Import Config Bundle ]                             │    │
│ └────────────────────────────────────────────────────┘    │
│                                                            │
│ Platform Health Self-Check                                 │
│ ┌────────────────────────────────────────────────────┐    │
│ │ ✓ PostgreSQL: connected (latency: 2ms)              │    │
│ │ ✓ Disk space: 67% free (42 GB available)            │    │
│ │ ✓ SSH keys: all 4 envs present                      │    │
│ │ ✓ Last backup: 14h ago (threshold: 25h)             │    │
│ │ ✓ TLS cert: valid, expires in 62 days               │    │
│ │ ⚠ Memory: 78% used (threshold: 85%)                │    │
│ └────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
```

**Platform self-monitoring (background scheduler):**

| Check | Interval | Alert threshold |
|-------|----------|----------------|
| PostgreSQL connectivity | 60s | 3 consecutive failures → CRITICAL alert |
| Disk space | 5 min | <20% free → WARNING, <10% → CRITICAL |
| Database backup age | 1 hour | >25 hours since last backup → WARNING |
| Memory usage | 5 min | >85% → WARNING, >95% → CRITICAL |
| SSH key presence | 1 hour | Any missing env key → WARNING |
| TLS certificate expiry | Daily | <30 days → WARNING, <7 days → CRITICAL |

**Recovery runbook (automated):**
```bash
# Full platform recovery on new VM:
# 1. Install PostgreSQL + Java + WizardCD (from setup guide)
# 2. Restore database:
pg_restore -U wizardcd -d wizardcd /path/to/wizardcd_backup.dump
# 3. Restore config bundle (SSH keys, TLS certs, settings):
wizardcd-admin restore --bundle /path/to/config-export.zip
# 4. Start runner service:
sudo systemctl start wizardcd-runner
# 5. Verify:
curl -s https://localhost:8443/actuator/health
```

**API endpoints:**
```
POST /admin/backup/db              → Trigger immediate DB backup
GET  /admin/backup/db/latest       → Download latest backup
POST /admin/backup/config/export   → Export config bundle ZIP
POST /admin/backup/config/import   → Import config bundle ZIP
GET  /admin/health/self            → Platform self-check results
```

#### 11.5.9 Security Dashboard (ADMIN Only)

```
Admin → Security Dashboard

┌──────────────────────────────────────────────────────────┐
│ SECURITY OVERVIEW                                        │
│                                                          │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│
│ │ 🟢 SAFE  │  │    0     │  │    2     │  │    14    ││
│ │ Platform │  │ CRITICAL │  │ WARNINGS │  │ INFO     ││
│ │ Status   │  │ Events   │  │ (7 days) │  │ (7 days) ││
│ └──────────┘  └──────────┘  └──────────┘  └──────────┘│
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │ RECENT SECURITY EVENTS                               ││
│ │                                                       ││
│ │ ⚠ 10:42  Off-hours PROD deploy by john.doe           ││
│ │ ℹ 09:15  New IP 203.0.113.5 for jane.smith           ││
│ │ ✓ 08:00  Daily integrity check — all files OK         ││
│ │ ⚠ Yesterday  3 rapid redeploys: payment-svc → UAT    ││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│ ┌──────────────────────┐  ┌──────────────────────────┐ │
│ │ TLS CERTIFICATE      │  │ VULNERABILITY SCAN       │ │
│ │ ● Valid              │  │ Last scan: 2h ago        │ │
│ │ Expires: 2026-06-15  │  │ Clean: 12 apps           │ │
│ │ Auto-renew: ON       │  │ Warning: 2 apps          │ │
│ │ Issuer: Let's Encrypt│  │ Critical: 0 apps         │ │
│ └──────────────────────┘  └──────────────────────────┘ │
│                                                          │
│ ┌──────────────────────────────────────────────────────┐│
│ │ FILE INTEGRITY                                       ││
│ │ Last check: 3 min ago          All 12 files ✓ OK     ││
│ │ deploy.sh ✓  application-deployment.sh ✓  keys ✓     ││
│ └──────────────────────────────────────────────────────┘│
│                                                          │
│ [ Emergency Halt ]  [ Export Forensic Bundle ]           │
└──────────────────────────────────────────────────────────┘
```

**API endpoints:**
```
GET  /admin/security/overview        → { status, criticalCount, warningCount, infoCount, tlsCert, lastScan }
GET  /admin/security/events          → SecurityEvent[] (paginated, filterable by type/severity/date)
POST /admin/security/events/:id/ack  → Acknowledge event (with optional note)
GET  /admin/security/integrity       → { files[], lastCheck, allOk }
POST /admin/security/halt            → Halt all deployments (ADMIN only)
POST /admin/security/resume          → Resume deployments (ADMIN only)
GET  /admin/security/forensic-export → ZIP download
GET  /admin/security/tls             → { enabled, issuer, expiry, autoRenew }
POST /admin/security/tls/upload      → Upload custom certificate
```

#### 11.5.10 CORS & Security Headers

```java
@Configuration
public class SecurityHeadersConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) {
        return http
            .headers(h -> h
                .contentTypeOptions(Customizer.withDefaults())        // X-Content-Type-Options: nosniff
                .frameOptions(fo -> fo.deny())                        // X-Frame-Options: DENY
                .httpStrictTransportSecurity(hsts -> hsts
                    .maxAgeInSeconds(31536000)                        // 1 year
                    .includeSubDomains(true))
                .contentSecurityPolicy(csp -> csp
                    .policyDirectives("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"))
                .referrerPolicy(rp -> rp
                    .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                .permissionsPolicy(pp -> pp
                    .policy("camera=(), microphone=(), geolocation=()"))
            )
            .cors(cors -> cors.configurationSource(corsSource()))     // Whitelist UI origin only
            .build();
    }

    private CorsConfigurationSource corsSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("https://your-wizardcd-ui.com"));  // configurable
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(true);
        return new UrlBasedCorsConfigurationSource(Map.of("/**", config));
    }
}
```

### How Similar Platforms Handle Security

| Platform | Key security features | What we're matching/exceeding |
|----------|----------------------|-------------------------------|
| **Octopus Deploy** | Audit log, RBAC, Tentacle mutual TLS, retention policies, spaces isolation | ✅ All covered (audit, RBAC, TLS, file integrity, per-env isolation) |
| **Spinnaker** | OAuth/SAML, fine-grained RBAC, canary analysis, pipeline restrictions | ✅ OAuth (Phase 6), RBAC, anomaly detection, deployment strategies (Phase 8) |
| **ArgoCD** | RBAC, SSO, audit trails, signed commits, network policies | ✅ All covered + artifact signing + vulnerability scanning (we go further) |
| **Jenkins** | Plugin-based security, credentials store, matrix auth | ✅ Exceeding — integrated secrets (Phase 7) + scanning + anomaly detection |
| **GitHub Actions** | OIDC, encrypted secrets, audit log, IP allowlists | ✅ Matching — encrypted secrets, audit, rate limiting, IP-based detection |

**What WizardCD adds beyond competitors:**
- Artifact vulnerability scanning BEFORE deploy (not just at build)
- Real-time anomaly detection with configurable auto-actions
- Emergency kill switch with forensic export
- File integrity monitoring on the deployment infrastructure itself

### What It Unlocks
- **Compliance readiness:** SOC2, ISO 27001 audit evidence (immutable log + forensic export)
- **Active threat detection:** Not just logging — detecting and responding to anomalies
- **Artifact trust chain:** Checksum + optional signing + vulnerability scanning before code touches production
- **Operational confidence:** TLS, rate limiting, CORS, security headers — industry-standard hardening
- **Incident response:** Kill switch + forensic bundle + tamper detection

### Build Order Within Phase 11.5

| Sub-phase | What | Days |
|-----------|------|------|
| 11.5.1 | TLS/HTTPS (Spring Boot SSL + Let's Encrypt + cert management UI) | 1 |
| 11.5.2 | Rate limiting (Bucket4j + per-endpoint policies + admin config) | 0.5 |
| 11.5.3 | Artifact integrity (SHA-256 checksums + GPG optional + vulnerability scanning + env policies) | 2 |
| 11.5.4 | Intrusion detection (security events table + 12 detection rules + auto-actions + business hours) | 1.5 |
| 11.5.5 | Emergency controls (kill switch + forensic export) | 0.5 |
| 11.5.6 | File integrity monitoring (runner VM critical file checksums + background scheduler) | 0.5 |
| 11.5.7 | Platform disaster recovery (DB backups + config export/import + self-monitoring + recovery runbook) | 1 |
| 11.5.8 | Platform DR UI (backup panel + self-check dashboard + admin endpoints) | 0.5 |
| 11.5.9 | Security dashboard UI (overview + events + TLS + integrity + DR status + emergency controls) | 1 |
| 11.5.10 | CORS + security headers (Spring Security config) | 0.5 |

### UI Acceptance Tests — Phase 11.5

> Test TLS, rate limiting, artifact integrity, intrusion detection, emergency controls, and security dashboard.

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 11.5.1 | **HTTPS enforced** | Navigate to `http://runner:8081` (plain HTTP) | Automatically redirected to `https://runner:8443`. Browser shows padlock. |
| 11.5.2 | **TLS certificate info** | Admin → Security Dashboard → TLS Certificate panel | Shows: issuer, expiry date, auto-renew status. If expiry < 30 days, amber warning shown. |
| 11.5.3 | **Rate limit — deploy** | Rapidly submit 6 deploy requests within 1 minute | First 5 accepted (202). 6th returns 429 Too Many Requests. `X-RateLimit-Remaining: 0` header present. |
| 11.5.4 | **Rate limit — login brute force** | Attempt 20 failed logins from same IP | After 10: 429 responses. After 20: IP locked out for 1 hour. Security event created: `BRUTE_FORCE_LOGIN`. |
| 11.5.5 | **Artifact checksum computed** | Deploy a JAR → check job detail | SHA-256 checksum displayed in job metadata. Matches manual `sha256sum` of the uploaded file. |
| 11.5.6 | **Vulnerability scan — clean** | Deploy a JAR with no known vulnerabilities | Scan result shows "CLEAN" in Step 4 Review. Green badge in job detail. |
| 11.5.7 | **Vulnerability scan — warning** | Deploy a JAR with a known HIGH vulnerability to SIT | Scan result shows amber warning in Step 4 Review: "1 HIGH vulnerability found". Deploy proceeds (SIT policy = warn on HIGH). |
| 11.5.8 | **Vulnerability scan — blocked** | Deploy a JAR with a CRITICAL vulnerability to PROD | Scan result shows red block in Step 4 Review: "1 CRITICAL vulnerability — deploy blocked for PROD". Deploy button disabled. |
| 11.5.9 | **GPG signature verification** | Upload JAR + matching .asc signature file → Deploy | Job detail shows "Signature verified ✓ — signed by Bishop <bishop@ebb.com>". |
| 11.5.10 | **Off-hours PROD deploy warning** | Deploy to PROD outside configured business hours | Security event created: `OFF_HOURS_PROD_DEPLOY`. ADMIN + RELEASE_MANAGER receive notification. Deploy proceeds (with override reason logged). |
| 11.5.11 | **Rapid redeploy detection** | Deploy same app → same env 4 times in 10 minutes | After 3rd: security event `RAPID_REDEPLOY` created. Warning notification sent. 4th deploy proceeds but is flagged. |
| 11.5.12 | **Unknown IP detection** | Log in from a new IP address not seen in 30 days → Deploy | Security event `UNKNOWN_IP_DEPLOY` created (INFO level). ADMIN notified. |
| 11.5.13 | **Emergency halt** | Admin → Security → Emergency Halt → click → confirm | All deployments paused. New deploy attempts return 503. Banner visible on all pages: "Deployments paused by administrator". Queued jobs show "PAUSED". |
| 11.5.14 | **Emergency resume** | Admin → Security → Resume Deployments | Deployments resume. Banner disappears. Queued jobs start processing. Both halt and resume events in audit log with timestamps. |
| 11.5.15 | **File integrity check** | SSH to runner VM → modify `deploy.sh` (add a comment) → wait 5 min | Security event `CONFIG_TAMPERING` (ALERT) created. Admin notification: "deploy.sh checksum mismatch detected". Security dashboard shows file as ✗ MODIFIED. |
| 11.5.16 | **Security dashboard loads** | Admin → Security Dashboard | Overview loads: platform status indicator, event counts (CRITICAL/WARNING/INFO), TLS cert status, scan status, file integrity status. Recent events listed. |
| 11.5.17 | **Security event acknowledgment** | Security Dashboard → click WARNING event → "Acknowledge" with note | Event marked as acknowledged. Acknowledger name + timestamp shown. Event moves to acknowledged section. |
| 11.5.18 | **Forensic export** | Admin → Security → Export Forensic Bundle | ZIP downloads containing: audit log (30 days), security events, deploy logs, session log, config snapshots. Manifest file with SHA-256 hashes inside. |
| 11.5.19 | **CORS blocks cross-origin** | From browser console on different domain, `fetch('https://runner:8443/jobs')` | CORS error. Request blocked. Only configured UI origin allowed. |
| 11.5.20 | **Security headers present** | Open browser DevTools → Network → check response headers on any API call | Headers present: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, `Content-Security-Policy`, `Referrer-Policy`. |
| 11.5.21 | **Scan policy configuration** | Admin → Settings → Security → Vulnerability Policy → change UAT CRITICAL from "Block" to "Warn" | Setting saved. Next deploy to UAT with CRITICAL vulnerability shows warning (not block). |
| 11.5.22 | **Session hijack detection** | Use same JWT from two different IP addresses simultaneously | Second IP triggers `SESSION_HIJACK_SUSPECT` CRITICAL event. Session invalidated. Both users forced to re-login. |
| 11.5.23 | **Database backup runs** | Admin → Settings → Platform Backup → "Backup Now" | Backup completes. Shows: timestamp, size, location. Download button available. |
| 11.5.24 | **Config export** | Admin → Platform Backup → "Export Config Bundle" | ZIP downloads containing: app configs, env configs, encrypted secrets references, webhook configs, health check configs, deployment windows. |
| 11.5.25 | **Config import on fresh instance** | Set up new runner VM with fresh PostgreSQL → Import config bundle | All apps, env configs, webhook configs, health checks restored. Apps appear in registry. Env configs populated. (Secrets require re-entry — encrypted values are env-specific.) |
| 11.5.26 | **Database restore** | Stop runner → drop DB → `pg_restore` from backup → start runner | All data restored: jobs, apps, users, audit log. Dashboard shows all historical data. No data loss. |
| 11.5.27 | **Platform self-check** | Admin → Platform Backup → Platform Health Self-Check | Shows: PostgreSQL ✓, disk space ✓, SSH keys ✓, backup age ✓, TLS cert ✓, memory ✓. All green indicators. |
| 11.5.28 | **Self-check disk warning** | Fill runner VM disk to >80% → wait 5 min | Platform self-check shows disk WARNING. Security event created. ADMIN notified: "Disk space low: 18% free". |
| 11.5.29 | **Backup age warning** | Delete all backups → wait 25+ hours | Platform self-check shows backup WARNING: "Last backup: 26 hours ago (threshold: 25h)". ADMIN notified. |

**Pass criteria:** All 29 tests pass. TLS enforced everywhere, rate limiting prevents abuse, artifacts verified before deploy, anomalies detected and actioned, emergency controls work, platform can be backed up and fully restored, and security dashboard gives ADMIN full visibility into platform security posture.

---

## Phase 12 — Multi-Language Runtime Support

**Goal:** Expand WizardCD beyond Java to support .NET, Python, Node.js, Go, and custom applications. Same deployment engine, same zero-friction experience.

**Duration:** 10–14 days

**Depends on:** Phases 4–8 (core platform stable before adding runtimes)

### Architecture: Runtime Adapters

The deployment pipeline is split into **language-agnostic** (already built) and **language-specific** (adapter layer):

```
┌──────────────────────────────────────────────────────────────┐
│  LANGUAGE-AGNOSTIC (works for ALL runtimes — already built)  │
│                                                               │
│  ✓ SSH/SCP transport to target VM                            │
│  ✓ Backup-before-deploy with retention                       │
│  ✓ Stability window (port-based health check)                │
│  ✓ Blue-green / Canary / Rolling strategies                  │
│  ✓ Secret injection (env vars, files, config templates)      │
│  ✓ Audit trail, dashboard, notifications                     │
│  ✓ Artifact registry + promotion pipeline                    │
│  ✓ Rollback (restore from backup)                            │
│  ✓ Real-time log streaming                                   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  LANGUAGE-SPECIFIC (Runtime Adapter — new in Phase 12)       │
│                                                               │
│  Per runtime:                                                │
│    • Artifact format + upload validation                     │
│    • Manifest/config parsing (auto-fill wizard fields)       │
│    • Process manager (how to start/stop/restart)             │
│    • Health check convention                                 │
│    • Port detection                                          │
│    • systemd unit file / wrapper generation                  │
└──────────────────────────────────────────────────────────────┘
```

### What We Build

#### 12.1 RuntimeAdapter Interface

```java
public interface RuntimeAdapter {
    /** Unique identifier: "java", "dotnet", "python", "nodejs", "go", "custom" */
    String getRuntimeId();

    /** Human-readable name: "Java / Spring Boot", ".NET / ASP.NET Core" */
    String getDisplayName();

    /** Accepted artifact file extensions: [".jar"], [".zip", ".tar.gz"], etc. */
    List<String> getAcceptedExtensions();

    /** Parse uploaded artifact — extract app name, version, port, entry point */
    ArtifactAnalysis analyzeArtifact(Path artifactPath);

    /** Generate process manager config (systemd unit, Tanuki conf, pm2 config) */
    ProcessConfig generateProcessConfig(DeploymentRequest request);

    /** Generate start/stop/restart commands for the target VM */
    ProcessCommands getProcessCommands(DeploymentRequest request);

    /** Default health check URL pattern: "/actuator/health", "/health", etc. */
    String getDefaultHealthEndpoint();
}
```

#### 12.2 Java / Spring Boot Adapter (Current — Refactored)

Existing logic extracted into `JavaSpringBootAdapter`:

```
Artifact:     .jar (fat or thin + lib.zip)
Parsing:      META-INF/MANIFEST.MF → app name, main class
              application.yml → server.port, spring.profiles.active
Process:      Tanuki Service Wrapper (existing)
Health:       /actuator/health
Port detect:  server.port from embedded config
```

No behaviour changes — just refactored behind the `RuntimeAdapter` interface.

#### 12.3 .NET / ASP.NET Core Adapter

```
Artifact:     .zip (dotnet publish output) or single-file executable
Parsing:      *.deps.json → app name, target framework
              appsettings.json → Kestrel URLs/ports
              *.runtimeconfig.json → runtime version
Process:      systemd unit file:
                ExecStart=/usr/bin/dotnet /app/MyApp.dll
                  OR
                ExecStart=/app/MyApp (single-file)
              Environment=ASPNETCORE_URLS=http://+:5000
              Environment=DOTNET_ENVIRONMENT=Production
Health:       /health (ASP.NET health checks middleware)
Port detect:  Kestrel.Endpoints from appsettings.json
```

**systemd unit generation (replaces Tanuki for .NET):**
```ini
[Unit]
Description={{APP_NAME}} ({{ENV_NAME}})
After=network.target

[Service]
Type=notify
WorkingDirectory={{APP_HOME}}
ExecStart=/usr/bin/dotnet {{APP_HOME}}/{{APP_DLL}}
ExecStop=/bin/kill -SIGTERM $MAINPID
Restart=on-failure
RestartSec=10
User={{RUN_AS_USER}}
Environment=ASPNETCORE_ENVIRONMENT={{ENV_NAME}}
Environment=ASPNETCORE_URLS=http://+:{{PORT}}
{{SECRET_ENV_VARS}}

[Install]
WantedBy=multi-user.target
```

#### 12.4 Python Adapter (Django / Flask / FastAPI)

```
Artifact:     .zip (app code + requirements.txt) or .tar.gz
Parsing:      pyproject.toml → name, version
              requirements.txt → dependency list
              manage.py presence → Django detection
              app.py / main.py → Flask/FastAPI detection
Process:      systemd + Gunicorn (Django/Flask) or Uvicorn (FastAPI):
                ExecStart=/app/venv/bin/gunicorn myapp.wsgi:application --bind 0.0.0.0:8000
                ExecStart=/app/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
              Virtualenv created on target during deploy
Health:       /health or /api/health
Port detect:  From gunicorn/uvicorn config or settings.py
```

**Deploy flow additions for Python:**
```bash
# After extracting artifact on target VM:
1. Create/update virtualenv: python3 -m venv /app/myapp/venv
2. Install dependencies: /app/myapp/venv/bin/pip install -r requirements.txt
3. Run migrations (optional, configurable): /app/myapp/venv/bin/python manage.py migrate
4. Collect static (Django, optional): /app/myapp/venv/bin/python manage.py collectstatic --noinput
5. Generate systemd unit → reload → start
6. Health check on configured port
```

#### 12.5 Node.js Adapter (Express / NestJS / Next.js)

```
Artifact:     .zip or .tar.gz (app + node_modules, or app + package-lock.json)
Parsing:      package.json → name, version, main, scripts.start
              .env or config files → PORT
Process:      systemd + node directly, or PM2:
                ExecStart=/usr/bin/node /app/myapp/dist/main.js
                  OR
                ExecStart=/usr/bin/pm2 start /app/myapp/ecosystem.config.js
Health:       /health or /api/health
Port detect:  PORT from .env or package.json scripts
```

**Deploy flow additions for Node.js:**
```bash
# After extracting artifact on target VM:
1. If node_modules not included: npm ci --production (using package-lock.json)
2. If build step needed (Next.js): npm run build
3. Generate systemd unit or PM2 config → start
4. Health check on configured port
```

#### 12.6 Go Adapter

```
Artifact:     Single compiled binary (or .tar.gz with binary + config)
Parsing:      Binary inspection: -ldflags version (if embedded)
              Config file detection: config.yaml, .env
Process:      systemd unit file:
                ExecStart=/app/myapp/myapp-binary
Health:       /health or /healthz
Port detect:  From config file or command-line flag convention
```

Go is the simplest adapter — a single binary needs no runtime, no virtualenv, no package manager. Just copy, set permissions, generate systemd unit, start.

#### 12.7 Generic / Custom Adapter

For applications that don't fit any predefined adapter:

```
Artifact:     .zip or .tar.gz (any files)
Parsing:      None — user fills all wizard fields manually
Process:      User-provided commands:
                Start:   /app/myapp/start.sh
                Stop:    /app/myapp/stop.sh
                Status:  /app/myapp/status.sh (exit code 0 = running)
Health:       User-provided: HTTP endpoint URL or shell command
Port detect:  User enters manually
```

This is the escape hatch for: legacy apps, custom frameworks, Rust binaries, Erlang/Elixir releases, PHP applications behind Apache/Nginx, etc.

#### 12.8 Deploy Wizard Changes

Step 2 gets a **runtime selector** at the top (before artifact upload):

```
┌──────────────────────────────────────────────────────────────┐
│  APPLICATION RUNTIME                                          │
│                                                                │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────┐ ┌─────┐│
│  │ ☕ Java │ │ 🔷.NET │ │ 🐍 Py  │ │ ⬡ Node │ │ Go │ │ ⚙️  ││
│  │        │ │        │ │        │ │        │ │    │ │Custom││
│  └────────┘ └────────┘ └────────┘ └────────┘ └────┘ └─────┘│
│                                                                │
│  Selected: Java / Spring Boot                                 │
│  Accepts: .jar files (fat JAR or thin JAR + dependencies)    │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

The runtime selection controls:
- Which artifact types are accepted in the upload dropzone
- Which manifest/config parsing runs after upload
- Which fields are shown (JVM config for Java, virtualenv for Python, PM2 for Node.js)
- Which process manager config is generated
- Which health check defaults are pre-filled

#### 12.9 Runner Script Refactoring

```
runner/
├── deploy.sh                    # Orchestrator (calls runtime-specific scripts)
├── application-deployment.sh    # Remote deployment (refactored to be runtime-aware)
├── runtimes/
│   ├── java-spring.sh           # Tanuki wrapper generation + Java-specific logic
│   ├── dotnet.sh                # systemd unit generation for .NET
│   ├── python.sh                # virtualenv + pip + Gunicorn/Uvicorn
│   ├── nodejs.sh                # npm ci + PM2/node systemd
│   ├── go.sh                    # Binary deploy + systemd
│   └── custom.sh                # User-provided start/stop commands
├── strategies/                  # (unchanged — strategy scripts are runtime-agnostic)
└── helpers.sh
```

#### 12.10 Database Changes

```sql
-- Add runtime type to applications table
ALTER TABLE applications ADD COLUMN runtime_type VARCHAR(30) DEFAULT 'java';
-- Values: java, dotnet, python, nodejs, go, custom

-- Add runtime-specific config to environment_configs
ALTER TABLE environment_configs ADD COLUMN runtime_config JSONB;
-- Java:   {"processManager": "tanuki", "mainClass": "...", "jarType": "fat"}
-- .NET:   {"processManager": "systemd", "appDll": "MyApp.dll", "dotnetVersion": "8.0"}
-- Python: {"processManager": "systemd+gunicorn", "wsgiModule": "myapp.wsgi", "pythonVersion": "3.12"}
-- Node:   {"processManager": "pm2", "entryScript": "dist/main.js", "nodeVersion": "20"}
-- Go:     {"processManager": "systemd", "binaryName": "myapp"}
-- Custom: {"startCommand": "./start.sh", "stopCommand": "./stop.sh", "statusCommand": "./status.sh"}
```

### Build Order Within Phase 12

| Sub-phase | What | Days |
|-----------|------|------|
| 12.1 | `RuntimeAdapter` interface + refactor Java adapter from existing code | 2 |
| 12.2 | systemd unit generator (shared by .NET, Python, Node, Go) | 1 |
| 12.3 | .NET adapter (artifact parsing + Kestrel config + systemd) | 2 |
| 12.4 | Python adapter (virtualenv + pip + Gunicorn/Uvicorn + Django detection) | 2 |
| 12.5 | Node.js adapter (package.json parsing + npm ci + PM2/node) | 2 |
| 12.6 | Go adapter (binary deploy + systemd) | 1 |
| 12.7 | Custom/Generic adapter (user-provided commands) | 1 |
| 12.8 | Deploy wizard runtime selector UI + per-runtime field sets | 2 |
| 12.9 | Runner script refactoring (runtime dispatch) | 1 |

### What It Unlocks
- WizardCD deploys **any** application type to Linux VMs
- Same zero-friction experience for .NET, Python, Node.js, Go teams
- Custom adapter covers: Rust, Elixir, PHP, legacy apps, anything
- Market positioning expands from "Java deployment tool" to "universal deployment platform for VMs"
- All existing features (strategies, secrets, pipelines, notifications) work with all runtimes

### UI Acceptance Tests — Phase 12

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 12.1 | **Java deploy still works** | Select Java runtime → upload JAR → deploy | Exact same behaviour as before refactoring. Tanuki wrapper, manifest parsing, port detection — all unchanged. |
| 12.2 | **Runtime selector appears** | New Deploy → Step 2 | Runtime tiles shown: Java, .NET, Python, Node.js, Go, Custom. Java selected by default. |
| 12.3 | **Runtime selection changes upload** | Select .NET → see upload dropzone | Dropzone accepts .zip files. Label: "Upload .NET publish output (.zip)". JAR-specific fields hidden. |
| 12.4 | **.NET deploy** | Select .NET → upload publish ZIP → fill fields → deploy | Artifact extracted on target. systemd unit generated. `dotnet MyApp.dll` starts. Health check passes on configured port. |
| 12.5 | **.NET artifact parsing** | Upload .NET ZIP | Auto-detects: app name from *.deps.json, port from appsettings.json, target framework. Fields auto-filled. |
| 12.6 | **Python deploy (FastAPI)** | Select Python → upload ZIP with main.py + requirements.txt → deploy | Virtualenv created. Dependencies installed. Uvicorn starts. Health check passes. |
| 12.7 | **Python deploy (Django)** | Select Python → upload ZIP with manage.py → deploy | Django detected. Migrations run (if configured). Gunicorn starts. Health check passes. |
| 12.8 | **Node.js deploy** | Select Node.js → upload ZIP with package.json → deploy | npm ci runs (if node_modules not included). Node/PM2 starts. Health check passes. |
| 12.9 | **Node.js artifact parsing** | Upload Node.js ZIP | Auto-detects: name, version from package.json. Port from .env or scripts. |
| 12.10 | **Go deploy** | Select Go → upload binary (or tar.gz) → deploy | Binary deployed with executable permissions. systemd unit generated. Process starts. Health check passes. |
| 12.11 | **Custom runtime deploy** | Select Custom → upload ZIP → provide start/stop/status commands → deploy | Artifact extracted. User commands executed. Health check (HTTP or command) passes. |
| 12.12 | **Rollback works for .NET** | Deploy .NET app → deploy broken version → Rollback | Backup restored. Previous .NET version running. systemd unit matches previous config. |
| 12.13 | **Secrets inject for Python** | Configure DB_PASSWORD secret for Python app → deploy | Secret injected as environment variable in systemd unit. Python app reads from os.environ. |
| 12.14 | **Blue-green works for Node.js** | Configure blue-green env for Node.js app → deploy | Deploys to inactive set. Health check. LB swap. Zero downtime. |
| 12.15 | **Saved app preserves runtime** | Register .NET app → close browser → reopen → deploy | App remembers runtime type. Deploy wizard pre-selects .NET. Correct fields shown. |

**Pass criteria:** All 15 tests pass. Every runtime deploys, rolls back, injects secrets, and works with deployment strategies. Java behaviour is unchanged after refactoring.

---

## Phase 13 — Parallel Jobs + Multi-VM Targets + Service Dependencies (7–9 days)

**Prerequisite:** Phase 8 (Deployment Strategies — multi-VM env configs exist)

### What It Does
1. **Parallel job execution** — Replace single-thread executor with configurable thread pool; multiple deployments run concurrently
2. **Concurrency safety** — Lock per app+env combination so two deploys to the same app on the same environment never overlap
3. **Multi-VM targets** — Deploy a single app to multiple VMs in one operation (e.g. 3-node cluster)
4. **Deployment modes** — Sequential (safest), Parallel (fastest), Batched (balanced — configurable batch size)
5. **Job queue** — When max concurrency is reached or same app+env is busy, jobs queue with position tracking

### Why This Matters
Currently, WizardCD runs **one job at a time** via `SingleThreadExecutor` and targets **one VM per deploy**. This is the biggest operational limitation — a team deploying 5 apps must wait for each to finish before starting the next, and a clustered app requires 3 separate deploy operations.

Phase 13 removes both limitations while keeping the safety guarantees that prevent conflicting deploys to the same app+env.

### Architecture

#### Thread Pool Executor
```java
// Replace SingleThreadExecutor
@Value("${wizardcd.jobs.max-concurrent:5}")
private int maxConcurrentJobs;

private ExecutorService jobExecutor;

@PostConstruct
void init() {
    jobExecutor = Executors.newFixedThreadPool(maxConcurrentJobs);
}
```

#### Concurrency Lock (Per App+Env)
```java
// Prevents two deploys to same app+env from overlapping
private final ConcurrentHashMap<String, UUID> appEnvLocks = new ConcurrentHashMap<>();

private String lockKey(String appName, String env) {
    return appName.toLowerCase() + ":" + env.toLowerCase();
}

// Before executing:
boolean acquired = appEnvLocks.putIfAbsent(lockKey, jobId) == null;
if (!acquired) {
    // Queue this job — another deploy to same app+env is running
    jobQueue.add(new QueuedJob(jobId, lockKey, priority));
    updateStatus(jobId, QUEUED, "Waiting for " + lockKey + " — position " + position);
    return;
}

// After completion (finally block):
appEnvLocks.remove(lockKey, jobId);
// Check queue for next job waiting on this lockKey
drainQueue(lockKey);
```

#### Multi-VM Target Model
```java
// DeploymentRequest gains a targets list
public class DeploymentTarget {
    private String host;
    private int port;
    private String label;  // e.g. "node-1", "node-2"
}

// Single-host deploys: targets list has 1 entry (backward compatible)
// Multi-VM deploys: targets list has N entries
// Deployment mode: SEQUENTIAL | PARALLEL | BATCHED
// Batch size: configurable (default 2) — only used in BATCHED mode
```

#### Deployment Modes

| Mode | Behaviour | Use case |
|------|-----------|----------|
| **Sequential** | Deploy to VM 1, wait for success, deploy to VM 2, etc. If any VM fails, stop. | Production clusters where you want to catch issues early |
| **Parallel** | Deploy to all VMs simultaneously. If any fails, report but continue others. | Dev/SIT environments, stateless apps, fast rollouts |
| **Batched** | Deploy to N VMs at a time. Wait for batch to complete before starting next batch. | Large clusters (10+ VMs) — balance speed with safety |

#### How Modes Combine with Deployment Strategies

| Strategy | + Sequential | + Parallel | + Batched |
|----------|-------------|-----------|-----------|
| **In-Place** | VM1 stop→deploy→start, VM2, VM3... | All VMs stop→deploy→start at once | Batch of N at a time |
| **Rolling** | VM1 drain→deploy→rejoin, VM2... | N/A (rolling IS sequential by nature) | Batch drain→deploy→rejoin |
| **Blue-Green** | Deploy inactive set sequentially, then swap | Deploy all inactive VMs, then swap | Deploy inactive in batches, then swap |
| **Canary** | Deploy canary VM, monitor, then rest sequentially | Deploy canary, monitor, then rest in parallel | Deploy canary, monitor, then rest in batches |

### Database Schema

```sql
-- Extend environment_configs with multi-VM targets
ALTER TABLE environment_configs ADD COLUMN deployment_targets JSONB DEFAULT '[]';
-- [{"host": "10.0.1.10", "port": 22, "label": "node-1"}, {"host": "10.0.1.11", "port": 22, "label": "node-2"}]

ALTER TABLE environment_configs ADD COLUMN deployment_mode VARCHAR(20) DEFAULT 'SEQUENTIAL';
-- SEQUENTIAL | PARALLEL | BATCHED

ALTER TABLE environment_configs ADD COLUMN batch_size INTEGER DEFAULT 2;

-- Job queue table
CREATE TABLE job_queue (
    id              BIGSERIAL PRIMARY KEY,
    job_id          UUID NOT NULL REFERENCES jobs(id),
    lock_key        VARCHAR(200) NOT NULL,   -- "appName:env"
    priority        INTEGER DEFAULT 0,        -- higher = run first
    queued_at       TIMESTAMP NOT NULL DEFAULT NOW(),
    status          VARCHAR(20) DEFAULT 'WAITING',  -- WAITING | PICKED | CANCELLED
    picked_at       TIMESTAMP,
    CONSTRAINT uq_job_queue_job UNIQUE (job_id)
);

CREATE INDEX idx_job_queue_lock ON job_queue(lock_key, status, priority DESC, queued_at);

-- Per-VM deployment tracking
CREATE TABLE job_vm_status (
    id              BIGSERIAL PRIMARY KEY,
    job_id          UUID NOT NULL REFERENCES jobs(id),
    target_host     VARCHAR(255) NOT NULL,
    target_label    VARCHAR(100),
    status          VARCHAR(30) NOT NULL,     -- PENDING | DEPLOYING | SUCCESS | FAILED | SKIPPED
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    exit_code       INTEGER,
    log_offset      INTEGER,                  -- byte offset in deploy.log for this VM's output
    error_message   TEXT,
    CONSTRAINT uq_job_vm UNIQUE (job_id, target_host)
);
```

### Job Lifecycle Extension

```
                              ┌─── QUEUED (waiting for app+env lock)
                              │
CREATED → VALIDATING → PREPARING_WORKSPACE ─┤
                                            └─── RUNNING → SUCCESS / FAILED / ABORTED

QUEUED state: job validated and ready, but another deploy to same app+env is active.
              Transitions to PREPARING_WORKSPACE when lock acquired.
```

### Runner Service Changes

```java
// RunnerServiceImpl — key changes:

// 1. Thread pool replaces SingleThreadExecutor
private final ExecutorService jobExecutor;

// 2. Submit returns immediately — job may queue
public JobResponse submit(DeploymentRequest request, ...) {
    // ... validate, create workspace ...
    String lockKey = lockKey(request.getAppName(), request.getEnvironment());
    if (appEnvLocks.putIfAbsent(lockKey, jobId) != null) {
        enqueue(jobId, lockKey);
        updateStatus(jobId, QUEUED);
        return new JobResponse(jobId, QUEUED, ...);
    }
    jobExecutor.submit(() -> executeWithLock(jobId, lockKey, request));
    return new JobResponse(jobId, RUNNING, ...);
}

// 3. Multi-VM execution
private void executeMultiVm(UUID jobId, DeploymentRequest request, List<DeploymentTarget> targets) {
    String mode = request.getDeploymentMode();  // SEQUENTIAL, PARALLEL, BATCHED
    int batchSize = request.getBatchSize();

    switch (mode) {
        case "SEQUENTIAL" -> executeSequential(jobId, request, targets);
        case "PARALLEL"   -> executeParallel(jobId, request, targets);
        case "BATCHED"    -> executeBatched(jobId, request, targets, batchSize);
    }
}

private void executeSequential(UUID jobId, DeploymentRequest req, List<DeploymentTarget> targets) {
    for (DeploymentTarget target : targets) {
        updateVmStatus(jobId, target.getHost(), DEPLOYING);
        int exitCode = runDeployScript(jobId, req, target);
        updateVmStatus(jobId, target.getHost(), exitCode == 0 ? SUCCESS : FAILED, exitCode);
        if (exitCode != 0) {
            // Mark remaining as SKIPPED
            skipRemaining(jobId, targets, target);
            throw new DeploymentFailedException("Failed on " + target.getLabel());
        }
    }
}

private void executeParallel(UUID jobId, DeploymentRequest req, List<DeploymentTarget> targets) {
    List<CompletableFuture<VmResult>> futures = targets.stream()
        .map(t -> CompletableFuture.supplyAsync(() -> {
            updateVmStatus(jobId, t.getHost(), DEPLOYING);
            int exitCode = runDeployScript(jobId, req, t);
            updateVmStatus(jobId, t.getHost(), exitCode == 0 ? SUCCESS : FAILED, exitCode);
            return new VmResult(t, exitCode);
        }, vmExecutor))
        .toList();

    List<VmResult> results = futures.stream()
        .map(CompletableFuture::join)
        .toList();

    if (results.stream().anyMatch(r -> r.exitCode != 0)) {
        throw new DeploymentFailedException("Failed on: " + failedHosts(results));
    }
}

private void executeBatched(UUID jobId, DeploymentRequest req, List<DeploymentTarget> targets, int batchSize) {
    List<List<DeploymentTarget>> batches = partition(targets, batchSize);
    for (int i = 0; i < batches.size(); i++) {
        log.info("[job={}] Deploying batch {}/{} ({} VMs)", jobId, i+1, batches.size(), batches.get(i).size());
        executeParallel(jobId, req, batches.get(i));  // Each batch runs in parallel
    }
}
```

### deploy.sh Changes

```bash
# deploy.sh gains --target-host and --target-label flags
# For multi-VM, runner-service-ms calls deploy.sh N times (once per VM)
# Each call gets a different --target-host override

# Log isolation: per-VM logs written to:
#   workspace/jobs/<jobId>/logs/deploy-<label>.log
# Combined view: deploy.log aggregates all VM logs with [node-1] prefix
```

### UI Changes

#### Deploy Wizard — Step 1 (SSH Target)
```
┌──────────────────────────────────────────────────┐
│ SSH TARGET CONFIGURATION                          │
│ Environment: [DEV] [SIT] [UAT] [PROD]            │
│                                                    │
│ Target VMs:                                        │
│ ┌──────────────────────────────────────────┐      │
│ │ node-1  │  deploy@10.0.1.10:22   [✕]    │      │
│ │ node-2  │  deploy@10.0.1.11:22   [✕]    │      │
│ └──────────────────────────────────────────┘      │
│ [+ Add Target VM]                                  │
│                                                    │
│ Deployment Mode:                                   │
│ [Sequential ●]  [Parallel]  [Batched (size: 2)]   │
│                                                    │
│ SSH User: deploy   SSH Port: 22                    │
│ Target Base Path: /app/home/deploy/deployments     │
└──────────────────────────────────────────────────┘
```

- Single VM: existing UX unchanged (one host field, no mode selector)
- Multi-VM: "Add Target VM" button reveals additional rows; mode selector appears when >1 VM
- SSH User, Port, Base Path shared across all VMs in the same environment
- Each VM gets its own connection test

#### Job Detail — Multi-VM Progress
```
┌──────────────────────────────────────────────────┐
│ DEPLOYMENT PROGRESS — 3 VMs (Batched, size 2)    │
│                                                    │
│ Batch 1/2:                                         │
│   ✓ node-1 (10.0.1.10)    42s    [View logs]     │
│   ✓ node-2 (10.0.1.11)    38s    [View logs]     │
│                                                    │
│ Batch 2/2:                                         │
│   ⟳ node-3 (10.0.1.12)    12s... [View logs]     │
└──────────────────────────────────────────────────┘
```

#### Dashboard — Queue Indicator
- QUEUED status badge (amber): shown when job is waiting for app+env lock
- Queue position shown: "Queued (2nd in line)"
- Active jobs counter in header: "3/5 slots active"

### API Changes

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/jobs/:id/status` | Add `queuePosition`, `vmStatuses[]` fields |
| `GET` | `/jobs/:id/vm-logs/:label` | NEW — per-VM log streaming |
| `GET` | `/runner/capacity` | NEW — `{ maxConcurrent, active, queued }` |

### Settings

```yaml
# application.yaml
wizardcd:
  jobs:
    max-concurrent: 5        # Thread pool size (1 = current behaviour)
    queue-max-size: 50       # Max jobs waiting in queue before rejection
  vm:
    parallel-threads: 3      # Max VMs deployed simultaneously in parallel/batched mode
```

### Build Order Within Phase 13

| Sub-phase | What | Days |
|-----------|------|------|
| 13.1 | Thread pool executor + capacity endpoint + settings | 1 |
| 13.2 | App+env concurrency lock + QUEUED state + queue table | 1 |
| 13.3 | Queue drain logic + position tracking + dashboard indicators | 1 |
| 13.4 | Multi-VM target model (DB schema + DeploymentRequest + environment config) | 1 |
| 13.5 | Sequential + Parallel + Batched execution modes | 1 |
| 13.6 | Per-VM status tracking + per-VM log isolation | 0.5 |
| 13.7 | UI: multi-VM target input + mode selector + per-VM progress in job detail | 1.5 |
| 13.8 | deploy.sh `--target-host` / `--target-label` support | 0.5 |

#### Deployment Dependencies (Service Ordering)

> **"Deploy config-server before api-gateway before my-service."** Microservice teams need ordered deployments when services depend on each other.

```sql
CREATE TABLE app_dependencies (
    id              UUID PRIMARY KEY,
    app_id          UUID NOT NULL REFERENCES applications(id),
    depends_on_id   UUID NOT NULL REFERENCES applications(id),
    env_name        VARCHAR(20),                     -- NULL = all envs, or specific env
    dependency_type VARCHAR(20) DEFAULT 'DEPLOY_FIRST', -- DEPLOY_FIRST, HEALTH_CHECK
    description     TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(app_id, depends_on_id, env_name)
);
```

**Dependency types:**
| Type | Behaviour |
|------|-----------|
| `DEPLOY_FIRST` | Dependent app must have a successful deploy in this env BEFORE this app can deploy |
| `HEALTH_CHECK` | Dependent app must be 🟢 healthy (Phase 11.7) at deploy time |

**How it works:**
1. User configures dependencies in App Settings: "api-gateway depends on config-server"
2. At deploy time, `DeploymentValidatorService` checks:
   - `DEPLOY_FIRST`: Does config-server have a successful deploy to this env? If not → blocked with message
   - `HEALTH_CHECK`: Is config-server currently 🟢 in this env (via Phase 11.7)? If not → blocked with message
3. Dependencies shown in deploy wizard Step 4 (Review): "Dependencies: config-server ✓ healthy"
4. Circular dependency detection at config time (topological sort)

**Grouped deployment (deploy chain):**
```
App Settings → Dependencies → "Deploy Chain"

┌──────────────────────────────────────────────┐
│ DEPLOYMENT ORDER — eureka-registry-ms → UAT   │
│                                                │
│ 1. config-server     (dependency — must be ✓) │
│ 2. eureka-registry   (this app)               │
│ 3. api-gateway       (depends on this)        │
│                                                │
│ [ Deploy Chain ] — deploys all 3 in order     │
│ [ Deploy This Only ] — just this app          │
└──────────────────────────────────────────────┘
```

- **Deploy Chain** button: creates linked jobs for the entire dependency chain in order
- Each job waits for the previous to reach SUCCESS before starting
- If any job in the chain fails → remaining jobs are cancelled
- Chain progress shown in dashboard as grouped deployment

**UI — App Settings:**
```
App Detail → Settings → Dependencies

Dependencies (apps that must be deployed/healthy before this app):
┌────────────────────────────────────────────────────┐
│ config-server   │ Type: Health Check  │ All envs [✕]│
│ eureka-registry │ Type: Deploy First  │ PROD only[✕]│
└────────────────────────────────────────────────────┘
[+ Add Dependency]

Dependents (apps that depend on this app):
  api-gateway, notification-service
```

### What It Unlocks
- **Team productivity**: 5 developers can deploy 5 different apps simultaneously
- **Cluster deployments**: Deploy to 3-node app cluster in one operation with safety modes
- **Queue visibility**: No more "is my deploy stuck?" — clear queue position and capacity
- **Backward compatible**: `max-concurrent: 1` preserves V1 single-threaded behaviour
- **Foundation for Phase 14**: Thread pool + queue pattern extends naturally to multi-runner
- **Service ordering**: Deploy microservices in the right order without manual coordination
- **Chain deployments**: One-click deployment of an entire service stack in dependency order

### UI Acceptance Tests — Phase 13

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 13.1 | **Single job still works** | Submit one deploy with default settings | Deploys exactly as before. No queue, no multi-VM UI. Regression-free. |
| 13.2 | **Two different apps deploy concurrently** | Submit deploy for App-A/UAT, immediately submit deploy for App-B/UAT | Both jobs show RUNNING simultaneously. Dashboard shows "2/5 slots active". Both complete independently. |
| 13.3 | **Same app+env queues** | Submit deploy for App-A/UAT, immediately submit another deploy for App-A/UAT | Second job shows QUEUED with "Waiting for app-a:uat — position 1". First completes → second auto-starts. |
| 13.4 | **Queue position updates** | Submit 3 deploys for same app+env | Jobs show positions 1, 2. As first completes, positions decrement. Third job eventually runs. |
| 13.5 | **Capacity limit reached** | Set max-concurrent=2, submit 3 different app deploys | First 2 run, third queues. When one finishes, third auto-starts. |
| 13.6 | **Abort queued job** | Queue a job, then abort it before it starts | Job transitions from QUEUED → ABORTED. Does not run. Queue shrinks. |
| 13.7 | **Multi-VM sequential** | Add 2 target VMs for App-A/UAT, select Sequential, deploy | VM 1 deploys first. After success, VM 2 deploys. Job detail shows per-VM status with timestamps. |
| 13.8 | **Multi-VM parallel** | Add 2 target VMs, select Parallel, deploy | Both VMs deploy simultaneously. Per-VM progress shown. Both must succeed for overall SUCCESS. |
| 13.9 | **Multi-VM batched** | Add 4 target VMs, select Batched (size 2), deploy | Batch 1 (VM 1+2) runs in parallel. After success, Batch 2 (VM 3+4) runs. Progress shows batch 1/2, 2/2. |
| 13.10 | **Sequential stops on failure** | Add 3 VMs sequential, VM 2 has wrong SSH key | VM 1 succeeds, VM 2 fails, VM 3 shows SKIPPED. Overall job FAILED. |
| 13.11 | **Parallel reports all failures** | Add 3 VMs parallel, VMs 1 and 3 have wrong SSH key | All 3 attempt. VM 2 succeeds, VMs 1 and 3 fail. Job FAILED with list of failed hosts. |
| 13.12 | **Per-VM log view** | Multi-VM deploy → click on a specific VM in job detail | Shows logs only for that VM. Switch between VMs. Combined view also available. |
| 13.13 | **Connection test per VM** | Add 3 target VMs in Step 1, run connection test | Each VM tested independently. Shows ✓/✗ per VM. Next button gated on ALL VMs passing. |
| 13.14 | **Redeploy multi-VM** | Successful multi-VM deploy → Redeploy | Redeploy preserves all target VMs and deployment mode. New JAR deployed to all VMs. |
| 13.15 | **Rollback multi-VM** | Multi-VM deploy → Rollback | Rollback executes on all VMs (same mode as original deploy). All VMs restored. |
| 13.16 | **Capacity endpoint** | `GET /runner/capacity` | Returns `{"maxConcurrent": 5, "active": 2, "queued": 1}`. Dashboard header shows slot usage. |
| 13.17 | **Configure dependency** | App Settings → Dependencies → add "config-server" as HEALTH_CHECK dependency | Dependency saved. Shown in dependency list with type and scope. |
| 13.18 | **Dependency blocks deploy** | Configure api-gateway depends on config-server (HEALTH_CHECK) → config-server is 🔴 DOWN → deploy api-gateway | Deploy blocked: "Dependency not met: config-server is DOWN in UAT. Cannot deploy api-gateway." |
| 13.19 | **Dependency passes** | config-server is 🟢 healthy → deploy api-gateway | Deploy proceeds. Step 4 Review shows: "Dependencies: config-server ✓ healthy". |
| 13.20 | **Deploy chain** | Configure 3-app chain → click "Deploy Chain" on root app | 3 linked jobs created. Execute in order: config-server → eureka → api-gateway. Dashboard shows grouped deployment with chain progress. |
| 13.21 | **Chain stops on failure** | Deploy chain of 3 apps → second app fails | Third app cancelled automatically. Chain status: "Failed at eureka-registry — api-gateway cancelled". |
| 13.22 | **Circular dependency rejected** | Try to add: A depends on B, B depends on C, C depends on A | Error: "Circular dependency detected: A → B → C → A". Configuration rejected. |

**Pass criteria:** All 22 tests pass. Parallel job execution, queue management, multi-VM deployment, and service dependencies all work. Single-VM deploys are unchanged. Chain deployments execute in correct order.

---

## Phase 14 — Multi-Runner Horizontal Scaling (8–10 days)

> **FUTURE PHASE** — This phase is designed but not scheduled for immediate implementation. A single runner with Phase 13's parallel job support handles most workloads comfortably. Multi-runner scaling will be implemented as user adoption grows and the platform demands horizontal capacity. The architecture is documented here so it can be picked up when the need arises.

**Prerequisite:** Phase 4 (Database), Phase 13 (Parallel Jobs)

### What It Does
1. **Multiple runner instances** — Run 2+ runner-service-ms instances behind a load balancer
2. **Distributed job execution** — Any runner can pick up any job; no single point of failure
3. **Database-level locking** — PostgreSQL advisory locks replace in-memory `ConcurrentHashMap`
4. **Shared storage** — Job workspaces on shared filesystem (EFS/NFS) or object storage (S3)
5. **Runner health heartbeat** — Runners register themselves and report health; stale runners detected

### Why This Matters
Phase 13 scales jobs vertically (more threads on one runner). Phase 14 scales horizontally — add more runner VMs to handle more deployments. This is the enterprise scaling story:
- **High availability**: if one runner VM dies, others continue processing
- **Geographic distribution**: runners in different regions for lower latency to targets
- **Resource isolation**: heavy deployments on dedicated runner VMs

### Architecture

```
                    ┌──────────────────┐
                    │   Load Balancer   │
                    │   (ALB / Nginx)   │
                    └─────┬────┬───────┘
                          │    │
              ┌───────────┘    └───────────┐
              ▼                            ▼
     ┌─────────────────┐        ┌─────────────────┐
     │  Runner VM 1     │        │  Runner VM 2     │
     │  runner-service   │        │  runner-service   │
     │  :8081            │        │  :8081            │
     └────────┬─────────┘        └────────┬─────────┘
              │                            │
              ▼                            ▼
     ┌──────────────────────────────────────────┐
     │          PostgreSQL (shared)              │
     │   jobs | job_queue | runner_instances     │
     └──────────────────────────────────────────┘
              │                            │
              ▼                            ▼
     ┌──────────────────────────────────────────┐
     │    Shared Storage (EFS / NFS / S3)       │
     │   /opt/wizardcd/workspace/jobs/          │
     └──────────────────────────────────────────┘
```

### Database Schema

```sql
-- Runner instance registry
CREATE TABLE runner_instances (
    id              VARCHAR(50) PRIMARY KEY,   -- hostname or UUID
    hostname        VARCHAR(255) NOT NULL,
    public_ip       VARCHAR(45),
    port            INTEGER DEFAULT 8081,
    status          VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE | DRAINING | OFFLINE
    version         VARCHAR(50),               -- runner-service-ms version
    max_concurrent  INTEGER DEFAULT 5,
    active_jobs     INTEGER DEFAULT 0,
    last_heartbeat  TIMESTAMP NOT NULL DEFAULT NOW(),
    registered_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata        JSONB                      -- OS, Java version, region, tags
);

-- Jobs table gains runner assignment
ALTER TABLE jobs ADD COLUMN runner_id VARCHAR(50) REFERENCES runner_instances(id);
ALTER TABLE jobs ADD COLUMN picked_at TIMESTAMP;

-- Distributed lock table (alternative to pg_advisory_lock for visibility)
CREATE TABLE deployment_locks (
    lock_key        VARCHAR(200) PRIMARY KEY,  -- "appName:env"
    job_id          UUID NOT NULL REFERENCES jobs(id),
    runner_id       VARCHAR(50) NOT NULL REFERENCES runner_instances(id),
    acquired_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMP NOT NULL         -- heartbeat-based expiry
);
```

### Distributed Locking with PostgreSQL

```java
@Service
public class DistributedLockService {

    private final JdbcTemplate jdbc;

    /**
     * Try to acquire app+env lock. Uses PostgreSQL advisory lock
     * for atomic, deadlock-free locking across runner instances.
     *
     * Advisory lock key: hash of "appName:env" string
     */
    public boolean tryAcquire(String appName, String env, UUID jobId, String runnerId) {
        long lockKey = hashLockKey(appName + ":" + env);

        // pg_try_advisory_lock returns true if lock acquired, false if held by another session
        Boolean acquired = jdbc.queryForObject(
            "SELECT pg_try_advisory_lock(?)", Boolean.class, lockKey);

        if (Boolean.TRUE.equals(acquired)) {
            // Record lock ownership for visibility and expiry
            jdbc.update("""
                INSERT INTO deployment_locks (lock_key, job_id, runner_id, acquired_at, expires_at)
                VALUES (?, ?, ?, NOW(), NOW() + INTERVAL '30 minutes')
                ON CONFLICT (lock_key) DO UPDATE
                SET job_id = ?, runner_id = ?, acquired_at = NOW(), expires_at = NOW() + INTERVAL '30 minutes'
                """, appName + ":" + env, jobId, runnerId, jobId, runnerId);
            return true;
        }
        return false;
    }

    public void release(String appName, String env) {
        long lockKey = hashLockKey(appName + ":" + env);
        jdbc.queryForObject("SELECT pg_advisory_unlock(?)", Boolean.class, lockKey);
        jdbc.update("DELETE FROM deployment_locks WHERE lock_key = ?", appName + ":" + env);
    }

    private long hashLockKey(String key) {
        // Consistent hash to fit PostgreSQL bigint advisory lock parameter
        return key.hashCode() & 0x7FFFFFFFL;
    }
}
```

### Runner Heartbeat

```java
@Service
public class RunnerHeartbeatService {

    @Value("${wizardcd.runner.id:#{T(java.net.InetAddress).getLocalHost().getHostName()}}")
    private String runnerId;

    @Scheduled(fixedRate = 15_000)  // Every 15 seconds
    public void heartbeat() {
        jdbc.update("""
            UPDATE runner_instances
            SET last_heartbeat = NOW(), active_jobs = ?
            WHERE id = ?
            """, activeJobCount(), runnerId);
    }

    @PostConstruct
    public void register() {
        jdbc.update("""
            INSERT INTO runner_instances (id, hostname, public_ip, port, max_concurrent, version)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE
            SET hostname = ?, public_ip = ?, status = 'ACTIVE', last_heartbeat = NOW()
            """, runnerId, hostname, publicIp, port, maxConcurrent, version,
                hostname, publicIp);
    }

    // Detect stale runners (no heartbeat for 60 seconds)
    @Scheduled(fixedRate = 30_000)
    public void detectStaleRunners() {
        List<String> stale = jdbc.queryForList("""
            SELECT id FROM runner_instances
            WHERE status = 'ACTIVE' AND last_heartbeat < NOW() - INTERVAL '60 seconds'
            """, String.class);

        for (String staleId : stale) {
            log.warn("Runner {} missed heartbeat — marking OFFLINE", staleId);
            jdbc.update("UPDATE runner_instances SET status = 'OFFLINE' WHERE id = ?", staleId);
            // Requeue any jobs assigned to stale runner that haven't completed
            requeueOrphanedJobs(staleId);
        }
    }
}
```

### Distributed Job Queue

```java
@Service
public class DistributedJobQueueService {

    /**
     * Poll for next available job. Uses SELECT ... FOR UPDATE SKIP LOCKED
     * to prevent two runners from picking the same job.
     */
    @Transactional
    public Optional<QueuedJob> pollNext(String runnerId, int capacity) {
        if (capacity <= 0) return Optional.empty();

        return jdbc.query("""
            SELECT jq.id, jq.job_id, jq.lock_key, jq.priority
            FROM job_queue jq
            WHERE jq.status = 'WAITING'
            ORDER BY jq.priority DESC, jq.queued_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
            """, rs -> {
                if (!rs.next()) return Optional.empty();

                UUID jobId = UUID.fromString(rs.getString("job_id"));
                String lockKey = rs.getString("lock_key");

                // Check if app+env lock is available
                String[] parts = lockKey.split(":");
                if (!distributedLockService.tryAcquire(parts[0], parts[1], jobId, runnerId)) {
                    return Optional.empty();  // Lock held — skip, try next poll cycle
                }

                // Mark as picked
                jdbc.update("""
                    UPDATE job_queue SET status = 'PICKED', picked_at = NOW()
                    WHERE job_id = ?
                    """, jobId);
                jdbc.update("UPDATE jobs SET runner_id = ?, picked_at = NOW() WHERE id = ?",
                    runnerId, jobId);

                return Optional.of(new QueuedJob(jobId, lockKey));
            });
    }

    @Scheduled(fixedDelay = 2_000)  // Poll every 2 seconds
    public void pollAndExecute() {
        int available = maxConcurrent - activeJobCount();
        pollNext(runnerId, available).ifPresent(this::executeJob);
    }
}
```

### Shared Storage Options

| Option | Pros | Cons | Best for |
|--------|------|------|----------|
| **AWS EFS** | Fully managed, auto-scales, POSIX-compatible | ~3× EBS cost, higher latency | AWS deployments, simple setup |
| **NFS server** | Low cost, simple, any cloud | Single point of failure, manual setup | On-prem, small clusters |
| **S3 + local cache** | Unlimited, cheapest, durable | Not POSIX, requires sync logic | Large deployments, cross-region |

**Recommended approach for WizardCD:**
- Job workspace created on shared storage (EFS) → any runner can access
- SSH keys on shared storage or replicated via DB (encrypted)
- Logs written to shared storage → any runner can serve log API
- JAR uploads stored on shared storage → no need to transfer between runners

### Runner Administration UI

```
Settings → Runner Management (ADMIN only)

┌──────────────────────────────────────────────────┐
│ RUNNER INSTANCES                                  │
│                                                    │
│ ● runner-1 (54.144.235.55)    ACTIVE              │
│   3/5 slots  │  v0.0.2  │  us-east-1            │
│   Last heartbeat: 3s ago                          │
│   [Drain]  [Remove]                               │
│                                                    │
│ ● runner-2 (54.144.235.56)    ACTIVE              │
│   1/5 slots  │  v0.0.2  │  us-east-1            │
│   Last heartbeat: 1s ago                          │
│   [Drain]  [Remove]                               │
│                                                    │
│ ○ runner-3 (54.144.235.57)    OFFLINE             │
│   0/5 slots  │  v0.0.1  │  eu-west-1            │
│   Last heartbeat: 5m ago  ⚠ Stale                │
│   [Reactivate]  [Remove]                          │
│                                                    │
│ Total capacity: 15 slots  │  Active: 4 jobs      │
│ Queue depth: 2 jobs                               │
└──────────────────────────────────────────────────┘
```

**Drain mode**: Runner stops accepting new jobs, completes current jobs, then can be safely shut down for maintenance or upgrade.

### API Changes

| Method | Path | Change |
|--------|------|--------|
| `GET` | `/admin/runners` | List all runner instances with status |
| `POST` | `/admin/runners/:id/drain` | Set runner to DRAINING mode |
| `POST` | `/admin/runners/:id/activate` | Reactivate a drained/offline runner |
| `DELETE` | `/admin/runners/:id` | Remove runner from registry |
| `GET` | `/admin/runners/capacity` | Aggregate capacity across all runners |

### Configuration

```yaml
# application.yaml — per-runner config
wizardcd:
  runner:
    id: ${HOSTNAME:runner-1}           # Unique runner identifier
    max-concurrent: 5                   # This runner's thread pool size
  queue:
    poll-interval: 2000                 # ms between queue polls
    stale-runner-threshold: 60          # seconds before runner marked offline
  storage:
    type: efs                           # efs | nfs | s3 | local
    workspace-path: /mnt/efs/wizardcd/workspace
    ssh-keys-path: /mnt/efs/wizardcd/ssh-keys
```

### Build Order Within Phase 14

| Sub-phase | What | Days |
|-----------|------|------|
| 14.1 | `runner_instances` table + heartbeat service + registration | 1 |
| 14.2 | Replace in-memory locks with `DistributedLockService` (pg_advisory_lock) | 1 |
| 14.3 | Distributed job queue (`SELECT ... FOR UPDATE SKIP LOCKED`) | 1.5 |
| 14.4 | Shared storage setup (EFS mount + workspace paths) | 1 |
| 14.5 | SSH key replication (shared storage or DB-encrypted) | 0.5 |
| 14.6 | Stale runner detection + orphaned job requeue | 1 |
| 14.7 | Runner drain mode (graceful shutdown for upgrades) | 0.5 |
| 14.8 | Admin UI: runner management panel + capacity dashboard | 1.5 |
| 14.9 | Load balancer configuration + health check endpoint | 0.5 |
| 14.10 | Integration testing with 2+ runners | 1 |

### What It Unlocks
- **High availability**: No single point of failure for the deployment platform itself
- **Horizontal scaling**: Add runner VMs to handle enterprise workload (50+ concurrent deploys)
- **Rolling upgrades**: Drain runner → upgrade → reactivate, zero downtime for the platform
- **Geographic distribution**: Runners close to target VMs for faster artifact transfer
- **Enterprise readiness**: Multi-runner is the standard for production deployment platforms

### UI Acceptance Tests — Phase 14

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 14.1 | **Single runner still works** | Deploy with only 1 runner instance registered | Exact same behaviour as Phase 13. No regression. |
| 14.2 | **Runner registers on startup** | Start runner-service-ms → check Admin → Runner Management | New runner appears with ACTIVE status, hostname, version, capacity. |
| 14.3 | **Heartbeat visible** | Admin → Runner Management → observe a runner | "Last heartbeat: Xs ago" updates every 15 seconds. |
| 14.4 | **Job assigned to runner** | Submit deploy → check job detail | Job shows "Runner: runner-1" field. Logs served from correct runner. |
| 14.5 | **Load distributed across runners** | 2 runners active, submit 4 deploys for different apps | Jobs distributed — both runners pick up work. Neither runner gets all 4. |
| 14.6 | **App+env lock works across runners** | Runner-1 deploys App-A/UAT, Runner-2 submits App-A/UAT | Second job QUEUED on Runner-2. Starts after Runner-1's job completes. Lock is cross-runner. |
| 14.7 | **Drain mode** | Admin → Drain runner-2 → submit new deploy | Runner-2 shows DRAINING. New job assigned to runner-1 only. Runner-2 completes its current job. |
| 14.8 | **Drain completion** | Drain runner → wait for current jobs to finish | Runner transitions to DRAINING with 0 active jobs. Safe to shut down. |
| 14.9 | **Stale runner detected** | Stop runner-2 process (kill) → wait 60s | Admin shows runner-2 as OFFLINE with warning. Orphaned jobs requeued to runner-1. |
| 14.10 | **Orphaned job recovery** | Runner-2 dies mid-deploy → wait for stale detection | Failed job on runner-2 marked FAILED. Any queued jobs for that runner reassigned. |
| 14.11 | **Runner reactivation** | Admin → Reactivate offline runner → start runner process | Runner goes back to ACTIVE. Starts picking up jobs from queue. |
| 14.12 | **Aggregate capacity** | 2 runners (5 slots each) → check dashboard | "Total capacity: 10 slots / Active: X jobs / Queue: Y". Individual runner breakdown visible. |
| 14.13 | **Shared workspace access** | Runner-1 starts deploy, Runner-2 serves GET /jobs/:id/logs | Logs accessible from either runner (shared storage). No 404 or empty response. |
| 14.14 | **Runner removal** | Admin → Remove offline runner | Runner disappears from list. No orphaned references. |
| 14.15 | **Version mismatch warning** | Runner-1 v0.0.2, Runner-2 v0.0.1 → check Admin | Warning icon on runner-2: "Version mismatch — consider upgrading". |

**Pass criteria:** All 15 tests pass. Multi-runner deployment, distributed locking, heartbeat, drain mode, and failover all work. Single-runner setup is unchanged.

---

## Phase 15 — Subscription, Billing & Cost Management (4–5 days)

**Prerequisite:** Phase 14 (all platform features complete — you now know exactly what to monetise)

**Goal:** Monetisation layer — subscription tiers, feature gating, billing, cost tracking, and revenue analytics. Built last because you need the full platform picture before deciding what goes in each tier.

### Why Last?

Building subscriptions after all features are complete gives you:
1. **Informed tier design** — you know which features are high-value (multi-runner, strategies, auto-rollback) vs baseline (deploy, rollback, secrets)
2. **Real usage data** — Phase 11's usage dashboard shows which features teams actually use, informing what to gate
3. **No premature limits** — during development phases 4–14, everything runs unlimited (no friction for testing)
4. **Feature-complete demo** — prospects can evaluate the full platform before hitting any paywall

### Subscription Tiers

| Tier | Apps | Users | Envs | Runners | VMs/App | Key Features | Price (example) |
|------|------|-------|------|---------|---------|-------------|----------------|
| **Free** | 3 | 5 | DEV, SIT | 1 | 1 | In-Place deploy, manual upload, Java only | $0 |
| **Team** | 15 | 25 | All 4 | 1 | 3 | All strategies, all runtimes, webhooks, secrets (built-in) | $49/month |
| **Business** | 50 | 100 | All 4 + custom | 3 | 10 | Multi-VM, auto-rollback, external secret providers, DORA metrics | $199/month |
| **Enterprise** | Unlimited | Unlimited | Unlimited | Unlimited | Unlimited | Multi-runner, SSO, audit export, priority support, custom integrations | Custom |

> **Note:** Tiers are fully configurable by the platform admin. These are example defaults. Self-hosted customers can disable tier limits entirely via `wizardcd.billing.enabled=false`.

### What We Build

#### 15.1 Subscription Plan Management

```
Settings → Subscription & Billing (ADMIN only)

┌──────────────────────────────────────────────────────────────┐
│ CURRENT PLAN                                                  │
│                                                               │
│ ┌─────────────────────────────────────────────────────┐      │
│ │  TEAM PLAN                          $49/month       │      │
│ │  Renews: April 24, 2026                             │      │
│ │  Payment: Visa ending 4242                          │      │
│ │                                                     │      │
│ │  Usage:                                             │      │
│ │  Apps:    8 / 15   ████████░░░░░░░  53%            │      │
│ │  Users:   12 / 25  █████████░░░░░░  48%            │      │
│ │  Runners: 1 / 1    ███████████████  100%           │      │
│ │  VMs/App: 2 / 3    ██████████░░░░░  67%            │      │
│ │                                                     │      │
│ │  [Upgrade Plan]   [Manage Billing]                  │      │
│ └─────────────────────────────────────────────────────┘      │
│                                                               │
│ USAGE COST BREAKDOWN (this billing period)                    │
│ ┌─────────────────────────────────────────────────────┐      │
│ │  Base plan:              $49.00                      │      │
│ │  Additional runners:     $0.00  (0 extra × $25/mo)  │      │
│ │  Overage (apps):         $0.00  (within limit)      │      │
│ │  ─────────────────────────────────                   │      │
│ │  Current total:          $49.00                      │      │
│ │                                                      │      │
│ │  Projected next month:   $49.00  (no overage trend)  │      │
│ └─────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

#### 15.2 Feature Gating

```java
@Service
public class FeatureGateService {

    /**
     * Check if a feature is available on the org's current plan.
     * Features are stored as JSONB array in subscription_plans.
     */
    public boolean isFeatureEnabled(Long orgId, String feature) {
        SubscriptionPlan plan = getActivePlan(orgId);
        return plan.getFeatures().contains(feature);
    }

    public void requireFeature(Long orgId, String feature) {
        if (!isFeatureEnabled(orgId, feature)) {
            SubscriptionPlan plan = getActivePlan(orgId);
            throw new FeatureNotAvailableException(
                "%s is not available on your %s plan. Upgrade to unlock this feature."
                    .formatted(FEATURE_LABELS.get(feature), plan.getDisplayName()));
        }
    }
}
```

**Gated features by tier:**

| Feature key | Free | Team | Business | Enterprise |
|------------|------|------|----------|------------|
| `deploy_strategies` | In-Place only | All | All | All |
| `multi_vm` | - | Up to 3 | Up to 10 | Unlimited |
| `multi_runner` | - | - | - | Yes |
| `auto_rollback` | - | - | Yes | Yes |
| `external_secrets` | - | - | Yes (AWS/Vault/Azure/GCP) | Yes |
| `all_runtimes` | Java only | All | All | All |
| `webhooks` | - | Yes | Yes | Yes |
| `dora_metrics` | - | - | Yes | Yes |
| `audit_export` | - | - | - | Yes |
| `custom_envs` | - | - | Yes | Yes |
| `sso` | - | - | - | Yes |

#### 15.3 Limit Enforcement

```java
@Service
public class SubscriptionLimitService {

    public void checkLimit(Long orgId, LimitType type) {
        Subscription sub = subscriptionRepo.findActiveByOrg(orgId);
        SubscriptionPlan plan = sub.getPlan();

        int current = switch (type) {
            case APPS    -> appRepo.countByOrg(orgId);
            case USERS   -> userRepo.countByOrg(orgId);
            case RUNNERS -> runnerRepo.countByOrg(orgId);
            case VMS_PER_APP -> 0;  // checked per-app at deploy time
        };

        Integer max = switch (type) {
            case APPS    -> plan.getMaxApps();
            case USERS   -> plan.getMaxUsers();
            case RUNNERS -> plan.getMaxRunners();
            case VMS_PER_APP -> plan.getMaxVmsPerApp();
        };

        if (max != null && current >= max) {
            throw new LimitExceededException(
                "Your %s plan allows %d %s. Upgrade to add more."
                    .formatted(plan.getDisplayName(), max, type.label()));
        }
    }
}
```

**UI limit enforcement UX:**
- Soft warning at 80% usage: amber banner "You're using 12 of 15 apps"
- Hard block at limit: modal with upgrade CTA showing next tier comparison
- Feature gate: disabled button + "Available on Business plan" tooltip

#### 15.4 Revenue & Cost Dashboard (Platform Operator)

```
Admin → Revenue & Costs

┌──────────────────────────────────────────────────────────────┐
│ REVENUE OVERVIEW                         Last 12 months ▼    │
│                                                               │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│ │  $2,847  │  │    14    │  │   $203   │  │   4.2%   │     │
│ │   MRR    │  │  Active  │  │  ARPU    │  │  Churn   │     │
│ │          │  │  Subs    │  │          │  │          │     │
│ └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│                                                               │
│ Revenue Trend                │  Subscriptions by Tier        │
│ ┌─────────────────────┐     │  ┌────────────────────────┐   │
│ │          ▄▄██████   │     │  │ Free:       5          │   │
│ │      ▄▄██████████   │     │  │ Team:       6  ████    │   │
│ │  ▄▄██████████████   │     │  │ Business:   2  ██      │   │
│ │  J  F  M  A  M  J   │     │  │ Enterprise: 1  █       │   │
│ └─────────────────────┘     │  └────────────────────────┘   │
│                                                               │
│ Infrastructure Cost (self-hosted estimate)                    │
│ ┌─────────────────────────────────────────────────────┐      │
│ │  Runner VMs (2× m5.large):    $140/month            │      │
│ │  PostgreSQL (db.t3.medium):   $65/month             │      │
│ │  EFS storage (50 GB):        $15/month              │      │
│ │  Data transfer:              ~$8/month              │      │
│ │  ──────────────────────────                         │      │
│ │  Total infrastructure:       ~$228/month            │      │
│ │  Revenue - cost:             $2,619/month margin    │      │
│ └─────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

#### 15.5 Payment Integration (Stripe)

- Stripe integration via `stripe-java` SDK
- Webhook receiver: `POST /api/webhooks/stripe` for payment events (invoice.paid, invoice.payment_failed, customer.subscription.updated)
- Auto-generate invoices on billing cycle
- Grace period (7 days) for failed payments before downgrade
- Prorated upgrades (mid-cycle plan change)
- Annual billing discount option
- Self-hosted mode: `wizardcd.billing.enabled=false` removes all billing UI + removes all limits

### Database Schema

```sql
-- Subscription plans (configurable by admin)
CREATE TABLE subscription_plans (
    id              BIGSERIAL PRIMARY KEY,
    name            VARCHAR(50) NOT NULL,          -- Free, Team, Business, Enterprise
    display_name    VARCHAR(100) NOT NULL,
    max_apps        INTEGER,                       -- NULL = unlimited
    max_users       INTEGER,
    max_envs        INTEGER,
    max_runners     INTEGER,
    max_vms_per_app INTEGER,
    features        JSONB NOT NULL DEFAULT '[]',   -- ["deploy_strategies", "multi_vm", "auto_rollback", ...]
    price_monthly   DECIMAL(10,2) DEFAULT 0,
    price_yearly    DECIMAL(10,2) DEFAULT 0,       -- annual discount
    is_active       BOOLEAN DEFAULT TRUE,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Organization subscriptions
CREATE TABLE subscriptions (
    id              BIGSERIAL PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    plan_id         BIGINT NOT NULL REFERENCES subscription_plans(id),
    status          VARCHAR(20) DEFAULT 'ACTIVE',  -- ACTIVE | PAST_DUE | CANCELLED | TRIAL
    billing_cycle   VARCHAR(10) DEFAULT 'MONTHLY', -- MONTHLY | YEARLY
    stripe_subscription_id  VARCHAR(100),           -- Stripe reference
    stripe_customer_id      VARCHAR(100),
    current_period_start  TIMESTAMP NOT NULL,
    current_period_end    TIMESTAMP NOT NULL,
    trial_ends_at   TIMESTAMP,
    cancelled_at    TIMESTAMP,
    payment_method  JSONB,                         -- { type: "card", last4: "4242", brand: "visa" }
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Usage tracking (daily snapshots — feeds cost projections)
CREATE TABLE usage_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    snapshot_date   DATE NOT NULL,
    app_count       INTEGER NOT NULL DEFAULT 0,
    user_count      INTEGER NOT NULL DEFAULT 0,
    deploy_count    INTEGER NOT NULL DEFAULT 0,
    runner_count    INTEGER NOT NULL DEFAULT 0,
    storage_bytes   BIGINT DEFAULT 0,
    CONSTRAINT uq_usage_snapshot UNIQUE (org_id, snapshot_date)
);

-- Invoice / billing history
CREATE TABLE invoices (
    id              BIGSERIAL PRIMARY KEY,
    org_id          BIGINT NOT NULL REFERENCES organizations(id),
    subscription_id BIGINT NOT NULL REFERENCES subscriptions(id),
    stripe_invoice_id  VARCHAR(100),
    period_start    TIMESTAMP NOT NULL,
    period_end      TIMESTAMP NOT NULL,
    base_amount     DECIMAL(10,2) NOT NULL,
    overage_amount  DECIMAL(10,2) DEFAULT 0,
    total_amount    DECIMAL(10,2) NOT NULL,
    status          VARCHAR(20) DEFAULT 'PENDING', -- PENDING | PAID | OVERDUE | VOID
    line_items      JSONB NOT NULL DEFAULT '[]',   -- [{ desc, qty, unit_price, amount }]
    paid_at         TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Infrastructure cost tracking (admin-entered or API-pulled)
CREATE TABLE infra_costs (
    id              BIGSERIAL PRIMARY KEY,
    month           DATE NOT NULL,                 -- first day of month
    category        VARCHAR(50) NOT NULL,          -- 'compute', 'database', 'storage', 'network'
    description     VARCHAR(200),
    amount          DECIMAL(10,2) NOT NULL,
    currency        VARCHAR(3) DEFAULT 'USD',
    source          VARCHAR(50) DEFAULT 'manual',  -- 'manual', 'aws_cost_explorer', 'azure_cost'
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_infra_cost UNIQUE (month, category, description)
);
```

### API Endpoints

```
GET  /admin/subscription              → current plan, usage, limits, features
PUT  /admin/subscription/plan         → change plan (upgrade/downgrade)
GET  /admin/subscription/plans        → list available plans with features
GET  /admin/billing/invoices          → invoice history
GET  /admin/billing/cost-breakdown    → current period breakdown + projection
POST /api/webhooks/stripe             → Stripe webhook receiver
GET  /admin/revenue/summary           → MRR, ARPU, churn, trends
GET  /admin/revenue/by-tier           → subscriber count per tier
POST /admin/infra-costs               → record infrastructure cost entry
GET  /admin/infra-costs               → infrastructure cost history + margin
GET  /admin/features/status           → all features with enabled/disabled per current plan
```

### Build Order Within Phase 15

| Sub-phase | What | Days |
|-----------|------|------|
| 15.1 | Subscription plans table + seeder (4 default tiers) + admin CRUD | 0.5 |
| 15.2 | Feature gate service + limit enforcement service | 0.5 |
| 15.3 | Wire feature gates into existing endpoints (strategies, multi-VM, runtimes, secrets, etc.) | 1 |
| 15.4 | Subscription management UI (current plan, usage bars, upgrade flow) | 1 |
| 15.5 | Stripe integration (checkout, webhooks, invoices) | 1 |
| 15.6 | Revenue & cost dashboard + infra cost tracking | 0.5 |
| 15.7 | Self-hosted mode (`billing.enabled=false` removes all limits + billing UI) | 0.5 |

### What It Unlocks
- **Monetisation ready**: clear upgrade path from free to enterprise
- **Feature-based gating**: pay for what you need (not arbitrary user counts)
- **Revenue visibility**: MRR, churn, ARPU — know your business metrics
- **Cost awareness**: infrastructure cost vs revenue margin at a glance
- **Self-hosted friendly**: one config flag removes all commercial constraints
- **Informed pricing**: built on top of real usage data from Phase 11

### UI Acceptance Tests — Phase 15

| # | Test | Steps | Expected Outcome |
|---|------|-------|-----------------|
| 15.1 | **Subscription page loads** | Admin → Settings → Subscription | Shows current plan name, price, renewal date, usage bars (apps X/Y, users X/Y, runners X/Y, VMs X/Y). |
| 15.2 | **Plan limit enforcement (apps)** | On Team plan (max 15 apps) with 15 apps → try to create 16th app | Error: "Your Team plan allows 15 applications. Upgrade to add more." Upgrade button shown. |
| 15.3 | **Plan limit enforcement (users)** | On Team plan (max 25 users) with 25 → invite 26th user | Error with upgrade CTA. User not created. |
| 15.4 | **Feature gate — strategies** | On Free plan → try to select Blue-Green strategy | Strategy tiles disabled. Tooltip: "Available on Team plan". Upgrade button visible. |
| 15.5 | **Feature gate — multi-VM** | On Free plan → try to add second target VM | "Add Target VM" disabled. "Available on Team plan" tooltip. |
| 15.6 | **Feature gate — multi-runner** | On Business plan → try to add 4th runner | "Your Business plan allows 3 runners." Enterprise upgrade CTA. |
| 15.7 | **Feature gate — external secrets** | On Team plan → Settings → Secret Provider → select AWS | "External secret providers available on Business plan." Upgrade CTA. |
| 15.8 | **Feature gate — runtimes** | On Free plan → deploy wizard → runtime selector | Only Java tile enabled. Others show lock icon + "Available on Team plan". |
| 15.9 | **80% usage warning** | Team plan with 12/15 apps → dashboard | Amber banner: "You're using 12 of 15 applications. Upgrade for more." |
| 15.10 | **Plan upgrade** | Admin → Subscription → Upgrade Plan → select Business | Plan changes immediately. New limits applied. Prorated billing shown. Previously gated features now accessible. |
| 15.11 | **Plan downgrade** | Admin → Subscription → Downgrade → select Team | Warning shown if current usage exceeds new tier limits. Must reduce usage first or downgrade proceeds at next billing cycle. |
| 15.12 | **Cost breakdown** | Admin → Subscription → Cost Breakdown | Shows: base plan cost, overage charges (if any), total for current period, projected next month. |
| 15.13 | **Invoice history** | Admin → Billing → Invoices | List of past invoices with date, amount, status (Paid/Pending). Downloadable. |
| 15.14 | **Revenue dashboard** | Platform operator → Admin → Revenue | MRR, active subscriptions, ARPU, churn rate, revenue trend chart, subscribers by tier breakdown. |
| 15.15 | **Infrastructure cost tracking** | Admin → Revenue → add infra cost "EC2 runners: $140" | Entry saved. Shown in cost list. Total infra cost calculated. Margin = revenue - cost displayed. |
| 15.16 | **Billing disabled mode** | Set `wizardcd.billing.enabled=false` → restart | Subscription page shows "Self-hosted — no billing". All plan limits removed. No payment UI. All features unlocked. Usage tracking still works. |
| 15.17 | **Stripe webhook — payment success** | Simulate Stripe `invoice.paid` webhook | Invoice status updated to PAID. No disruption to service. |
| 15.18 | **Stripe webhook — payment failed** | Simulate Stripe `invoice.payment_failed` webhook | Subscription status changes to PAST_DUE. Admin notified. 7-day grace period starts. Service continues. |

**Pass criteria:** All 18 tests pass. Subscription tiers enforce limits, feature gating works across all platform capabilities, Stripe billing processes payments, and self-hosted mode removes all restrictions.

---

## Phase Summary — The Complete Journey

```
Phase 4     Phase 5        Phase 6       Phase 7        Phase 8       Phase 9          Phase 10        Phase 11
Database    App Registry   Auth/SSO      Secrets        Strategies    Pipelines        Integrations    Analytics+Health
  │           │              │             │               │             │                │               │
  ▼           ▼              ▼             ▼               ▼             ▼                ▼               ▼
 JPA       CRUD API       GitHub/       AES-256       Blue-Green    DEV→SIT→UAT→PROD  Slack           DORA/MTTR
 Flyway    Config Mgmt    Google/Azure  5 Providers   Canary        Approvals         Webhooks        Health status
 Migrate   Orgs+Teams     SAML/LDAP     Per-env       Rolling       Scheduled         CLI tool        Uptime track
 Audit     Onboarding     RBAC+Input    Log masking   Multi-VM      Windows           API docs        Live activity
 4-5 days  6-8 days       6-8 days      13-15 days    8-10 days     7-9 days          9-11 days       7-9 days

Phase 11.5        Phase 12        Phase 13            Phase 14          Phase 15
Security+DR       Multi-Lang      Parallel+Deps       Multi-Runner      Subscriptions
  │                 │               │                   │                 │
  ▼                 ▼               ▼                   ▼                 ▼
 TLS/HTTPS        .NET           Thread pool         Distributed       Tier gating
 Rate limiting    Python         App+env locks       pg_advisory_lock  Stripe billing
 Vuln scanning    Node.js        Multi-VM targets    Shared storage    Revenue/costs
 Intrusion det    Go/Custom      Dependencies        Heartbeat/Drain   Feature gates
 Platform DR                     Deploy chains
 8-10 days        10-14 days     7-9 days            8-10 days         4-5 days
```

> **Security is woven into every phase** (see Security Touchpoints table above) — Phase 11.5 is the dedicated hardening phase for cross-cutting concerns.

**Total estimated effort: ~97–123 days of focused development**
**Total UI acceptance tests: 274 tests across 13 phases**

### Environments

WizardCD supports 4 standard environments: **DEV → SIT → UAT → PROD**

| Environment | Purpose | Who deploys | Approval needed |
|-------------|---------|-------------|-----------------|
| DEV | Development / local testing | DEPLOYER+ | No |
| SIT | System Integration Testing | DEPLOYER+ | No |
| UAT | User Acceptance Testing | DEPLOYER+ | No |
| PROD | Production | RELEASE_MANAGER+ | Yes (approval gate) |

Custom environments can be added per application (e.g. STAGING, PERF, DR).

### Build Order Rationale

| Phase | Why this order |
|-------|---------------|
| 4 Database | Everything stores data — must come first |
| 5 App Registry + Config Mgmt + Orgs | Deploy UX improvement + config overrides (your colleague's request) + saves config for all later features. Org/team foundation needed before RBAC (Phase 6) and billing (Phase 15). |
| 6 Auth + SSO | Must know WHO before we can gate WHAT. OAuth (GitHub/Google/Azure) + SAML/LDAP for enterprise teams. Input sanitisation prevents shell injection across all endpoints. |
| 7 Secrets | Need app registry to scope secrets + auth to control access. 5 providers: Built-in, AWS, Vault, Azure, GCP |
| 8 Strategies | Need multi-host env config from registry + secrets for LB creds |
| 9 Pipelines + Scheduling | Need auth (approvals) + artifacts (promotion) + secrets (per-env). Scheduled deployments for maintenance windows. |
| 10 Integrations + CLI + API Docs | Need auth (webhook secrets) + pipelines (CI triggers). Supports GitHub, Azure DevOps, GitLab, Bitbucket + generic webhook. CLI tool + Swagger API docs for developer adoption. |
| 11 Analytics + Health | Need rich DB data from all previous phases. Service health status page gives every user real-time visibility — the most-requested feature after deployment itself. |
| 11.5 Security Hardening | Needs auth (Phase 6) for identity-aware detection, secrets (Phase 7) for encryption infra, analytics (Phase 11) for anomaly baselines. Must harden BEFORE adding more attack surface (multi-lang, parallel jobs). |
| 12 Multi-Language | Core platform must be stable (Phases 4–8) and hardened (Phase 11.5) before adding runtimes. Refactors deploy pipeline behind RuntimeAdapter interface. |
| 13 Parallel Jobs + Multi-VM + Dependencies | Single-threaded executor is the biggest operational bottleneck. Multi-VM needs env config from Phase 5 + strategies from Phase 8. Service dependencies + deploy chains for microservice teams. |
| 14 Multi-Runner | **FUTURE** — enterprise scaling, implement when user adoption demands it. Single-runner + Phase 13 parallel jobs handles most workloads. |
| 15 Subscriptions | Must come LAST — requires complete platform to make informed tier/pricing decisions. Uses Phase 11 usage data to know what to monetise. |

---

## Technology Decisions

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Database (all envs) | PostgreSQL | JSONB for config snapshots, persistent across restarts, mature, free, Spring Boot native |
| Database (tests only) | H2 in-memory | Auto-disposed per test run, validates JPA/Flyway before deploying to runner VM |
| Migrations | Flyway | Industry standard, version-controlled schema |
| ORM | Spring Data JPA | Already using Spring Boot, minimal new dependencies |
| Auth | Spring Security OAuth2 | Built-in GitHub/Google/Azure support |
| JWT | `io.jsonwebtoken:jjwt` | Lightweight, widely used |
| Encryption | Java `javax.crypto` AES-256-GCM | No external dependency, FIPS-compliant |
| Secret providers | Built-in + AWS + Vault + Azure + GCP | `SecretProvider` interface, user picks in Settings |
| Connection pool | HikariCP | Spring Boot default, fastest |
| Distributed locking | PostgreSQL `pg_advisory_lock` | No external dependency, built into DB we already use, deadlock-free |
| Job queue | `SELECT ... FOR UPDATE SKIP LOCKED` | Native PostgreSQL, no message broker needed, exactly-once delivery |
| Shared storage | AWS EFS (or NFS) | POSIX-compatible, multi-runner workspace access, auto-scaling |
| TLS | Spring Boot embedded SSL + Let's Encrypt | Zero external proxy needed, auto-renewal via certbot |
| Rate limiting | Bucket4j + PostgreSQL | Token bucket algorithm, distributed-safe, Spring Boot integration |
| Vulnerability scanning | OWASP dependency-check | Scans against NVD + GitHub Advisory DB, CLI + library mode |
| File integrity | SHA-256 checksums + background scheduler | No external agent, built into runner-service-ms |
| Security headers | Spring Security `headers()` DSL | HSTS, CSP, X-Frame-Options, Referrer-Policy — zero custom code |
| Enterprise SSO | Spring Security SAML2 + LDAP | SAML 2.0 (Okta, ADFS, PingFederate) + LDAP/AD — covers OAuth + enterprise |
| CLI | TypeScript / Node.js (`pkg` for binary) | Cross-platform, NPM distribution, same language as UI |
| API docs | `springdoc-openapi` | Auto-generated Swagger UI + OpenAPI 3.0 spec from Spring controllers |
| Health checks | Custom `HealthCheckService` + scheduler | HTTP/TCP/Process checks, auto-configured per runtime type |

---

## Provider Reference — Secret Management

| Provider | Security | Complexity | Cost | Best for |
|----------|----------|-----------|------|----------|
| **WizardCD Vault (built-in)** | 🟡 Strong (software) | Lowest — zero deps | Free | Dev/SIT, small teams, zero external deps |
| **AWS Secrets Manager** | 🟢 HSM-backed | Low (if on AWS) | ~$0.40/secret/month | AWS users (recommended for our setup) |
| **HashiCorp Vault** | 🟢 HSM-optional | High (separate infra) | Free (BSL) | Enterprise, multi-cloud, on-prem |
| **Azure Key Vault** | 🟢 HSM-backed | Low (if on Azure) | ~$1/month | Azure shops |
| **GCP Secret Manager** | 🟢 Google-managed | Low (if on GCP) | ~$0.06/10k ops | GCP shops |

---

*Last updated: 2026-03-24*
