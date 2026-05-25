import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  BookMarked, CheckCircle2, ChevronDown, ExternalLink,
  Loader2, Pencil, RefreshCw, Server, Sparkles, X,
} from 'lucide-react'

import { fetchApplications, fetchApplication } from '../api/applications'
import type { Application } from '../types/Application'
import type { EnvironmentConfig } from '../types/EnvironmentConfig'

/**
 * Phase 5 §5.3a — Saved Configs Panel.
 *
 * Sits at the top of the Deploy wizard's Step 1. Lets the user skip the
 * tedious SSH/Java/Runtime form by picking a previously-saved app + env
 * config. Embodies §5.0 principle 1 (select don't type): the preferred
 * path is two clicks (app → env → Load), not 10+ form fields.
 *
 * Three display modes, switched on internally:
 *
 *   1. LOADED    — compact green confirmation strip showing what's loaded,
 *                  with Unload and Edit-config actions.
 *   2. EMPTY     — no apps registered yet. Soft gold CTA inviting the user
 *                  to register one (or skip and fill the form manually).
 *   3. PICKER    — default. Two side-by-side cards:
 *                    Left  (gold, preferred) — App + Env picker
 *                    Right (neutral)         — "Configure manually" escape
 *
 * §5.3c — the panel also pre-selects the dropdown values from the
 *         last successful deploy's config (read from localStorage).
 *         User still has to click "Load" — auto-loading without consent
 *         would feel surprising, especially after the user has just
 *         opened the page expecting a fresh form.
 */

/** localStorage key — last successful deploy's saved-config selection. */
export const LAST_USED_CONFIG_KEY = 'wiz-last-used-config'

export interface PersistedLastUsed {
  applicationId: string
  environmentId: string
  appName:       string
  envName:       string
  at:            string  // ISO timestamp
}

function readLastUsed(): PersistedLastUsed | null {
  try {
    const raw = localStorage.getItem(LAST_USED_CONFIG_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.applicationId || !parsed?.environmentId) return null
    return parsed as PersistedLastUsed
  } catch { return null }
}

// ── Types ────────────────────────────────────────────────────────────────

export interface LoadedConfig {
  applicationId: string
  environmentId: string
  appName:       string
  envName:       string
}

interface Props {
  /** Currently loaded config, or null if user hasn't picked one. */
  loaded: LoadedConfig | null
  /** Fires when the user clicks "Load" — receives the picked env + app name. */
  onLoad: (appName: string, env: EnvironmentConfig) => void
  /** Fires when the user unloads the current config (button on loaded strip). */
  onUnload: () => void
  /** Whether the user has dismissed the picker for this session. */
  dismissed: boolean
  /** Setter for the dismissed flag. */
  setDismissed: (next: boolean) => void
}

// ── Env theme map ────────────────────────────────────────────────────────

const ENV_THEME: Record<string, { dot: string; chip: string; ring: string }> = {
  DEV:  { dot: 'bg-sig-green',  chip: 'bg-sig-green-dim  text-sig-green  border-sig-green/30',  ring: 'ring-sig-green/40'  },
  SIT:  { dot: 'bg-sig-blue',   chip: 'bg-sig-blue-dim   text-sig-blue   border-sig-blue/30',   ring: 'ring-sig-blue/40'   },
  UAT:  { dot: 'bg-sig-yellow', chip: 'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/30', ring: 'ring-sig-yellow/40' },
  PROD: { dot: 'bg-sig-purple', chip: 'bg-sig-purple-dim text-sig-purple border-sig-purple/30', ring: 'ring-sig-purple/40' },
}

function envTheme(env: string) {
  return ENV_THEME[env.toUpperCase()] ?? {
    dot: 'bg-wiz-muted', chip: 'bg-wiz-bg/60 text-wiz-muted border-wiz-border', ring: 'ring-wiz-border',
  }
}

// ── Component ────────────────────────────────────────────────────────────

export default function SavedConfigsPanel(props: Props) {
  const { loaded, onLoad, onUnload, dismissed, setDismissed } = props
  const navigate = useNavigate()

  // ── LOADED MODE ──────────────────────────────────────────────────────
  if (loaded) {
    const theme = envTheme(loaded.envName)
    return (
      <div
        id="saved-config-panel"
        className="rounded border border-sig-green/40 border-l-2 border-l-sig-green/70 bg-sig-green-dim/60 overflow-hidden animate-fade-in"
      >
        <div className="flex items-center gap-3 px-5 py-3">
          <CheckCircle2 size={16} className="text-sig-green flex-shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
            <span className="text-xs uppercase tracking-wider font-mono text-sig-green/80">
              Loaded from saved config
            </span>
            <span className="text-sm font-semibold text-wiz-cream truncate">
              {loaded.appName}
            </span>
            <span className={clsx('text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded border', theme.chip)}>
              {loaded.envName}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => navigate(`/applications/${loaded.applicationId}/environments/${loaded.environmentId}/edit`)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded border border-wiz-border/60 text-wiz-muted hover:text-wiz-cream hover:border-wiz-border transition-all"
              title="Edit the saved config in a new tab"
            >
              <Pencil size={11} />
              Edit saved config
            </button>
            <button
              type="button"
              onClick={onUnload}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded border border-wiz-border/60 text-wiz-muted hover:text-wiz-cream hover:border-wiz-border transition-all"
              title="Clear the loaded config and edit fields manually"
            >
              <X size={11} />
              Unload
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── DISMISSED — render nothing (user opted out for this session) ─────
  if (dismissed) return null

  // ── PICKER + EMPTY MODE ──────────────────────────────────────────────
  return <PickerPanel onLoad={onLoad} setDismissed={setDismissed} />
}

// ── Picker subcomponent ──────────────────────────────────────────────────

interface PickerProps {
  onLoad: (appName: string, env: EnvironmentConfig) => void
  setDismissed: (next: boolean) => void
}

function PickerPanel({ onLoad, setDismissed }: PickerProps) {
  const navigate = useNavigate()
  // Pre-seed from last successful deploy (§5.3c) so the most common
  // case — "deploy the same app to the same env again" — is one click.
  const lastUsed = useMemo(readLastUsed, [])
  const [pickedAppId, setPickedAppId] = useState<string>(() => lastUsed?.applicationId ?? '')
  const [pickedEnvId, setPickedEnvId] = useState<string>('')
  // Tracks whether we've already restored the env from last-used — only
  // happens once per panel mount so the user's manual re-selection of an
  // app doesn't get clobbered by the restore effect.
  const [envRestored, setEnvRestored] = useState(false)

  // List of apps (shallow — no environments inlined yet)
  const appsQuery = useQuery({
    queryKey: ['applications-list-for-deploy'],
    queryFn:  () => fetchApplications(),
    staleTime: 30_000,
  })

  // When an app is picked, fetch its envs
  const appDetailQuery = useQuery({
    queryKey: ['application-with-envs', pickedAppId],
    queryFn:  () => fetchApplication(pickedAppId, { expandEnvironments: true }),
    enabled:  !!pickedAppId,
    staleTime: 30_000,
  })

  const apps = appsQuery.data ?? []
  const envs = appDetailQuery.data?.environments ?? []
  const pickedEnv = envs.find(e => e.id === pickedEnvId) ?? null
  const pickedApp = appDetailQuery.data ?? apps.find(a => a.id === pickedAppId) ?? null

  // Env restoration logic — priority order:
  //   1. Last-used env from localStorage (only on first hydrate of this app)
  //   2. Single-env apps: auto-pick the only env (§5.0 #2 auto-detect)
  useEffect(() => {
    if (envs.length === 0 || pickedEnvId) return

    // 1. Restore env from last-used if it matches the current app
    if (!envRestored && lastUsed?.applicationId === pickedAppId && lastUsed.environmentId) {
      const match = envs.find(e => e.id === lastUsed.environmentId)
      if (match) {
        setPickedEnvId(match.id)
        setEnvRestored(true)
        return
      }
    }

    // 2. Auto-pick the only env when an app has just one
    if (envs.length === 1) {
      setPickedEnvId(envs[0].id)
    }
  }, [envs, pickedEnvId, pickedAppId, lastUsed, envRestored])

  // Reset env pick when app changes
  useEffect(() => {
    setPickedEnvId('')
  }, [pickedAppId])

  const handleLoad = () => {
    if (!pickedApp || !pickedEnv) return
    onLoad(pickedApp.name, pickedEnv)
  }

  // ── Loading state ────────────────────────────────────────────────────
  if (appsQuery.isLoading) {
    return (
      <div className="rounded border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-surface overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-gold-dim">
          <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
          <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
            Saved App Configs
          </h3>
        </div>
        <div className="p-5 flex items-center gap-2 text-sm text-wiz-muted">
          <Loader2 size={14} className="animate-spin" />
          Loading saved apps…
        </div>
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (appsQuery.isError) {
    return (
      <div className="rounded border border-sig-red/40 border-l-2 border-l-sig-red bg-sig-red-dim/40 overflow-hidden">
        <div className="px-5 py-3 flex items-center gap-3">
          <RefreshCw size={14} className="text-sig-red" />
          <p className="text-sm text-wiz-cream flex-1">
            Couldn't reach the runner to load saved configs.
          </p>
          <button
            type="button"
            onClick={() => appsQuery.refetch()}
            className="text-xs font-medium px-2.5 py-1 rounded border border-sig-red/40 text-sig-red hover:bg-sig-red-dim transition-all"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs font-medium px-2.5 py-1 rounded border border-wiz-border/60 text-wiz-muted hover:text-wiz-cream transition-all"
          >
            Skip
          </button>
        </div>
      </div>
    )
  }

  // ── EMPTY state — no apps registered yet ─────────────────────────────
  if (apps.length === 0) {
    return (
      <div className="rounded border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-surface overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-gold-dim">
          <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
          <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
            Saved App Configs
          </h3>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-wiz-muted/70 font-mono">
            Optional shortcut
          </span>
        </div>
        <div className="p-5 flex items-start gap-4">
          <div className="w-9 h-9 rounded-full bg-wiz-gold-dim flex items-center justify-center flex-shrink-0">
            <Sparkles size={16} className="text-wiz-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-wiz-cream font-medium">
              Save your app once. Skip these fields forever.
            </p>
            <p className="text-xs text-wiz-muted/80 mt-1 leading-relaxed">
              Register an app + environment now and every future deploy
              becomes a two-click affair: pick app → pick env → upload JAR.
              You can also fill the form below manually for one-off deploys.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={() => navigate('/applications/new')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-wiz-gold text-white hover:bg-wiz-gold/90 transition-all"
              >
                <BookMarked size={12} />
                Register an app
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-xs font-medium px-3 py-1.5 rounded border border-wiz-border/60 text-wiz-muted hover:text-wiz-cream hover:border-wiz-border transition-all"
              >
                Skip — I'll fill in below
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── PICKER state — apps exist, user is choosing ──────────────────────
  return (
    <div className="rounded border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-surface overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-gold-dim">
        <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
        <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
          Saved App Configs
        </h3>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-wiz-muted/70 font-mono">
          Optional shortcut · {apps.length} {apps.length === 1 ? 'app' : 'apps'} saved
        </span>
      </div>
      <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_auto_minmax(180px,auto)] gap-3">
        {/* App picker */}
        <AppDropdown
          apps={apps}
          value={pickedAppId}
          onChange={setPickedAppId}
        />

        {/* Env picker — only when app is chosen */}
        <EnvPicker
          envs={envs}
          loading={appDetailQuery.isLoading && !!pickedAppId}
          value={pickedEnvId}
          onChange={setPickedEnvId}
          disabled={!pickedAppId}
        />

        {/* Load button */}
        <button
          type="button"
          onClick={handleLoad}
          disabled={!pickedEnv}
          className={clsx(
            'inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-semibold transition-all',
            pickedEnv
              ? 'bg-wiz-gold text-white hover:bg-wiz-gold/90 shadow-sm'
              : 'bg-wiz-bg/40 text-wiz-muted/50 cursor-not-allowed border border-wiz-border/40',
          )}
        >
          <Server size={13} />
          Load config
        </button>
      </div>

      <div className="px-5 pb-4 -mt-1 flex items-center justify-between gap-3">
        <p className="text-[11px] text-wiz-muted/70 leading-relaxed">
          Loaded configs pre-fill every field below. You can still override any
          field for this one deploy — your changes won't touch the saved config
          unless you ask to save them back.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-[11px] font-medium text-wiz-muted/70 hover:text-wiz-cream underline-offset-2 hover:underline transition-colors flex-shrink-0"
        >
          Skip — fill manually
        </button>
      </div>
    </div>
  )
}

// ── App dropdown ─────────────────────────────────────────────────────────

function AppDropdown({
  apps, value, onChange,
}: {
  apps: Application[]
  value: string
  onChange: (id: string) => void
}) {
  const picked = apps.find(a => a.id === value) ?? null

  // Sort: most-recently-deployed first (then alpha)
  const sorted = useMemo(() => {
    return [...apps].sort((a, b) => {
      const aLast = a.deploySummary?.lastDeployAt
      const bLast = b.deploySummary?.lastDeployAt
      if (aLast && bLast) return bLast.localeCompare(aLast)
      if (aLast) return -1
      if (bLast) return 1
      return a.name.localeCompare(b.name)
    })
  }, [apps])

  return (
    <div className="relative">
      <label className="block text-[11px] font-mono uppercase tracking-wider text-wiz-muted/70 mb-1">
        Application
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none px-3 py-2 pr-9 rounded border border-wiz-border bg-wiz-bg text-sm text-wiz-cream focus:outline-none focus:ring-2 focus:ring-wiz-gold/40 focus:border-wiz-gold/40"
        >
          <option value="">— Pick an app —</option>
          {sorted.map(a => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.deploySummary?.totalDeploys
                ? `  ·  ${a.deploySummary.totalDeploys} deploy${a.deploySummary.totalDeploys === 1 ? '' : 's'}`
                : ''}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-wiz-muted pointer-events-none"
        />
      </div>
      {picked?.description && (
        <p className="text-[11px] text-wiz-muted/70 mt-1 truncate" title={picked.description}>
          {picked.description}
        </p>
      )}
    </div>
  )
}

// ── Env picker (chip-style) ──────────────────────────────────────────────

function EnvPicker({
  envs, loading, value, onChange, disabled,
}: {
  envs: EnvironmentConfig[]
  loading: boolean
  value: string
  onChange: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col">
      <label className="block text-[11px] font-mono uppercase tracking-wider text-wiz-muted/70 mb-1">
        Environment
      </label>
      {disabled ? (
        <div className="flex items-center px-3 py-2 rounded border border-dashed border-wiz-border/60 bg-wiz-bg/30 text-xs text-wiz-muted/70 h-[38px]">
          Pick an app first
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded border border-wiz-border bg-wiz-bg text-xs text-wiz-muted h-[38px]">
          <Loader2 size={12} className="animate-spin" />
          Loading envs…
        </div>
      ) : envs.length === 0 ? (
        <div className="flex items-center px-3 py-2 rounded border border-wiz-yellow/40 bg-wiz-yellow-dim/40 text-xs text-wiz-cream h-[38px]">
          No saved envs — <ExternalLink size={10} className="mx-1.5" /> add one
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap h-[38px]">
          {envs.map(env => {
            const theme = envTheme(env.envName)
            const active = env.id === value
            return (
              <button
                key={env.id}
                type="button"
                onClick={() => onChange(env.id)}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono font-bold uppercase tracking-wider transition-all',
                  theme.chip,
                  active
                    ? `ring-2 ${theme.ring} ring-offset-1 ring-offset-wiz-surface`
                    : 'opacity-70 hover:opacity-100',
                )}
              >
                <span className={clsx('w-1.5 h-1.5 rounded-full', theme.dot)} />
                {env.envName}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
