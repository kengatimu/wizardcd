import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Heart, AlertTriangle, CheckCircle2, XCircle, Ban,
  Activity, Layers, TrendingDown, Lightbulb,
} from 'lucide-react'
import clsx from 'clsx'
import { fetchJobs } from '../api/jobs'
import type { JobSummary } from '../types/JobSummary'
import BackButton from '../components/BackButton'

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

interface HealthTier {
  key:    'healthy' | 'stable' | 'degraded' | 'critical'
  label:  string
  blurb:  string
  color:  string    // text class
  ringHex: string   // raw hex for SVG/gradient
  bg:     string    // bg-tint class
  border: string    // border class
}

function tierFor(rate: number): HealthTier {
  if (rate >= 90)
    return { key: 'healthy',  label: 'Healthy',  blurb: 'Your deployments are running reliably',                  color: 'text-sig-green',  ringHex: '#16A34A', bg: 'bg-sig-green-dim',  border: 'border-sig-green/25' }
  if (rate >= 70)
    return { key: 'stable',   label: 'Stable',   blurb: 'Most of your deploys succeed but failures are non-trivial', color: 'text-sig-yellow', ringHex: '#D97706', bg: 'bg-sig-yellow-dim', border: 'border-sig-yellow/25' }
  if (rate >= 50)
    return { key: 'degraded', label: 'Degraded', blurb: 'Your failure rate is elevated — investigate causes',     color: 'text-sig-red',    ringHex: '#DC2626', bg: 'bg-sig-red-dim',    border: 'border-sig-red/25' }
  return     { key: 'critical', label: 'Critical', blurb: 'Most of your deploys are failing — urgent action needed', color: 'text-sig-red',    ringHex: '#DC2626', bg: 'bg-sig-red-dim',    border: 'border-sig-red/30' }
}

export default function PlatformHealthPage() {
  const { data: jobs, isLoading } = useQuery<JobSummary[]>({
    queryKey: ['jobs-list'],
    queryFn:  fetchJobs,
    refetchInterval: 30_000,
  })

  // Aggregate stats
  const stats = useMemo(() => {
    if (!jobs) return null
    const total   = jobs.length
    const success = jobs.filter(j => j.lifecycleStatus === 'SUCCESS').length
    const failed  = jobs.filter(j => j.lifecycleStatus === 'FAILED').length
    const aborted = jobs.filter(j => j.lifecycleStatus === 'ABORTED').length
    const successRate = total > 0 ? Math.round((success / total) * 100) : 100
    return { total, success, failed, aborted, successRate }
  }, [jobs])

  // Per-environment breakdown — always show all 4 envs, even if 0 deploys
  const byEnv = useMemo(() => {
    if (!jobs) return []
    const envs = ['DEV', 'SIT', 'UAT', 'PROD']
    return envs.map(env => {
      const e = jobs.filter(j => j.environment?.toUpperCase() === env)
      const ok   = e.filter(j => j.lifecycleStatus === 'SUCCESS').length
      const fail = e.filter(j => j.lifecycleStatus === 'FAILED').length
      const rate = e.length > 0 ? Math.round((ok / e.length) * 100) : 0
      return { env, total: e.length, ok, fail, rate }
    })
  }, [jobs])

  // Per-app breakdown — only apps with failures
  const failingApps = useMemo(() => {
    if (!jobs) return []
    const map = new Map<string, { total: number; failed: number }>()
    jobs.forEach(j => {
      if (!j.appName) return
      const cur = map.get(j.appName) ?? { total: 0, failed: 0 }
      cur.total++
      if (j.lifecycleStatus === 'FAILED') cur.failed++
      map.set(j.appName, cur)
    })
    return Array.from(map.entries())
      .filter(([, s]) => s.failed > 0)
      .map(([name, s]) => ({ name, ...s, rate: Math.round((1 - s.failed / s.total) * 100) }))
      .sort((a, b) => b.failed - a.failed)
      .slice(0, 5)
  }, [jobs])

  // Compute actionable insights — what should the user *do* about the data?
  const insights = useMemo(() => {
    if (!jobs) return []
    const items: { severity: 'critical' | 'warning' | 'info'; icon: 'alert' | 'down' | 'lightbulb'; title: string; description: string; action: string; link: string }[] = []

    // Critical apps — apps where success rate is 0%
    const zeroApps = failingApps.filter(a => a.rate === 0)
    if (zeroApps.length > 0) {
      const lead = zeroApps[0]
      items.push({
        severity: 'critical', icon: 'alert',
        title: `${zeroApps.length} app${zeroApps.length > 1 ? 's' : ''} with 0% success`,
        description: zeroApps.length === 1
          ? `${lead.name} has failed all ${lead.total} deploys`
          : `${lead.name} + ${zeroApps.length - 1} more — every deploy is failing`,
        action: zeroApps.length === 1 ? `View ${lead.name} failures` : 'View failed jobs',
        // If exactly one offender, deep-link with status + name; otherwise just FAILED
        link: zeroApps.length === 1
          ? `/?status=FAILED&q=${encodeURIComponent(lead.name)}`
          : `/?status=FAILED`,
      })
    }

    // Critical environments — env with rate < 50%
    const criticalEnvs = byEnv.filter(e => e.rate < 50 && e.total >= 3)
    if (criticalEnvs.length > 0) {
      const top = criticalEnvs[0]
      items.push({
        severity: 'critical', icon: 'down',
        title: `${top.env} environment is unstable`,
        description: `${top.rate}% success rate across ${top.total} deploys (${top.fail} failed)`,
        action: `Filter ${top.env}`,
        link:   `/?env=${top.env}`,
      })
    }

    // Warning — last 24h failures
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000
    const recentFails = jobs.filter(j =>
      j.lifecycleStatus === 'FAILED' && new Date(j.createdAt).getTime() >= dayAgo
    ).length
    if (recentFails > 0) {
      items.push({
        severity: 'warning', icon: 'alert',
        title: `${recentFails} failure${recentFails > 1 ? 's' : ''} in last 24h`,
        description: 'These need fresh investigation',
        action: 'View recent failures',
        link:   `/?status=FAILED`,
      })
    }

    // Info / positive — overall health is good
    if (items.length === 0) {
      items.push({
        severity: 'info', icon: 'lightbulb',
        title: 'No critical issues',
        description: 'Platform is operating within healthy thresholds',
        action: 'View full activity',
        link:   `/activity`,
      })
    }

    return items
  }, [jobs, failingApps, byEnv])

  if (isLoading || !stats) {
    return (
      <div className="flex flex-col gap-3 pt-3 pb-2 animate-fade-in min-h-full">
        <div className="skeleton h-12 rounded" />
        <div className="skeleton h-48 rounded" />
        <div className="skeleton h-64 rounded" />
      </div>
    )
  }

  const tier = tierFor(stats.successRate)
  // Donut ring math — radius 56, circumference ≈ 351.86
  const RADIUS = 56
  const CIRC = 2 * Math.PI * RADIUS
  const dashoffset = CIRC * (1 - stats.successRate / 100)

  return (
    <div className="flex flex-col gap-3 pt-3 pb-2 animate-fade-in min-h-full">

      {/* ── Prominent back button — primary navigation, easy to spot ── */}
      <BackButton to="/" label="Dashboard" />

      {/* ── Page header ── */}
      <div className="flex items-end justify-between gap-4 pb-1.5 border-b border-wiz-border/60">
        <div className="flex items-end gap-3 min-w-0">
          <div className="w-1 h-7 rounded-full bg-wiz-gold flex-shrink-0" aria-hidden />
          <div className="min-w-0">
            <h1 className="text-lg font-serif font-bold text-wiz-cream leading-none">Deployment Health</h1>
            <p className="text-[11px] text-wiz-muted mt-1 font-mono">
              your deployments &mdash; success rate, failures, and risk overview
            </p>
          </div>
        </div>
      </div>

      {/* ── Hero: focused donut + tier + 4 stats spanning the full row ── */}
      <div
        className="wiz-card px-5 py-4 flex items-center gap-5 border-l-[3px] border-l-wiz-gold"
        style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.07), 0 1px 3px rgba(0,0,0,0.05)' }}
      >
        {/* Donut — bigger so the inner text has breathing room */}
        <div className="relative flex-shrink-0">
          <svg width="144" height="144" viewBox="0 0 160 160" className="-rotate-90">
            <circle
              cx="80" cy="80" r={RADIUS}
              fill="none"
              stroke="rgb(var(--wiz-border))"
              strokeWidth="10"
            />
            <circle
              cx="80" cy="80" r={RADIUS}
              fill="none"
              stroke={tier.ringHex}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashoffset}
              style={{ transition: 'stroke-dashoffset 800ms ease-out' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={clsx('text-[32px] font-serif font-bold tabular-nums leading-none', tier.color)}>
              {stats.successRate}
              <span className="text-lg">%</span>
            </span>
            <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-wiz-muted mt-1.5 whitespace-nowrap">
              success rate
            </span>
          </div>
        </div>

        {/* Right column: tier + blurb + 4 stat tiles spanning full width */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-[0.16em]', tier.bg, tier.color, tier.border)}>
              <Heart size={10} strokeWidth={2.5} />
              {tier.label}
            </span>
            <p className="text-[12.5px] text-wiz-cream/85 leading-snug truncate">{tier.blurb}</p>
          </div>

          {/* 4-column grid — fills the width, all four stat types covered */}
          <div className="grid grid-cols-4 gap-2 mt-3">
            <MiniStat
              icon={<Layers size={11} />}
              label="Total"
              value={stats.total}
              color="text-wiz-cream"
              to="/"
              hint="View all deployments"
            />
            <MiniStat
              icon={<CheckCircle2 size={11} />}
              label="Successful"
              value={stats.success}
              color="text-sig-green"
              to="/?status=SUCCESS"
              hint="View successful deployments"
            />
            <MiniStat
              icon={<XCircle size={11} />}
              label="Failed"
              value={stats.failed}
              color="text-sig-red"
              to="/?status=FAILED"
              hint="View failed deployments"
            />
            <MiniStat
              icon={<Ban size={11} />}
              label="Aborted"
              value={stats.aborted}
              color="text-wiz-muted"
              to="/?status=ABORTED"
              hint="View aborted deployments"
            />
          </div>
        </div>
      </div>

      {/* ── Insights & Action Items ──
          Surfaces the *patterns* that matter rather than raw failures.
          Each card deep-links into the relevant filtered Dashboard view. */}
      <div>
        <div className="flex items-center gap-3 mb-2.5 px-1">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-wiz-surface border border-wiz-border-mid shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-wiz-gold/12 text-wiz-gold">
              <Lightbulb size={12} strokeWidth={2.4} />
            </span>
            <span className="text-[12px] font-bold uppercase tracking-[0.20em] text-wiz-cream">
              Insights &amp; Actions
            </span>
            <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-wiz-gold text-white text-[9.5px] font-bold tabular-nums">
              {insights.length}
            </span>
          </div>
          <div className="flex-1 h-px bg-wiz-border-mid/60" />
        </div>
        <div className={clsx('grid gap-2.5', insights.length === 1 ? 'grid-cols-1' : insights.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>
          {insights.map((ins, i) => {
            const sev = ins.severity === 'critical'
              ? { bg: 'bg-sig-red-dim',    border: 'border-l-sig-red',    text: 'text-sig-red',    badge: 'CRITICAL', badgeBg: 'bg-sig-red text-white' }
              : ins.severity === 'warning'
              ? { bg: 'bg-sig-yellow-dim', border: 'border-l-sig-yellow', text: 'text-sig-yellow', badge: 'WARNING',  badgeBg: 'bg-sig-yellow text-white' }
              : { bg: 'bg-sig-green-dim',  border: 'border-l-sig-green',  text: 'text-sig-green',  badge: 'INFO',     badgeBg: 'bg-sig-green text-white' }
            const Icon = ins.icon === 'alert' ? AlertTriangle : ins.icon === 'down' ? TrendingDown : Lightbulb
            return (
              <Link
                key={i}
                to={ins.link}
                className={clsx(
                  'group text-left wiz-card overflow-hidden border-l-[3px] px-3 py-2.5 flex flex-col gap-1',
                  'hover:-translate-y-[2px] transition-all duration-200',
                  sev.border, sev.bg,
                )}
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 8px 22px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.06)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)' }}
              >
                <div className="flex items-center gap-1.5">
                  <span className={clsx('flex items-center justify-center w-5 h-5 rounded-md', sev.text, 'bg-white/40 border border-current/20')}>
                    <Icon size={11} strokeWidth={2.4} />
                  </span>
                  <span className={clsx('inline-flex items-center px-1.5 py-[1px] rounded-sm text-[8.5px] font-bold uppercase tracking-[0.10em] leading-tight', sev.badgeBg)}>
                    {sev.badge}
                  </span>
                </div>
                <h3 className="text-[13px] font-semibold text-wiz-cream leading-tight">{ins.title}</h3>
                <p className="text-[11px] text-wiz-muted leading-snug flex-1">{ins.description}</p>
                <span className={clsx('inline-flex items-center gap-1 text-[10.5px] font-semibold', sev.text)}>
                  {ins.action}
                </span>
              </Link>
            )
          })}
        </div>
      </div>

      {/* ── Two-column: per-environment + top failing apps ── */}
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">

        {/* Per-Environment */}
        <div
          className="wiz-card overflow-hidden border-l-[3px] border-l-sig-blue/60 flex flex-col"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
        >
          <div className="px-3 py-2 border-b border-wiz-border/60 bg-wiz-raised/40 flex items-center gap-2">
            <Activity size={11} className="text-sig-blue" />
            <span className="section-label">By Environment</span>
          </div>
          <div className="px-2 py-2 flex flex-col gap-1.5 flex-1">
            {byEnv.length === 0 && (
              <p className="text-xs text-wiz-muted px-1">No environment data yet.</p>
            )}
            {byEnv.map(({ env, total, ok, fail, rate }) => {
              const envStyle = ENV_STYLES[env] ?? 'bg-wiz-surface text-wiz-muted border-wiz-border'
              const envTier = tierFor(rate)
              const isEmpty = total === 0
              return (
                <Link
                  key={env}
                  to={`/?env=${env}`}
                  title={`Filter dashboard by ${env} environment`}
                  className={clsx(
                    'group block rounded-md px-2.5 py-2 border transition-all duration-200',
                    isEmpty
                      ? 'opacity-50 border-wiz-border/50 hover:opacity-90 hover:border-wiz-border-mid hover:bg-wiz-bg/40'
                      : 'border-wiz-border bg-wiz-surface hover:border-wiz-gold hover:-translate-y-[2px]',
                  )}
                  style={!isEmpty ? { boxShadow: '0 1px 2px rgba(0,0,0,0.04)' } : undefined}
                  onMouseEnter={(e) => {
                    if (!isEmpty) (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 6px 16px rgba(139,26,26,0.14), 0 2px 4px rgba(139,26,26,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isEmpty) (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider border group-hover:scale-105 transition-transform', envStyle)}>
                      {env}
                    </span>
                    <span className="text-[10px] font-mono text-wiz-muted">
                      <span className="text-wiz-cream font-semibold">{total}</span> deploys
                    </span>
                    {!isEmpty && (
                      <span className="text-[10px] font-mono">
                        <span className="text-sig-green">{ok}</span>
                        <span className="text-wiz-border-mid mx-1">/</span>
                        <span className="text-sig-red">{fail}</span>
                      </span>
                    )}
                    <span className="ml-auto inline-flex items-center gap-1.5">
                      {!isEmpty && (
                        <span className={clsx('text-[11px] font-bold tabular-nums', envTier.color)}>
                          {rate}%
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full bg-wiz-bg/60 overflow-hidden border border-wiz-border/40">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${rate}%`, background: isEmpty ? 'rgb(var(--wiz-border))' : envTier.ringHex }}
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>

        {/* Top failing apps */}
        <div
          className="wiz-card overflow-hidden border-l-[3px] border-l-sig-red/60 flex flex-col"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
        >
          <div className="px-3 py-2 border-b border-wiz-border/60 bg-wiz-raised/40 flex items-center gap-2">
            <TrendingDown size={11} className="text-sig-red" />
            <span className="section-label">Top Failing Apps</span>
          </div>
          <div className="px-2 py-2 flex flex-col gap-1.5 flex-1">
            {failingApps.length === 0 ? (
              <p className="text-xs text-sig-green flex items-center gap-1.5 px-1">
                <CheckCircle2 size={12} />
                No apps with failures.
              </p>
            ) : (
              failingApps.map(app => {
                const appTier = tierFor(app.rate)
                return (
                  <Link
                    key={app.name}
                    to={`/?status=FAILED&q=${encodeURIComponent(app.name)}`}
                    title={`View failed deployments for ${app.name}`}
                    className="group flex items-center gap-2 px-2.5 py-2 rounded-md border border-wiz-border bg-wiz-surface hover:border-wiz-gold hover:-translate-y-[2px] transition-all duration-200"
                    style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 6px 16px rgba(139,26,26,0.14), 0 2px 4px rgba(139,26,26,0.08)' }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)' }}
                  >
                    <span className="text-sm font-medium text-wiz-cream truncate flex-1 group-hover:text-wiz-gold transition-colors">
                      {app.name}
                    </span>
                    <span className="text-[10px] font-mono text-wiz-muted">
                      <span className="text-sig-red font-semibold">{app.failed}</span>
                      <span className="text-wiz-border-mid mx-1">/</span>
                      <span>{app.total}</span>
                    </span>
                    <span className={clsx('text-[11px] font-bold tabular-nums w-10 text-right', appTier.color)}>
                      {app.rate}%
                    </span>
                  </Link>
                )
              })
            )}
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Mini Stat ─────────────────────────────────────────────────────
// Compact tile used in the hero. Clickable — each stat deep-links to a
// filtered Dashboard view so the page doubles as a navigation hub.

interface MiniStatProps {
  icon:  React.ReactNode
  label: string
  value: number
  color: string
  to?:   string
  hint?: string
}

function MiniStat({ icon, label, value, color, to, hint }: MiniStatProps) {
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-wiz-muted">
        <span className={color}>{icon}</span>
        <span className="text-[8.5px] font-bold uppercase tracking-[0.14em]">{label}</span>
      </div>
      <span className={clsx('block text-lg font-serif font-bold tabular-nums leading-none mt-0.5', color)}>
        {value}
      </span>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        title={hint}
        className="group block px-2.5 py-2 rounded-md bg-wiz-bg/60 border border-wiz-border-mid hover:bg-wiz-bg hover:border-wiz-gold hover:-translate-y-[2px] transition-all duration-200"
        style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 6px 16px rgba(139,26,26,0.16), 0 2px 4px rgba(139,26,26,0.10)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)' }}
      >
        {inner}
      </Link>
    )
  }

  return (
    <div className="px-2.5 py-2 rounded-md bg-wiz-bg/60 border border-wiz-border-mid">
      {inner}
    </div>
  )
}
