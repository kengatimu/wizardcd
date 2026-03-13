import apiClient from './client'
import type { DeploymentRequest } from '../types/DeploymentRequest'
import type { JobResponse } from '../types/JobResponse'
import type { JobSummary } from '../types/JobSummary'
import type { DashboardSummary } from '../types/DashboardSummary'
import type { JobLifecycleStatus } from '../types/enums'

/**
 * Submit a new deployment job.
 * Sends a multipart/form-data request with the JSON config and JAR artifact.
 */
export async function submitJob(
  request: DeploymentRequest,
  artifact: File,
): Promise<JobResponse> {
  const formData = new FormData()

  // Append the JSON request part as a Blob with the correct content-type
  formData.append(
    'request',
    new Blob([JSON.stringify(request)], { type: 'application/json' }),
  )

  // Append the JAR artifact
  formData.append('artifact', artifact, artifact.name)

  const { data } = await apiClient.post<JobResponse>('/jobs', formData)
  return data
}

/**
 * Fetch all jobs, optionally filtered by lifecycle status.
 */
export async function fetchJobs(status?: JobLifecycleStatus): Promise<JobSummary[]> {
  const params = status ? { status } : undefined
  const { data } = await apiClient.get<JobSummary[]>('/jobs', { params })
  return data
}

/**
 * Fetch the current lifecycle + execution snapshot for a specific job.
 */
export async function fetchJobStatus(jobId: string): Promise<JobResponse> {
  const { data } = await apiClient.get<JobResponse>(`/jobs/${jobId}/status`)
  return data
}

/**
 * Fetch the last N log lines for a job (tail read, chronological order).
 */
export async function fetchJobLogs(jobId: string, tail = 200): Promise<string> {
  const { data } = await apiClient.get<string>(`/jobs/${jobId}/logs`, {
    params: { tail },
    // Backend returns plain text
    headers: { Accept: 'text/plain, */*' },
  })
  return data
}

/**
 * Request an abort of a running job.
 */
export async function abortJob(jobId: string): Promise<string> {
  const { data } = await apiClient.post<string>(`/jobs/${jobId}/abort`)
  return data
}

/**
 * Fetch the dashboard summary metrics.
 */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await apiClient.get<DashboardSummary>('/jobs/summary')
  return data
}

/**
 * Fetch per-environment runner SSH public keys.
 * Returns an object keyed by environment: { SIT: "ssh-ed25519 ...", UAT: "...", PROD: "..." }
 */
export async function fetchRunnerPublicKeys(): Promise<Record<string, string>> {
  const { data } = await apiClient.get<Record<string, string>>('/runner/public-keys')
  return data
}

export interface SshTestResult {
  success: boolean
  message: string
}

/**
 * Test SSH connectivity from the runner to a target server using the
 * environment-specific runner key.
 */
export async function testSshConnection(params: {
  sshUser:     string
  sshHost:     string
  sshPort:     number
  environment: string
}): Promise<SshTestResult> {
  const { data } = await apiClient.post<SshTestResult>('/ssh/test', params)
  return data
}
