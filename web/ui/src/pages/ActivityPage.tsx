import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Activity, CheckCircle2, XCircle, Ban, Calendar, TrendingUp, Filter, X } from 'lucide-react'
import clsx from 'clsx'
import { fetchJobs } from '../api/jobs'
import type { JobSummary } from '../types/JobSummary'
import StatusBadge from '../components/StatusBadge'
import BackButton from '../components/BackButton'
import JobTypeBadge from '../components/JobTypeBadge'

// Environment colour mapping (small inline version — page is self-contained)
const ENV_STYLES: Record<string, string> = {
  DEV:  'bg-sig-green-dim  text-sig-green  border-sig-green/25',
  SIT:  'bg-sig-blue-dim   text-sig-blue   border-sig-blue/25',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/25',
  PROD: 'bg-sig-purple-dim text-sig-purple border-sig-purple/25',
}

// Map a lifecycle status to a solid fill colour for per-deploy stack
// segments. Used by the Daily Deployments tiles. Terminal states get their
// semantic signal colour; in-progress states render as blue.
function statusBg(status: string): string {
  switch (status) {
    case 'SUCCESS':         return 'bg-sig-green'
    case 'FAILED':          return 'bg-sig-red'
    case 'ABORTED':         return 'bg-wiz-muted/70'
    case 'ABORT_REQUESTED': return 'bg-sig-yellow/80'
    default:                return 'bg-sig-blue/75'  // CREATED/VALIDATING/RUNNING/etc.
  }
}

// DOM id for a day's card in the per-day breakdown list — used by the
// Daily Deployments tiles so clicking a tile smooth-scrolls to that day.
function dayCardId(date: Date): string {
  return `day-${date.toISOString().slice(0, 10)}`
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
  try {
    const d = new Date(iso)
    const day  = d.toLocaleString('en-GB', { day: '2-digit', month: 'short' })
    const time = d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    return `${day} · ${time}`
  } catch {
    return iso
  }
}

// Lifecycle-status partitions — mirror Dashboard so a job that is still
// in flight gets the same yellow "running" treatment in both places.
const TERMINAL = new Set(['SUCCESS', 'FAILED', 'ABORTED'])
const ACTIVE   = new Set(['CREATED', 'VALIDATING', 'PREPARING_WORKSPACE', 'RUNNING'])

function formatDuration(createdAt: string, completedAt?: string, lifecycleStatus?: string): string {
  const start = new Date(createdAt).getTime()
  if (!start) return '—'
  const end = completedAt
    ? new Date(completedAt).getTime()
    : TERMINAL.has(lifecycleStatus ?? '') ? null : Date.now()
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

// Small inline env badge — matches the Dashboard styling so the two
// tables are visually identical.
function EnvBadge({ env }: { env: string }) {
  const e = env?.toUpperCase() ?? '—'
  const cls = ENV_STYLES[e] ?? 'bg-wiz-surface text-wiz-muted border-wiz-border'
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider border',
      cls,
    )}>
      {e}
    </span>
  )
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

  // ── Day filter (Daily Deployments → per-day list) ────────────────
  // Click a day tile to narrow the per-day breakdown list to that day
  // only. Clicking the same day again (or the clear-chip) restores the
  // full week. Stored as Date.toDateString() — stable, time-zone-safe
  // key that's easy to compare without parsing.
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const toggleDayFilter = (date: Date) => {
    const key = date.toDateString()
    if (selectedDay === key) {
      setSelectedDay(null)
      return
    }
    setSelectedDay(key)
    // Drop the user near the list so they see the filter take effect
    // without having to scroll manually. Defer one tick so React has
    // re-rendered the list before we scroll.
    window.setTimeout(() => {
      document.getElementById('per-day-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  // Resolved label/count for the active filter — used by the clear banner.
  const selectedDayInfo = useMemo(() => {
    if (!selectedDay) return null
    const day = days.find(d => d.date.toDateString() === selectedDay)
    if (!day) return null
    return {
      weekday: day.weekday,
      label:   day.label,
      count:   day.jobs.length,
      isToday: day.date.toDateString() === new Date().toDateString(),
    }
  }, [selectedDay, days])

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

      {/* ── Daily Deployments panel ──────────────────────────────────
          Layout philosophy: each day is its own *tile* with three vertical
          zones — count (top), bar (middle), label (bottom). The tile gives
          every day visible presence even when zero deploys, so the panel
          never feels "squeezed". The bar in the middle zone uses propor-
          tional outcome segments (success / aborted / failed) to convey
          mix at a glance without per-deploy noise. */}
      <div
        className="wiz-card px-5 py-4 border-l-[3px] border-l-wiz-gold"
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-wiz-gold" />
            <span className="section-label">Daily Deployments</span>
          </div>
          <div className="flex items-center gap-3 text-[9px] font-mono text-wiz-muted">
            {/* Inline legend — declares the segment colours up-front so the
                tiles below need no annotation. */}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-sig-green" /> success
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-wiz-muted/70" /> aborted
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm bg-sig-red" /> failed
            </span>
            <span className="text-wiz-dim/70">·</span>
            <span>
              busiest: <span className="text-wiz-cream font-semibold">{totals.busiest?.weekday ?? '—'}</span>
              {totals.busiest?.jobs.length ? ` (${totals.busiest.jobs.length})` : ''}
            </span>
          </div>
        </div>

        {/* Tile grid — 7 evenly-spaced day tiles.
            Each tile is a metric-card-with-sparkline:
              [ Day · date ]   ← header row
              [ count ]  [ ▮▮▮ ]   ← count on left, vertical per-deploy
                                     stack on right (newest at top)
              [ outcome chips ]    ← optional footer
            The whole tile is a button: click → smooth-scroll to that day's
            section in the breakdown list below. Empty days render the same
            shell (so the row has consistent rhythm) but with the bar omitted
            and the tile disabled. */}
        <div className="grid grid-cols-7 gap-2.5 items-stretch">
          {days.map((d) => {
            const successCnt = d.jobs.filter(j => j.lifecycleStatus === 'SUCCESS').length
            const failedCnt  = d.jobs.filter(j => j.lifecycleStatus === 'FAILED').length
            const abortedCnt = d.jobs.filter(j => j.lifecycleStatus === 'ABORTED').length
            const heightPct  = d.jobs.length === 0 ? 0 : Math.max(14, (d.jobs.length / maxBarCount) * 100)
            const isToday    = d.date.toDateString() === new Date().toDateString()

            const parts: string[] = []
            if (successCnt > 0) parts.push(`${successCnt} ✓`)
            if (failedCnt  > 0) parts.push(`${failedCnt} ✗`)
            if (abortedCnt > 0) parts.push(`${abortedCnt} ⊘`)
            const tooltip = d.jobs.length === 0
              ? `${d.weekday} ${d.label}: no deploys`
              : `${d.weekday} ${d.label}: ${d.jobs.length} deploy${d.jobs.length > 1 ? 's' : ''} — ${parts.join(', ')} · click for details`

            const hasDeploys = d.jobs.length > 0
            const isSelected = selectedDay === d.date.toDateString()

            return (
              <button
                type="button"
                key={d.date.toISOString()}
                title={isSelected ? `${tooltip} · click again to clear filter` : tooltip}
                disabled={!hasDeploys}
                aria-pressed={isSelected}
                onClick={() => toggleDayFilter(d.date)}
                className={clsx(
                  'group relative flex flex-col rounded-lg border overflow-hidden text-left transition-all duration-150',
                  // Selected state takes priority — strongest gold ring +
                  // surface tint so the active filter is unmistakable.
                  isSelected
                    ? 'border-wiz-gold ring-2 ring-wiz-gold/45 bg-wiz-gold/[0.08] shadow-md'
                    : isToday
                      ? 'border-wiz-gold/45 bg-wiz-gold/[0.04]'
                      : 'border-wiz-border-mid bg-wiz-bg/30',
                  hasDeploys
                    ? 'cursor-pointer hover:-translate-y-[1px] hover:border-wiz-gold/60 hover:shadow-md'
                    : 'cursor-default opacity-80',
                )}
              >
                {/* Header strip — weekday + date.
                    Tinted gold for today so the focal day pops; otherwise
                    a quiet raised band. */}
                <div className={clsx(
                  'px-3 py-1.5 border-b flex items-baseline justify-between gap-1',
                  isToday
                    ? 'bg-wiz-gold/12 border-wiz-gold/30'
                    : 'bg-wiz-raised/40 border-wiz-border/40',
                )}>
                  <span className={clsx(
                    'text-[10px] font-bold uppercase tracking-[0.14em] leading-none',
                    isToday ? 'text-wiz-gold' : 'text-wiz-cream/80',
                  )}>
                    {d.weekday}
                  </span>
                  <span className="text-[9px] font-mono text-wiz-dim leading-none">{d.label}</span>
                </div>

                {/* Body — count on the left, vertical per-deploy stack on
                    the right. The stack iterates d.jobs (sorted newest-
                    first), so the top segment is the LATEST deploy. */}
                <div className="flex-1 px-3 py-3 flex items-stretch gap-2 min-h-[100px]">
                  {/* Count column */}
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <div className={clsx(
                        'text-[28px] font-serif font-bold tabular-nums leading-none',
                        hasDeploys ? 'text-wiz-cream' : 'text-wiz-dim/40',
                      )}>
                        {d.jobs.length || '—'}
                      </div>
                      <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-wiz-muted/70 mt-1 leading-none">
                        {d.jobs.length === 1 ? 'deploy' : 'deploys'}
                      </div>
                    </div>
                    {/* Outcome chips — three counters in semantic colour.
                        Each only renders when its count is > 0 so the row
                        is information-dense without filler. */}
                    {hasDeploys && (
                      <div className="flex items-center gap-2 mt-2 text-[10px] font-mono tabular-nums">
                        {successCnt > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-sig-green" title={`${successCnt} success`}>
                            <span className="w-1.5 h-1.5 rounded-sm bg-sig-green" />{successCnt}
                          </span>
                        )}
                        {failedCnt > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-sig-red" title={`${failedCnt} failed`}>
                            <span className="w-1.5 h-1.5 rounded-sm bg-sig-red" />{failedCnt}
                          </span>
                        )}
                        {abortedCnt > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-wiz-muted" title={`${abortedCnt} aborted`}>
                            <span className="w-1.5 h-1.5 rounded-sm bg-wiz-muted/70" />{abortedCnt}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Vertical stack — newest deploy at TOP.
                      d.jobs is already sorted desc by createdAt (see days
                      useMemo), and flex-col paints in document order, so
                      d.jobs[0] (most recent) is the top segment. */}
                  <div className="w-3 flex flex-col justify-end items-stretch">
                    {hasDeploys ? (
                      <div
                        className="w-full rounded-md overflow-hidden flex flex-col shadow-sm group-hover:shadow transition-shadow"
                        style={{ height: `${heightPct}%`, minHeight: 12 }}
                      >
                        {d.jobs.map(job => (
                          <div
                            key={job.jobId}
                            className={statusBg(job.lifecycleStatus)}
                            style={{ flex: '1 1 0', minHeight: 0 }}
                          />
                        ))}
                      </div>
                    ) : (
                      // Empty rail — keeps the stack column visually present
                      // so all 7 tiles share the same layout grid.
                      <div className="w-full h-3 rounded-full bg-wiz-border/30" aria-hidden />
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Day-filter chip — only when a day is selected from the tiles ──
          Lives just above the breakdown list so the user immediately sees
          what's being filtered and can clear it in one click. */}
      {selectedDayInfo && (
        <div
          className="wiz-card px-4 py-2 flex items-center justify-between gap-3 border-l-[3px] border-l-wiz-gold rounded-lg"
          style={{ boxShadow: '0 2px 8px rgba(139,26,26,0.04)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Filter size={12} className="text-wiz-gold flex-shrink-0" />
            <span className="text-[11px] font-mono text-wiz-cream/85 truncate">
              Showing only{' '}
              <span className="font-bold text-wiz-gold">
                {selectedDayInfo.isToday ? 'Today' : selectedDayInfo.weekday}
              </span>
              <span className="text-wiz-muted"> · {selectedDayInfo.label} · </span>
              <span className="font-bold tabular-nums text-wiz-cream">{selectedDayInfo.count}</span>
              <span className="text-wiz-muted"> deploy{selectedDayInfo.count === 1 ? '' : 's'}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold uppercase tracking-wider text-wiz-muted hover:text-wiz-cream hover:bg-wiz-bg/60 transition-colors"
            title="Clear day filter — show all 7 days"
          >
            <X size={11} /> Show all days
          </button>
        </div>
      )}

      {/* ── Per-day breakdown — list of jobs grouped by day ──────────
          When selectedDay is set the list collapses to that single day;
          otherwise it shows every day with at least one deploy. */}
      <div id="per-day-list" className="flex flex-col gap-3 scroll-mt-4">
        {[...days].reverse().map((d) => {
          if (d.jobs.length === 0) return null
          if (selectedDay && d.date.toDateString() !== selectedDay) return null
          const success = d.jobs.filter(j => j.lifecycleStatus === 'SUCCESS').length
          const failed  = d.jobs.filter(j => j.lifecycleStatus === 'FAILED').length
          const isToday = d.date.toDateString() === new Date().toDateString()
          return (
            <div
              key={d.date.toISOString()}
              id={dayCardId(d.date)}
              className="wiz-card overflow-hidden border-l-[3px] border-l-wiz-gold/60 scroll-mt-4 rounded-lg"
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
              {/* Jobs table — mirrors the Dashboard layout: same colgroup
                  widths, same column headers, same status-coloured row
                  accents on the leftmost cell, same hover and active-row
                  tinting. The fixed column widths replace the previous
                  flex-row that pushed appName and env apart whenever the
                  card was wide. */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[24%]" />   {/* Job ID */}
                    <col className="w-[18%]" />   {/* Application */}
                    <col className="w-[9%]"  />   {/* Type */}
                    <col className="w-[8%]"  />   {/* Environment */}
                    <col className="w-[11%]" />   {/* Status */}
                    <col className="w-[17%]" />   {/* Started */}
                    <col className="w-[13%]" />   {/* Duration */}
                  </colgroup>
                  <thead>
                    <tr className="bg-wiz-raised border-b-2 border-wiz-border-mid">
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">Job ID</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">Application</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">Type</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">Environment</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">Status</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">Started</th>
                      <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-wiz-border/40">
                    {d.jobs.map(job => {
                      const isActive = ACTIVE.has(job.lifecycleStatus)
                      return (
                        <tr
                          key={job.jobId}
                          onClick={() => navigate(`/jobs/${job.jobId}`)}
                          className={clsx(
                            'group transition-all duration-150 cursor-pointer',
                            job.lifecycleStatus === 'FAILED'
                              ? 'bg-sig-red/[0.025]   hover:bg-sig-red/[0.055]'
                              : isActive
                              ? 'bg-sig-yellow/[0.025] hover:bg-sig-yellow/[0.055]'
                              : 'hover:bg-wiz-bg',
                          )}
                        >
                          {/* Job ID — first cell carries the status-coloured
                              left accent strip (mirrors Dashboard). */}
                          <td className={clsx(
                            'px-4 py-2 border-l-[3px] transition-colors duration-150',
                            job.lifecycleStatus === 'FAILED'
                              ? 'border-l-sig-red/40    group-hover:border-l-sig-red/80'
                              : job.lifecycleStatus === 'SUCCESS'
                              ? 'border-l-transparent   group-hover:border-l-sig-green/50'
                              : isActive
                              ? 'border-l-sig-yellow/50 group-hover:border-l-sig-yellow'
                              : job.lifecycleStatus === 'ABORTED'
                              ? 'border-l-wiz-border/60 group-hover:border-l-wiz-border-strong'
                              : 'border-l-transparent   group-hover:border-l-wiz-border-mid',
                          )}>
                            <span className="font-mono text-xs text-wiz-gold/90 truncate block" title={job.jobId}>
                              {job.jobId}
                            </span>
                          </td>

                          {/* Application */}
                          <td className="px-4 py-2">
                            <span className="text-sm font-medium text-wiz-cream truncate block" title={job.appName}>
                              {job.appName}
                            </span>
                          </td>

                          {/* Type — deploy / redeploy / rollback */}
                          <td className="px-4 py-2">
                            <JobTypeBadge type={job.jobType} />
                          </td>

                          {/* Environment */}
                          <td className="px-4 py-2">
                            <EnvBadge env={job.environment} />
                          </td>

                          {/* Status */}
                          <td className="px-4 py-2">
                            <StatusBadge status={job.lifecycleStatus} pulse={isActive} />
                          </td>

                          {/* Started — wall-clock + relative ago */}
                          <td className="px-4 py-2">
                            <span className="font-mono text-xs text-wiz-gray block" title={job.createdAt}>
                              {formatTime(job.createdAt)}
                            </span>
                            <span className="font-mono text-[10px] text-wiz-dim mt-0.5 block">
                              {timeAgo(job.createdAt)}
                            </span>
                          </td>

                          {/* Duration — live counter for active jobs, final for terminal */}
                          <td className="px-4 py-2">
                            <span className="font-mono text-xs text-wiz-gray block">
                              {formatDuration(job.createdAt, job.completedAt, job.lifecycleStatus)}
                            </span>
                            {isActive && (
                              <span className="font-mono text-[10px] text-sig-yellow mt-0.5 block animate-pulse">
                                running…
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
