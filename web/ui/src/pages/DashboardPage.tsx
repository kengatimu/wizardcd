import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, RefreshCw, StopCircle, Activity, Search, X, Wand2, RotateCcw } from 'lucide-react'
import { fetchDashboardSummary, fetchJobs, abortJob } from '../api/jobs'
import RedeployModal from '../components/RedeployModal'
import RollbackModal from '../components/RollbackModal'
import type { DashboardSummary } from '../types/DashboardSummary'
import type { JobSummary } from '../types/JobSummary'
import StatusBadge from '../components/StatusBadge'
import toast from 'react-hot-toast'
import clsx from 'clsx'

// ── Environment badge ─────────────────────────────────────────────

const ENV_STYLES: Record<string, string> = {
  DEV:  'bg-sig-green-dim text-sig-green border-sig-green/25',
  SIT:  'bg-sig-blue-dim text-sig-blue border-sig-blue/25',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/25',
  PROD: 'bg-sig-purple-dim text-sig-purple border-sig-purple/25',
}

function EnvBadge({ env }: { env: string }) {
  const upper = env.toUpperCase()
  const style = ENV_STYLES[upper] ?? 'bg-wiz-surface text-wiz-muted border-wiz-border'
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider border',
      style,
    )}>
      {upper}
    </span>
  )
}

// ── Metric Card ──────────────────────────────────────────────────

interface MetricCardProps {
  label:    string
  value:    number
  sub:      string
  accent:   string
  trend?:   number
  muted?:   boolean   // dim the value when 0 and contextually empty
  alert?:   boolean   // subtle background tint for attention
}

function MetricCard({ label, value, sub, accent, trend, muted, alert }: MetricCardProps) {
  return (
    <div className={clsx(
      `wiz-card ${accent} p-5 animate-fade-in`,
      alert && value > 0 && 'bg-sig-red-dim/30',
    )}>
      <p className="section-label">{label}</p>
      <div className="flex items-end gap-2 mt-2">
        <span className={clsx(
          'text-3xl font-bold tabular-nums',
          muted && value === 0 ? 'text-wiz-muted/40' : 'text-wiz-cream',
        )}>
          {value}
        </span>
        {trend !== undefined && trend !== 0 && (
          <span className={`text-xs font-mono mb-1 ${trend > 0 ? 'text-sig-green' : 'text-sig-red'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}
          </span>
        )}
      </div>
      <p className="text-xs text-wiz-muted mt-1">
        {muted && value === 0 ? 'No active deployments' : sub}
      </p>
    </div>
  )
}

// ── Skeleton Row ─────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-3 py-3">
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

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'ABORTED'])

function formatDuration(createdAt: string, completedAt?: string, lifecycleStatus?: string): string {
  const start = new Date(createdAt).getTime()
  if (!start) return '—'
  const end = completedAt
    ? new Date(completedAt).getTime()
    : TERMINAL_STATUSES.has(lifecycleStatus ?? '') ? null : Date.now()
  if (end === null) return '—'
  const ms = end - start
  if (ms < 0) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`
}

// ── Filter types ─────────────────────────────────────────────────

type EnvFilter    = '' | 'DEV' | 'SIT' | 'UAT' | 'PROD'
type StatusFilter = '' | 'SUCCESS' | 'FAILED' | 'RUNNING' | 'ABORTED'

// ── Main Page ────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()

  // Filters
  const [envFilter, setEnvFilter]       = useState<EnvFilter>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [searchQuery, setSearchQuery]   = useState('')
  const [refreshing, setRefreshing]     = useState(false)

  // Re-deploy / Rollback modal state
  const [redeployTarget, setRedeployTarget] = useState<{ jobId: string; appName: string; environment: string } | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<{ jobId: string; appName: string; environment: string } | null>(null)

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

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([refetchSummary(), refetchJobs()])
      toast.success('Dashboard refreshed')
    } catch {
      toast.error('Failed to refresh')
    } finally {
      setTimeout(() => setRefreshing(false), 600)
    }
  }

  const handleAbort = async (jobId: string) => {
    try {
      await abortJob(jobId)
      toast.success(`Abort requested for job ${jobId.slice(0, 8)}…`)
      void refetchJobs()
    } catch {
      toast.error('Failed to abort job.')
    }
  }

  const trends = summary?.trends

  // ── Filter jobs ──
  const filteredJobs = jobs
    ? [...jobs]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .filter((j) => {
          if (envFilter && j.environment?.toUpperCase() !== envFilter) return false
          if (statusFilter && j.lifecycleStatus !== statusFilter) return false
          if (searchQuery) {
            const q = searchQuery.toLowerCase()
            return j.appName?.toLowerCase().includes(q) || j.jobId.toLowerCase().includes(q)
          }
          return true
        })
    : []

  const hasActiveFilters = envFilter !== '' || statusFilter !== '' || searchQuery !== ''

  return (
    <div className="flex flex-col gap-6 pt-6 animate-fade-in">

      {/* ── Page Title ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-wiz-cream">Deployment Activity</h1>
          <p className="text-sm text-wiz-muted mt-0.5">
            Real-time job tracking and lifecycle management.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className={clsx(
            'btn-secondary gap-2 transition-all duration-200',
            refreshing && 'opacity-70',
          )}
        >
          <RefreshCw size={13} className={clsx(refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
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
              <MetricCard label="RUNNING"     value={summary.running}    sub="Currently executing"     accent="metric-running" trend={trends?.running}    muted />
              <MetricCard label="SUCCESSFUL"  value={summary.successful} sub="Completed successfully"  accent="metric-success" trend={trends?.successful} />
              <MetricCard label="FAILED"      value={summary.failed}     sub="Require investigation"   accent="metric-failed"  trend={trends?.failed}     alert />
              <MetricCard label="ABORTED"     value={summary.aborted}    sub="Terminated manually"     accent="metric-aborted" trend={trends?.aborted}    muted />
            </>
          ) : null}
        </div>
      )}

      {/* ── Job Table ── */}
      <div className="wiz-card overflow-hidden">

        {/* Table header + filters */}
        <div className="px-6 py-4 border-b border-wiz-border flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-wiz-gold" />
              <h2 className="section-label">Recent Jobs</h2>
            </div>
            <span className="text-xs text-wiz-muted font-mono">
              {hasActiveFilters
                ? `${filteredJobs.length} of ${jobs?.length ?? 0}`
                : `${jobs?.length ?? 0} total`
              }
            </span>
          </div>

          {/* Filter row */}
          <div className="flex items-center gap-2.5">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-wiz-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search app name or job ID…"
                className="w-full bg-wiz-surface border border-wiz-border-mid rounded-lg pl-8 pr-8 py-2 text-xs text-wiz-cream placeholder-wiz-muted/60 font-mono focus:outline-none focus:border-wiz-gold/50 focus:ring-1 focus:ring-wiz-gold/20 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-wiz-muted/50 hover:text-wiz-cream"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Environment dropdown */}
            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value as EnvFilter)}
              className={clsx(
                'bg-wiz-bg border rounded-lg px-3 py-2 text-xs font-mono font-semibold',
                'focus:outline-none focus:border-wiz-gold/50 focus:ring-1 focus:ring-wiz-gold/20 transition-all cursor-pointer',
                envFilter
                  ? envFilter === 'DEV'  ? 'border-sig-green/40 text-sig-green'
                  : envFilter === 'SIT'  ? 'border-sig-blue/40 text-sig-blue'
                  : envFilter === 'UAT'  ? 'border-sig-yellow/40 text-sig-yellow'
                  : 'border-sig-purple/40 text-sig-purple'
                  : 'border-wiz-border text-wiz-muted',
              )}
            >
              <option value="">All Environments</option>
              <option value="DEV">DEV</option>
              <option value="SIT">SIT</option>
              <option value="UAT">UAT</option>
              <option value="PROD">PROD</option>
            </select>

            {/* Status dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className={clsx(
                'bg-wiz-bg border rounded-lg px-3 py-2 text-xs font-mono font-semibold',
                'focus:outline-none focus:border-wiz-gold/50 focus:ring-1 focus:ring-wiz-gold/20 transition-all cursor-pointer',
                statusFilter
                  ? statusFilter === 'RUNNING' ? 'border-sig-yellow/40 text-sig-yellow'
                  : statusFilter === 'SUCCESS' ? 'border-sig-green/40 text-sig-green'
                  : statusFilter === 'FAILED'  ? 'border-sig-red/40 text-sig-red'
                  : 'border-wiz-muted/40 text-wiz-muted'
                  : 'border-wiz-border text-wiz-muted',
              )}
            >
              <option value="">All Statuses</option>
              <option value="RUNNING">Running</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="ABORTED">Aborted</option>
            </select>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setEnvFilter(''); setStatusFilter(''); setSearchQuery('') }}
                className="text-xs text-wiz-muted hover:text-wiz-cream transition-colors underline underline-offset-2"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[14%]" />   {/* Job ID */}
              <col className="w-[16%]" />   {/* Application */}
              <col className="w-[6%]" />    {/* Env */}
              <col className="w-[11%]" />   {/* Lifecycle */}
              <col className="w-[11%]" />   {/* Execution */}
              <col className="w-[17%]" />   {/* Created */}
              <col className="w-[17%]" />   {/* Completed */}
              <col className="w-[8%]" />    {/* Duration */}
            </colgroup>
            <thead>
              <tr className="border-b border-wiz-border bg-wiz-panel/50">
                <th className="text-left px-3 py-3 section-label font-semibold">Job ID</th>
                <th className="text-left px-3 py-3 section-label font-semibold">Application</th>
                <th className="text-left px-3 py-3 section-label font-semibold">Env</th>
                <th className="text-left px-3 py-3 section-label font-semibold">Lifecycle</th>
                <th className="text-left px-3 py-3 section-label font-semibold">Execution</th>
                <th className="text-left px-3 py-3 section-label font-semibold">Created</th>
                <th className="text-left px-3 py-3 section-label font-semibold">Completed</th>
                <th className="text-left px-3 py-3 section-label font-semibold">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-wiz-border/40">
              {jobsLoading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : filteredJobs.length > 0 ? (
                filteredJobs.map((job) => (
                  <tr
                    key={job.jobId}
                    className="hover:bg-wiz-surface/50 transition-colors duration-100 cursor-pointer"
                    onClick={() => navigate(`/jobs/${job.jobId}`)}
                  >
                    {/* Job ID */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className="font-mono text-xs text-wiz-gold/90"
                        title={job.jobId}
                      >
                        {job.jobId.slice(0, 18)}…
                      </span>
                    </td>

                    {/* App name */}
                    <td className="px-3 py-3">
                      <span className="font-medium text-wiz-cream truncate block" title={job.appName}>
                        {job.appName}
                      </span>
                    </td>

                    {/* Environment — color badge */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <EnvBadge env={job.environment} />
                    </td>

                    {/* Lifecycle */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span title={job.lifecycleStatus}><StatusBadge status={job.lifecycleStatus} pulse /></span>
                    </td>

                    {/* Execution */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span title={job.executionStatus}><StatusBadge status={job.executionStatus} /></span>
                    </td>

                    {/* Created at */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-wiz-muted" title={formatTime(job.createdAt)}>
                        {formatTime(job.createdAt)}
                      </span>
                    </td>

                    {/* Completed at */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs text-wiz-muted" title={job.completedAt ? formatTime(job.completedAt) : ''}>
                        {job.completedAt ? formatTime(job.completedAt) : '—'}
                      </span>
                    </td>

                    {/* Duration + Abort */}
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-wiz-muted">
                          {formatDuration(job.createdAt, job.completedAt, job.lifecycleStatus)}
                        </span>
                        {(job.lifecycleStatus === 'RUNNING' || job.lifecycleStatus === 'VALIDATING' || job.lifecycleStatus === 'PREPARING_WORKSPACE') && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); void handleAbort(job.jobId) }}
                            className="btn-icon h-6 w-6 text-sig-red/70 hover:text-sig-red hover:bg-sig-red-dim flex-shrink-0"
                            title="Abort job"
                          >
                            <StopCircle size={12} />
                          </button>
                        )}
                        {(job.lifecycleStatus === 'SUCCESS' || job.lifecycleStatus === 'FAILED' || job.lifecycleStatus === 'ABORTED') && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setRedeployTarget({ jobId: job.jobId, appName: job.application, environment: job.environment }) }}
                              className="btn-icon h-6 w-6 text-wiz-gold/70 hover:text-wiz-gold hover:bg-wiz-gold/10 flex-shrink-0"
                              title="Re-deploy"
                            >
                              <Wand2 size={12} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setRollbackTarget({ jobId: job.jobId, appName: job.application, environment: job.environment }) }}
                              className="btn-icon h-6 w-6 text-sig-yellow/70 hover:text-sig-yellow hover:bg-sig-yellow/10 flex-shrink-0"
                              title="Rollback"
                            >
                              <RotateCcw size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Activity size={32} className="text-wiz-muted" />
                      {hasActiveFilters ? (
                        <>
                          <p className="text-wiz-muted text-sm">No jobs match your filters.</p>
                          <button
                            type="button"
                            onClick={() => { setEnvFilter(''); setStatusFilter(''); setSearchQuery('') }}
                            className="btn-secondary mt-1"
                          >
                            Clear Filters
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-wiz-muted text-sm">No deployments yet.</p>
                          <button
                            type="button"
                            onClick={() => navigate('/deploy')}
                            className="btn-primary mt-1"
                          >
                            Start First Deployment
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {redeployTarget && (
        <RedeployModal
          jobId={redeployTarget.jobId}
          appName={redeployTarget.appName}
          environment={redeployTarget.environment}
          onClose={() => setRedeployTarget(null)}
        />
      )}

      {rollbackTarget && (
        <RollbackModal
          jobId={rollbackTarget.jobId}
          appName={rollbackTarget.appName}
          environment={rollbackTarget.environment}
          onClose={() => setRollbackTarget(null)}
        />
      )}

    </div>
  )
}
