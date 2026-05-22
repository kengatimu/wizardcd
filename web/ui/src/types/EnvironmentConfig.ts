/**
 * Phase 5 §5.1 — Environment config types.
 *
 * Mirrors `com.ebb.wizardcd.runner.web.dto.EnvironmentConfigResponse` +
 * `EnvironmentConfigRequest` on the backend. The request shape uses
 * optional fields throughout so PUT can behave as a null-skip patch.
 */

export interface EnvironmentConfig {
  id:                  string
  appId:               string
  envName:             string                // DEV / SIT / UAT / PROD (uppercase)

  // SSH target
  sshUser:             string
  sshHost:             string
  sshPort:             number

  // Java runtime
  javaCommand:         string
  javaVersion:         string | null

  // Filesystem / process
  targetBasePath:      string
  runAsUser:           string
  serverPort:          number
  mainClass:           string | null
  jarName:             string | null
  libPath:             string                // "" = fat JAR, "lib" = thin JAR

  // JVM heap + flags
  xms:                 string | null
  xmx:                 string | null
  extraJvmOpts:        string | null         // JSON array of strings

  // Logging
  maxLogSize:          string
  maxLogFiles:         number

  // Backup + stability
  performBackup:       boolean
  maxBackups:          number
  stabilityWindow:     number

  // Strategy
  deploymentStrategy:  string

  createdAt:           string
  updatedAt:           string
}

/**
 * Request body for POST/PUT env-config endpoints.
 *
 * Every field is optional — backend treats null as "leave unchanged" on
 * PUT and as "use default" on POST (subject to NOT NULL columns rejecting
 * truly missing required values).
 */
export interface EnvironmentConfigRequest {
  envName?:             string | null
  sshUser?:             string | null
  sshHost?:             string | null
  sshPort?:             number | null
  javaCommand?:         string | null
  javaVersion?:         string | null
  targetBasePath?:      string | null
  runAsUser?:           string | null
  serverPort?:          number | null
  mainClass?:           string | null
  jarName?:             string | null
  libPath?:             string | null
  xms?:                 string | null
  xmx?:                 string | null
  extraJvmOpts?:        string | null
  maxLogSize?:          string | null
  maxLogFiles?:         number | null
  performBackup?:       boolean | null
  maxBackups?:          number | null
  stabilityWindow?:     number | null
  deploymentStrategy?:  string | null
}
