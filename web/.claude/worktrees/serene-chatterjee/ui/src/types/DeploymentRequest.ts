/**
 * Maps a local source directory (relative to the ZIP root / INPUT_DIR)
 * to an absolute path on the target server where it should be placed.
 * Used for keystores, truststores, and other certs that must live
 * outside the main application directory.
 *
 * Mirrors DeploymentRequest.CertPath on the Java side.
 */
export interface CertPath {
  /** Directory name within the ZIP / INPUT_DIR (e.g. "certs") */
  source: string
  /** Absolute path on the target server (e.g. "/opt/certs") */
  targetPath: string
}

/**
 * Maps a local directory name (relative to INPUT_DIR) to an absolute
 * path on the target server.  Transferred independently of the main
 * application tarball — identical in mechanism to CertPath.
 *
 * Mirrors DeploymentRequest.ExtraDir on the Java side.
 */
export interface ExtraDir {
  /** Directory name within INPUT_DIR (e.g. "deploy") */
  dirName:    string
  /** Absolute path on the target server (e.g. "/opt/apps/my-service/deploy") */
  targetPath: string
}

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
  libPath: string
  /**
   * Extra directories transferred independently to absolute server paths.
   * Each entry maps a local directory name to its target_path on the server.
   */
  extraDirs: ExtraDir[]
  /**
   * Cert / keystore directories with custom server target paths.
   * Each entry is transferred independently of the main app tarball.
   */
  certPaths: CertPath[]

  // ── SSH Target ───────────────────────────────────────────────
  sshUser:        string
  sshHost:        string
  sshPort:        number
  targetBasePath: string

  // ── Backup Policy ────────────────────────────────────────────
  performBackup: boolean
  maxBackups:    number

  // ── Deployment Options ─────────────────────────────────────
  stabilityWindow: number
}
