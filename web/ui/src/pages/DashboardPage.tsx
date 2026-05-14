import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, RefreshCw, StopCircle, Activity, Search, X,
  Filter, Layers, Zap, CheckCircle2, XCircle, Ban,
  Wand2, ArrowUp,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { fetchDashboardSummary, fetchJobs, abortJob } from '../api/jobs'
import RedeployModal from '../components/RedeployModal'
import RollbackModal from '../components/RollbackModal'
import type { DashboardSummary } from '../types/DashboardSummary'
import type { JobSummary } from '../types/JobSummary'
import StatusBadge from '../components/StatusBadge'
import JobTypeBadge from '../components/JobTypeBadge'
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
  label:       string
  value:       number
  accent:      string
  Icon:        LucideIcon
  iconBg:      string    // tinted bg + text colour for icon chip, e.g. "bg-wiz-gold/12 text-wiz-gold"
  cardTint:    string    // subtle background gradient css (e.g. "linear-gradient(135deg, ...)")
  trend?:      number
  muted?:      boolean
  valueColor?: string
  activeBg?:   string
  onClick?:    () => void
  active?:     boolean
  isReset?:    boolean    // TOTAL JOBS — active = "show all", not a filter
  dim?:        boolean    // dim non-active cards when another card is active
  delayMs?:    number     // stagger entry animation
}

function MetricCard({
  label, value, accent, Icon, iconBg, cardTint,
  trend, muted, valueColor, activeBg,
  onClick, active, isReset, dim, delayMs,
}: MetricCardProps) {
  return (
    <div
      className={clsx(
        'relative wiz-card px-3.5 py-3 animate-fade-in group',
        'shadow-[0_3px_10px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]',
        accent,
        'transition-all duration-200',
        onClick && 'cursor-pointer select-none',
        onClick && !active && 'hover:shadow-[0_8px_22px_rgba(139,26,26,0.16),0_2px_4px_rgba(139,26,26,0.10)] hover:-translate-y-[2px] hover:border-wiz-gold',
        active && activeBg,
        dim && 'opacity-55 hover:opacity-100',
      )}
      style={{
        background: cardTint,
        ...(delayMs ? { animationDelay: `${delayMs}ms`, animationFillMode: 'backwards' as const } : {}),
      }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
    >
      {/* Top row — icon chip + label, with right-side affordance/state */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={clsx(
            'flex items-center justify-center w-[18px] h-[18px] rounded-[5px] flex-shrink-0',
            iconBg,
          )}>
            <Icon size={10} strokeWidth={2.4} />
          </span>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-wiz-gold leading-none truncate">
            {label}
          </p>
        </div>

        {/* Filter affordance — dim filter icon at rest */}
        {onClick && !active && (
          <Filter
            size={9}
            className="text-wiz-dim/40 group-hover:text-wiz-muted/70 transition-colors duration-150 flex-shrink-0"
          />
        )}

        {/* Active "FILTERED" badge — only on filter cards */}
        {active && !isReset && (
          <span className="inline-flex items-center gap-0.5 px-1 py-[1px] rounded-sm text-[8px] font-bold uppercase tracking-wider bg-wiz-gold/15 text-wiz-gold border border-wiz-gold/30 leading-none">
            <Filter size={6} strokeWidth={2.5} />
            On
          </span>
        )}
      </div>

      {/* Value + trend — single line, all the room */}
      <div className="flex items-baseline gap-1.5">
        <span className={clsx(
          'text-[26px] font-serif font-bold tabular-nums leading-none',
          muted && value === 0    ? 'text-wiz-muted/40'
          : valueColor && value > 0 ? valueColor
          : 'text-wiz-cream',
        )}>
          {value}
        </span>
        {trend !== undefined && trend !== 0 && (
          <span className={`text-[10px] font-mono ${trend > 0 ? 'text-sig-green' : 'text-sig-red'}`}>
            {trend > 0 ? '↑' : '↓'}{Math.abs(trend)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Pulse Ribbon ──────────────────────────────────────────────────
// Heartbeat-style strip: 30 most recent deploys as colour-coded segments.
// Standard visualization in modern deploy dashboards (Vercel, Netlify,
// GitHub Actions). Each segment is hoverable (shows tooltip), clickable
// (jumps to job detail), and active jobs pulse.

interface PulseRibbonProps {
  jobs:     JobSummary[]
  navigate: (path: string) => void
}

function PulseRibbon({ jobs, navigate }: PulseRibbonProps) {
  const recent = [...jobs]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30)
    // newest is index 0 (leftmost), oldest is last (rightmost)

  if (recent.length === 0) return null

  // Aggregate stats for the side panel
  const successCount = recent.filter(j => j.lifecycleStatus === 'SUCCESS').length
  const failCount    = recent.filter(j => j.lifecycleStatus === 'FAILED').length
  const successRate  = recent.length > 0 ? Math.round((successCount / recent.length) * 100) : 0

  // Trend chip colour by success rate
  const trendColour = successRate >= 90 ? 'text-sig-green'
                    : successRate >= 70 ? 'text-sig-yellow'
                    : 'text-sig-red'

  return (
    <div
      className="wiz-card px-4 py-3 flex items-center gap-4 border-l-[3px] border-l-wiz-gold"
      style={{
        // Gradient runs left-to-right: crimson tint near "now" (left), fading to white toward older (right)
        background: 'linear-gradient(90deg, rgba(139,26,26,0.04) 0%, rgba(255,255,255,1) 30%)',
        boxShadow: '0 3px 12px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {/* Left: descriptive label — what this ribbon shows */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="relative flex w-1.5 h-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-wiz-gold opacity-50 animate-ping" style={{ animationDuration: '2.4s' }} />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-wiz-gold" />
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-wiz-cream/80 whitespace-nowrap">
          Last {recent.length} Deploys
        </span>
      </div>

      {/* Middle: heartbeat ribbon — newest on left, oldest on right */}
      <div className="flex flex-1 gap-[2px] h-3 min-w-0">
        {recent.map((job, i) => {
          const status = job.lifecycleStatus
          const isRunning = ACTIVE.has(status)
          // Newest (i=0) = brightest, oldest (i=29) = dimmest — emphasises "now" on the left
          const opacity = 1 - (i / recent.length) * 0.45
          return (
            <button
              key={job.jobId}
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.jobId}`) }}
              title={`${job.appName} · ${status} · ${timeAgo(job.createdAt)}`}
              className={clsx(
                'flex-1 rounded-[2px] transition-all duration-200 cursor-pointer',
                'hover:scale-y-[1.6] hover:opacity-100 hover:shadow-[0_0_8px_currentColor] relative',
                status === 'SUCCESS' ? 'bg-sig-green text-sig-green'
                : status === 'FAILED' ? 'bg-sig-red text-sig-red'
                : isRunning ? 'bg-sig-yellow text-sig-yellow animate-pulse'
                : 'bg-wiz-border-strong/60 text-wiz-border-strong',
              )}
              style={{ opacity }}
              aria-label={`Job ${job.appName} ${status}`}
            />
          )
        })}
      </div>

      {/* Right: health chip */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {(() => {
          const tier =
            successRate >= 90 ? 'healthy'
            : successRate >= 70 ? 'stable'
            : 'attention'

          const pillClass =
            tier === 'healthy' ? 'bg-sig-green-dim text-sig-green border-sig-green/30'
            : tier === 'stable' ? 'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/30'
            : 'bg-sig-red-dim text-sig-red border-sig-red/30'

          const dotClass =
            tier === 'healthy' ? 'bg-sig-green'
            : tier === 'stable' ? 'bg-sig-yellow'
            : 'bg-sig-red'

          return (
            <div
              className={clsx(
                'inline-flex items-center gap-1.5 px-2 py-[3px] rounded-md text-[10px] font-bold tabular-nums border',
                pillClass,
              )}
              title={`Health score: ${successRate}% — ${successCount} successful / ${failCount} failed across the last ${recent.length} deployments`}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotClass)} />
              <span>{successRate}%</span>
              <span className="opacity-65 text-[8.5px] font-bold uppercase tracking-[0.08em]">
                {tier}
              </span>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Skeleton Row (7 cols — Job ID | App | Type | Env | Status | Started | Duration) ──

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-2">
          <div className="skeleton h-4 rounded w-3/4" />
        </td>
      ))}
    </tr>
  )
}

// ── Timestamp — compact format ────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const day   = d.toLocaleString('en-GB', { day: '2-digit', month: 'short' })
    const time  = d.toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    return `${day} · ${time}`
  } catch {
    return iso
  }
}

const TERMINAL = new Set(['SUCCESS', 'FAILED', 'ABORTED'])
const ACTIVE   = new Set(['CREATED', 'VALIDATING', 'PREPARING_WORKSPACE', 'RUNNING'])

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

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

// ── Filter types ─────────────────────────────────────────────────

type EnvFilter    = '' | 'DEV' | 'SIT' | 'UAT' | 'PROD'
type StatusFilter = '' | 'SUCCESS' | 'FAILED' | 'RUNNING' | 'ABORTED'

// ── Main Page ────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // Initialise filters from URL — lets Platform Health insights deep-link in
  const initialEnv    = (searchParams.get('env')?.toUpperCase()    || '') as EnvFilter
  const initialStatus = (searchParams.get('status')?.toUpperCase() || '') as StatusFilter
  const initialQuery  = searchParams.get('q') || ''

  const [envFilter, setEnvFilter]       = useState<EnvFilter>(
    ['DEV','SIT','UAT','PROD'].includes(initialEnv) ? initialEnv : ''
  )
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    ['SUCCESS','FAILED','RUNNING','ABORTED'].includes(initialStatus) ? initialStatus : ''
  )
  const [searchQuery, setSearchQuery]   = useState(initialQuery)
  const [refreshing, setRefreshing]     = useState(false)
  const [scrolled, setScrolled] = useState(false)

  // Sync filters with URL when params change (e.g. user clicks an insight card
  // while already on the dashboard — query params change without re-mount)
  useEffect(() => {
    const env    = (searchParams.get('env')?.toUpperCase()    || '') as EnvFilter
    const status = (searchParams.get('status')?.toUpperCase() || '') as StatusFilter
    const q      = searchParams.get('q') || ''
    setEnvFilter(['DEV','SIT','UAT','PROD'].includes(env) ? env : '')
    setStatusFilter(['SUCCESS','FAILED','RUNNING','ABORTED'].includes(status) ? status : '')
    setSearchQuery(q)
  }, [searchParams])

  // The page scrolls inside <main> (Layout sets overflow-y-auto on <main>).
  // Listen directly to that element's scroll event — works reliably across
  // all browsers without IntersectionObserver quirks.
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return

    const checkScroll = () => setScrolled(main.scrollTop > 300)
    checkScroll()  // initial state on mount
    main.addEventListener('scroll', checkScroll, { passive: true })
    return () => main.removeEventListener('scroll', checkScroll)
  }, [])

  const scrollToTop = () => {
    document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Modals — kept accessible via row actions on job detail; these remain
  // here only for the abort flow which is time-sensitive
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
      toast.success(`Abort requested for ${jobId.slice(0, 8)}…`)
      void refetchJobs()
    } catch {
      toast.error('Failed to abort job.')
    }
  }

  const trends = summary?.trends

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
    <div className="flex flex-col gap-4 pt-4 animate-fade-in">

      {/* ── Page Title — compact single-row header ── */}
      <div className="flex items-end justify-between gap-4 pb-2 border-b border-wiz-border/60">
        <div className="flex items-end gap-3 min-w-0">
          <div className="w-1 h-8 rounded-full bg-wiz-gold flex-shrink-0" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-xl font-serif font-bold text-wiz-cream leading-none">Deployment Activity</h1>
            <p className="text-[11px] text-wiz-muted mt-1.5 font-mono">
              real-time job tracking and lifecycle management
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          className={clsx('btn-secondary gap-2 transition-all duration-200 flex-shrink-0', refreshing && 'opacity-70')}
        >
          <RefreshCw size={13} className={clsx(refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Metric Cards ── */}
      {summaryError ? (
        <div className="flex items-center gap-3 p-4 bg-sig-red-dim border border-sig-red/20 rounded text-sig-red text-sm">
          <AlertCircle size={16} />
          Failed to load metrics. Check that the runner service is running.
        </div>
      ) : (
      <div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {summaryLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="wiz-card p-5 h-28">
                <div className="skeleton h-3 rounded w-1/2 mb-3" />
                <div className="skeleton h-8 rounded w-1/3 mb-2" />
                <div className="skeleton h-3 rounded w-2/3" />
              </div>
            ))
          ) : summary ? (
            <>
              {/* Focus mode: when a status filter is active, dim the non-matching cards */}
              {(() => {
                const filterActive = statusFilter !== ''
                return (
                  <>
                    <MetricCard
                      label="TOTAL JOBS"  value={summary.total}
                      accent="metric-total"   Icon={Layers}           iconBg="bg-wiz-gold/12 text-wiz-gold"
                      cardTint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(139,26,26,0.04) 100%)"
                      activeBg="bg-wiz-gold/[0.04]"
                      isReset
                      delayMs={0}
                      active={statusFilter === ''}
                      onClick={() => setStatusFilter('')}
                    />
                    <MetricCard
                      label="RUNNING"     value={summary.running}
                      accent="metric-running" Icon={Zap}             iconBg="bg-sig-yellow/15 text-sig-yellow"
                      cardTint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(217,119,6,0.05) 100%)"
                      activeBg="bg-sig-yellow/[0.05]"
                      trend={trends?.running} muted
                      delayMs={50}
                      active={statusFilter === 'RUNNING'}
                      dim={filterActive && statusFilter !== 'RUNNING'}
                      onClick={() => setStatusFilter(statusFilter === 'RUNNING' ? '' : 'RUNNING')}
                    />
                    <MetricCard
                      label="SUCCESSFUL"  value={summary.successful}
                      accent="metric-success" Icon={CheckCircle2}    iconBg="bg-sig-green/15 text-sig-green"
                      cardTint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(22,163,74,0.05) 100%)"
                      activeBg="bg-sig-green/[0.05]"
                      trend={trends?.successful}
                      delayMs={100}
                      active={statusFilter === 'SUCCESS'}
                      dim={filterActive && statusFilter !== 'SUCCESS'}
                      onClick={() => setStatusFilter(statusFilter === 'SUCCESS' ? '' : 'SUCCESS')}
                    />
                    <MetricCard
                      label="FAILED"      value={summary.failed}
                      accent="metric-failed"  Icon={XCircle}         iconBg="bg-sig-red/15 text-sig-red"
                      cardTint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(220,38,38,0.06) 100%)"
                      activeBg="bg-sig-red/[0.05]"
                      valueColor="text-sig-red" trend={trends?.failed}
                      delayMs={150}
                      active={statusFilter === 'FAILED'}
                      dim={filterActive && statusFilter !== 'FAILED'}
                      onClick={() => setStatusFilter(statusFilter === 'FAILED' ? '' : 'FAILED')}
                    />
                    <MetricCard
                      label="ABORTED"     value={summary.aborted}
                      accent="metric-aborted" Icon={Ban}             iconBg="bg-wiz-border-strong/25 text-wiz-muted"
                      cardTint="linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(160,150,135,0.10) 100%)"
                      activeBg="bg-wiz-border/[0.25]"
                      trend={trends?.aborted} muted
                      delayMs={200}
                      active={statusFilter === 'ABORTED'}
                      dim={filterActive && statusFilter !== 'ABORTED'}
                      onClick={() => setStatusFilter(statusFilter === 'ABORTED' ? '' : 'ABORTED')}
                    />
                  </>
                )
              })()}
            </>
          ) : null}
        </div>
      </div>
      )}

      {/* ── Pulse Ribbon — heartbeat of the last 30 deployments ── */}
      {jobs && jobs.length > 0 && (
        <PulseRibbon jobs={jobs} navigate={navigate} />
      )}

      {/* ── Job Table ── */}
      <div>
        <div className="wiz-card overflow-hidden border-l-[3px] border-l-wiz-gold shadow-[0_4px_16px_rgba(0,0,0,0.07),0_1px_3px_rgba(0,0,0,0.05)]">

        {/* Header + filters — distinct toolbar background, prominent search */}
        <div
          className="px-5 py-3 border-b border-wiz-border flex items-center gap-3"
          style={{ background: 'linear-gradient(180deg, rgba(248,246,241,0.6) 0%, rgba(255,255,255,0) 100%)' }}
        >
          {/* Section label + count */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Activity size={13} className="text-wiz-gold" />
            <span className="section-label">Recent Jobs</span>
            <span className={clsx(
              'inline-flex items-center px-1.5 py-[2px] rounded-sm text-[9px] font-mono font-bold tabular-nums border',
              hasActiveFilters
                ? 'bg-wiz-gold/10 text-wiz-gold border-wiz-gold/25'
                : 'bg-wiz-bg/60 text-wiz-muted border-wiz-border/60',
            )}>
              {hasActiveFilters
                ? `${filteredJobs.length}/${jobs?.length ?? 0}`
                : `${jobs?.length ?? 0}`}
            </span>
          </div>

          {/* Prominent search — large, bordered, with focus glow */}
          <div className="relative flex-1 max-w-md group">
            <Search
              size={13}
              className={clsx(
                'absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-150',
                searchQuery ? 'text-wiz-gold' : 'text-wiz-muted group-focus-within:text-wiz-gold',
              )}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by app name or job ID…"
              className="w-full bg-wiz-surface border border-wiz-border rounded-md pl-9 pr-9 py-[7px] text-xs text-wiz-cream placeholder-wiz-muted/60 focus:outline-none focus:border-wiz-gold focus:shadow-[0_0_0_3px_rgba(139,26,26,0.08)] hover:border-wiz-border-mid transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-wiz-muted hover:text-wiz-cream hover:bg-wiz-raised transition-colors"
                title="Clear search"
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
              'rounded-md px-2.5 py-[7px] text-[11px] font-medium focus:outline-none focus:border-wiz-gold focus:shadow-[0_0_0_3px_rgba(139,26,26,0.08)] transition-all cursor-pointer border',
              envFilter
                ? 'bg-sig-blue-dim text-sig-blue border-sig-blue/30'
                : 'bg-wiz-surface text-wiz-muted border-wiz-border hover:border-wiz-border-mid',
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
              'rounded-md px-2.5 py-[7px] text-[11px] font-medium focus:outline-none focus:border-wiz-gold focus:shadow-[0_0_0_3px_rgba(139,26,26,0.08)] transition-all cursor-pointer border',
              statusFilter === 'SUCCESS' ? 'bg-sig-green-dim text-sig-green border-sig-green/30'
              : statusFilter === 'FAILED' ? 'bg-sig-red-dim text-sig-red border-sig-red/30'
              : statusFilter === 'RUNNING' ? 'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/30'
              : statusFilter === 'ABORTED' ? 'bg-wiz-raised text-wiz-muted border-wiz-border'
              : 'bg-wiz-surface text-wiz-muted border-wiz-border hover:border-wiz-border-mid',
            )}
          >
            <option value="">All Statuses</option>
            <option value="RUNNING">Running</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="ABORTED">Aborted</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setEnvFilter(''); setStatusFilter(''); setSearchQuery('') }}
              className="inline-flex items-center gap-1 px-2 py-[7px] rounded-md text-[11px] font-medium text-wiz-gold bg-wiz-gold/8 hover:bg-wiz-gold/15 border border-wiz-gold/20 transition-all"
              title="Clear all filters"
            >
              <X size={11} strokeWidth={2.5} />
              Clear
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          {/* table-fixed + percentages keeps columns proportional on any screen width.
              Application is the "flex" column — takes remaining space after fixed cols. */}
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[24%]" />   {/* Job ID — slightly tighter to make room for Type, full UUID still fits */}
              <col className="w-[18%]" />   {/* Application */}
              <col className="w-[9%]"  />   {/* Type — deploy / redeploy / rollback */}
              <col className="w-[8%]"  />   {/* Environment */}
              <col className="w-[11%]" />   {/* Status */}
              <col className="w-[17%]" />   {/* Started */}
              <col className="w-[13%]" />   {/* Duration */}
            </colgroup>
            <thead>
              <tr className="bg-wiz-raised border-b-2 border-wiz-border-mid">
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">
                  Job ID
                </th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">
                  Application
                </th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">
                  Type
                </th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">
                  Environment
                </th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">
                  Status
                </th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">
                  Started
                </th>
                <th className="text-left px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">
                  Duration
                </th>
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
                filteredJobs.map((job) => {
                  const isActive = ACTIVE.has(job.lifecycleStatus)
                  return (
                    <tr
                      key={job.jobId}
                      className={clsx(
                        'group transition-all duration-150 cursor-pointer',
                        job.lifecycleStatus === 'FAILED'
                          ? 'bg-sig-red/[0.025]   hover:bg-sig-red/[0.055]'
                          : isActive
                          ? 'bg-sig-yellow/[0.025] hover:bg-sig-yellow/[0.055]'
                          : 'hover:bg-wiz-bg',
                      )}
                      onClick={() => navigate(`/jobs/${job.jobId}`)}
                    >
                      {/* Job ID — clean single line, no extra glyphs */}
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
                        <span
                          className="text-sm font-medium text-wiz-cream truncate block"
                          title={job.appName}
                        >
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

                      {/* Started */}
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs text-wiz-gray block" title={job.createdAt}>
                          {formatTime(job.createdAt)}
                        </span>
                        <span className="font-mono text-[10px] text-wiz-dim mt-0.5 block">
                          {timeAgo(job.createdAt)}
                        </span>
                      </td>

                      {/* Duration + abort + row nav hint */}
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs text-wiz-gray block">
                              {formatDuration(job.createdAt, job.completedAt, job.lifecycleStatus)}
                            </span>
                            {isActive && (
                              <span className="font-mono text-[10px] text-sig-yellow mt-0.5 block animate-pulse">
                                running…
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isActive && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); void handleAbort(job.jobId) }}
                                className="btn-icon h-6 w-6 text-sig-red/60 hover:text-sig-red hover:bg-sig-red-dim"
                                title="Abort job"
                              >
                                <StopCircle size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Activity size={32} className="text-wiz-border-mid" />
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
      </div>

      {/* Modals (triggered from job detail; kept here for abort flow) */}
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

      {/* ── Floating Action Button — New Deploy ──
          Pinned to the viewport, glows in crimson, the most obviously
          "floating" element on the page. Always one click from anywhere. */}
      <Link
        to="/deploy"
        title="New Deployment"
        aria-label="Start a new deployment"
        className="
          fixed bottom-8 right-8 z-30
          w-14 h-14 rounded-full
          bg-wiz-gold text-white
          flex items-center justify-center
          group
          transition-all duration-200
          hover:bg-wiz-gold-light hover:scale-110 hover:-translate-y-0.5
          active:scale-95
        "
        style={{
          boxShadow: `
            0 12px 32px rgba(139,26,26,0.36),
            0 4px 12px rgba(139,26,26,0.22),
            0 0 0 4px rgba(255,255,255,0.85),
            inset 0 1px 0 rgba(255,255,255,0.18)
          `,
        }}
      >
        {/* Pulse ring — subtle continuous pulse to draw attention */}
        <span
          className="absolute inset-0 rounded-full bg-wiz-gold/40 animate-ping"
          style={{ animationDuration: '2.6s' }}
          aria-hidden
        />
        <Wand2
          size={20}
          strokeWidth={2.4}
          className="relative z-[1] group-hover:rotate-[-12deg] transition-transform duration-200"
        />
      </Link>

      {/* ── Floating Back-to-Top button ──
          Bottom-LEFT — soft pale-crimson tint instead of solid fill.
          Whispers "I'm here" rather than shouting. Crimson icon for
          legibility, surface darkens on hover. */}
      <button
        type="button"
        onClick={scrollToTop}
        title="Back to top"
        aria-label="Scroll to top of page"
        className={clsx(
          'group fixed bottom-8 left-[16.5rem] z-30 w-11 h-11 rounded-full',
          'flex items-center justify-center',
          'hover:scale-110 hover:-translate-y-1',
          'active:scale-95',
          'transition-all duration-200',
          scrolled
            ? 'opacity-100 pointer-events-auto translate-y-0'
            : 'opacity-0 pointer-events-none translate-y-2',
        )}
        style={{
          background: '#FBE6E6',                             // very pale pink-crimson
          color: '#D44040',                                  // crimson icon
          border: '1px solid rgba(212,64,64,0.22)',
          boxShadow: `
            0 4px 14px rgba(0,0,0,0.10),
            0 1px 3px rgba(0,0,0,0.06),
            0 0 0 3px rgba(255,255,255,0.85)
          `,
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background = '#F5C4C4'
          el.style.boxShadow = '0 6px 18px rgba(212,64,64,0.22), 0 2px 4px rgba(212,64,64,0.12), 0 0 0 3px rgba(255,255,255,0.9)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLButtonElement
          el.style.background = '#FBE6E6'
          el.style.boxShadow = '0 4px 14px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06), 0 0 0 3px rgba(255,255,255,0.85)'
        }}
      >
        <ArrowUp size={17} strokeWidth={2.6} className="group-hover:-translate-y-0.5 transition-transform duration-200" />
      </button>

    </div>
  )
}
