/**
 * Mirrors com.ebb.wizardcd.runner.dto.DashboardSummary
 * Returned by GET /jobs/summary
 */
export interface DashboardSummary {
  total:      number
  running:    number
  successful: number
  failed:     number
  aborted:    number
  trends: {
    running:    number
    successful: number
    failed:     number
    aborted:    number
  }
}
