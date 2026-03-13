import { useQuery } from '@tanstack/react-query'
import { fetchJobLogs } from '../api/jobs'
import { TERMINAL_LIFECYCLE } from '../types/enums'
import type { JobLifecycleStatus } from '../types/enums'

const POLL_INTERVAL_MS = 3_000

/**
 * Polls GET /jobs/{jobId}/logs every 3 seconds.
 * Stops polling when the job lifecycle is terminal.
 *
 * @param jobId         The job to fetch logs for
 * @param lifecycleStatus Pass the current lifecycle state so polling stops correctly
 * @param tail          Number of lines to fetch from the end of the log file
 */
export function useJobLogs(
  jobId: string | undefined,
  lifecycleStatus: JobLifecycleStatus | undefined,
  tail = 200,
) {
  const isTerminal = lifecycleStatus
    ? TERMINAL_LIFECYCLE.includes(lifecycleStatus)
    : false

  return useQuery<string>({
    queryKey: ['job-logs', jobId, tail],
    queryFn: () => fetchJobLogs(jobId!, tail),
    enabled: Boolean(jobId),
    refetchInterval: isTerminal ? false : POLL_INTERVAL_MS,
    staleTime: 0,
  })
}
