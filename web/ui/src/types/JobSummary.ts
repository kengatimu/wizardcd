import type { JobLifecycleStatus, JobExecutionStatus } from './enums'

/**
 * Mirrors com.ebb.wizardcd.runner.dto.JobSummary
 * Used in the job list table (GET /jobs)
 */
export interface JobSummary {
  jobId:           string
  appName:         string
  environment:     string
  createdAt:       string           // ISO 8601 string from backend
  lifecycleStatus: JobLifecycleStatus
  executionStatus: JobExecutionStatus
}
