import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Activity, CheckCircle2, XCircle, Ban, Clock, Calendar, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { fetchJobs } from '../api/jobs'
import type { JobSummary } from '../types/JobSummary'
import StatusBadge from '../components/StatusBadge'
import BackButton from '../components/BackButton'

// Environment colour mapping (small inline version — page is self-contained)
const ENV_STYLES: Record<string, string> = {
  DEV:  'bg-sig-green-dim  text-sig-green  border-sig-green/25',
  SIT:  'bg-sig-blue-dim   text-sig-blue   border-sig-blue/25',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/25',
  PROD: 'bg-sig-purple-dim text-sig-purple border-sig-purple/25',
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleString('en-GB', { day: '2-digit', month: 'short' })} · ${d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

export default function ActivityPage() {
  const navigate = useNavigate()
  const { data: jobs, isLoading } = useQuery<JobSummary[]>({
    queryKey: ['jobs-list'],
    queryFn:  fetchJobs,
    refetchInterval: 30_000,
  })

  // Group jobs by day for the last 7 days
  const days = useMemo(() => {
    if (!jobs) return []
    const now = new Date()
    const result: { date: Date; label: string; weekday: string; jobs: JobSummary[] }[] = []
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now)
      day.setDate(day.getDate() - i)
      day.setHours(0, 0, 0, 0)
      const next = new Date(day)
      next.setDate(next.getDate() + 1)
      const dayJobs = jobs.filter(j => {
        const t = new Date(j.createdAt).getTime()
        return t >= day.getTime() && t < next.getTime()
      })
      result.push({
        date:    day,
        label:   day.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        weekday: day.toLocaleDateString('en-GB', { weekday: 'short' }),
        jobs:    dayJobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      })
    }
    return result
  }, [jobs])

  // Aggregate stats
  const totals = useMemo(() => {
    const all = days.flatMap(d => d.jobs)
    const success = all.filter(j => j.lifecycleStatus === 'SUCCESS').length
    const failed  = all.filter(j => j.lifecycleStatus === 'FAILED').length
    const aborted = all.filter(j => j.lifecycleStatus === 'ABORTED').length
    const successRate = all.length > 0 ? Math.round((success / all.length) * 100) : 0
    const busiest = days.reduce((max, d) => d.jobs.length > max.jobs.length ? d : max, days[0] || { jobs: [], label: '—' })
    return { total: all.length, success, failed, aborted, successRate, busiest }
  }, [days])

  const maxBarCount = Math.max(...days.map(d => d.jobs.length), 1)

  return (
    <div className="flex flex-col gap-4 pt-4 animate-fade-in">

      {/* ── Prominent back button — primary navigation, easy to spot ── */}
      <BackButton to="/" label="Dashboard" />

      {/* ── Page header ── */}
      <div className="flex items-end justify-between gap-4 pb-2 border-b border-wiz-border/60">
        <div className="flex items-end gap-3 min-w-0">
          <div className="w-1 h-8 rounded-full bg-wiz-gold flex-shrink-0" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-xl font-serif font-bold text-wiz-cream leading-none">7-Day Activity</h1>
            <p className="text-[11px] text-wiz-muted mt-1.5 font-mono">
              {days[0]?.label} to {days[days.length - 1]?.label} · per-day deployment breakdown
            </p>
          </div>
        </div>
      </div>

      {/* ── Summary metric strip — 5 cards (added Aborted) ── */}
      <div className="grid grid-cols-5 gap-3">
        <SummaryCard
          icon={<Activity size={12} strokeWidth={2.4} />}
          iconBg="bg-wiz-gold/12 text-wiz-gold"
          label="Total deploys"
          value={totals.total}
          tint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(139,26,26,0.04) 100%)"
        />
        <SummaryCard
          icon={<CheckCircle2 size={12} strokeWidth={2.4} />}
          iconBg="bg-sig-green/15 text-sig-green"
          label="Successful"
          value={totals.success}
          accent="text-sig-green"
          tint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(22,163,74,0.05) 100%)"
        />
        <SummaryCard
          icon={<XCircle size={12} strokeWidth={2.4} />}
          iconBg="bg-sig-red/15 text-sig-red"
          label="Failed"
          value={totals.failed}
          accent={totals.failed > 0 ? 'text-sig-red' : undefined}
          tint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(220,38,38,0.06) 100%)"
        />
        <SummaryCard
          icon={<Ban size={12} strokeWidth={2.4} />}
          iconBg="bg-wiz-border-strong/25 text-wiz-muted"
          label="Aborted"
          value={totals.aborted}
          tint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(160,150,135,0.10) 100%)"
        />
        <SummaryCard
          icon={<TrendingUp size={12} strokeWidth={2.4} />}
          iconBg="bg-sig-blue/15 text-sig-blue"
          label="Success rate"
          value={`${totals.successRate}%`}
          accent={totals.successRate >= 90 ? 'text-sig-green' : totals.successRate >= 70 ? 'text-sig-yellow' : 'text-sig-red'}
          tint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(37,99,235,0.04) 100%)"
        />
      </div>

      {/* ── Big bar chart — full-size version of the sidebar mini-chart ── */}
      <div
        className="wiz-card px-5 py-4 border-l-[3px] border-l-wiz-gold"
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-wiz-gold" />
            <span className="section-label">Daily Deployments</span>
          </div>
          <span className="text-[10px] font-mono text-wiz-muted">
            busiest day: <span className="text-wiz-cream font-semibold">{totals.busiest?.label ?? '—'}</span>
            {totals.busiest?.jobs.length ? ` · ${totals.busiest.jobs.length} deploys` : ''}
          </span>
        </div>

        <div className="flex items-end gap-2 h-32">
          {days.map((d) => {
            const heightPct = d.jobs.length === 0 ? 0 : Math.max(8, (d.jobs.length / maxBarCount) * 100)
            const failedCount = d.jobs.filter(j => j.lifecycleStatus === 'FAILED').length
            const isToday = d.date.toDateString() === new Date().toDateString()
            return (
              <div key={d.date.toISOString()} className="flex-1 flex flex-col items-center gap-1.5 group">
                {/* Count above bar */}
                <span className={clsx(
                  'text-[10px] font-mono font-bold tabular-nums',
                  d.jobs.length === 0 ? 'text-wiz-dim/50' : 'text-wiz-cream',
                )}>
                  {d.jobs.length || ''}
                </span>
                {/* Bar */}
                <div className="flex-1 w-full flex flex-col justify-end relative">
                  <div
                    className={clsx(
                      'rounded-md transition-all duration-200 group-hover:scale-x-105 origin-bottom',
                      d.jobs.length === 0
                        ? 'bg-wiz-border/40'
                        : failedCount > 0
                        ? 'bg-gradient-to-t from-sig-red/85 to-sig-red/55 group-hover:shadow-[0_0_14px_rgba(220,38,38,0.30)]'
                        : 'bg-gradient-to-t from-sig-green/85 to-sig-green/55 group-hover:shadow-[0_0_14px_rgba(22,163,74,0.30)]',
                      isToday && d.jobs.length > 0 && 'ring-2 ring-wiz-gold/40',
                    )}
                    style={{ height: `${heightPct}%`, minHeight: d.jobs.length > 0 ? 6 : 4 }}
                  />
                </div>
                {/* Day label */}
                <div className="flex flex-col items-center">
                  <span className={clsx(
                    'text-[10px] font-bold uppercase tracking-wider',
                    isToday ? 'text-wiz-gold' : 'text-wiz-muted',
                  )}>
                    {d.weekday}
                  </span>
                  <span className="text-[9px] font-mono text-wiz-dim">{d.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Per-day breakdown — list of jobs grouped by day ── */}
      <div className="flex flex-col gap-3">
        {[...days].reverse().map((d) => {
          if (d.jobs.length === 0) return null
          const success = d.jobs.filter(j => j.lifecycleStatus === 'SUCCESS').length
          const failed  = d.jobs.filter(j => j.lifecycleStatus === 'FAILED').length
          const isToday = d.date.toDateString() === new Date().toDateString()
          return (
            <div
              key={d.date.toISOString()}
              className="wiz-card overflow-hidden border-l-[3px] border-l-wiz-gold/60"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
            >
              {/* Day header */}
              <div className="px-4 py-2.5 border-b border-wiz-border/60 bg-wiz-raised/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    'text-[10px] font-bold uppercase tracking-[0.16em]',
                    isToday ? 'text-wiz-gold' : 'text-wiz-cream/85',
                  )}>
                    {isToday ? 'Today' : d.weekday}
                  </span>
                  <span className="text-[10px] font-mono text-wiz-muted">{d.label}</span>
                  <span className="inline-flex items-center px-1.5 py-[2px] rounded-sm text-[9px] font-mono font-bold tabular-nums bg-wiz-bg/60 border border-wiz-border/60 text-wiz-muted">
                    {d.jobs.length}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  {success > 0 && (
                    <span className="inline-flex items-center gap-1 text-sig-green">
                      <CheckCircle2 size={9} strokeWidth={2.5} /> {success}
                    </span>
                  )}
                  {failed > 0 && (
                    <span className="inline-flex items-center gap-1 text-sig-red">
                      <XCircle size={9} strokeWidth={2.5} /> {failed}
                    </span>
                  )}
                </div>
              </div>
              {/* Jobs list */}
              <ul className="divide-y divide-wiz-border/40">
                {d.jobs.map(job => {
                  const env = job.environment?.toUpperCase() ?? '—'
                  const envStyle = ENV_STYLES[env] ?? 'bg-wiz-surface text-wiz-muted border-wiz-border'
                  return (
                    <li
                      key={job.jobId}
                      onClick={() => navigate(`/jobs/${job.jobId}`)}
                      className={clsx(
                        'px-4 py-2 flex items-center gap-3 cursor-pointer transition-colors',
                        'hover:bg-wiz-bg/60',
                        job.lifecycleStatus === 'FAILED' && 'bg-sig-red/[0.02]',
                      )}
                    >
                      <span className="font-mono text-xs text-wiz-gold/85 w-[16ch] truncate flex-shrink-0" title={job.jobId}>
                        {job.jobId}
                      </span>
                      <span className="text-sm font-medium text-wiz-cream flex-1 truncate">{job.appName}</span>
                      <span className={clsx(
                        'inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider border',
                        envStyle,
                      )}>
                        {env}
                      </span>
                      <StatusBadge status={job.lifecycleStatus} />
                      <span className="font-mono text-[11px] text-wiz-muted w-[5.5rem] text-right flex items-center justify-end gap-1">
                        <Clock size={10} className="opacity-60" />
                        {timeAgo(job.createdAt)}
                      </span>
                      <span className="font-mono text-[10px] text-wiz-dim w-[6rem] text-right">
                        {formatTime(job.createdAt)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        {/* Empty state */}
        {!isLoading && days.every(d => d.jobs.length === 0) && (
          <div className="wiz-card px-6 py-12 text-center">
            <Activity size={28} className="text-wiz-border-mid mx-auto mb-3" />
            <p className="text-wiz-muted text-sm">No deployments in the last 7 days.</p>
          </div>
        )}
      </div>

    </div>
  )
}

// ── Summary Card ──────────────────────────────────────────────────

interface SummaryCardProps {
  icon:    React.ReactNode
  iconBg:  string
  label:   string
  value:   string | number
  accent?: string
  tint:    string
}

function SummaryCard({ icon, iconBg, label, value, accent, tint }: SummaryCardProps) {
  return (
    <div
      className="wiz-card px-3.5 py-3 shadow-[0_3px_10px_rgba(0,0,0,0.06)] border border-wiz-border-mid hover:-translate-y-[2px] hover:border-wiz-gold transition-all duration-200 group"
      style={{ background: tint }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 22px rgba(139,26,26,0.16), 0 2px 4px rgba(139,26,26,0.10)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 3px 10px rgba(0,0,0,0.06)' }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className={clsx('flex items-center justify-center w-[18px] h-[18px] rounded-[5px] flex-shrink-0', iconBg)}>
          {icon}
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-wiz-gold leading-none">
          {label}
        </span>
      </div>
      <span className={clsx(
        'text-[26px] font-serif font-bold tabular-nums leading-none',
        accent ?? 'text-wiz-cream',
      )}>
        {value}
      </span>
    </div>
  )
}
