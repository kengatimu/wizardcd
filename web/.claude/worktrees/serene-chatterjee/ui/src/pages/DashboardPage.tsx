import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, RefreshCw, Eye, StopCircle, Activity } from 'lucide-react'
import { fetchDashboardSummary, fetchJobs, abortJob } from '../api/jobs'
import type { DashboardSummary } from '../types/DashboardSummary'
import type { JobSummary } from '../types/JobSummary'
import StatusBadge from '../components/StatusBadge'
import toast from 'react-hot-toast'

// ── Metric Card ──────────────────────────────────────────────────

interface MetricCardProps {
  label:   string
  value:   number
  sub:     string
  accent:  string
  trend?:  number
}

function MetricCard({ label, value, sub, accent, trend }: MetricCardProps) {
  return (
    <div className={`wiz-card ${accent} p-5 animate-fade-in`}>
      <p className="section-label">{label}</p>
      <div className="flex items-end gap-2 mt-2">
        <span className="text-3xl font-bold text-wiz-cream tabular-nums">
          {value}
        </span>
        {trend !== undefined && trend !== 0 && (
          <span className={`text-xs font-mono mb-1 ${trend > 0 ? 'text-sig-green' : 'text-sig-red'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}
          </span>
        )}
      </div>
      <p className="text-xs text-wiz-muted mt-1">{sub}</p>
    </div>
  )
}

// ── Skeleton Row ─────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 rounded w-3/4" />
        </td>
      ))}
    </tr>
  )
}

// ── Timestamp formatter ──────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-GB', {
      day:    '2-digit',
      month:  'short',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

function truncateId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) + '…' : id
}

// ── Main Page ────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()

  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
    refetch: refetchSummary,
  } = useQuery<DashboardSummary>({
    queryKey: ['jobs-summary'],
    queryFn:  fetchDashboardSummary,
    refetchInterval: 5_000,
  })

  const {
    data: jobs,
    isLoading: jobsLoading,
    refetch: refetchJobs,
  } = useQuery<JobSummary[]>({
    queryKey: ['jobs-list'],
    queryFn:  fetchJobs,
    refetchInterval: 5_000,
  })

  const handleRefresh = () => {
    void refetchSummary()
    void refetchJobs()
  }

  const handleAbort = async (jobId: string) => {
    try {
      await abortJob(jobId)
      toast.success(`Abort requested for job ${truncateId(jobId)}`)
      void refetchJobs()
    } catch {
      toast.error('Failed to abort job.')
    }
  }

  const trends = summary?.trends

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* ── Page Title ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-wiz-cream">Control Plane</h1>
          <p className="text-sm text-wiz-muted mt-0.5">
            Real-time deployment activity and job lifecycle management.
          </p>
        </div>
        <button type="button" onClick={handleRefresh} className="btn-secondary gap-2">
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      {/* ── Metric Cards ── */}
      {summaryError ? (
        <div className="flex items-center gap-3 p-4 bg-sig-red-dim border border-sig-red/20 rounded-lg text-sig-red text-sm">
          <AlertCircle size={16} />
          Failed to load metrics. Check that the runner service is running.
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {summaryLoading ? (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="wiz-card p-5 h-28">
                  <div className="skeleton h-3 rounded w-1/2 mb-3" />
                  <div className="skeleton h-8 rounded w-1/3 mb-2" />
                  <div className="skeleton h-3 rounded w-2/3" />
                </div>
              ))}
            </>
          ) : summary ? (
            <>
              <MetricCard label="TOTAL JOBS"  value={summary.total}      sub="All-time deployments"    accent="metric-total"   />
              <MetricCard label="RUNNING"     value={summary.running}    sub="Currently executing"     accent="metric-running" trend={trends?.running}    />
              <MetricCard label="SUCCESSFUL"  value={summary.successful} sub="Completed successfully"  accent="metric-success" trend={trends?.successful} />
              <MetricCard label="FAILED"      value={summary.failed}     sub="Require investigation"   accent="metric-failed"  trend={trends?.failed}     />
              <MetricCard label="ABORTED"     value={summary.aborted}    sub="Terminated manually"     accent="metric-aborted" trend={trends?.aborted}    />
            </>
          ) : null}
        </div>
      )}

      {/* ── Job Table ── */}
      <div className="wiz-card overflow-hidden">

        {/* Table header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-wiz-border">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-wiz-gold" />
            <h2 className="section-label">Recent Jobs</h2>
          </div>
          {jobs && (
            <span className="text-xs text-wiz-muted font-mono">
              {jobs.length} total
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-wiz-border bg-wiz-panel/50">
                <th className="text-left px-4 py-3 section-label font-semibold">Job ID</th>
                <th className="text-left px-4 py-3 section-label font-semibold">Application</th>
                <th className="text-left px-4 py-3 section-label font-semibold">Environment</th>
                <th className="text-left px-4 py-3 section-label font-semibold">Lifecycle</th>
                <th className="text-left px-4 py-3 section-label font-semibold">Execution</th>
                <th className="text-left px-4 py-3 section-label font-semibold">Created</th>
                <th className="text-right px-4 py-3 section-label font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wiz-border/40">
              {jobsLoading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : jobs && jobs.length > 0 ? (
                jobs.map((job) => (
                  <tr
                    key={job.jobId}
                    className="hover:bg-wiz-surface/50 transition-colors duration-100"
                  >
                    {/* Job ID */}
                    <td className="px-4 py-3">
                      <span
                        className="font-mono text-xs text-wiz-gold/90 cursor-pointer hover:text-wiz-gold"
                        title={job.jobId}
                        onClick={() => navigate(`/jobs/${job.jobId}`)}
                      >
                        {truncateId(job.jobId)}
                      </span>
                    </td>

                    {/* App name */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-wiz-cream">
                        {job.appName}
                      </span>
                    </td>

                    {/* Environment */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-wiz-muted uppercase tracking-wider">
                        {job.environment}
                      </span>
                    </td>

                    {/* Lifecycle */}
                    <td className="px-4 py-3">
                      <StatusBadge status={job.lifecycleStatus} pulse />
                    </td>

                    {/* Execution */}
                    <td className="px-4 py-3">
                      <StatusBadge status={job.executionStatus} />
                    </td>

                    {/* Created at */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-wiz-muted">
                        {formatTime(job.createdAt)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => navigate(`/jobs/${job.jobId}`)}
                          className="btn-icon h-7 w-7"
                          title="View details"
                        >
                          <Eye size={13} />
                        </button>
                        {(job.lifecycleStatus === 'RUNNING' || job.lifecycleStatus === 'VALIDATING' || job.lifecycleStatus === 'PREPARING_WORKSPACE') && (
                          <button
                            type="button"
                            onClick={() => void handleAbort(job.jobId)}
                            className="btn-icon h-7 w-7 text-sig-red/70 hover:text-sig-red hover:bg-sig-red-dim"
                            title="Abort job"
                          >
                            <StopCircle size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Activity size={32} className="text-wiz-muted" />
                      <p className="text-wiz-muted text-sm">No deployments yet.</p>
                      <button
                        type="button"
                        onClick={() => navigate('/deploy')}
                        className="btn-primary mt-1"
                      >
                        Start First Deployment
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
