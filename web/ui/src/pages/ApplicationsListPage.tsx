import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Search, Plus, X, Sparkles, Rocket, MoreHorizontal,
  CheckCircle2, AlertTriangle, HelpCircle, Loader2, Boxes,
} from 'lucide-react'
import clsx from 'clsx'
import { fetchApplications } from '../api/applications'
import { fetchJobs } from '../api/jobs'
import type { Application, LiveConfigCapability } from '../types/Application'
import type { JobSummary } from '../types/JobSummary'

/**
 * Phase 5 §5.2.a — Applications List page.
 *
 * Grid of app cards. Search + sort + capability filter inline. Built to
 * the §5.0 principles:
 *   - Select don't type      : sort/filter are dropdowns + chips, not free-text
 *   - Auto-detect over ask   : deploy summary is computed client-side from
 *                              the existing /jobs feed; user supplies nothing
 *   - Show capability before action : every card shows live-push state
 *                                      via a coloured badge
 *   - Empty states with one-click CTAs : fresh installs see a guided
 *                                         "Register your first application"
 *
 * The page hangs off two queries — fetchApplications() for the registry
 * and fetchJobs() for the deploy summary. React Query caches both so
 * cross-page navigation is instant.
 */

// ── Style maps ───────────────────────────────────────────────────────

/** Tints used in env badges, matching the rest of the app. */
const ENV_STYLES: Record<string, string> = {
  DEV:  'bg-sig-green-dim  text-sig-green  border-sig-green/30',
  SIT:  'bg-sig-blue-dim   text-sig-blue   border-sig-blue/30',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/30',
  PROD: 'bg-sig-purple-dim text-sig-purple border-sig-purple/30',
}

/** Last-deploy outcome → border dot colour on the env badge. */
function deployStatusColor(status: string | null): string {
  if (!status)            return 'bg-wiz-border-mid'       // never deployed
  if (status === 'SUCCESS') return 'bg-sig-green'
  if (status === 'FAILED')  return 'bg-sig-red'
  if (status === 'ABORTED') return 'bg-wiz-muted/70'
  return 'bg-sig-yellow'   // running / created / validating
}

// ── Helpers ──────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000)    return 'just now'
  const m = Math.floor(ms / 60_000)
  if (m < 60)         return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)         return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

type SortKey = 'recent' | 'name' | 'deploys'

/**
 * Per-env deploy stats derived from the global /jobs feed.
 * Computed client-side because §5.1 doesn't populate DeploySummary
 * server-side yet (planned addition once the UI lands on its shape).
 */
interface AppStats {
  totalDeploys:    number
  lastDeployAt:    string | null
  perEnv:          Record<string, { count: number; lastStatus: string | null; lastAt: string | null }>
}

function statsFor(appName: string, jobs: JobSummary[]): AppStats {
  const appJobs = jobs.filter(j => j.appName === appName)
  const perEnv: AppStats['perEnv'] = {}
  let lastDeployAt: string | null = null

  for (const j of appJobs) {
    const env = j.environment ?? '—'
    const bucket = perEnv[env] ??= { count: 0, lastStatus: null, lastAt: null }
    bucket.count++
    if (!bucket.lastAt || j.createdAt > bucket.lastAt) {
      bucket.lastAt = j.createdAt
      bucket.lastStatus = j.lifecycleStatus
    }
    if (!lastDeployAt || j.createdAt > lastDeployAt) {
      lastDeployAt = j.createdAt
    }
  }
  return { totalDeploys: appJobs.length, lastDeployAt, perEnv }
}

// ── Page ─────────────────────────────────────────────────────────────

export default function ApplicationsListPage() {
  const navigate = useNavigate()
  const [query,      setQuery]      = useState('')
  const [sortKey,    setSortKey]    = useState<SortKey>('recent')
  const [capability, setCapability] = useState<'' | LiveConfigCapability>('')

  const { data: applications, isLoading: appsLoading } = useQuery<Application[]>({
    queryKey: ['applications', { q: query, capability }],
    queryFn:  () => fetchApplications({
      q:          query || undefined,
      capability: capability || undefined,
    }),
    refetchInterval: 60_000,
    keepPreviousData: true,
  } as any)

  const { data: allJobs = [] } = useQuery<JobSummary[]>({
    queryKey: ['jobs-list'],
    queryFn:  fetchJobs,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  // Decorate apps with computed deploy stats + apply client-side sort.
  const decorated = useMemo(() => {
    if (!applications) return []
    const rows = applications.map(app => ({
      app,
      stats: statsFor(app.name, allJobs),
    }))
    return rows.sort((a, b) => {
      if (sortKey === 'name') {
        return a.app.name.localeCompare(b.app.name)
      }
      if (sortKey === 'deploys') {
        return b.stats.totalDeploys - a.stats.totalDeploys
      }
      // 'recent' — by lastDeployAt desc, apps with no deploys last
      const ad = a.stats.lastDeployAt ?? ''
      const bd = b.stats.lastDeployAt ?? ''
      if (ad === bd) return a.app.name.localeCompare(b.app.name)
      return bd.localeCompare(ad)
    })
  }, [applications, allJobs, sortKey])

  // Quick stats for the page header subtitle.
  const headerStats = useMemo(() => {
    if (!applications) return { total: 0, withLivePush: 0 }
    return {
      total:        applications.length,
      withLivePush: applications.filter(a => a.liveConfigCapability === 'ENABLED').length,
    }
  }, [applications])

  const showingEmptyState = !appsLoading && applications && applications.length === 0 && !query && !capability

  return (
    <div className="flex flex-col gap-4 pt-4 animate-fade-in">

      {/* ── Page header ────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-4 pb-2 border-b border-wiz-border/60">
        <div className="flex items-end gap-3 min-w-0">
          <div className="w-1 h-8 rounded-full bg-wiz-gold flex-shrink-0" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-xl font-serif font-bold text-wiz-cream leading-none">Applications</h1>
            <p className="text-[11px] text-wiz-muted mt-1.5 font-mono">
              {appsLoading ? (
                <>loading…</>
              ) : showingEmptyState ? (
                <>your application registry — start by registering one</>
              ) : (
                <>
                  <span className="text-wiz-cream font-semibold">{headerStats.total}</span>
                  {' app'}{headerStats.total === 1 ? '' : 's'}
                  {headerStats.withLivePush > 0 && (
                    <>
                      {' · '}
                      <span className="text-sig-green font-semibold">{headerStats.withLivePush}</span>
                      {' with live push enabled'}
                    </>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/applications/new')}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-wiz-gold text-white text-[12px] font-bold uppercase tracking-wider hover:bg-wiz-gold-light transition-colors shadow-sm hover:shadow"
        >
          <Plus size={13} strokeWidth={2.5} />
          Register App
        </button>
      </div>

      {/* ── Empty state — fresh install / no apps registered yet ───── */}
      {showingEmptyState && (
        <div className="wiz-card px-6 py-16 text-center mt-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-wiz-gold/10 text-wiz-gold mb-4">
            <Boxes size={32} strokeWidth={1.75} />
          </div>
          <h2 className="text-lg font-serif font-bold text-wiz-cream mb-1.5">
            No applications registered yet
          </h2>
          <p className="text-sm text-wiz-muted max-w-md mx-auto mb-5">
            Register an application once — name, environments, and SSH targets —
            then deploy to it repeatedly by picking from a dropdown. No more
            re-entering connection details every time.
          </p>
          <button
            type="button"
            onClick={() => navigate('/applications/new')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-wiz-gold text-white text-[12px] font-bold uppercase tracking-wider hover:bg-wiz-gold-light transition-colors"
          >
            <Sparkles size={13} strokeWidth={2.5} />
            Register your first application
          </button>
        </div>
      )}

      {/* ── Toolbar — search / sort / capability filter ────────────── */}
      {!showingEmptyState && (
        <div className="wiz-card px-3.5 py-2.5 flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-[320px]">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-wiz-dim pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find an app…"
              className="w-full pl-7 pr-7 py-1.5 rounded-md border border-wiz-border bg-wiz-bg/60 text-wiz-cream text-[12px] font-mono focus:outline-none focus:border-wiz-gold/60"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-wiz-muted hover:text-wiz-cream"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <span className="w-px h-5 bg-wiz-border/60" aria-hidden />

          {/* Sort */}
          <Chips<SortKey>
            label="Sort"
            value={sortKey}
            onChange={setSortKey}
            options={[
              { value: 'recent',  label: 'Recent' },
              { value: 'name',    label: 'Name' },
              { value: 'deploys', label: 'Most deployed' },
            ]}
          />

          <span className="w-px h-5 bg-wiz-border/60" aria-hidden />

          {/* Capability filter */}
          <Chips
            label="Live push"
            value={capability}
            onChange={setCapability}
            options={[
              { value: '',          label: 'All' },
              { value: 'ENABLED',   label: 'Enabled',  color: 'text-sig-green' },
              { value: 'DEGRADED',  label: 'Setup',    color: 'text-sig-yellow' },
              { value: 'MISSING',   label: 'Missing',  color: 'text-wiz-muted' },
            ]}
          />

          <div className="flex-1" />

          <span className="text-[10px] font-mono text-wiz-muted">
            {decorated.length}/{applications?.length ?? 0} shown
          </span>
        </div>
      )}

      {/* ── App grid ─────────────────────────────────────────────────── */}
      {appsLoading && !applications ? (
        <SkeletonGrid />
      ) : !showingEmptyState && decorated.length === 0 ? (
        <NoResultsBanner onClear={() => { setQuery(''); setCapability('') }} />
      ) : !showingEmptyState ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {decorated.map(({ app, stats }) => (
            <ApplicationCard
              key={app.id}
              app={app}
              stats={stats}
              onClickDeploy={() => navigate(`/deploy?app=${encodeURIComponent(app.name)}`)}
              onClickView={() => navigate(`/apps/${encodeURIComponent(app.name)}`)}
            />
          ))}
          {/* "+ Register New App" tile sits in the same grid so the empty
              slot reads as an action, not a missing card. */}
          <button
            type="button"
            onClick={() => navigate('/applications/new')}
            className="group flex flex-col items-center justify-center gap-2 py-10 rounded-lg border-2 border-dashed border-wiz-border-mid hover:border-wiz-gold/60 hover:bg-wiz-gold/[0.03] transition-colors min-h-[200px]"
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-wiz-gold/10 text-wiz-gold group-hover:bg-wiz-gold/15 transition-colors">
              <Plus size={20} strokeWidth={2.25} />
            </div>
            <span className="text-[12px] font-bold uppercase tracking-wider text-wiz-cream/85">
              Register New App
            </span>
            <span className="text-[10px] text-wiz-muted">
              Add another application to your registry
            </span>
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────

interface ApplicationCardProps {
  app:            Application
  stats:          AppStats
  onClickDeploy:  () => void
  onClickView:    () => void
}

function ApplicationCard({ app, stats, onClickDeploy, onClickView }: ApplicationCardProps) {
  return (
    <div
      className="wiz-card overflow-hidden flex flex-col group transition-shadow hover:shadow-md"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* Header — name + description + ⋯ menu */}
      <div className="px-4 pt-3 pb-2.5 border-b border-wiz-border/30">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <button
            type="button"
            onClick={onClickView}
            className="flex-1 text-left min-w-0 group/title"
          >
            <h3 className="text-[14px] font-bold text-wiz-cream truncate group-hover/title:text-wiz-gold transition-colors">
              {app.name}
            </h3>
            <p className="text-[11px] text-wiz-muted mt-0.5 line-clamp-1">
              {app.description || <span className="italic">No description</span>}
            </p>
          </button>
          <button
            type="button"
            aria-label={`More actions for ${app.name}`}
            onClick={(e) => { e.stopPropagation(); onClickView() }}
            className="flex-shrink-0 p-1 rounded text-wiz-muted hover:text-wiz-cream hover:bg-wiz-bg/60 transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Body — env badges + deploy summary + capability */}
      <div className="px-4 py-3 flex flex-col gap-2.5 flex-1">
        {/* Env badges row — DEV/SIT/UAT/PROD always shown; missing envs
            render as dimmed placeholders so the row reads consistently. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['DEV', 'SIT', 'UAT', 'PROD'] as const).map(env => {
            const data = stats.perEnv[env]
            const seen = !!data
            return (
              <span
                key={env}
                title={
                  data
                    ? `${env}: ${data.count} deploy${data.count === 1 ? '' : 's'}, last ${data.lastStatus} ${timeAgo(data.lastAt)}`
                    : `${env}: no deploys yet`
                }
                className={clsx(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold uppercase tracking-wider border',
                  seen ? ENV_STYLES[env] : 'border-wiz-border bg-wiz-bg/40 text-wiz-dim/60',
                )}
              >
                <span className={clsx('w-1.5 h-1.5 rounded-full', deployStatusColor(data?.lastStatus ?? null))} />
                {env}
              </span>
            )
          })}
        </div>

        {/* Deploy + capability summary */}
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-wiz-muted">
            {stats.totalDeploys === 0
              ? <span className="italic">No deploys yet</span>
              : <>
                  <span className="text-wiz-cream font-semibold">{stats.totalDeploys}</span>
                  {' deploy'}{stats.totalDeploys === 1 ? '' : 's'}
                  {' · last '}{timeAgo(stats.lastDeployAt)}
                </>
            }
          </span>
          <CapabilityBadge capability={app.liveConfigCapability} />
        </div>
      </div>

      {/* Footer — primary CTA + ghost CTA */}
      <div className="px-3 py-2 border-t border-wiz-border/30 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onClickDeploy}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-wiz-gold text-white text-[11px] font-bold uppercase tracking-wider hover:bg-wiz-gold-light transition-colors"
        >
          <Rocket size={11} strokeWidth={2.5} />
          Deploy
        </button>
        <button
          type="button"
          onClick={onClickView}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-wiz-border text-wiz-cream/85 text-[11px] font-bold uppercase tracking-wider hover:bg-wiz-bg/60 transition-colors"
        >
          View
        </button>
      </div>
    </div>
  )
}

function CapabilityBadge({ capability }: { capability: LiveConfigCapability | null }) {
  if (capability === 'ENABLED') {
    return (
      <span className="inline-flex items-center gap-1 text-sig-green" title="Live config push available — config changes apply instantly">
        <CheckCircle2 size={10} strokeWidth={2.5} />
        Live push
      </span>
    )
  }
  if (capability === 'DEGRADED') {
    return (
      <span className="inline-flex items-center gap-1 text-sig-yellow" title="Actuator present but /refresh blocked — setup needed for zero-downtime config changes">
        <AlertTriangle size={10} strokeWidth={2.5} />
        Setup
      </span>
    )
  }
  if (capability === 'MISSING') {
    return (
      <span className="inline-flex items-center gap-1 text-wiz-muted" title="Spring Boot Actuator not detected — config changes require redeploy">
        <AlertTriangle size={10} strokeWidth={2.5} />
        No live push
      </span>
    )
  }
  if (capability === 'PROBING') {
    return (
      <span className="inline-flex items-center gap-1 text-wiz-muted">
        <Loader2 size={10} className="animate-spin" />
        Probing
      </span>
    )
  }
  // UNKNOWN or null — not probed yet
  return (
    <span className="inline-flex items-center gap-1 text-wiz-dim italic" title="Capability not probed yet — happens after first deploy">
      <HelpCircle size={10} />
      Not probed
    </span>
  )
}

/** Reusable chip-group selector used by sort + filter rows. */
interface ChipsProps<T extends string> {
  label?:   string
  value:    T
  onChange: (v: T) => void
  options:  Array<{ value: T; label: string; color?: string }>
}
function Chips<T extends string>({ label, value, onChange, options }: ChipsProps<T>) {
  return (
    <div className="flex items-center gap-1.5">
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-wiz-muted">
          {label}
        </span>
      )}
      <div className="inline-flex rounded border border-wiz-border bg-wiz-bg/40 p-0.5">
        {options.map(opt => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={clsx(
                'px-2.5 py-0.5 rounded-sm font-mono text-[10px] font-semibold transition-colors',
                active
                  ? 'bg-wiz-surface text-wiz-cream shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                  : clsx('hover:bg-wiz-surface/50', opt.color ?? 'text-wiz-muted'),
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function NoResultsBanner({ onClear }: { onClear: () => void }) {
  return (
    <div className="wiz-card px-6 py-10 text-center">
      <p className="text-sm text-wiz-cream mb-1">No apps match your filters</p>
      <p className="text-xs text-wiz-muted mb-3">Try widening the search or capability filter.</p>
      <button
        type="button"
        onClick={onClear}
        className="text-[11px] font-mono text-wiz-gold hover:underline"
      >
        Clear all filters
      </button>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="wiz-card px-4 py-4 min-h-[200px]">
          <div className="skeleton h-4 rounded w-2/3 mb-2" />
          <div className="skeleton h-3 rounded w-3/4 mb-4" />
          <div className="flex gap-1.5 mb-3">
            <div className="skeleton h-4 w-10 rounded" />
            <div className="skeleton h-4 w-10 rounded" />
            <div className="skeleton h-4 w-10 rounded" />
            <div className="skeleton h-4 w-10 rounded" />
          </div>
          <div className="skeleton h-3 rounded w-1/2 mb-4" />
          <div className="skeleton h-8 rounded w-full" />
        </div>
      ))}
    </div>
  )
}
