import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { ArrowLeft, Server, Clock, ExternalLink, Layers } from 'lucide-react'
import { fetchJobs } from '../api/jobs'
import StatusBadge from '../components/StatusBadge'
import type { JobSummary } from '../types/JobSummary'

// ── Helpers ────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDuration(start: string, end?: string): string {
  if (!end) return '\u2014'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  return `${mins}m ${secs % 60}s`
}

// ── Environment styling ────────────────────────────────────────────────

const ENV_CFG: Record<string, { badge: string; border: string; bg: string }> = {
  SIT:  { badge: 'bg-sig-blue/20 text-sig-blue',     border: 'border-l-sig-blue',   bg: 'bg-sig-blue/5'   },
  UAT:  { badge: 'bg-sig-yellow/20 text-sig-yellow',  border: 'border-l-sig-yellow', bg: 'bg-sig-yellow/5' },
  PROD: { badge: 'bg-sig-purple/20 text-sig-purple',  border: 'border-l-sig-purple', bg: 'bg-sig-purple/5' },
}

const ENVS = ['SIT', 'UAT', 'PROD'] as const

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'ABORTED'])

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

// ── Component ──────────────────────────────────────────────────────────

export default function ApplicationPage() {
  const { appName } = useParams<{ appName: string }>()
  const navigate = useNavigate()

  const { data: allJobs = [], isLoading, isError } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => fetchJobs(),
    refetchInterval: 10_000,
  })

  const appJobs = allJobs
    .filter((j) => j.appName === appName)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // Latest job per environment
  const latestByEnv: Record<string, JobSummary | undefined> = {}
  for (const env of ENVS) {
    latestByEnv[env] = appJobs.find((j) => j.environment?.toUpperCase() === env)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── Page header ───────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-wiz-border/60 bg-wiz-surface text-wiz-muted hover:text-wiz-cream hover:border-wiz-border transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-wiz-cream tracking-tight">{appName}</h1>
          <p className="text-xs text-wiz-muted mt-0.5">Application Overview</p>
        </div>
      </div>

      {/* ── Loading / Error ───────────────────────────────────────── */}
      {isLoading && (
        <div className="text-sm text-wiz-muted py-12 text-center">Loading deployment data...</div>
      )}
      {isError && (
        <div className="text-sm text-sig-red py-12 text-center">Failed to load jobs.</div>
      )}

      {!isLoading && !isError && (
        <>
          {/* ── Environment status cards ──────────────────────────── */}
          <section>
            <p className="section-label mb-3 flex items-center gap-2">
              <Server size={13} className="text-wiz-gold" />
              Environment Status
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {ENVS.map((env) => {
                const cfg = ENV_CFG[env] ?? ENV_CFG['SIT']
                const job = latestByEnv[env]

                return (
                  <div
                    key={env}
                    className={clsx(
                      'rounded-xl border border-wiz-border border-l-2 bg-wiz-panel overflow-hidden flex flex-col',
                      cfg.border,
                    )}
                  >
                    {/* Card header */}
                    <div className={clsx('px-4 py-3 border-b border-wiz-border/60', cfg.bg)}>
                      <span className={clsx('text-2xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded', cfg.badge)}>
                        {env}
                      </span>
                    </div>

                    {/* Card body */}
                    <div className="px-4 py-4 flex flex-col gap-2.5 flex-1">
                      {job ? (
                        <>
                          <StatusBadge status={job.lifecycleStatus} size="sm" pulse />

                          <div className="flex items-center gap-1.5 text-xs text-wiz-muted">
                            <Clock size={12} />
                            <span>Last: {timeAgo(job.createdAt)}</span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-wiz-gray font-mono truncate" title={job.jobId}>
                            <Layers size={12} className="flex-shrink-0" />
                            <span className="truncate">Job: {job.jobId.slice(0, 8)}...</span>
                          </div>

                          <button
                            onClick={() => navigate(`/jobs/${job.jobId}`)}
                            className="mt-auto flex items-center gap-1 text-xs text-wiz-gold hover:text-wiz-cream transition-colors pt-1"
                          >
                            <ExternalLink size={12} />
                            View details
                          </button>
                        </>
                      ) : (
                        <p className="text-xs text-wiz-muted/60 italic py-2">No deploys</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── Recent deploys table ─────────────────────────────── */}
          <section>
            <p className="section-label mb-3 flex items-center gap-2">
              <Clock size={13} className="text-wiz-gold" />
              Recent Deployments
            </p>

            <div className="rounded-xl border border-wiz-border bg-wiz-panel overflow-hidden">
              {appJobs.length === 0 ? (
                <p className="text-sm text-wiz-muted/60 text-center py-10">
                  No deployments found for this application.
                </p>
              ) : (
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-wiz-border/60 bg-wiz-surface/50 text-wiz-muted text-xs uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5 w-[12%]">Env</th>
                      <th className="text-left px-4 py-2.5 w-[18%]">Status</th>
                      <th className="text-left px-4 py-2.5 w-[18%]">Started</th>
                      <th className="text-left px-4 py-2.5 w-[14%]">Duration</th>
                      <th className="text-left px-4 py-2.5">Job ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-wiz-border/40">
                    {appJobs.map((job) => {
                      const envKey = job.environment?.toUpperCase() ?? ''
                      const envCfg = ENV_CFG[envKey]

                      return (
                        <tr
                          key={job.jobId}
                          className="hover:bg-wiz-surface/30 transition-colors cursor-pointer"
                          onClick={() => navigate(`/jobs/${job.jobId}`)}
                        >
                          <td className="px-4 py-2.5">
                            {envCfg ? (
                              <span className={clsx('text-2xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded', envCfg.badge)}>
                                {envKey}
                              </span>
                            ) : (
                              <span className="text-xs text-wiz-muted">{job.environment ?? '\u2014'}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={job.lifecycleStatus} size="sm" pulse={!isTerminal(job.lifecycleStatus)} />
                          </td>
                          <td className="px-4 py-2.5 text-xs text-wiz-muted" title={job.createdAt}>
                            {timeAgo(job.createdAt)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-wiz-gray font-mono">
                            {formatDuration(job.createdAt, job.completedAt)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className="text-xs text-wiz-gold hover:text-wiz-cream font-mono truncate block transition-colors"
                              title={job.jobId}
                            >
                              {job.jobId.slice(0, 12)}...
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
