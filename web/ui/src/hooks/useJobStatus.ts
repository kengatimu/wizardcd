import { useQuery } from '@tanstack/react-query'
import { fetchJobStatus } from '../api/jobs'
import { TERMINAL_LIFECYCLE } from '../types/enums'
import type { JobResponse } from '../types/JobResponse'

const POLL_INTERVAL_MS = 3_000

/**
 * Polls GET /jobs/{jobId}/status every 3 seconds.
 * Automatically stops polling when the job reaches a terminal lifecycle state.
 */
export function useJobStatus(jobId: string | undefined) {
  return useQuery<JobResponse>({
    queryKey: ['job-status', jobId],
    queryFn: () => fetchJobStatus(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && TERMINAL_LIFECYCLE.includes(data.jobStatus)) {
        return false
      }
      return POLL_INTERVAL_MS
    },
    staleTime: 0,
  })
}
