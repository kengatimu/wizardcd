import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ArrowLeft, Server, Clock, ExternalLink, Layers,
  CheckCircle2, XCircle, Loader2, AlertCircle, StopCircle,
  Activity, Calendar,
} from 'lucide-react'
import { fetchJobs } from '../api/jobs'
import StatusBadge from '../components/StatusBadge'
import JobTypeBadge from '../components/JobTypeBadge'
import type { JobSummary } from '../types/JobSummary'

// ── Helpers ────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const ms   = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(start: string, end?: string): string {
  if (!end) return '—'
  const ms   = new Date(end).getTime() - new Date(start).getTime()
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  return `${mins}m ${secs % 60}s`
}

// ── Environment config ─────────────────────────────────────────────────

const ENV_CFG: Record<string, {
  badge:   string
  border:  string
  bg:      string
  dim:     string
  accent:  string
  icon:    string
}> = {
  DEV:  {
    badge:  'bg-sig-green/20 text-sig-green border border-sig-green/30',
    border: 'border-l-sig-green',
    bg:     'bg-sig-green-dim',
    dim:    'bg-sig-green/10',
    accent: 'text-sig-green',
    icon:   'bg-sig-green/15',
  },
  SIT:  {
    badge:  'bg-sig-blue/20 text-sig-blue border border-sig-blue/30',
    border: 'border-l-sig-blue',
    bg:     'bg-sig-blue-dim',
    dim:    'bg-sig-blue/10',
    accent: 'text-sig-blue',
    icon:   'bg-sig-blue/15',
  },
  UAT:  {
    badge:  'bg-sig-yellow/20 text-sig-yellow border border-sig-yellow/30',
    border: 'border-l-sig-yellow',
    bg:     'bg-sig-yellow-dim',
    dim:    'bg-sig-yellow/10',
    accent: 'text-sig-yellow',
    icon:   'bg-sig-yellow/15',
  },
  PROD: {
    badge:  'bg-sig-purple/20 text-sig-purple border border-sig-purple/30',
    border: 'border-l-sig-purple',
    bg:     'bg-sig-purple-dim',
    dim:    'bg-sig-purple/10',
    accent: 'text-sig-purple',
    icon:   'bg-sig-purple/15',
  },
}

const ENVS = ['DEV', 'SIT', 'UAT', 'PROD'] as const

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'ABORTED'])

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status)
}

// ── Status icon for env card ───────────────────────────────────────────

function EnvStatusIcon({ status }: { status: string }) {
  if (status === 'SUCCESS')
    return <CheckCircle2 size={20} className="text-sig-green" />
  if (status === 'FAILED')
    return <XCircle size={20} className="text-sig-red" />
  if (status === 'ABORTED')
    return <StopCircle size={20} className="text-sig-yellow" />
  if (['RUNNING', 'PREPARING_WORKSPACE'].includes(status))
    return <Loader2 size={20} className="text-sig-yellow animate-spin" />
  return <AlertCircle size={20} className="text-wiz-dim" />
}

// ── Component ──────────────────────────────────────────────────────────

export default function ApplicationPage() {
  const { appName }  = useParams<{ appName: string }>()
  const navigate     = useNavigate()

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

  // Stats
  const totalDeploys  = appJobs.length
  const successCount  = appJobs.filter(j => j.lifecycleStatus === 'SUCCESS').length
  const failedCount   = appJobs.filter(j => j.lifecycleStatus === 'FAILED').length
  const successRate   = totalDeploys > 0 ? Math.round((successCount / totalDeploys) * 100) : null
  const envsDeployed  = ENVS.filter(e => latestByEnv[e]).length

  return (
    <div className="flex flex-col gap-6 pt-2 animate-fade-in">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="flex items-center justify-center w-8 h-8 rounded border border-wiz-border bg-wiz-surface text-wiz-muted hover:text-wiz-cream hover:border-wiz-border-mid transition-colors"
        >
          <ArrowLeft size={15} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-wiz-cream tracking-tight truncate">{appName}</h1>
            <span className="text-wiz-dim/40">·</span>
            <span className="text-xs text-wiz-muted font-mono">Application Overview</span>
          </div>
        </div>
      </div>

      {/* ── Loading / Error ───────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-3 text-wiz-muted text-sm">
          <Loader2 size={16} className="animate-spin" />
          Loading deployment data…
        </div>
      )}
      {isError && (
        <div className="text-sm text-sig-red py-12 text-center">Failed to load jobs.</div>
      )}

      {!isLoading && !isError && (
        <>
          {/* ── Summary stats strip ──────────────────────────── */}
          {totalDeploys > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                {
                  label: 'Total Deploys',
                  value: totalDeploys,
                  icon:  <Layers size={14} />,
                  color: 'text-wiz-gold',
                  bg:    'bg-wiz-gold-dim',
                },
                {
                  label: 'Successful',
                  value: successCount,
                  icon:  <CheckCircle2 size={14} />,
                  color: 'text-sig-green',
                  bg:    'bg-sig-green-dim',
                },
                {
                  label: 'Failed',
                  value: failedCount,
                  icon:  <XCircle size={14} />,
                  color: 'text-sig-red',
                  bg:    'bg-sig-red-dim',
                },
                {
                  label: 'Success Rate',
                  value: successRate !== null ? `${successRate}%` : '—',
                  icon:  <Activity size={14} />,
                  color: successRate !== null && successRate >= 80 ? 'text-sig-green' : 'text-sig-yellow',
                  bg:    successRate !== null && successRate >= 80 ? 'bg-sig-green-dim' : 'bg-sig-yellow-dim',
                },
              ].map(({ label, value, icon, color, bg }) => (
                <div key={label} className="wiz-card px-4 py-3 flex items-center gap-3">
                  <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', bg)}>
                    <span className={color}>{icon}</span>
                  </div>
                  <div>
                    <p className={clsx('text-lg font-bold leading-none', color)}>{value}</p>
                    <p className="text-[10px] text-wiz-muted uppercase tracking-wider mt-0.5">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Environment status cards — always 4 columns ─── */}
          <section>
            <p className="section-label mb-3 flex items-center gap-2">
              <Server size={12} className="text-wiz-gold" />
              Environment Status
              <span className="ml-auto text-[10px] text-wiz-muted/50 font-normal normal-case tracking-normal">
                {envsDeployed} of {ENVS.length} environments deployed
              </span>
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {ENVS.map((env) => {
                const cfg = ENV_CFG[env]
                const job = latestByEnv[env]

                return (
                  <div
                    key={env}
                    className={clsx(
                      'wiz-card border-l-[3px] overflow-hidden flex flex-col',
                      cfg.border,
                    )}
                  >
                    {/* Card header */}
                    <div className={clsx('px-4 py-3 border-b border-wiz-border/60 flex items-center justify-between', cfg.bg)}>
                      <span className={clsx(
                        'font-mono text-[11px] font-bold uppercase tracking-[0.12em] px-2 py-0.5 rounded border',
                        cfg.badge,
                      )}>
                        {env}
                      </span>
                      {job && (
                        <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center', cfg.icon)}>
                          <EnvStatusIcon status={job.lifecycleStatus} />
                        </div>
                      )}
                    </div>

                    {/* Card body */}
                    <div className="px-4 py-4 flex flex-col gap-3 flex-1">
                      {job ? (
                        <>
                          <StatusBadge status={job.lifecycleStatus} size="sm"
                            pulse={!isTerminal(job.lifecycleStatus)} />

                          <div className="flex flex-col gap-1.5 text-xs text-wiz-muted">
                            <div className="flex items-center gap-1.5">
                              <Clock size={11} className="flex-shrink-0 text-wiz-dim" />
                              <span>{timeAgo(job.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 font-mono" title={job.jobId}>
                              <Layers size={11} className="flex-shrink-0 text-wiz-dim" />
                              <span className="truncate text-[11px]">{job.jobId.slice(0, 12)}…</span>
                            </div>
                          </div>

                          <button
                            onClick={() => navigate(`/jobs/${job.jobId}`)}
                            className={clsx(
                              'mt-auto flex items-center gap-1 text-xs font-semibold transition-colors',
                              cfg.accent, 'hover:opacity-70',
                            )}
                          >
                            <ExternalLink size={11} />
                            View details
                          </button>
                        </>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-2 py-4 text-center">
                          <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center opacity-30', cfg.dim)}>
                            <Server size={14} className="text-wiz-muted" />
                          </div>
                          <p className="text-xs text-wiz-muted/50 italic">No deploys yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* ── Recent deployments table ─────────────────────── */}
          <section>
            <p className="section-label mb-3 flex items-center gap-2">
              <Calendar size={12} className="text-wiz-gold" />
              Recent Deployments
              {appJobs.length > 0 && (
                <span className="ml-auto text-[10px] text-wiz-muted/50 font-normal normal-case tracking-normal">
                  {appJobs.length} {appJobs.length === 1 ? 'deployment' : 'deployments'}
                </span>
              )}
            </p>

            <div className="wiz-card overflow-hidden">
              {appJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                  <div className="w-10 h-10 rounded-full bg-wiz-raised flex items-center justify-center">
                    <Layers size={18} className="text-wiz-dim" />
                  </div>
                  <p className="text-sm text-wiz-muted/60">No deployments found for <span className="font-mono">{appName}</span></p>
                </div>
              ) : (
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col className="w-[9%]"  />   {/* Env */}
                    <col className="w-[11%]" />   {/* Type — deploy / redeploy / rollback */}
                    <col className="w-[14%]" />   {/* Status */}
                    <col className="w-[18%]" />   {/* Started */}
                    <col className="w-[12%]" />   {/* Duration */}
                    <col className="w-[36%]" />   {/* Job ID */}
                  </colgroup>
                  <thead>
                    <tr className="border-b border-wiz-border bg-wiz-bg text-wiz-muted text-[10px] uppercase tracking-wider">
                      <th className="text-left px-4 py-2.5">Env</th>
                      <th className="text-left px-4 py-2.5">Type</th>
                      <th className="text-left px-4 py-2.5">Status</th>
                      <th className="text-left px-4 py-2.5">Started</th>
                      <th className="text-left px-4 py-2.5">Duration</th>
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
                          className="hover:bg-wiz-bg transition-colors cursor-pointer group"
                          onClick={() => navigate(`/jobs/${job.jobId}`)}
                        >
                          {/* Env */}
                          <td className="px-4 py-2.5">
                            {envCfg ? (
                              <span className={clsx(
                                'font-mono text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border',
                                envCfg.badge,
                              )}>
                                {envKey}
                              </span>
                            ) : (
                              <span className="text-xs text-wiz-muted font-mono">{job.environment ?? '—'}</span>
                            )}
                          </td>

                          {/* Type — deploy / redeploy / rollback */}
                          <td className="px-4 py-2.5">
                            <JobTypeBadge type={job.jobType} />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-2.5">
                            <StatusBadge status={job.lifecycleStatus} size="sm"
                              pulse={!isTerminal(job.lifecycleStatus)} />
                          </td>

                          {/* Started */}
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-wiz-cream">{formatDate(job.createdAt)}</span>
                              <span className="text-[10px] text-wiz-muted/60 font-mono">{timeAgo(job.createdAt)}</span>
                            </div>
                          </td>

                          {/* Duration */}
                          <td className="px-4 py-2.5 text-xs text-wiz-gray font-mono">
                            {formatDuration(job.createdAt, job.completedAt)}
                          </td>

                          {/* Job ID — full UUID, monospace, copy-friendly */}
                          <td className="px-4 py-2.5">
                            <span
                              className="text-xs text-wiz-gold group-hover:text-wiz-cream font-mono transition-colors truncate block"
                              title={job.jobId}
                            >
                              {job.jobId}
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
