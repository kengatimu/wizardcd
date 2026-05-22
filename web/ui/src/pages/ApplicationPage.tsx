import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ArrowLeft, Server, Clock, Layers, CheckCircle2, XCircle,
  Loader2, AlertCircle, StopCircle, Activity, Rocket,
  Pencil, MoreHorizontal, Archive, Plus, Trash2,
  AlertTriangle, HelpCircle, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'

import {
  fetchApplicationByName,
  updateApplication,
  deleteApplication,
  restoreApplication,
} from '../api/applications'
import { fetchEnvironments, deleteEnvironment } from '../api/environments'
import { fetchJobs } from '../api/jobs'
import StatusBadge from '../components/StatusBadge'
import JobTypeBadge from '../components/JobTypeBadge'

import type { Application, LiveConfigCapability } from '../types/Application'
import type { EnvironmentConfig } from '../types/EnvironmentConfig'
import type { JobSummary } from '../types/JobSummary'

/**
 * Phase 5 §5.2.b — Application Detail page.
 *
 * Reads the application + its saved env configs + its deploy history.
 * Layout (top-to-bottom):
 *   1. Header — name (inline-editable), description (inline-editable),
 *      capability badge, Archive button
 *   2. Stats strip (4 KPIs) — only when there are deploys
 *   3. Env cards — DEV/SIT/UAT/PROD. Each card shows EITHER:
 *      • saved env config (SSH/Java/port summary + last deploy + Deploy
 *        button + ⋯ menu with Edit/Delete/Test), OR
 *      • a dimmed "+ Add Environment" placeholder linking to the
 *        Setup Wizard (Stage 5.2c).
 *   4. Deploy history table
 *
 * §5.0 principles honoured:
 *   1. Select don't type      — Deploy buttons land on the wizard with
 *                                app + env pre-selected; no manual ids.
 *   2. Show capability before — capability badge appears next to the
 *      action                    app name so users see live-push state
 *                                before they reach for Deploy.
 *   5. Diff before destruction — Archive + Delete Env both show confirm
 *                                 dialogs; Archive uses toast-Undo
 *                                 within 5s.
 *   6. Optimistic with safety — Archive navigates away immediately while
 *                                showing the toast; Undo restores via the
 *                                /restore endpoint.
 */

// ── Helpers ────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const ms   = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
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

const ENVS = ['DEV', 'SIT', 'UAT', 'PROD'] as const
type Env = typeof ENVS[number]

/** Per-env visual tokens, matching the rest of the app. */
const ENV_CFG: Record<Env, { badge: string; border: string; bg: string; accent: string; iconBg: string }> = {
  DEV:  { badge: 'bg-sig-green/20 text-sig-green border border-sig-green/30',  border: 'border-l-sig-green',  bg: 'bg-sig-green-dim',  accent: 'text-sig-green',  iconBg: 'bg-sig-green/15'  },
  SIT:  { badge: 'bg-sig-blue/20 text-sig-blue border border-sig-blue/30',     border: 'border-l-sig-blue',   bg: 'bg-sig-blue-dim',   accent: 'text-sig-blue',   iconBg: 'bg-sig-blue/15'   },
  UAT:  { badge: 'bg-sig-yellow/20 text-sig-yellow border border-sig-yellow/30', border: 'border-l-sig-yellow', bg: 'bg-sig-yellow-dim', accent: 'text-sig-yellow', iconBg: 'bg-sig-yellow/15' },
  PROD: { badge: 'bg-sig-purple/20 text-sig-purple border border-sig-purple/30', border: 'border-l-sig-purple', bg: 'bg-sig-purple-dim', accent: 'text-sig-purple', iconBg: 'bg-sig-purple/15' },
}

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'ABORTED'])
const isTerminal = (s: string) => TERMINAL_STATUSES.has(s)

function EnvStatusIcon({ status }: { status: string }) {
  if (status === 'SUCCESS') return <CheckCircle2 size={18} className="text-sig-green" />
  if (status === 'FAILED')  return <XCircle      size={18} className="text-sig-red" />
  if (status === 'ABORTED') return <StopCircle   size={18} className="text-sig-yellow" />
  if (['RUNNING', 'PREPARING_WORKSPACE', 'CREATED', 'VALIDATING'].includes(status))
                            return <Loader2     size={18} className="text-sig-yellow animate-spin" />
  return <AlertCircle size={18} className="text-wiz-dim" />
}

// ────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────

export default function ApplicationPage() {
  const { appName }  = useParams<{ appName: string }>()
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  // ── Queries ─────────────────────────────────────────────────────────
  const appQuery = useQuery<Application | null>({
    queryKey: ['application', appName],
    queryFn:  () => appName ? fetchApplicationByName(appName) : Promise.resolve(null),
    enabled:  !!appName,
  })

  const envsQuery = useQuery<EnvironmentConfig[]>({
    queryKey: ['environments', appQuery.data?.id],
    queryFn:  () => appQuery.data?.id
      ? fetchEnvironments(appQuery.data.id)
      : Promise.resolve([]),
    enabled:  !!appQuery.data?.id,
  })

  const jobsQuery = useQuery<JobSummary[]>({
    queryKey: ['jobs-list'],
    queryFn:  fetchJobs,
    refetchInterval: 10_000,
  })

  // ── Derived data ───────────────────────────────────────────────────
  const app  = appQuery.data
  const envs = envsQuery.data ?? []

  const appJobs = useMemo(() => {
    if (!appName) return []
    return (jobsQuery.data ?? [])
      .filter(j => j.appName === appName)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [jobsQuery.data, appName])

  /** Latest job per env (uppercased), as a map for O(1) lookup. */
  const latestByEnv = useMemo(() => {
    const m: Record<string, JobSummary | undefined> = {}
    for (const env of ENVS) {
      m[env] = appJobs.find(j => (j.environment ?? '').toUpperCase() === env)
    }
    return m
  }, [appJobs])

  /** Saved env config per env name. */
  const envConfigByName = useMemo(() => {
    const m: Record<string, EnvironmentConfig | undefined> = {}
    for (const e of envs) m[e.envName] = e
    return m
  }, [envs])

  // Stats
  const totalDeploys = appJobs.length
  const successCount = appJobs.filter(j => j.lifecycleStatus === 'SUCCESS').length
  const failedCount  = appJobs.filter(j => j.lifecycleStatus === 'FAILED').length
  const successRate  = totalDeploys > 0 ? Math.round((successCount / totalDeploys) * 100) : null

  // ── Loading / not found ────────────────────────────────────────────
  if (appQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-wiz-muted">
        <Loader2 size={18} className="animate-spin mr-2" />
        Loading application…
      </div>
    )
  }

  if (appQuery.isError || (!appQuery.isLoading && !app)) {
    return (
      <div className="wiz-card px-6 py-12 text-center mt-6">
        <AlertCircle size={28} className="text-wiz-muted mx-auto mb-3" />
        <p className="text-sm text-wiz-cream mb-1">
          Application <span className="font-mono text-wiz-gold">{appName}</span> not found
        </p>
        <p className="text-xs text-wiz-muted mb-4">It may have been archived. Check the registry.</p>
        <button
          type="button"
          onClick={() => navigate('/applications')}
          className="text-[12px] font-mono text-wiz-gold hover:underline"
        >
          ← Back to Applications
        </button>
      </div>
    )
  }

  // ── Mutations (inline — small enough not to need useMutation) ──────
  async function commitNameChange(newName: string) {
    if (!app) return
    if (newName === app.name || newName.trim() === '') return
    try {
      const updated = await updateApplication(app.id, { name: newName.trim() })
      toast.success(`Renamed to "${updated.name}"`)
      queryClient.invalidateQueries({ queryKey: ['application'] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      navigate(`/apps/${encodeURIComponent(updated.name)}`, { replace: true })
    } catch (e) {
      toast.error('Rename failed — name may already be taken')
    }
  }

  async function commitDescriptionChange(newDescription: string) {
    if (!app) return
    if (newDescription === (app.description ?? '')) return
    try {
      await updateApplication(app.id, { description: newDescription.trim() })
      queryClient.invalidateQueries({ queryKey: ['application'] })
    } catch {
      toast.error('Saving description failed')
    }
  }

  async function handleArchive() {
    if (!app) return
    const confirmed = window.confirm(
      `Archive "${app.name}"?\n\nIt will be hidden from the registry. Deploy history is preserved. You can restore it from the toast that appears.`
    )
    if (!confirmed) return
    try {
      await deleteApplication(app.id)
      const appId = app.id
      toast(
        (t) => (
          <span className="flex items-center gap-3">
            <span><strong>{app.name}</strong> archived</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await restoreApplication(appId)
                  toast.success('Restored')
                  queryClient.invalidateQueries({ queryKey: ['applications'] })
                  toast.dismiss(t.id)
                  navigate(`/apps/${encodeURIComponent(app.name)}`, { replace: true })
                } catch {
                  toast.error('Restore failed')
                }
              }}
              className="px-2 py-0.5 rounded bg-wiz-gold/15 text-wiz-gold text-[11px] font-bold uppercase tracking-wider"
            >
              Undo
            </button>
          </span>
        ),
        { duration: 5000, icon: '📦' },
      )
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      navigate('/applications')
    } catch {
      toast.error('Archive failed')
    }
  }

  async function handleDeleteEnv(env: EnvironmentConfig) {
    if (!app) return
    const confirmed = window.confirm(
      `Delete the ${env.envName} configuration for ${app.name}?\n\nDeploy history is preserved; you can re-add the environment later.`
    )
    if (!confirmed) return
    try {
      await deleteEnvironment(app.id, env.id)
      toast.success(`${env.envName} environment removed`)
      queryClient.invalidateQueries({ queryKey: ['environments'] })
    } catch {
      toast.error(`Removing ${env.envName} failed`)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  if (!app) return null   // (TS narrowing — handled above)

  return (
    <div className="flex flex-col gap-5 pt-2 animate-fade-in">

      {/* ── Header ───────────────────────────────────────────────── */}
      <PageHeader
        app={app}
        envCount={envs.length}
        deployCount={totalDeploys}
        onNameCommit={commitNameChange}
        onDescriptionCommit={commitDescriptionChange}
        onArchive={handleArchive}
        onBack={() => navigate('/applications')}
      />

      {/* ── Stats strip (only when there are deploys) ────────────── */}
      {totalDeploys > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Total Deploys" value={totalDeploys} icon={<Layers size={14} />} color="text-wiz-gold"  bg="bg-wiz-gold-dim" />
          <Kpi label="Successful"    value={successCount} icon={<CheckCircle2 size={14} />} color="text-sig-green" bg="bg-sig-green-dim" />
          <Kpi label="Failed"        value={failedCount}  icon={<XCircle size={14} />}      color="text-sig-red"   bg="bg-sig-red-dim" />
          <Kpi
            label="Success Rate"
            value={successRate !== null ? `${successRate}%` : '—'}
            icon={<Activity size={14} />}
            color={successRate !== null && successRate >= 80 ? 'text-sig-green' : 'text-sig-yellow'}
            bg={successRate !== null && successRate >= 80 ? 'bg-sig-green-dim' : 'bg-sig-yellow-dim'}
          />
        </div>
      )}

      {/* ── Env cards (4 — one per known env) ────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="section-label flex items-center gap-2">
            <Server size={11} />
            ENVIRONMENTS
          </p>
          <p className="text-[10px] font-mono text-wiz-muted">
            {envs.length}/4 configured
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {ENVS.map(env => (
            <EnvCard
              key={env}
              env={env}
              config={envConfigByName[env]}
              latestJob={latestByEnv[env]}
              appName={app.name}
              onDeploy={() =>
                navigate(`/deploy?app=${encodeURIComponent(app.name)}&env=${env}`)
              }
              onAdd={() =>
                navigate(`/applications/${app.id}/environments/new?env=${env}`)
              }
              onEdit={(cfg) =>
                navigate(`/applications/${app.id}/environments/${cfg.id}/edit`)
              }
              onDelete={handleDeleteEnv}
            />
          ))}
        </div>
      </section>

      {/* ── Deploy history table ─────────────────────────────────── */}
      <DeployHistory appJobs={appJobs} navigate={navigate} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Page header — inline-editable name + description, archive menu
// ────────────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  app:                  Application
  envCount:             number
  deployCount:          number
  onNameCommit:         (newName: string) => void
  onDescriptionCommit:  (newDescription: string) => void
  onArchive:            () => void
  onBack:               () => void
}

function PageHeader({ app, envCount, deployCount, onNameCommit, onDescriptionCommit, onArchive, onBack }: PageHeaderProps) {
  return (
    <header className="flex items-start gap-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Applications"
        className="flex items-center justify-center w-8 h-8 rounded border border-wiz-border bg-wiz-surface text-wiz-muted hover:text-wiz-cream hover:border-wiz-border-mid transition-colors flex-shrink-0 mt-1"
      >
        <ArrowLeft size={15} />
      </button>

      <div className="flex-1 min-w-0">
        {/* Inline-editable name */}
        <InlineEdit
          value={app.name}
          onCommit={onNameCommit}
          maxLength={100}
          placeholder="Application name"
          className="text-xl font-serif font-bold text-wiz-cream tracking-tight"
        />
        {/* Inline-editable description */}
        <InlineEdit
          value={app.description ?? ''}
          onCommit={onDescriptionCommit}
          maxLength={500}
          placeholder="Add a description"
          multiline
          className="text-[12px] text-wiz-muted mt-1 italic"
        />

        {/* Summary chips — capability + counts */}
        <div className="flex items-center gap-2.5 mt-2 text-[10px] font-mono text-wiz-muted">
          <CapabilityChip capability={app.liveConfigCapability} />
          <span className="text-wiz-dim/40">·</span>
          <span>{envCount} env{envCount === 1 ? '' : 's'}</span>
          <span className="text-wiz-dim/40">·</span>
          <span>{deployCount} deploy{deployCount === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* Header action — Archive */}
      <button
        type="button"
        onClick={onArchive}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-wiz-border text-wiz-muted text-[11px] font-bold uppercase tracking-wider hover:text-sig-red hover:border-sig-red/40 hover:bg-sig-red/5 transition-colors flex-shrink-0"
        title="Archive — hide from registry. History is preserved."
      >
        <Archive size={11} />
        Archive
      </button>
    </header>
  )
}

function CapabilityChip({ capability }: { capability: LiveConfigCapability | null }) {
  if (capability === 'ENABLED')
    return <span className="inline-flex items-center gap-1 text-sig-green"><CheckCircle2 size={10} /> Live push ready</span>
  if (capability === 'DEGRADED')
    return <span className="inline-flex items-center gap-1 text-sig-yellow"><AlertTriangle size={10} /> Live push needs setup</span>
  if (capability === 'MISSING')
    return <span className="inline-flex items-center gap-1 text-wiz-muted"><AlertTriangle size={10} /> No live push</span>
  if (capability === 'PROBING')
    return <span className="inline-flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Probing</span>
  return <span className="inline-flex items-center gap-1 text-wiz-dim italic"><HelpCircle size={10} /> Capability unknown</span>
}

// ────────────────────────────────────────────────────────────────────────
// InlineEdit — click to edit, Enter / blur to commit, Esc to cancel
// ────────────────────────────────────────────────────────────────────────

interface InlineEditProps {
  value:        string
  onCommit:     (newValue: string) => void
  placeholder?: string
  maxLength?:   number
  multiline?:   boolean
  className?:   string
}

function InlineEdit({ value, onCommit, placeholder, maxLength, multiline, className }: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    if (draft !== value) onCommit(draft)
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          maxLength={maxLength}
          rows={2}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit() }
            if (e.key === 'Escape') { setDraft(value); setEditing(false) }
          }}
          className={clsx(
            'block w-full bg-wiz-bg/60 border border-wiz-gold/30 rounded px-2 py-1 focus:outline-none focus:border-wiz-gold',
            className,
          )}
        />
      )
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter')  { e.preventDefault(); commit() }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        className={clsx(
          'block w-full bg-wiz-bg/60 border border-wiz-gold/30 rounded px-2 py-1 focus:outline-none focus:border-wiz-gold',
          className,
        )}
      />
    )
  }

  // Display mode — click anywhere to enter edit
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={value ? `Click to edit — ${value}` : `Click to add ${placeholder?.toLowerCase()}`}
      className={clsx(
        'group/edit text-left w-full block px-2 py-1 -mx-2 rounded hover:bg-wiz-gold/[0.04] transition-colors',
        className,
      )}
    >
      {value || <span className="text-wiz-dim/60">{placeholder}</span>}
      <Pencil size={9} className="inline-block ml-1.5 opacity-0 group-hover/edit:opacity-60 transition-opacity" />
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────
// KPI tile
// ────────────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string
  value: string | number
  icon:  React.ReactNode
  color: string
  bg:    string
}
function Kpi({ label, value, icon, color, bg }: KpiProps) {
  return (
    <div className="wiz-card px-4 py-3 flex items-center gap-3">
      <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', bg)}>
        <span className={color}>{icon}</span>
      </div>
      <div>
        <p className={clsx('text-lg font-bold leading-none', color)}>{value}</p>
        <p className="text-[10px] text-wiz-muted uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// EnvCard — saved-config view OR add-env placeholder
// ────────────────────────────────────────────────────────────────────────

interface EnvCardProps {
  env:        Env
  config:     EnvironmentConfig | undefined
  latestJob:  JobSummary | undefined
  appName:    string
  onDeploy:   () => void
  onAdd:      () => void
  onEdit:     (cfg: EnvironmentConfig) => void
  onDelete:   (cfg: EnvironmentConfig) => void
}

function EnvCard({ env, config, latestJob, onDeploy, onAdd, onEdit, onDelete }: EnvCardProps) {
  const cfg = ENV_CFG[env]
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close ⋯ menu on outside click + Esc
  useEffect(() => {
    if (!menuOpen) return
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  // ── Empty-env placeholder ────────────────────────────────────────
  if (!config) {
    return (
      <button
        type="button"
        onClick={onAdd}
        className="group flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed border-wiz-border-mid hover:border-wiz-gold/60 hover:bg-wiz-gold/[0.03] transition-colors min-h-[180px]"
      >
        <span className={clsx('inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider', cfg.badge)}>
          {env}
        </span>
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-wiz-gold/10 text-wiz-gold group-hover:bg-wiz-gold/15 transition-colors">
          <Plus size={18} strokeWidth={2.25} />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-wider text-wiz-cream/85">
          Add {env}
        </span>
        <span className="text-[10px] text-wiz-muted">
          Configure SSH + Java for this environment
        </span>
      </button>
    )
  }

  // ── Active env card ──────────────────────────────────────────────
  return (
    <div className={clsx('wiz-card overflow-hidden border-l-[3px]', cfg.border, 'flex flex-col')}>
      {/* Tinted header strip */}
      <div className={clsx('px-3 py-2 border-b border-wiz-border/40 flex items-center justify-between', cfg.bg)}>
        <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider', cfg.badge)}>
          {env}
        </span>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label={`${env} actions`}
            className="p-1 rounded text-wiz-muted hover:text-wiz-cream hover:bg-wiz-bg/60 transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1 w-44 rounded-md border border-wiz-border bg-wiz-surface shadow-lg z-20 py-1 text-[12px]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onEdit(config) }}
                className="w-full text-left px-3 py-1.5 hover:bg-wiz-bg/60 flex items-center gap-2"
              >
                <Pencil size={11} /> Edit configuration
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); onDelete(config) }}
                className="w-full text-left px-3 py-1.5 hover:bg-sig-red/8 text-sig-red flex items-center gap-2"
              >
                <Trash2 size={11} /> Remove environment
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body — config summary */}
      <div className="px-3 py-3 flex flex-col gap-1.5 flex-1">
        <Row label="Target"  value={`${config.sshUser}@${config.sshHost}:${config.sshPort}`} />
        <Row label="Java"    value={config.javaVersion ? `Java ${config.javaVersion}` : 'Custom'} />
        <Row label="Port"    value={String(config.serverPort)} />
        <Row label="Run as"  value={config.runAsUser} />
        {(config.xms || config.xmx) && (
          <Row label="Heap" value={`${config.xms ?? '—'} / ${config.xmx ?? '—'}`} />
        )}

        {latestJob && (
          <div className="flex items-center gap-1.5 mt-1 pt-1.5 border-t border-wiz-border/30 text-[10px] font-mono">
            <EnvStatusIcon status={latestJob.lifecycleStatus} />
            <span className="text-wiz-cream truncate flex-1">
              Last: {timeAgo(latestJob.createdAt)}
            </span>
            <StatusBadge status={latestJob.lifecycleStatus} size="sm" pulse={!isTerminal(latestJob.lifecycleStatus)} />
          </div>
        )}
      </div>

      {/* Footer — Deploy CTA */}
      <div className="px-3 py-2 border-t border-wiz-border/40">
        <button
          type="button"
          onClick={onDeploy}
          className={clsx(
            'w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-white text-[11px] font-bold uppercase tracking-wider transition-colors',
            'bg-wiz-gold hover:bg-wiz-gold-light',
          )}
        >
          <Rocket size={11} strokeWidth={2.5} />
          Deploy to {env}
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="text-wiz-muted uppercase tracking-wider text-[9px] w-12 flex-shrink-0">{label}</span>
      <span className="text-wiz-cream font-mono truncate" title={value}>{value}</span>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Deploy history table (unchanged from Phase 4 — kept here so the page is
// self-contained)
// ────────────────────────────────────────────────────────────────────────

function DeployHistory({ appJobs, navigate }: { appJobs: JobSummary[]; navigate: (path: string) => void }) {
  if (appJobs.length === 0) {
    return (
      <section className="wiz-card px-6 py-10 text-center">
        <Clock size={20} className="text-wiz-border-mid mx-auto mb-2" />
        <p className="text-sm text-wiz-muted">No deployments yet for this application.</p>
        <p className="text-[11px] text-wiz-dim mt-1">Once you deploy, every job will appear here.</p>
      </section>
    )
  }

  return (
    <section className="wiz-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-wiz-border/60 bg-wiz-raised/40 flex items-center justify-between">
        <p className="section-label">RECENT DEPLOYMENTS</p>
        <span className="text-[10px] font-mono text-wiz-muted">
          {appJobs.length} total
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[9%]"  />   {/* Env */}
            <col className="w-[11%]" />   {/* Type */}
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
              const envKey = (job.environment ?? '').toUpperCase()
              const envCfg = ENV_CFG[envKey as Env]
              return (
                <tr
                  key={job.jobId}
                  className="hover:bg-wiz-bg transition-colors cursor-pointer group"
                  onClick={() => navigate(`/jobs/${job.jobId}`)}
                >
                  <td className="px-4 py-2.5">
                    {envCfg ? (
                      <span className={clsx('font-mono text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border', envCfg.badge)}>
                        {envKey}
                      </span>
                    ) : (
                      <span className="text-xs text-wiz-muted font-mono">{job.environment ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <JobTypeBadge type={job.jobType} />
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={job.lifecycleStatus} size="sm" pulse={!isTerminal(job.lifecycleStatus)} />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-wiz-cream">{formatDate(job.createdAt)}</span>
                      <span className="text-[10px] text-wiz-muted/60 font-mono">{timeAgo(job.createdAt)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-wiz-gray font-mono">
                    {formatDuration(job.createdAt, job.completedAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-wiz-gold group-hover:text-wiz-cream font-mono transition-colors truncate block" title={job.jobId}>
                      {job.jobId}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
