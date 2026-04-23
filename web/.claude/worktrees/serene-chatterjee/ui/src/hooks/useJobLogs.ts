import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJobLogs } from '../api/jobs'
import { TERMINAL_LIFECYCLE } from '../types/enums'
import type { JobLifecycleStatus } from '../types/enums'

const POLL_INTERVAL_MS = 3_000

/**
 * Polls GET /jobs/{jobId}/logs every 3 seconds.
 * Stops polling when the job lifecycle is terminal.
 * Performs one guaranteed final fetch when the job transitions live → terminal
 * so that fast-failing jobs (< 3s) always show complete logs.
 *
 * @param jobId           The job to fetch logs for
 * @param lifecycleStatus Pass the current lifecycle state so polling stops correctly
 * @param tail            Number of lines to fetch from the end of the log file
 */
export function useJobLogs(
  jobId: string | undefined,
  lifecycleStatus: JobLifecycleStatus | undefined,
  tail = 200,
) {
  const isTerminal = lifecycleStatus
    ? TERMINAL_LIFECYCLE.includes(lifecycleStatus)
    : false

  const queryClient  = useQueryClient()
  const wasTerminal  = useRef(isTerminal)

  // When job transitions live → terminal, invalidate so React Query
  // performs one final fetch and the component re-renders with complete logs.
  useEffect(() => {
    if (!wasTerminal.current && isTerminal && jobId) {
      void queryClient.invalidateQueries({ queryKey: ['job-logs', jobId, tail] })
    }
    wasTerminal.current = isTerminal
  }, [isTerminal, jobId, tail, queryClient])

  return useQuery<string>({
    queryKey: ['job-logs', jobId, tail],
    queryFn: () => fetchJobLogs(jobId!, tail),
    enabled: Boolean(jobId),
    refetchInterval: isTerminal ? false : POLL_INTERVAL_MS,
    staleTime: 0,
  })
}
