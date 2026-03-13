# WizardCD Project Memory

## Project Identity
- WizardCD: config-driven deployment automation platform for Java microservices
- Deploy via SSH to remote VMs, lifecycle state machine, crash recovery
- Brand: dark navy bg + gold (#C9A84C) accent + violet (#6B46A0) wizard theme

## Repo Layout
- `/ui/` — React + Vite + TypeScript frontend (worktree: `serene-chatterjee`)
- `/runner-service-ms/` — Spring Boot control plane (port 8081)
- `/runner/` — Bash execution scripts (deploy.sh, application-deployment.sh, etc.)
- `/workspace/jobs/<jobId>/` — isolated per-job workspaces
- `/logo/wizardCD-logo.png` — brand logo

## UI Tech Stack (ui/)
- React 19, Vite 5, TypeScript 5.5, Tailwind CSS 3.4
- React Router 7, TanStack Query 5, Axios, react-hot-toast, lucide-react, clsx
- Build: `npm run build` ✅ zero TS errors, clean prod build

## UI Architecture
```
src/
  api/          client.ts (axios, baseURL from VITE_API_BASE_URL), jobs.ts
  types/        DeploymentRequest, JobResponse, JobSummary, DashboardSummary, enums
  hooks/        useJobStatus (polls /status, stops on terminal), useJobLogs
  components/   StatusBadge, SectionCard, FormField, ToggleSwitch, DynamicList, LogViewer
  layouts/      Layout (sidebar+header shell), Header, Sidebar
  pages/        DashboardPage, DeployPage, JobDetailPage
  styles/       globals.css (Tailwind + wiz- / sig- custom classes)
```

## Brand Colors (tailwind.config.js)
- bg: #080B14  surface: #0D1120  raised: #111827  panel: #161D2E
- gold: #C9A84C  gold-light: #D4B560  violet: #6B46A0
- cream: #E8DCCA  gray: #A8A49C  muted: #6B6760
- sig-green/red/yellow/blue/orange — all with *-dim variants

## Backend API (port 8081)
- POST /jobs (multipart: request JSON + artifact JAR) → 202 JobResponse
- GET  /jobs?status= → JobSummary[]
- GET  /jobs/summary → DashboardSummary
- GET  /jobs/{jobId}/status → JobResponse
- GET  /jobs/{jobId}/logs?tail=200 → plain text
- POST /jobs/{jobId}/abort → string

## Lifecycle States
- JobStatus: CREATED → VALIDATING → PREPARING_WORKSPACE → RUNNING → SUCCESS/FAILED/ABORT_REQUESTED/ABORTED
- JobExecutionStateStatus: RECEIVED → WORKSPACE_READY → RUNNING → SUCCEEDED/FAILED/TIMEOUT/ABORTED
- Terminal (stop polling): SUCCESS, FAILED, ABORTED / SUCCEEDED, FAILED, TIMEOUT, ABORTED

## DeploymentRequest DTO (5 sections)
1. App: appName, environment, mainClass, jarName
2. JVM: javaCommand, javaVersion, xms, xmx, newRatio, extraOpts[]
3. Runtime: runAsUser, serverPort, maxLogSize, maxLogFiles
4. SSH: sshUser, sshHost, sshPort, privateKeyPath, targetBasePath
5. Backup: performBackup, maxBackups
