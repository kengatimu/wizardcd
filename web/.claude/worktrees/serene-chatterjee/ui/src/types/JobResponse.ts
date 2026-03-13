import type { JobLifecycleStatus, JobExecutionStatus } from './enums'

/**
 * Mirrors com.ebb.wizardcd.runner.dto.JobResponse
 * Returned by POST /jobs and GET /jobs/{jobId}/status
 */
export interface JobResponse {
  jobId:          string
  jobStatus:      JobLifecycleStatus
  executionState: JobExecutionStatus
}
