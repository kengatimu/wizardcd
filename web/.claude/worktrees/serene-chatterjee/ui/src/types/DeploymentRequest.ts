/**
 * Mirrors com.ebb.wizardcd.runner.dto.DeploymentRequest
 * This is the JSON payload sent as the "request" part in the multipart POST /jobs.
 */
export interface DeploymentRequest {
  // ── Application Identity ─────────────────────────────────────
  appName:     string
  environment: string
  mainClass:   string
  jarName:     string

  // ── Java Runtime ─────────────────────────────────────────────
  javaCommand: string
  javaVersion: number

  // ── JVM Configuration ────────────────────────────────────────
  xms:       string
  xmx:       string
  newRatio:  string
  extraOpts: string[]

  // ── Runtime Configuration ────────────────────────────────────
  runAsUser:  string
  serverPort: number

  // ── Logging ──────────────────────────────────────────────────
  maxLogSize:  string
  maxLogFiles: number

  // ── Build Configuration ──────────────────────────────────────
  libPath:       string
  optionalPaths: string[]

  // ── SSH Target ───────────────────────────────────────────────
  sshUser:        string
  sshHost:        string
  sshPort:        number
  targetBasePath: string

  // ── Backup Policy ────────────────────────────────────────────
  performBackup: boolean
  maxBackups:    number
}
