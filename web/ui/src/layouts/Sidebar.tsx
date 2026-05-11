import { useMemo } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { LayoutDashboard, Wand2, Settings, Sparkles, BarChart3 } from 'lucide-react'
import clsx from 'clsx'
import { fetchJobs } from '../api/jobs'
import type { JobSummary } from '../types/JobSummary'

// ── Navigation definitions ────────────────────────────────────────

interface NavItemDef {
  to:           string
  label:        string
  icon:         React.ReactNode
  exact?:       boolean
  iconAnim?:    string    // CSS animation class fired on hover ("anim-wand", "anim-cog", "anim-bob")
  flourish?:    'sparkle' // optional decorative element on hover
}

const PRIMARY_NAV: NavItemDef[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: <LayoutDashboard size={15} />,
    exact: true,
    iconAnim: 'anim-bob',
  },
  {
    to: '/deploy',
    label: 'New Deploy',
    icon: <Wand2 size={15} />,
    iconAnim: 'anim-wand',
    flourish: 'sparkle',
  },
]

// ── Floating Nav Button — shared between primary nav and Settings ──
//
// Design notes:
// - At rest: text/icon dim, no background — sits quietly
// - On hover: floats up (-translate-y-px), gains a soft outer glow,
//   icon plays its assigned animation, optional sparkle appears,
//   subtle white background tints in
// - Active: full crimson gradient bg with inner highlight, glowing
//   outer ring, animated shimmer sweep across, pulsing dot at right
//
// The hover lift + shadow is what makes them "float" — at rest they
// look like buttons that haven't engaged yet, and on hover they
// commit, becoming actual physical objects on the surface.

interface FloatingNavLinkProps extends NavItemDef {
  isActive: boolean
}

function FloatingNavLink({ to, label, icon, exact, iconAnim, flourish, isActive }: FloatingNavLinkProps) {
  return (
    <NavLink
      to={to}
      end={exact}
      className={clsx(
        'group relative flex items-center gap-2.5 py-2.5 pr-3 rounded-md font-medium text-[13.5px] overflow-hidden',
        'transition-all duration-250 ease-out',
        // Quiet card-style chrome at rest. Active state earns a tiny crimson
        // signature (left stripe + icon tint) — everything else is neutral
        // white tints so the sidebar doesn't read as "everything's on fire".
        'border bg-white/[0.04]',
        isActive
          ? 'pl-[9px] border-white/[0.12] border-l-[3px] border-l-[#D44040] text-white bg-white/[0.10]'
          : 'pl-3 border-white/[0.10] border-l-[3px] border-l-transparent text-white/70 hover:text-white hover:bg-white/[0.07] hover:border-white/[0.18] hover:-translate-y-[1px] hover:scale-[1.02]',
      )}
      style={isActive ? {
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.10),
          0 4px 14px rgba(0,0,0,0.22),
          0 0 0 1px rgba(255,255,255,0.04)
        `,
      } : undefined}
      onMouseEnter={(e) => {
        if (!isActive) {
          // Neutral white wash — no crimson flood. The single crimson cue
          // on hover is the sparkle flourish (only on "New Deploy").
          e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.26), 0 0 0 1px rgba(255,255,255,0.08)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.boxShadow = ''
        }
      }}
    >
      {/* Active state: shimmer sweep — diagonal white highlight that slides across */}
      {isActive && (
        <span
          className="pointer-events-none absolute inset-y-0 -inset-x-2 rounded-md overflow-hidden"
          aria-hidden
        >
          <span
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
            style={{ animation: 'shimmer-active 4s ease-in-out infinite' }}
          />
        </span>
      )}

      {/* Icon with per-item animation — crimson tint reserved for active state
          (small contained accent, reads as "selected" not "alert") */}
      <span className={clsx(
        'flex-shrink-0 transition-all duration-200 relative z-10',
        isActive
          ? 'opacity-100 text-[#D44040]'
          : 'opacity-60 group-hover:opacity-100',
      )}>
        <span className={clsx('inline-block', iconAnim)}>{icon}</span>
      </span>

      <span className="flex-1 relative z-10 tracking-wide">{label}</span>

      {/* Sparkle flourish — appears on hover for "New Deploy". This is the
          only crimson moment on hover, and it's a single tiny glyph, not a fill. */}
      {flourish === 'sparkle' && !isActive && (
        <Sparkles
          size={9}
          className="absolute right-3 text-[#D44040] opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 z-10"
          strokeWidth={2.4}
        />
      )}

      {/* Active state: small static crimson dot at the right edge.
          Removed the pulsing animation — the active item is already clearly
          marked by the left stripe, bg, icon tint and shimmer; a pulse on top
          read as "warning" rather than "you are here". */}
      {isActive && (
        <span className="absolute right-2.5 z-10 w-1 h-1 rounded-full bg-[#D44040]" aria-hidden />
      )}
    </NavLink>
  )
}

// ── Wrappers that compute isActive from the router ───────────────

function SidebarLink(item: NavItemDef) {
  const location = useLocation()
  const isActive = item.exact
    ? location.pathname === item.to
    : location.pathname.startsWith(item.to)
  return <FloatingNavLink {...item} isActive={isActive} />
}

function SettingsLink() {
  const location = useLocation()
  const isActive = location.pathname === '/settings'
  return (
    <NavLink
      to="/settings"
      className={clsx(
        'block w-full mx-2 px-2.5 py-2 rounded-md border transition-all duration-200 group cursor-pointer',
        'hover:-translate-y-[2px] hover:scale-[1.02]',
        isActive
          // Active = subtle white wash + crimson icon chip only. The icon
          // chip is the single crimson "selected" cue — no red bg flood.
          ? 'bg-white/[0.10] border-white/[0.16] text-white'
          : 'bg-white/[0.04] border-white/[0.08] text-white/75 hover:bg-white/[0.08] hover:border-white/[0.20] hover:text-white',
      )}
      style={{
        boxShadow: isActive
          ? 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px rgba(0,0,0,0.22), 0 0 0 1px rgba(255,255,255,0.04)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 12px rgba(0,0,0,0.18)',
        width: 'calc(100% - 1rem)',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'flex items-center justify-center w-[18px] h-[18px] rounded-[5px] flex-shrink-0 transition-colors duration-200',
            // Active: small crimson chip with white icon — contained accent.
            // Inactive: neutral white tint chip.
            isActive ? 'bg-[#D44040]/85 text-white' : 'bg-white/[0.10] text-white/75',
          )}
        >
          <Settings size={11} strokeWidth={2.4} className="anim-cog" />
        </span>
        <span className="text-[12px] font-semibold tracking-wide">Settings</span>
      </div>
    </NavLink>
  )
}


// ── Weekly Activity Mini Chart ─────────────────────────────────────
// 7-day micro bar chart — counts deploys per day, colours bars red if
// any failed that day, green otherwise. Pure CSS, no chart library.

function WeeklyActivityChart() {
  const navigate = useNavigate()
  const { data: jobs } = useQuery<JobSummary[]>({
    queryKey: ['jobs-list'],
    queryFn:  fetchJobs,
    refetchInterval: 60_000,
    retry: 1,
    staleTime: 10_000,
  })

  const days = useMemo(() => {
    if (!jobs) return []
    const now = new Date()
    const result: { label: string; date: string; count: number; failed: number; success: number }[] = []
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
        label:   day.toLocaleDateString('en-GB', { weekday: 'short' })[0],
        date:    day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }),
        count:   dayJobs.length,
        failed:  dayJobs.filter(j => j.lifecycleStatus === 'FAILED').length,
        success: dayJobs.filter(j => j.lifecycleStatus === 'SUCCESS').length,
      })
    }
    return result
  }, [jobs])

  const max   = Math.max(...days.map(d => d.count), 1)
  const total = days.reduce((s, d) => s + d.count, 0)

  if (!jobs || days.length === 0) return null

  // Whole panel → navigates to dashboard
  // Individual bars → also clickable; failed days jump to FAILED filter
  return (
    <button
      type="button"
      onClick={() => navigate('/activity')}
      className="block w-full text-left mx-2 mb-3 px-2.5 py-2 rounded-md bg-white/[0.09] border border-white/[0.18] hover:border-white/[0.30] hover:-translate-y-[2px] hover:scale-[1.02] transition-all duration-200 group cursor-pointer relative overflow-hidden"
      style={{
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px rgba(0,0,0,0.25)',
        width: 'calc(100% - 1rem)',
      }}
      onMouseEnter={(e) => {
        // Neutral white-glow hover — this is a navigational widget, not an
        // alarm. The bars themselves carry semantic colour (red for failures,
        // green for success), so the chrome stays calm.
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 22px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,255,255,0.10)'
        e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 14px rgba(0,0,0,0.25)'
        e.currentTarget.style.background = ''
      }}
      title={`${total} deployments over the last 7 days — click to open the full activity view`}
    >
      {/* Shimmer sweep on hover */}
      <span
        className="pointer-events-none absolute inset-y-0 -inset-x-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        aria-hidden
      >
        <span
          className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent"
          style={{ animation: 'shimmer-active 2.5s ease-in-out infinite' }}
        />
      </span>
      {/* Header — neutral icon chip + label + view chevron */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="flex items-center justify-center w-[18px] h-[18px] rounded-[5px] bg-white/[0.10] text-white/75 flex-shrink-0">
          <BarChart3 size={11} strokeWidth={2.4} />
        </span>
        <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/85">
          7-Day Activity
        </span>
      </div>

      {/* Big stat + caption — feels like a real widget */}
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-[22px] font-serif font-bold tabular-nums leading-none text-white/95">
          {total}
        </span>
        <span className="text-[9px] font-mono text-white/50 uppercase tracking-wider">
          {total === 1 ? 'deploy' : 'deploys'}
        </span>
      </div>

      {/* Bars — gradient fill, today gets a crimson glow ring */}
      <div className="flex items-end gap-[3px] h-9">
        {days.map((d, i) => {
          const heightPct = d.count === 0 ? 0 : Math.max(12, (d.count / max) * 100)
          const isToday = i === days.length - 1
          const tooltip = d.count === 0
            ? `${d.date}: no deploys`
            : `${d.date}: ${d.count} deploy${d.count > 1 ? 's' : ''}${d.failed > 0 ? `, ${d.failed} failed` : ''}`
          return (
            <span
              key={i}
              role="button"
              tabIndex={d.count > 0 ? 0 : -1}
              aria-label={tooltip}
              title={tooltip}
              onClick={(e) => {
                if (d.count === 0) return
                e.stopPropagation()
                navigate('/activity')
              }}
              onKeyDown={(e) => {
                if (d.count > 0 && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  e.stopPropagation()
                  navigate('/activity')
                }
              }}
              className={clsx(
                'flex-1 flex flex-col justify-end h-full group/bar',
                d.count > 0 ? 'cursor-pointer' : 'cursor-default',
              )}
            >
              <span
                className={clsx(
                  'block rounded-[3px] transition-all duration-200',
                  d.count === 0
                    ? 'bg-white/[0.06] border border-white/[0.04]'
                    : d.failed > 0
                    ? 'bg-gradient-to-t from-sig-red to-sig-red/55 group-hover/bar:shadow-[0_0_10px_rgba(255,123,114,0.6)]'
                    : 'bg-gradient-to-t from-sig-green to-sig-green/55 group-hover/bar:shadow-[0_0_10px_rgba(63,185,80,0.6)]',
                  d.count > 0 && 'group-hover/bar:scale-x-[1.4]',
                  isToday && d.count > 0 && 'ring-2 ring-white/45 ring-offset-1 ring-offset-wiz-panel',
                )}
                style={{ height: `${heightPct}%`, minHeight: d.count > 0 ? 4 : 2, transformOrigin: 'bottom' }}
              />
            </span>
          )
        })}
      </div>

      {/* Day labels — today highlighted with bright white (no failure-red) */}
      <div className="flex justify-between mt-1.5 text-[8.5px] font-mono">
        {days.map((d, i) => (
          <span
            key={i}
            className={clsx(
              'flex-1 text-center font-bold',
              i === days.length - 1
                ? 'text-white'
                : d.count > 0
                ? 'text-white/55'
                : 'text-white/25',
            )}
          >
            {d.label}
          </span>
        ))}
      </div>
    </button>
  )
}

// ── Live Activity Pulse ───────────────────────────────────────────
// Auto-hides when the platform is quiet. Surfaces only when there's
// something the user *should* know:
//   - currently running deploys (dynamic count + animated state)
//   - recent failures in the last hour (yelling for attention)
//   - everything fine + idle = component renders nothing
//
// Replaces the static "LATEST" panel with information that changes.

const ACTIVE_STATES = new Set(['CREATED', 'VALIDATING', 'PREPARING_WORKSPACE', 'RUNNING'])

function LivePulsePanel() {
  const navigate = useNavigate()
  const { data: jobs } = useQuery<JobSummary[]>({
    queryKey: ['jobs-list'],
    queryFn:  fetchJobs,
    refetchInterval: 10_000,
    retry: 1,
    staleTime: 5_000,
  })

  if (!jobs) return null

  const running = jobs.filter(j => ACTIVE_STATES.has(j.lifecycleStatus))
  const dayAgo  = Date.now() - 24 * 60 * 60 * 1000
  const recentFailures = jobs.filter(j =>
    j.lifecycleStatus === 'FAILED' && new Date(j.createdAt).getTime() >= dayAgo
  )

  // ─── Priority 1: Running deploys (most urgent) ─────────────────
  if (running.length > 0) {
    const first = running[0]
    return (
      <button
        type="button"
        onClick={() => navigate(`/jobs/${first.jobId}`)}
        className="block w-full text-left mx-2 mb-3 px-2.5 py-2 rounded-md bg-sig-yellow/[0.10] border border-sig-yellow/30 hover:bg-sig-yellow/20 hover:border-sig-yellow hover:-translate-y-[2px] hover:scale-[1.02] transition-all duration-200 group"
        style={{ boxShadow: '0 4px 14px rgba(217,119,6,0.20), inset 0 1px 0 rgba(255,255,255,0.06)', width: 'calc(100% - 1rem)' }}
        title={`${running.length} deploy${running.length > 1 ? 's' : ''} currently running — click to view`}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="relative flex w-2 h-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-sig-yellow opacity-70 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sig-yellow" />
          </span>
          <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-sig-yellow group-hover:tracking-[0.22em] transition-all duration-200">
            Live · Running
          </span>
        </div>
        <p className="text-[11.5px] font-semibold text-white/90 truncate leading-tight">
          {first.appName}
        </p>
        <div className="flex items-center gap-1.5 mt-1 text-[9.5px] font-mono text-white/60">
          {running.length > 1 ? (
            <span className="font-semibold text-sig-yellow">+{running.length - 1} more</span>
          ) : (
            <span className="text-sig-yellow font-semibold animate-pulse">deploying…</span>
          )}
          <span className="text-white/25">·</span>
          <span>{first.environment?.toUpperCase() ?? '—'}</span>
        </div>
      </button>
    )
  }

  // ─── Priority 2: Recent failures within 24h ────────────────────
  if (recentFailures.length > 0) {
    return (
      <button
        type="button"
        onClick={() => navigate('/?status=FAILED')}
        className="block w-full text-left mx-2 mb-3 px-2.5 py-2 rounded-md bg-sig-red/[0.10] border border-sig-red/30 hover:bg-sig-red/20 hover:border-sig-red hover:-translate-y-[2px] hover:scale-[1.02] transition-all duration-200 group"
        style={{ boxShadow: '0 4px 14px rgba(220,38,38,0.18), inset 0 1px 0 rgba(255,255,255,0.06)', width: 'calc(100% - 1rem)' }}
        title={`${recentFailures.length} failure${recentFailures.length > 1 ? 's' : ''} in the last 24h — click to filter`}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="relative flex w-2 h-2 flex-shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-sig-red opacity-50 animate-ping" style={{ animationDuration: '1.8s' }} />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-sig-red" />
          </span>
          <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-sig-red group-hover:tracking-[0.22em] transition-all duration-200">
            Needs Attention
          </span>
        </div>
        <p className="text-[11.5px] font-semibold text-white/90 truncate leading-tight">
          {recentFailures.length} failed in last 24h
        </p>
        <div className="flex items-center gap-1.5 mt-1 text-[9.5px] font-mono text-white/55">
          <span>investigate failures</span>
        </div>
      </button>
    )
  }

  // ─── Priority 3: Deployment Health (always visible default) ────
  // Tier-based: NoData / Healthy / Stable / Degraded / Critical.
  // Colour follows the actual data, but the alert tiers are deliberately
  // damped — the panel hints at a problem rather than screaming about it.
  // (The screaming version was the dominant red on the sidebar.)
  const total = jobs.length
  const success = jobs.filter(j => j.lifecycleStatus === 'SUCCESS').length
  const successRate = total > 0 ? Math.round((success / total) * 100) : 0

  // Pick tier visuals from the success rate. When there are no deploys at
  // all, render a neutral "No data yet" tier — never red on an empty stage.
  const health =
    total === 0 ? {
      label: 'No data', color: 'text-white/70', dot: 'bg-white/40',
      bg: 'bg-white/[0.05]', border: 'border-white/[0.12]',
      bgHover: 'bg-white/[0.10]', borderHover: 'border-white/[0.22]',
      shadow: '0 4px 12px rgba(0,0,0,0.22)', pulseMs: '0s',
    }
    : successRate >= 90 ? {
      label: 'Healthy', color: 'text-sig-green', dot: 'bg-sig-green',
      bg: 'bg-sig-green/[0.10]', border: 'border-sig-green/30',
      bgHover: 'bg-sig-green/[0.16]', borderHover: 'border-sig-green/50',
      shadow: '0 4px 14px rgba(63,185,80,0.20)', pulseMs: '3s',
    }
    : successRate >= 70 ? {
      label: 'Stable',  color: 'text-sig-yellow', dot: 'bg-sig-yellow',
      bg: 'bg-sig-yellow/[0.10]', border: 'border-sig-yellow/30',
      bgHover: 'bg-sig-yellow/[0.16]', borderHover: 'border-sig-yellow/50',
      shadow: '0 4px 14px rgba(217,119,6,0.20)', pulseMs: '2.4s',
    }
    : successRate >= 50 ? {
      label: 'Degraded', color: 'text-sig-red', dot: 'bg-sig-red',
      bg: 'bg-sig-red/[0.08]', border: 'border-sig-red/30',
      bgHover: 'bg-sig-red/[0.14]', borderHover: 'border-sig-red/50',
      shadow: '0 4px 12px rgba(220,38,38,0.18)', pulseMs: '1.8s',
    }
    : {
      label: 'Critical', color: 'text-sig-red', dot: 'bg-sig-red',
      bg: 'bg-sig-red/[0.12]', border: 'border-sig-red/40',
      bgHover: 'bg-sig-red/[0.18]', borderHover: 'border-sig-red/60',
      shadow: '0 4px 14px rgba(220,38,38,0.22)', pulseMs: '1.2s',
    }

  const isEmpty = total === 0
  return (
    <button
      type="button"
      onClick={() => navigate('/health')}
      className={clsx(
        'block w-full text-left mx-2 mb-3 px-2.5 py-2 rounded-md border transition-all duration-200 group',
        'hover:-translate-y-[2px] hover:scale-[1.02]',
        health.bg, health.border, `hover:${health.bgHover}`, `hover:${health.borderHover}`,
      )}
      style={{ boxShadow: `${health.shadow}, inset 0 1px 0 rgba(255,255,255,0.06)`, width: 'calc(100% - 1rem)' }}
      title={
        isEmpty
          ? 'Deployment Health — no deployments yet. Click to view the dashboard.'
          : `Deployment Health — your deployments are ${health.label.toLowerCase()} (${successRate}% success across ${total} of your deploys). Click to view details.`
      }
    >
      {/* Top row: label + view chevron */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="relative flex w-2 h-2 flex-shrink-0">
          {!isEmpty && (
            <span
              className={clsx('absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping', health.dot)}
              style={{ animationDuration: health.pulseMs }}
            />
          )}
          <span className={clsx('relative inline-flex rounded-full h-2 w-2', health.dot)} />
        </span>
        <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/85">
          Deployment Health
        </span>
      </div>

      {/* Focal point — number + label stacked, tier chip on the right.
          Empty state shows an em-dash + "no deploys yet" caption instead of
          a glaring 0%. The tier chip switches to "No data" in neutral white. */}
      <div className="flex items-end justify-between gap-2">
        <div>
          {isEmpty ? (
            <>
              <span className="text-[22px] font-serif font-bold leading-none text-white/55">
                —
              </span>
              <span className="block text-[8px] font-bold uppercase tracking-[0.18em] text-white/45 mt-1">
                no deploys yet
              </span>
            </>
          ) : (
            <>
              <span className={clsx(
                'text-[22px] font-serif font-bold tabular-nums leading-none',
                health.color,
              )}>
                {successRate}<span className="text-[13px]">%</span>
              </span>
              <span className="block text-[8px] font-bold uppercase tracking-[0.18em] text-white/45 mt-1">
                success rate
              </span>
            </>
          )}
        </div>
        <span className={clsx(
          'inline-flex items-center px-1.5 py-[3px] rounded-sm text-[8.5px] font-bold uppercase tracking-[0.10em] border',
          health.bg, health.border, health.color,
        )}>
          {health.label}
        </span>
      </div>

      {/* Tiny progress bar — visual reinforcement. Empty state shows a thin
          dashed/faded bar so the slot is preserved without implying 0%. */}
      <div className="h-1 mt-2 rounded-full bg-white/[0.08] overflow-hidden">
        {!isEmpty && (
          <div
            className={clsx('h-full rounded-full transition-all duration-700', health.dot)}
            style={{ width: `${successRate}%` }}
          />
        )}
      </div>
    </button>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────

export default function Sidebar() {
  const navigate    = useNavigate()
  const queryClient = useQueryClient()

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault()
    navigate('/')
    void queryClient.invalidateQueries({ queryKey: ['jobs-summary'] })
    void queryClient.invalidateQueries({ queryKey: ['jobs-list'] })
    toast.success('Dashboard refreshed')
  }

  return (
    <aside
      className="w-[240px] flex-shrink-0 flex flex-col bg-wiz-panel relative"
      style={{
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        // Subtle white dot pattern over the navy bg — matches the main page
        // dot grid in size + cadence so the two surfaces feel cohesive.
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.045) 1px, transparent 0)',
        backgroundSize: '22px 22px',
        // Two-stop shadow + thin crimson brand line on the right edge so the
        // navy panel feels connected to the warm content area instead of
        // hard-cutting against it. Brand line opacity dropped slightly so it
        // stays a signature line, not an alert border.
        boxShadow: `
          6px 0 24px rgba(0,0,0,0.18),
          1px 0 0 rgba(212,64,64,0.16)
        `,
        zIndex: 10,
      } as React.CSSProperties}
    >
      {/* Soft top-edge gradient — adds depth without being decorative */}
      <div
        className="pointer-events-none absolute top-0 left-0 right-0 h-24"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 100%)',
        }}
        aria-hidden
      />

      {/* Decorative warm glow at the bottom — anchors the sidebar visually
          without compounding the "everywhere is red" feeling. Now uses a
          neutral cream/white tint with the merest crimson hint, so it reads
          as ambient warmth not alert. */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-40"
        style={{
          background: 'radial-gradient(ellipse at bottom left, rgba(255,255,255,0.05) 0%, rgba(212,64,64,0.025) 50%, transparent 75%)',
        }}
        aria-hidden
      />

      {/* ── Logo ──────────────────────────────────────────────────
          Wordmark + 1px #D44040 rule, shrink-wrapped via inline-flex.
          Rule width = wordmark width exactly (inline-flex technique). */}
      <a
        href="/"
        onClick={handleLogoClick}
        className="block px-5 py-[22px] border-b border-white/[0.08] hover:opacity-90 transition-opacity duration-150 cursor-pointer"
        title="Dashboard"
      >
        <div style={{ display: 'inline-flex', flexDirection: 'column' }}>
          <span
            className="font-serif font-bold text-xl text-white whitespace-nowrap leading-none"
            style={{ letterSpacing: '.01em' }}
          >
            Wizard<em className="not-italic" style={{ color: '#D44040' }}>CD</em>
          </span>
          <div style={{ height: '1px', background: '#D44040', width: '100%', marginTop: '5px' }} />
        </div>
      </a>

      {/* ── Top zone: things you DO (navigate + configure) ── */}
      <div className="flex flex-col">
        {/* ─── NAVIGATION section ─── */}
        <SidebarSectionLabel>Navigation</SidebarSectionLabel>
        <nav className="px-[10px] pt-1 pb-3 flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.to} {...item} />
          ))}
        </nav>

        {/* ─── SYSTEM section ─── */}
        <SidebarSectionLabel>System</SidebarSectionLabel>
        <div className="px-[10px] pt-1 pb-4">
          <SettingsLink />
        </div>
      </div>

      {/* Spacer — pushes the analytics zone to the bottom of the viewport */}
      <div className="flex-1" />

      {/* ── Bottom zone: things you SEE (live analytics + footer) ──
          The visual treatment (top hairline, recessed bg, gradient) marks
          this zone as "data display", separate from the action zone above.
          Top hairline is now a calm white tint instead of a saturated
          crimson rule, so the bottom zone doesn't shout for attention. */}
      <div
        className="relative"
        style={{
          boxShadow: `
            inset 0 1px 0 rgba(255,255,255,0.10),
            inset 0 12px 28px -12px rgba(0,0,0,0.40)
          `,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.18) 100%)',
        }}
      >
        {/* ─── ANALYTICS section ─── */}
        <SidebarSectionLabel>Analytics</SidebarSectionLabel>
        <div className="px-[10px]">
          {/* 7-day mini bar chart — quick at-a-glance week activity, clickable */}
          <WeeklyActivityChart />

          {/* Deployment Health panel — tier-aware, always visible */}
          <LivePulsePanel />
        </div>

        {/* Version / credit — sits at the very bottom as a quiet attribution */}
        <div className="px-[10px] pt-2 pb-4">
          <div className="px-3 pt-3 border-t border-white/[0.05]">
            <p className="font-mono text-[10px] leading-[1.6] text-white/[0.22]">
              WizardCD v1.0.0<br />
              Engineered by Bytes Ltd
            </p>
          </div>
        </div>
      </div>

    </aside>
  )
}

// ── Sidebar Section Label ─────────────────────────────────────────
// Labelled gradient divider that marks a sub-zone in the sidebar.
// Static visual — solid crimson dot, bright label, gradient line.

function SidebarSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-3 mt-3 mb-1.5 flex items-center gap-2 select-none">
      {/* Small crimson dot — single brand anchor per section. Kept tiny so
          three of them stacked don't read as three alarms. */}
      <span className="inline-block w-1 h-1 rounded-full bg-[#D44040]/70 flex-shrink-0" />

      {/* Bright static label — readable on dark navy bg */}
      <span className="text-[8.5px] font-bold uppercase tracking-[0.22em] text-white/85 whitespace-nowrap">
        {children}
      </span>

      {/* Quiet white-tinted divider — no crimson stops, no warning rainbow.
          A single soft gradient that just demarcates the section without
          implying alert. */}
      <span
        className="flex-1 h-px"
        style={{
          background:
            'linear-gradient(90deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.32) 50%, rgba(255,255,255,0.06) 100%)',
        }}
        aria-hidden
      />
    </div>
  )
}
