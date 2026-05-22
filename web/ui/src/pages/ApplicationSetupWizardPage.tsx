import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  ArrowLeft, ArrowRight, Boxes, Check, Plus, Server, Cpu,
  Sparkles, Settings2, AlertTriangle, Loader2, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'

import {
  createApplication, fetchApplication,
} from '../api/applications'
import {
  createEnvironment, updateEnvironment, fetchEnvironment,
} from '../api/environments'
import type { Application } from '../types/Application'
import type {
  EnvironmentConfig, EnvironmentConfigRequest,
} from '../types/EnvironmentConfig'

/**
 * Phase 5 §5.2.c — Application Setup Wizard.
 *
 * Three entry points, one page:
 *
 *   /applications/new
 *     Fresh app + environments. Multi-step:
 *       Step 1 — App basics (name + description)
 *       Step 2 — Pick envs (DEV / SIT / UAT / PROD chips)
 *       Step 3 — Configure each picked env (looped)
 *       Step 4 — Review & save (sequential createApplication + N envs)
 *
 *   /applications/:appId/environments/new?env=<env>
 *     Add an env to an existing app. Single-step env form; envName
 *     pre-set from the query string when provided.
 *
 *   /applications/:appId/environments/:envId/edit
 *     Edit an existing env. Single-step env form pre-populated.
 *
 * §5.0 principles in action:
 *   1. Select don't type   — env names + Java distributions + stability
 *                            presets are chip pickers
 *   2. Auto-detect over ask — sensible defaults for sshPort, serverPort,
 *                            maxLogSize, etc. User confirms; never
 *                            originates
 *   4. Progressive disclosure — 8 essential fields visible; 10 advanced
 *                                under a collapsed "Advanced" section
 *   5. Diff before destruction — Edit mode shows the existing values
 *                                 prominently so accidental overwrites
 *                                 are visually obvious
 */

// ── Constants & defaults ────────────────────────────────────────────────

const STANDARD_ENVS = ['DEV', 'SIT', 'UAT', 'PROD'] as const
type Env = typeof STANDARD_ENVS[number] | string

const ENV_BADGE: Record<string, string> = {
  DEV:  'bg-sig-green-dim  text-sig-green  border-sig-green/30',
  SIT:  'bg-sig-blue-dim   text-sig-blue   border-sig-blue/30',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/30',
  PROD: 'bg-sig-purple-dim text-sig-purple border-sig-purple/30',
}

interface JavaPreset { label: string; command: string; version: string }
/** Hand-picked Java distributions — covers ~95% of real apps. */
const JAVA_PRESETS: JavaPreset[] = [
  { label: 'Temurin 25 (LTS)', command: '/usr/lib/jvm/temurin-25-jdk/bin/java', version: '25' },
  { label: 'Temurin 21 (LTS)', command: '/usr/lib/jvm/temurin-21-jdk/bin/java', version: '21' },
  { label: 'Temurin 17 (LTS)', command: '/usr/lib/jvm/temurin-17-jdk/bin/java', version: '17' },
  { label: 'Corretto 21',      command: '/usr/lib/jvm/java-21-amazon-corretto/bin/java', version: '21' },
  { label: 'Corretto 17',      command: '/usr/lib/jvm/java-17-amazon-corretto/bin/java', version: '17' },
]

const STABILITY_PRESETS = [10, 20, 30, 60, 120]

/** Sensible field defaults — match the wizard's existing behaviour. */
function blankEnvConfig(envName: string): EnvironmentConfigRequest {
  return {
    envName,
    sshUser:            'deploy',
    sshHost:            '',
    sshPort:            22,
    javaCommand:        JAVA_PRESETS[2].command,    // Temurin 17 default
    javaVersion:        JAVA_PRESETS[2].version,
    targetBasePath:     '/app/home/deploy/deployments',
    runAsUser:          'deploy',
    serverPort:         8080,
    mainClass:          null,
    jarName:            null,
    libPath:            '',                          // fat JAR by default
    xms:                null,
    xmx:                null,
    extraJvmOpts:       null,
    maxLogSize:         '10m',
    maxLogFiles:        10,
    performBackup:      true,
    maxBackups:         5,
    stabilityWindow:    20,
    deploymentStrategy: 'in_place',
  }
}

/** Convert a full EnvironmentConfig (from GET) into a request shape (for PUT). */
function envToRequest(env: EnvironmentConfig): EnvironmentConfigRequest {
  return { ...env }   // shape is a strict superset
}

// ── Page ─────────────────────────────────────────────────────────────────

type Mode = 'new-app' | 'new-env' | 'edit-env'

export default function ApplicationSetupWizardPage() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()
  const params       = useParams<{ appId?: string; envId?: string }>()
  const [searchParams] = useSearchParams()

  /** Decide which of the three modes we're in. */
  const mode: Mode =
    params.appId && params.envId ? 'edit-env'
    : params.appId               ? 'new-env'
    :                              'new-app'

  // ── Wire up data for edit / add-to-existing modes ────────────────────
  const appQuery = useQuery<Application>({
    queryKey: ['application-by-id', params.appId],
    queryFn:  () => fetchApplication(params.appId!),
    enabled:  !!params.appId,
  })

  const envQuery = useQuery<EnvironmentConfig>({
    queryKey: ['environment', params.appId, params.envId],
    queryFn:  () => fetchEnvironment(params.appId!, params.envId!),
    enabled:  mode === 'edit-env',
  })

  // ── Wizard state (for new-app mode) ─────────────────────────────────
  const [step,        setStep]        = useState(1)
  const [appName,     setAppName]     = useState('')
  const [description, setDescription] = useState('')
  const [selectedEnvs, setSelectedEnvs] = useState<Set<string>>(new Set(['SIT', 'UAT']))
  const [envConfigs,  setEnvConfigs]  = useState<Record<string, EnvironmentConfigRequest>>({})

  // ── Wizard state (for new-env / edit-env modes) ─────────────────────
  const initialEnvName = searchParams.get('env')?.toUpperCase() ?? 'DEV'
  const [singleConfig, setSingleConfig] = useState<EnvironmentConfigRequest | null>(null)

  // Hydrate singleConfig once for edit / new-env modes
  useEffect(() => {
    if (mode === 'edit-env' && envQuery.data && !singleConfig) {
      setSingleConfig(envToRequest(envQuery.data))
    } else if (mode === 'new-env' && !singleConfig) {
      setSingleConfig(blankEnvConfig(initialEnvName))
    }
  }, [mode, envQuery.data, initialEnvName, singleConfig])

  // ── Render dispatch ─────────────────────────────────────────────────
  if (mode === 'edit-env' && envQuery.isLoading) {
    return <LoadingShell label="Loading environment…" />
  }
  if (mode === 'edit-env' && envQuery.isError) {
    return <NotFoundShell what="Environment" onBack={() => navigate(-1)} />
  }

  // SINGLE-FORM MODES — add env to existing app OR edit env
  if (mode === 'new-env' || mode === 'edit-env') {
    if (!singleConfig) return <LoadingShell label="Preparing form…" />

    return (
      <SingleEnvFormShell
        mode={mode}
        app={appQuery.data}
        config={singleConfig}
        onChange={setSingleConfig}
        onCancel={() => navigate(appQuery.data ? `/apps/${encodeURIComponent(appQuery.data.name)}` : '/applications')}
        onSubmit={async () => {
          if (!appQuery.data) return
          try {
            if (mode === 'edit-env' && params.envId) {
              await updateEnvironment(params.appId!, params.envId, singleConfig)
              toast.success(`${singleConfig.envName} updated`)
            } else {
              await createEnvironment(params.appId!, singleConfig)
              toast.success(`${singleConfig.envName} added`)
            }
            queryClient.invalidateQueries({ queryKey: ['environments'] })
            queryClient.invalidateQueries({ queryKey: ['application'] })
            navigate(`/apps/${encodeURIComponent(appQuery.data.name)}`)
          } catch (e: any) {
            const msg = e?.response?.data?.message ?? 'Save failed'
            toast.error(msg)
          }
        }}
      />
    )
  }

  // NEW-APP MODE — multi-step
  return (
    <NewAppWizardShell
      step={step}
      onStepChange={setStep}
      appName={appName}
      description={description}
      selectedEnvs={selectedEnvs}
      envConfigs={envConfigs}
      onAppName={setAppName}
      onDescription={setDescription}
      onToggleEnv={(env) => {
        const next = new Set(selectedEnvs)
        if (next.has(env)) next.delete(env)
        else next.add(env)
        setSelectedEnvs(next)
      }}
      onEnvConfig={(env, cfg) => setEnvConfigs(prev => ({ ...prev, [env]: cfg }))}
      onSubmit={async () => {
        try {
          const app = await createApplication({ name: appName.trim(), description: description.trim() || null })
          // Create envs sequentially so we get clean error messages per env
          for (const env of Array.from(selectedEnvs)) {
            const cfg = envConfigs[env] ?? blankEnvConfig(env)
            cfg.envName = env
            await createEnvironment(app.id, cfg)
          }
          toast.success(`Application ${app.name} registered with ${selectedEnvs.size} environment(s)`)
          queryClient.invalidateQueries({ queryKey: ['applications'] })
          navigate(`/apps/${encodeURIComponent(app.name)}`)
        } catch (e: any) {
          const msg = e?.response?.data?.message ?? 'Setup failed'
          toast.error(msg)
        }
      }}
      onCancel={() => navigate('/applications')}
    />
  )
}

// ────────────────────────────────────────────────────────────────────────
// Shell — generic loading / not-found
// ────────────────────────────────────────────────────────────────────────

function LoadingShell({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-wiz-muted">
      <Loader2 size={18} className="animate-spin mr-2" />
      {label}
    </div>
  )
}

function NotFoundShell({ what, onBack }: { what: string; onBack: () => void }) {
  return (
    <div className="wiz-card px-6 py-12 text-center mt-6">
      <AlertTriangle size={28} className="text-wiz-muted mx-auto mb-3" />
      <p className="text-sm text-wiz-cream mb-3">{what} not found</p>
      <button type="button" onClick={onBack} className="text-[12px] font-mono text-wiz-gold hover:underline">
        ← Back
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// New-app wizard shell — Steps 1 → 4
// ────────────────────────────────────────────────────────────────────────

interface NewAppWizardShellProps {
  step:           number
  onStepChange:   (s: number) => void
  appName:        string
  description:    string
  selectedEnvs:   Set<string>
  envConfigs:     Record<string, EnvironmentConfigRequest>
  onAppName:      (v: string) => void
  onDescription:  (v: string) => void
  onToggleEnv:    (env: string) => void
  onEnvConfig:    (env: string, cfg: EnvironmentConfigRequest) => void
  onSubmit:       () => Promise<void>
  onCancel:       () => void
}

function NewAppWizardShell(props: NewAppWizardShellProps) {
  const {
    step, onStepChange, appName, description, selectedEnvs, envConfigs,
    onAppName, onDescription, onToggleEnv, onEnvConfig, onSubmit, onCancel,
  } = props

  const envsList = useMemo(
    () => Array.from(selectedEnvs).sort((a, b) =>
      STANDARD_ENVS.indexOf(a as any) - STANDARD_ENVS.indexOf(b as any),
    ),
    [selectedEnvs],
  )

  // Step 1 valid → name non-empty
  const step1Valid = appName.trim().length > 0
  // Step 2 valid → ≥ 1 env picked
  const step2Valid = selectedEnvs.size > 0
  // Step 3 — pick which env we're configuring (defaults to the first one)
  const [envIndex, setEnvIndex] = useState(0)
  const currentEnv = envsList[envIndex]
  const step3Valid = envsList.every(env => isEnvValid(envConfigs[env] ?? blankEnvConfig(env)))

  const [submitting, setSubmitting] = useState(false)

  return (
    <div className="flex flex-col gap-4 pt-2 max-w-3xl mx-auto pb-12 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center justify-center w-8 h-8 rounded border border-wiz-border bg-wiz-surface text-wiz-muted hover:text-wiz-cream hover:border-wiz-border-mid transition-colors flex-shrink-0"
          aria-label="Cancel"
        >
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 className="text-xl font-serif font-bold text-wiz-cream leading-none">Register Application</h1>
          <p className="text-[11px] text-wiz-muted mt-1 font-mono">
            Step {step} of 4 · {STEP_TITLES[step - 1]}
          </p>
        </div>
      </div>

      {/* ── Step indicator ─────────────────────────────────────── */}
      <Stepper step={step} onStepChange={onStepChange} />

      {/* ── Step content ───────────────────────────────────────── */}
      <div className="wiz-card px-6 py-5">
        {step === 1 && (
          <StepAppBasics
            appName={appName}
            description={description}
            onAppName={onAppName}
            onDescription={onDescription}
          />
        )}
        {step === 2 && (
          <StepPickEnvs
            selectedEnvs={selectedEnvs}
            onToggle={onToggleEnv}
          />
        )}
        {step === 3 && currentEnv && (
          <StepConfigureEnv
            envs={envsList}
            envIndex={envIndex}
            onPickEnv={setEnvIndex}
            envName={currentEnv}
            config={envConfigs[currentEnv] ?? blankEnvConfig(currentEnv)}
            onChange={(cfg) => onEnvConfig(currentEnv, cfg)}
          />
        )}
        {step === 4 && (
          <StepReview
            appName={appName}
            description={description}
            envs={envsList}
            configs={envConfigs}
          />
        )}
      </div>

      {/* ── Nav buttons ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => step === 1 ? onCancel() : onStepChange(step - 1)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-wiz-border text-wiz-muted text-[12px] font-bold uppercase tracking-wider hover:text-wiz-cream hover:border-wiz-border-mid transition-colors"
        >
          <ArrowLeft size={12} />
          {step === 1 ? 'Cancel' : 'Back'}
        </button>

        {step < 4 ? (
          <button
            type="button"
            disabled={
              (step === 1 && !step1Valid) ||
              (step === 2 && !step2Valid)
            }
            onClick={() => onStepChange(step + 1)}
            className={clsx(
              'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12px] font-bold uppercase tracking-wider transition-colors',
              ((step === 1 && step1Valid) || (step === 2 && step2Valid) || step === 3)
                ? 'bg-wiz-gold text-white hover:bg-wiz-gold-light'
                : 'bg-wiz-border text-wiz-muted cursor-not-allowed',
            )}
          >
            Next
            <ArrowRight size={12} />
          </button>
        ) : (
          <button
            type="button"
            disabled={!step1Valid || !step2Valid || !step3Valid || submitting}
            onClick={async () => {
              setSubmitting(true)
              try { await onSubmit() }
              finally { setSubmitting(false) }
            }}
            className={clsx(
              'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12px] font-bold uppercase tracking-wider transition-colors',
              step3Valid && !submitting
                ? 'bg-wiz-gold text-white hover:bg-wiz-gold-light'
                : 'bg-wiz-border text-wiz-muted cursor-not-allowed',
            )}
          >
            {submitting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            Register Application
          </button>
        )}
      </div>
    </div>
  )
}

const STEP_TITLES = [
  'App basics',
  'Pick environments',
  'Configure each environment',
  'Review & register',
]

function Stepper({ step, onStepChange }: { step: number; onStepChange: (s: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      {STEP_TITLES.map((title, i) => {
        const num     = i + 1
        const active  = num === step
        const past    = num < step
        return (
          <button
            key={title}
            type="button"
            onClick={() => num < step && onStepChange(num)}
            disabled={num >= step}
            className={clsx(
              'flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-colors',
              active && 'border-wiz-gold/45 bg-wiz-gold/[0.05] text-wiz-gold',
              past   && 'border-sig-green/40 bg-sig-green/[0.04] text-sig-green hover:bg-sig-green/[0.08] cursor-pointer',
              !active && !past && 'border-wiz-border text-wiz-muted/60 cursor-not-allowed',
            )}
          >
            <span className={clsx(
              'inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-mono flex-shrink-0',
              active && 'bg-wiz-gold text-white',
              past   && 'bg-sig-green text-white',
              !active && !past && 'bg-wiz-border-mid text-white',
            )}>
              {past ? <Check size={9} strokeWidth={3} /> : num}
            </span>
            <span className="truncate">{title}</span>
          </button>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 1 — App basics
// ────────────────────────────────────────────────────────────────────────

function StepAppBasics({ appName, description, onAppName, onDescription }: {
  appName: string; description: string;
  onAppName: (v: string) => void; onDescription: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="section-label mb-2 flex items-center gap-1.5">
          <Boxes size={11} />
          App basics
        </h2>
        <p className="text-[12px] text-wiz-muted mb-4">
          Give your application a name. You can register multiple environments
          (DEV / SIT / UAT / PROD) in the next step.
        </p>
      </div>

      <Field
        label="Name *"
        hint="Required. Used as the identifier across the platform."
      >
        <input
          type="text"
          value={appName}
          onChange={(e) => onAppName(e.target.value)}
          placeholder="e.g. eureka-registry-ms"
          maxLength={100}
          autoFocus
          className="w-full px-3 py-1.5 rounded border border-wiz-border bg-wiz-bg/60 text-wiz-cream font-mono focus:outline-none focus:border-wiz-gold/60"
        />
      </Field>

      <Field
        label="Description"
        hint="Optional. One sentence about what this app does."
      >
        <input
          type="text"
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          placeholder="e.g. Service discovery — Netflix Eureka"
          maxLength={500}
          className="w-full px-3 py-1.5 rounded border border-wiz-border bg-wiz-bg/60 text-wiz-cream focus:outline-none focus:border-wiz-gold/60"
        />
      </Field>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 2 — Pick envs
// ────────────────────────────────────────────────────────────────────────

function StepPickEnvs({ selectedEnvs, onToggle }: {
  selectedEnvs: Set<string>; onToggle: (env: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="section-label mb-2 flex items-center gap-1.5">
          <Server size={11} />
          Pick environments
        </h2>
        <p className="text-[12px] text-wiz-muted mb-4">
          Choose which environments this app will be deployed to. You can
          add more later from the app detail page.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {STANDARD_ENVS.map(env => {
          const picked = selectedEnvs.has(env)
          return (
            <button
              key={env}
              type="button"
              onClick={() => onToggle(env)}
              className={clsx(
                'flex flex-col items-center gap-2 py-4 rounded-lg border-2 transition-colors',
                picked
                  ? 'border-wiz-gold bg-wiz-gold/[0.05]'
                  : 'border-wiz-border-mid bg-wiz-bg/30 hover:border-wiz-gold/40',
              )}
            >
              <span className={clsx('inline-flex items-center px-2 py-0.5 rounded font-mono text-[11px] font-bold uppercase tracking-wider border', ENV_BADGE[env])}>
                {env}
              </span>
              {picked
                ? <Check size={14} className="text-wiz-gold" strokeWidth={3} />
                : <span className="block h-[14px] w-[14px]" />}
            </button>
          )
        })}
      </div>

      <p className="text-[11px] text-wiz-muted italic">
        Selected: {Array.from(selectedEnvs).sort((a, b) =>
          STANDARD_ENVS.indexOf(a as any) - STANDARD_ENVS.indexOf(b as any),
        ).join(' · ') || '(none — pick at least one)'}
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 3 — Configure each env (sub-stepper)
// ────────────────────────────────────────────────────────────────────────

interface StepConfigureEnvProps {
  envs:       string[]
  envIndex:   number
  onPickEnv:  (i: number) => void
  envName:    string
  config:     EnvironmentConfigRequest
  onChange:   (cfg: EnvironmentConfigRequest) => void
}

function StepConfigureEnv({ envs, envIndex, onPickEnv, envName, config, onChange }: StepConfigureEnvProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="section-label mb-2 flex items-center gap-1.5">
          <Server size={11} />
          Configure {envName}
          <span className="ml-1 text-wiz-muted text-[10px] font-mono normal-case">
            ({envIndex + 1}/{envs.length})
          </span>
        </h2>
        <p className="text-[12px] text-wiz-muted mb-3">
          SSH target + Java + a few runtime defaults. Most fields auto-default
          to sensible values; advanced tuning is collapsed below.
        </p>
      </div>

      {/* Sub-stepper — pick which env we're configuring */}
      {envs.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {envs.map((env, i) => {
            const valid = isEnvValid(envName === env ? config : blankEnvConfig(env))
            return (
              <button
                key={env}
                type="button"
                onClick={() => onPickEnv(i)}
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-bold uppercase tracking-wider transition-colors',
                  i === envIndex
                    ? 'border-wiz-gold/45 bg-wiz-gold/[0.05] text-wiz-gold'
                    : valid
                      ? 'border-sig-green/30 bg-sig-green/[0.04] text-sig-green hover:border-sig-green/50'
                      : 'border-wiz-border text-wiz-muted hover:border-wiz-border-mid',
                )}
              >
                {valid ? <Check size={9} strokeWidth={3} /> : <span className="w-2 h-2 rounded-full bg-wiz-border-mid" />}
                {env}
              </button>
            )
          })}
        </div>
      )}

      <EnvConfigForm envName={envName} config={config} onChange={onChange} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// EnvConfigForm — shared by all three modes
// ────────────────────────────────────────────────────────────────────────

interface EnvConfigFormProps {
  envName:    string
  config:     EnvironmentConfigRequest
  onChange:   (cfg: EnvironmentConfigRequest) => void
}

function EnvConfigForm({ envName, config, onChange }: EnvConfigFormProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)

  function set<K extends keyof EnvironmentConfigRequest>(key: K, value: EnvironmentConfigRequest[K]) {
    onChange({ ...config, [key]: value })
  }

  return (
    <div className="flex flex-col gap-3.5">

      {/* SSH target — 3 fields on one row */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wiz-muted mb-1.5">SSH target</p>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
          <Input
            placeholder="user"
            value={config.sshUser ?? ''}
            onChange={(v) => set('sshUser', v)}
            mono
          />
          <Input
            placeholder="host or IP"
            value={config.sshHost ?? ''}
            onChange={(v) => set('sshHost', v)}
            mono
            required
          />
          <Input
            placeholder="22"
            type="number"
            value={config.sshPort ?? ''}
            onChange={(v) => set('sshPort', v === '' ? null : Number(v))}
            mono
            width="w-20"
          />
        </div>
      </div>

      {/* Java distribution + version */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wiz-muted mb-1.5">
          Java distribution
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {JAVA_PRESETS.map(preset => {
            const active = config.javaCommand === preset.command
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => onChange({ ...config, javaCommand: preset.command, javaVersion: preset.version })}
                className={clsx(
                  'px-2 py-1.5 rounded border text-[10px] font-mono font-semibold transition-colors',
                  active
                    ? 'border-wiz-gold/45 bg-wiz-gold/[0.05] text-wiz-cream'
                    : 'border-wiz-border bg-wiz-bg/40 text-wiz-muted hover:border-wiz-border-mid',
                )}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
        <div className="mt-1.5">
          <Input
            placeholder="Or paste a custom path, e.g. /opt/jvm/bin/java"
            value={config.javaCommand ?? ''}
            onChange={(v) => set('javaCommand', v)}
            mono
          />
        </div>
      </div>

      {/* Runtime essentials — target path / runAsUser / serverPort */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wiz-muted mb-1.5">Runtime</p>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-2">
          <Input
            placeholder="/app/home/deploy/deployments"
            value={config.targetBasePath ?? ''}
            onChange={(v) => set('targetBasePath', v)}
            mono
            required
          />
          <Input
            placeholder="run-as user"
            value={config.runAsUser ?? ''}
            onChange={(v) => set('runAsUser', v)}
            mono
          />
          <Input
            placeholder="8080"
            type="number"
            value={config.serverPort ?? ''}
            onChange={(v) => set('serverPort', v === '' ? null : Number(v))}
            mono
          />
        </div>
      </div>

      {/* Advanced — collapsed by default (§5.0 principle 4) */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(o => !o)}
        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-wiz-gold hover:text-wiz-gold-light self-start mt-1"
      >
        <ChevronRight
          size={11}
          className={clsx('transition-transform', advancedOpen && 'rotate-90')}
        />
        <Settings2 size={10} />
        Advanced tuning
      </button>

      {advancedOpen && (
        <div className="border-l-2 border-wiz-gold/20 pl-3 flex flex-col gap-3.5">
          <Field label="JVM heap (Xms / Xmx)" hint="Optional. JVM auto-sizes when blank.">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="e.g. 512m"
                value={config.xms ?? ''}
                onChange={(v) => set('xms', v || null)}
                mono
              />
              <Input
                placeholder="e.g. 1024m"
                value={config.xmx ?? ''}
                onChange={(v) => set('xmx', v || null)}
                mono
              />
            </div>
          </Field>

          <Field label="JAR layout" hint="Fat = single JAR. Thin = JAR + external lib/ dir.">
            <div className="inline-flex rounded border border-wiz-border bg-wiz-bg/40 p-0.5">
              {[
                { v: '',     label: 'Fat JAR' },
                { v: 'lib',  label: 'Thin JAR (external lib/)' },
              ].map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => set('libPath', opt.v)}
                  className={clsx(
                    'px-2.5 py-0.5 rounded-sm font-mono text-[10px] font-semibold transition-colors',
                    (config.libPath ?? '') === opt.v
                      ? 'bg-wiz-surface text-wiz-cream shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                      : 'text-wiz-muted hover:bg-wiz-surface/50',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Stability window" hint="Seconds the runner waits to confirm the app stayed up post-deploy.">
            <div className="flex items-center gap-1.5">
              {STABILITY_PRESETS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('stabilityWindow', s)}
                  className={clsx(
                    'px-2.5 py-1 rounded border text-[11px] font-mono transition-colors',
                    config.stabilityWindow === s
                      ? 'border-wiz-gold/45 bg-wiz-gold/[0.05] text-wiz-cream'
                      : 'border-wiz-border text-wiz-muted hover:border-wiz-border-mid',
                  )}
                >
                  {s}s
                </button>
              ))}
            </div>
          </Field>

          <Field label="Backups" hint="Pre-deploy backups kept on the target.">
            <div className="grid grid-cols-2 gap-2 items-center">
              <label className="flex items-center gap-2 text-[12px]">
                <input
                  type="checkbox"
                  checked={config.performBackup ?? true}
                  onChange={(e) => set('performBackup', e.target.checked)}
                />
                <span className="text-wiz-cream">Enable</span>
              </label>
              <Input
                placeholder="max backups"
                type="number"
                value={config.maxBackups ?? 5}
                onChange={(v) => set('maxBackups', v === '' ? null : Number(v))}
                mono
                disabled={!config.performBackup}
              />
            </div>
          </Field>

          <Field label="Log rotation" hint="Tanuki wrapper rolls logs at this size, keeping N files.">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="max log size — 10m"
                value={config.maxLogSize ?? ''}
                onChange={(v) => set('maxLogSize', v)}
                mono
              />
              <Input
                placeholder="max log files"
                type="number"
                value={config.maxLogFiles ?? 10}
                onChange={(v) => set('maxLogFiles', v === '' ? null : Number(v))}
                mono
              />
            </div>
          </Field>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Step 4 — Review & save
// ────────────────────────────────────────────────────────────────────────

function StepReview({ appName, description, envs, configs }: {
  appName: string; description: string;
  envs: string[]; configs: Record<string, EnvironmentConfigRequest>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="section-label mb-2 flex items-center gap-1.5">
          <Sparkles size={11} />
          Review & register
        </h2>
        <p className="text-[12px] text-wiz-muted mb-4">
          One click and we'll create the application + all {envs.length}{' '}
          environment{envs.length === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="wiz-card px-4 py-3 border-l-[3px] border-l-wiz-gold">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wiz-muted mb-1.5">Application</p>
        <p className="text-[14px] font-mono text-wiz-cream">{appName}</p>
        {description && (
          <p className="text-[11px] text-wiz-muted italic mt-0.5">{description}</p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wiz-muted mb-1.5">
          Environments ({envs.length})
        </p>
        <div className="space-y-1.5">
          {envs.map(env => {
            const cfg = configs[env] ?? blankEnvConfig(env)
            return (
              <div key={env} className="wiz-card px-3 py-2 flex items-center gap-3">
                <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider border', ENV_BADGE[env])}>
                  {env}
                </span>
                <span className="text-[12px] text-wiz-cream font-mono truncate">
                  {cfg.sshUser}@{cfg.sshHost}:{cfg.sshPort} · port {cfg.serverPort}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Single-form shell — used by new-env + edit-env modes
// ────────────────────────────────────────────────────────────────────────

interface SingleEnvFormShellProps {
  mode:       'new-env' | 'edit-env'
  app:        Application | undefined
  config:     EnvironmentConfigRequest
  onChange:   (cfg: EnvironmentConfigRequest) => void
  onSubmit:   () => Promise<void>
  onCancel:   () => void
}

function SingleEnvFormShell({ mode, app, config, onChange, onSubmit, onCancel }: SingleEnvFormShellProps) {
  const [submitting, setSubmitting] = useState(false)
  const valid = isEnvValid(config)
  const title = mode === 'edit-env'
    ? `Edit ${config.envName} configuration`
    : `Add ${config.envName} to ${app?.name ?? 'application'}`

  return (
    <div className="flex flex-col gap-4 pt-2 max-w-3xl mx-auto pb-12 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center justify-center w-8 h-8 rounded border border-wiz-border bg-wiz-surface text-wiz-muted hover:text-wiz-cream hover:border-wiz-border-mid transition-colors flex-shrink-0"
          aria-label="Cancel"
        >
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 className="text-xl font-serif font-bold text-wiz-cream leading-none">{title}</h1>
          {app && (
            <p className="text-[11px] text-wiz-muted mt-1 font-mono">
              {app.name} · {mode === 'edit-env' ? 'editing existing configuration' : 'new environment'}
            </p>
          )}
        </div>
      </div>

      <div className="wiz-card px-6 py-5">
        {/* env name — read-only chip in both modes (set from URL / existing row) */}
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-wiz-muted mb-2">Environment</p>
        <span className={clsx('inline-flex items-center px-2 py-0.5 rounded font-mono text-[11px] font-bold uppercase tracking-wider border mb-4', ENV_BADGE[config.envName ?? 'DEV'] ?? 'bg-wiz-bg/40 text-wiz-muted border-wiz-border')}>
          {config.envName}
        </span>

        <EnvConfigForm envName={config.envName ?? 'DEV'} config={config} onChange={onChange} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-wiz-border text-wiz-muted text-[12px] font-bold uppercase tracking-wider hover:text-wiz-cream hover:border-wiz-border-mid transition-colors"
        >
          <ArrowLeft size={12} /> Cancel
        </button>
        <button
          type="button"
          disabled={!valid || submitting}
          onClick={async () => {
            setSubmitting(true)
            try { await onSubmit() }
            finally { setSubmitting(false) }
          }}
          className={clsx(
            'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12px] font-bold uppercase tracking-wider transition-colors',
            valid && !submitting
              ? 'bg-wiz-gold text-white hover:bg-wiz-gold-light'
              : 'bg-wiz-border text-wiz-muted cursor-not-allowed',
          )}
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
          {mode === 'edit-env' ? 'Save changes' : 'Add environment'}
        </button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Form primitives + validation
// ────────────────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-wiz-muted mb-1">
          {label}
        </span>
        {children}
        {hint && <p className="text-[10px] text-wiz-dim italic mt-1">{hint}</p>}
      </label>
    </div>
  )
}

interface InputProps {
  value:       string | number
  onChange:    (v: string) => void
  placeholder?: string
  type?:        'text' | 'number'
  mono?:        boolean
  required?:    boolean
  disabled?:    boolean
  width?:       string
}
function Input({ value, onChange, placeholder, type = 'text', mono, required, disabled, width }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className={clsx(
        'px-3 py-1.5 rounded border border-wiz-border bg-wiz-bg/60 text-wiz-cream text-[12px] focus:outline-none focus:border-wiz-gold/60 disabled:opacity-50',
        mono && 'font-mono',
        width ?? 'w-full',
      )}
    />
  )
}

function isEnvValid(c: EnvironmentConfigRequest): boolean {
  return !!(
    c.envName && c.envName.trim() &&
    c.sshUser && c.sshUser.trim() &&
    c.sshHost && c.sshHost.trim() &&
    c.sshPort && c.sshPort > 0 &&
    c.javaCommand && c.javaCommand.trim() &&
    c.targetBasePath && c.targetBasePath.trim() &&
    c.runAsUser && c.runAsUser.trim() &&
    c.serverPort && c.serverPort > 0
  )
}
