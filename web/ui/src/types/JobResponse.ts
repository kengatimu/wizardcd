import type { JobLifecycleStatus, JobExecutionStatus } from './enums'

/**
 * One entry in the lifecycle-state transition history.
 * Mirrors JobExecutionStatus.StateTransition on the backend.
 */
export interface StateTransition {
  state:     string  // e.g. "CREATED", "VALIDATING", "RUNNING", "SUCCESS"
  timestamp: string  // ISO 8601
}

/**
 * Mirrors com.ebb.wizardcd.runner.dto.JobResponse
 * Returned by POST /jobs and GET /jobs/{jobId}/status
 */
export interface JobResponse {
  jobId:          string
  jobStatus:      JobLifecycleStatus
  executionState: JobExecutionStatus
  stateHistory?:  StateTransition[]
  // Enriched from metadata.json — populated by GET /jobs/{jobId}/status
  application?:   string
  environment?:   string
  createdAt?:     string   // ISO 8601
}
