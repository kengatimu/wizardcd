/**
 * Mirrors com.ebb.wizardcd.runner.enums.JobStatus (control plane lifecycle)
 */
export type JobLifecycleStatus =
  | 'CREATED'
  | 'VALIDATING'
  | 'PREPARING_WORKSPACE'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED'
  | 'ABORT_REQUESTED'
  | 'ABORTED'

/**
 * Mirrors com.ebb.wizardcd.runner.enums.JobExecutionStateStatus (execution plane)
 */
export type JobExecutionStatus =
  | 'RECEIVED'
  | 'WORKSPACE_READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TIMEOUT'
  | 'ABORTED'

/** Terminal states — polling stops when job reaches one of these */
export const TERMINAL_LIFECYCLE: JobLifecycleStatus[] = [
  'SUCCESS',
  'FAILED',
  'ABORTED',
]

export const TERMINAL_EXECUTION: JobExecutionStatus[] = [
  'SUCCEEDED',
  'FAILED',
  'TIMEOUT',
  'ABORTED',
]
