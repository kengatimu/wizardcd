# WizardCD — UX Redesign Plan
**Date:** 2026-03-17
**Author:** EBB Systems / WizardCD team
**Status:** Approved for implementation

---

## Background & Motivation

WizardCD's current deploy wizard is organised around **how the system works internally** — SSH config, then identity, then JVM internals, then process config, then backup, then file uploads. This reflects the deployment pipeline, not how a user thinks about deploying an application.

A review against fundamental UX principles revealed:

| Principle | Current State |
|-----------|--------------|
| Simplicity over complexity | ❌ JVM step exposes GC internals, heap flags, native memory concepts to all users |
| Reduce steps | ⚠️ 6 steps when most deployments need ~4 inputs |
| Users make mistakes | ❌ Main Class, JAR name, Java command path — all freeform, all error-prone |
| Obvious to users, not just devs | ❌ "Fat JAR", "NewRatio", "Tanuki", "Target Base Path" — jargon throughout |
| Users solve problems, not admire tech | ⚠️ JVM flags preview visible to all users regardless of need |
| Non-technical usability | ❌ A QA engineer or junior developer would be lost on Step 3 |

---

## The Core Philosophy Shift

**From:** Organise by internal pipeline (SSH → Identity → JVM → Process → Backup → Upload)

**To:** Organise by user decision (Where → What → How)

---

## New Wizard Structure: 3 Steps

### Step 1 — "Target Server" (Where am I deploying?)

**No changes to current Step 1 content.** Already well-designed.

- Environment (SIT / UAT / PROD)
- SSH User, SSH Host, SSH Port
- Target Base Path (renamed: "Install Directory on Server")
- Firewall Setup panel (runner IP + per-platform table)
- SSH Keys panel (per-environment public key + copy)
- Test Connection button — Next gated on passing this test

**Addition:** When connection test passes, silently detect Java installations on the target server:
```bash
find /usr/lib/jvm -name 'java' -type f 2>/dev/null | head -10
```
Store results in component state for use in Step 2.

---

### Step 2 — "Application" (What am I deploying?)

**This is the most transformed step. JAR upload moves here from Step 6 and becomes the first action.**

#### JAR Upload — top of step, large and prominent
- User drops or selects their JAR file
- Browser immediately reads `META-INF/MANIFEST.MF` from the JAR (client-side, JSZip library)
- Fields below auto-fill from the manifest
- "Auto-detected" badge shown on each auto-filled field

#### Auto-detection from JAR manifest

| Manifest key | Fills field | Notes |
|---|---|---|
| `Start-Class` | Entry Point | Spring Boot fat JARs |
| `Main-Class` | Entry Point | Standard JARs (fallback) |
| `Implementation-Title` | Application Name | Editable |
| Filename | JAR Name | Always equals upload filename |
| Presence of `BOOT-INF/` | JAR Type | fat = BOOT-INF present, thin = absent |

JAR Name and JAR Type become **hidden** (derived, not shown) — they are submitted to the backend unchanged.

#### Thin JAR: Dependencies upload — shown inline in Step 2 when detected

> **Design decision:** A thin JAR *requires* a lib ZIP to deploy successfully. Hiding this inside a collapsed accordion in Step 3 would cause silent deployment failures. The lib ZIP upload must surface immediately in context — in the same step where the thin JAR is detected.

Behaviour:
- **Fat JAR detected** (BOOT-INF/ present) → lib ZIP section is **not shown** anywhere
- **Thin JAR detected** (no BOOT-INF/) → lib ZIP upload section appears **immediately below the JAR upload** in Step 2, with a clear label:
  > "This JAR requires a separate dependencies folder. Upload a ZIP containing your `lib/*.jar` files."
- **No JAR uploaded yet** → lib ZIP section is not shown
- The lib ZIP section in the Advanced accordion (Step 3) is **removed entirely** — this is now the single location for it

This ensures the user sees the requirement at the exact moment they learn their JAR is thin — not later, not in a hidden section.

#### Remaining fields in Step 2

| Field | Old label | New label | Default |
|---|---|---|---|
| appName | App Name | Application Name | Auto from manifest |
| mainClass | Main Class | Entry Point | Auto from manifest |
| jarName | JAR Name | *hidden — derived from filename* | — |
| jarType | JAR Type (fat/thin) | *hidden — auto-detected* | — |
| javaCommand | Java Command (freeform) | Java Installation | Dropdown (see below) |
| javaVersion | Java Version | *derived from dropdown selection* | — |
| serverPort | Server Port | Port | 8080 |
| runAsUser | Run-as User | Server Account | deploy |

#### Java Installation dropdown
Replaces the freeform Java command text field.

**Preset options:**
| Label | Path filled |
|---|---|
| OpenJDK 8 | `/usr/lib/jvm/java-8-openjdk-amd64/bin/java` |
| OpenJDK 11 | `/usr/lib/jvm/java-11-openjdk-amd64/bin/java` |
| OpenJDK 17 | `/usr/lib/jvm/java-17-openjdk-amd64/bin/java` |
| OpenJDK 21 | `/usr/lib/jvm/java-21-openjdk-amd64/bin/java` |
| Temurin 17 | `/usr/lib/jvm/temurin-17-jdk-amd64/bin/java` |
| Temurin 21 | `/usr/lib/jvm/temurin-21-jdk-amd64/bin/java` |
| Temurin 25 | `/usr/lib/jvm/temurin-25-jdk-amd64/bin/java` |
| Corretto 11 | `/usr/lib/jvm/java-11-amazon-corretto/bin/java` |
| Corretto 17 | `/usr/lib/jvm/java-17-amazon-corretto/bin/java` |
| Corretto 21 | `/usr/lib/jvm/java-21-amazon-corretto/bin/java` |
| Custom path… | Shows freeform text input |

**Detected on server section** (shown only if Step 1 found Java):
- Lists actual binaries found during SSH test
- User selects one — fills the command field
- Java version extracted from selected path

---

### Step 3 — "Configuration" (How should it run?)

**Replaces current Steps 3 (JVM), 4 (Process), 5 (Backup), and remaining uploads from Step 6.**

#### Visible by default (minimal, all defaulted)

- **Backup** — toggle (on by default) + simple 1–5 release count picker

That is all. For the majority of deployments, users click through Step 3 without opening anything.

#### Advanced Settings accordion — collapsed by default

Users who need fine-grained control expand this section:

1. **JVM Memory & Performance** — the full current JVM panel unchanged:
   - Memory presets (Small/Medium/Large/XLarge)
   - Manual heap (Xms/Xmx)
   - GC selection tiles (G1GC / ParallelGC / ZGC / Shenandoah) with version badges
   - Workload Profile (API / Low Latency / Batch / Memory Intensive)
   - Container Optimisation + MaxRAMPercentage
   - Advanced GC Tuning (pause targets, metaspace, thread stack)
   - Generated JVM Arguments preview

2. **Certificates** — cert path config + ZIP uploads

3. **Extra Directories** — extra dir config + ZIP uploads

4. **Log Rotation** — max file size, max file count

> ⚠️ **Dependencies (lib ZIP) is intentionally absent from this accordion.** It is surfaced directly in Step 2 when a thin JAR is detected. See Step 2 above.

---

## Lightning Icon Change

The ⚡ (lightning bolt) icon used in the MaxRAMPercentage hint panel needs replacing. The user noted it looks like an AI indicator. Replace with a more neutral informational icon (e.g., ℹ️ or a simple text prefix).

---

## Re-deploy Flow (Phase 3 — future)

After a successful deployment, the config is saved. Subsequent deploys of the same app should be:
1. Navigate to last successful job
2. Click "Re-deploy"
3. Upload new JAR
4. Confirm → submit

No wizard steps at all for repeat deploys.

---

## Implementation Phases

### Phase 1 — Frontend Only (no backend deploy needed)

**Files changed:**
- `ui/src/pages/DeployPage.tsx` — primary change
- `ui/package.json` — add `jszip` dependency

**Changes:**
1. Install `jszip` npm package
2. Add `parseJarManifest(file: File): Promise<ManifestFields>` — reads ZIP, extracts manifest, detects BOOT-INF
3. Restructure wizard from 6 steps to 3 steps
4. Move JAR upload to top of Step 2; wire manifest parse to auto-fill fields on JAR drop
5. **Thin JAR conditional**: when `jarType === 'thin'` is auto-detected, render lib ZIP upload inline in Step 2 immediately below JAR upload — not in accordion
6. Add Java Installation dropdown component replacing freeform text
7. Wrap JVM panel + Certificates + Extra Directories + Log Rotation in Advanced Settings collapsible accordion in Step 3 — **lib ZIP is NOT in this accordion**
8. Apply plain language label rewrites throughout
9. Smart defaults: port=8080, runAsUser=deploy, backup=on, maxBackups=3
10. Replace ⚡ icon in MaxRAMPercentage hint with neutral alternative
11. Update step navigation: goToAndScroll cross-links updated for new step numbers
12. Update tab row from 6 tabs to 3 tabs

**What does NOT change:**
- `buildRequest()` field mapping — identical fields submitted to backend
- `DeploymentRequest.ts` interface — unchanged
- All backend code — unchanged
- All deployment scripts — unchanged
- Job tracking, log viewer, dashboard — unchanged

---

### Phase 2 — Backend Additions

**Files changed:**
- `runner-service-ms/.../web/controller/SshController.java`
- `runner-service-ms/.../dto/SshTestResult.java`
- `runner-service-ms/.../service/impl/SshKeyServiceImpl.java`
- `runner-service-ms/.../service/impl/RunnerWorkspaceServiceImpl.java`
- `runner-service-ms/.../web/controller/RunnerController.java`

**Changes:**

#### 2a. Extend SSH test to detect Java
`SshTestResult.java` — add `javaInstallations: List<String>` field (empty list if none found or test failed)

`SshKeyServiceImpl.testConnection()` — after successful test, run additional SSH command:
```bash
find /usr/lib/jvm -name 'java' -type f 2>/dev/null | head -10
```
Populate `javaInstallations` in result.

Frontend: Step 2 "Detected on server" section populated from this response.

#### 2b. Save deployment config per job
`RunnerWorkspaceServiceImpl.prepareWorkspace()` — serialize `DeploymentRequest` to `workspace/jobs/<jobId>/input/request.json` at job submission time.

`RunnerController.java` — new endpoint: `GET /jobs/:id/config` → reads and returns `request.json` as `DeploymentRequest` JSON.

Enables re-deploy flow in Phase 3.

---

### Phase 3 — Re-deploy Flow

**Files changed:**
- `runner-service-ms/.../web/controller/RunnerController.java` — new endpoint
- `ui/src/pages/DashboardPage.tsx` — Re-deploy button on successful jobs
- `ui/src/pages/JobDetailPage.tsx` — Re-deploy button in header
- `ui/src/api/jobs.ts` — `redeployJob()` function

**Changes:**

New endpoint: `POST /jobs/:id/redeploy`
- Loads `request.json` from original job workspace
- Accepts a new JAR file (multipart)
- Substitutes JAR, submits new job
- Returns new job ID

Frontend re-deploy wizard:
- "Re-deploy" button on dashboard row (successful jobs only) and job detail header
- Opens a minimal modal: "Upload new JAR for `<appName>` → `<env>`"
- Submit → new job created, redirects to new job detail page

---

## Field Reduction Summary

| Field | Current | After Phase 1 |
|---|---|---|
| JAR Name | Manual text input | Hidden — always equals uploaded filename |
| JAR Type | Manual fat/thin toggle | Hidden — auto-detected from BOOT-INF/ |
| Main Class | Manual text (error-prone) | Auto-filled from manifest, editable |
| App Name | Manual text | Auto-filled from manifest/filename, editable |
| Java Command | Manual full path text | Dropdown with presets |
| Java Version | Manual number text | Derived from dropdown selection |
| Steps visible | 6 | 3 (Advanced hidden by default) |
| Required manual inputs (first deploy) | ~15 fields | ~3–4 fields (SSH host/user + confirm auto-detected values) |

---

## What Stays the Same (Never Changes)

- `deploy.sh` — no changes
- `application-deployment.sh` — no changes
- `generate-tanuki-wrapper-conf.sh` — no changes
- `DeploymentRequest.java` / `DeploymentRequest.ts` — no changes
- `YamlGenerationServiceImpl.java` — no changes
- Job lifecycle state machine — no changes
- Log viewer (LogViewer.tsx) — no changes
- Job Detail page (JobDetailPage.tsx) — no changes
- Dashboard (DashboardPage.tsx) — no changes (until Phase 3 adds Re-deploy button)
- All existing API endpoints — no changes

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| JAR manifest missing Implementation-Title or Start-Class | Fields remain editable and clearly labelled; user fills in manually |
| Non-standard Java installation path not in dropdown | "Custom path…" option always available |
| User deploys thin JAR and misses the lib ZIP | Lib ZIP upload surfaces inline in Step 2 the moment thin JAR is detected — cannot be missed; Next button can optionally warn if thin JAR detected and no lib ZIP uploaded |
| User replaces thin JAR with fat JAR (or vice versa) on re-upload | Re-running parseJarManifest on new file re-evaluates `jarType`; lib ZIP section appears/disappears accordingly |
| SSH Java detection adds latency to test connection | Run detection as a best-effort background call; do not block the test result on it |

---

*Created: 2026-03-17 | WizardCD UX Redesign Planning Session*
