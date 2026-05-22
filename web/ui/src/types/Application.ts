/**
 * Phase 5 §5.1 — Application registry types.
 *
 * Mirrors `com.ebb.wizardcd.runner.web.dto.ApplicationResponse` +
 * `ApplicationRequest` on the backend. The list endpoint returns shallow
 * rows; the detail endpoint with `?expand=environments` returns the
 * `environments` array filled in.
 */

import type { EnvironmentConfig } from './EnvironmentConfig'

/** Live-push capability for an app — populated by the §5.5 runtime probe. */
export type LiveConfigCapability =
  | 'ENABLED'    // actuator + /actuator/refresh confirmed
  | 'DEGRADED'   // actuator present but /refresh blocked
  | 'MISSING'    // actuator dep not in JAR
  | 'UNKNOWN'    // probe failed for unrelated reasons
  | 'PROBING'    // probe in flight

/**
 * Compact summary of an app's deployment history per environment.
 * Backend may omit this on bulk list calls — treat as optional.
 */
export interface DeploySummary {
  totalDeploys: number
  lastDeployAt: string | null
  perEnv:       EnvSummary[]
}

/** Per-env breakdown — last-deploy outcome + count. */
export interface EnvSummary {
  envName:      string
  count:        number
  lastStatus:   string | null    // SUCCESS / FAILED / ABORTED / RUNNING / null
  lastDeployAt: string | null
}

export interface Application {
  id:                     string
  name:                   string
  description:            string | null
  liveConfigCapability:   LiveConfigCapability | null
  capabilityLastChecked:  string | null
  createdAt:              string
  updatedAt:              string
  deletedAt:              string | null     // null = live
  environments?:          EnvironmentConfig[]  // present when ?expand=environments
  deploySummary?:         DeploySummary | null
}

/** Request body for POST /applications and PUT /applications/:id. */
export interface ApplicationRequest {
  name?:        string | null
  description?: string | null
}
