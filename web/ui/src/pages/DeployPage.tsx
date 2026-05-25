import { useState, useCallback, useEffect, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Wand2, Upload, Check, X, Copy, Wifi, WifiOff, Loader2, Shield, Plus, AlertTriangle, Clock, ChevronDown, Info, Search } from 'lucide-react'
import JSZip from 'jszip'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { submitJob, fetchRunnerPublicKeys, fetchRunnerInfo, testSshConnection, checkDeployPath } from '../api/jobs'
import type { DeploymentRequest } from '../types/DeploymentRequest'
import FormField, { SelectField, FieldWrapper, RowInput, RowSelect, RowField } from '../components/FormField'
import ToggleSwitch from '../components/ToggleSwitch'
import DynamicList from '../components/DynamicList'
import { useTheme, type ActiveEnv } from '../context/ThemeContext'
import MissionControl, { SIDEBAR_MAX_W } from '../components/MissionControl'
import { DeployPathStatusPanel } from '../components/DeployPathStatusPanel'
import SavedConfigsPanel, { type LoadedConfig } from '../components/SavedConfigsPanel'
import type { EnvironmentConfig } from '../types/EnvironmentConfig'

// ── Step metadata ─────────────────────────────────────────────────

const STEPS = [
  { id: 1, num: '01', label: 'Target Server',       subtitle: 'Point WizardCD at your server and verify it can reach it over SSH.' },
  { id: 2, num: '02', label: 'Application',         subtitle: 'Upload your JAR and tell us how the application should run.' },
  { id: 3, num: '03', label: 'Deployment Options',  subtitle: 'Tune backups, log rotation, JVM flags and any extra files to ship.' },
  { id: 4, num: '04', label: 'Review & Deploy',     subtitle: 'One last look at every setting before you cast the deployment.' },
] as const

// ── File upload helper types ───────────────────────────────────────

interface CertUpload {
  source:     string       // directory name inside the ZIP / INPUT_DIR
  targetPath: string       // absolute path on the target server
  file:       File | null  // ZIP containing cert / keystore files
}

interface ExtraDirUpload {
  dirName:    string       // directory name within INPUT_DIR
  targetPath: string       // absolute path on the target server
  file:       File | null  // ZIP containing the directory contents
}

// ── Per-environment SSH key panel style tokens ────────────────────

const ENV_KEY_STYLE = {
  DEV:  { border: 'border-l-sig-green/40',  dot: 'bg-sig-green',  text: 'text-sig-green/85',  header: 'bg-sig-green-dim',  headerLight: 'bg-sig-green-dim/40',  badge: 'border-sig-green/30 bg-sig-green-dim/40'    },
  SIT:  { border: 'border-l-sig-blue/40',   dot: 'bg-sig-blue',   text: 'text-sig-blue/85',   header: 'bg-sig-blue-dim',   headerLight: 'bg-sig-blue-dim/40',   badge: 'border-sig-blue/30 bg-sig-blue-dim/40'     },
  UAT:  { border: 'border-l-sig-yellow/40', dot: 'bg-sig-yellow', text: 'text-sig-yellow/85', header: 'bg-sig-yellow-dim', headerLight: 'bg-sig-yellow-dim/40', badge: 'border-sig-yellow/30 bg-sig-yellow-dim/40'  },
  PROD: { border: 'border-l-sig-purple/40', dot: 'bg-sig-purple', text: 'text-sig-purple/85', header: 'bg-sig-purple-dim', headerLight: 'bg-sig-purple-dim/40', badge: 'border-sig-purple/30 bg-sig-purple-dim/40'  },
} as const

// ── Form state ────────────────────────────────────────────────────

interface FormState {
  // Step 1 — SSH Target
  environment:    string
  sshUser:        string
  sshHost:        string
  sshPort:        string
  targetBasePath: string
  // Step 2 — Identity
  appName:     string
  mainClass:   string
  // Step 3 — Java / JVM
  javaCommand: string
  javaVersion: string
  xms:         string
  xmx:         string
  newRatio:    string
  extraOpts:   string[]
  // Step 4 — Runtime
  runAsUser:   string
  serverPort:  string
  maxLogSize:  string
  maxLogFiles: string
  jarType:     'fat' | 'thin'  // fat = self-contained; thin = requires lib/ dir
  // Step 5 — Backup & Stability
  performBackup:   boolean
  maxBackups:      string
  stabilityWindow: string    // seconds — how long to monitor after startup (default 20)
  // Step 6 — File Uploads
  jarArtifact: File | null      // the application JAR (always required)
  libZip:      File | null      // lib/ dependencies ZIP (thin JAR mode only)
  hasCerts:    boolean           // explicit opt-in: user has cert/keystore files
  certUploads: CertUpload[]     // cert/keystore entries, each with its own ZIP
  hasExtraDirs: boolean          // explicit opt-in: user has extra directories
  extraDirs:   ExtraDirUpload[] // extra directory entries, each with its own ZIP
  jarName:     string           // auto-filled from jarArtifact filename
}

function getDefaultEnv(): string {
  const stored = localStorage.getItem('wiz-active-env')
  return stored && ['DEV', 'SIT', 'UAT', 'PROD'].includes(stored)
    ? stored
    : (import.meta.env.VITE_APP_ENV ?? 'SIT')
}

const INITIAL: FormState = {
  environment:    getDefaultEnv(),
  sshUser:        '',
  sshHost:        '',
  sshPort:        '22',
  targetBasePath: '',
  appName:        '',
  mainClass:      '',
  javaCommand:    '',
  javaVersion:    '',
  xms:            '',
  xmx:            '',
  newRatio:       '',
  extraOpts:      [],
  runAsUser:      '',
  serverPort:     '',
  maxLogSize:     '10m',
  maxLogFiles:    '10',
  jarType:        'fat',
  performBackup:    true,
  maxBackups:       '3',
  stabilityWindow:  '20',
  jarArtifact:    null,
  libZip:         null,
  hasCerts:       false,
  certUploads:    [],
  hasExtraDirs:   false,
  extraDirs:      [],
  jarName:        '',
}

// ── Per-step validation ───────────────────────────────────────────

type FormErrors = Partial<Record<keyof FormState, string>>

// Human-readable labels for validation error summaries
const FIELD_LABELS: Partial<Record<keyof FormState, string>> = {
  sshUser:        'SSH User',
  sshHost:        'SSH Host',
  sshPort:        'SSH Port',
  jarArtifact:    'JAR File',
  jarName:        'JAR Filename',
  libZip:         'Dependencies ZIP',
  appName:        'App Name',
  mainClass:      'Entry Point',
  javaCommand:    'Java Path',
  javaVersion:    'Java Version',
  runAsUser:      'Run As',
  serverPort:     'Port',
  targetBasePath: 'Deploy Path',
  xms:            'Heap Min',
}

function validateStep(step: number, form: FormState, jvmConfigEnabled = false): FormErrors {
  const e: FormErrors = {}
  switch (step) {
    case 1:  // Target Server
      if (!form.sshUser)        e.sshUser        = 'Required'
      if (!form.sshHost)        e.sshHost        = 'Required'
      if (!form.sshPort)        e.sshPort        = 'Required'
      break
    case 2:  // Application
      if (!form.jarArtifact) {
        e.jarArtifact = 'Required'
      } else if (!form.jarArtifact.name.toLowerCase().endsWith('.jar')) {
        e.jarArtifact = 'Must be a .jar file'
      }
      if (!form.jarName.trim()) e.jarName = 'Required'
      if (form.jarType === 'thin' && !form.libZip) {
        e.libZip = 'Required — upload your lib/ dependencies as a .zip'
      }
      if (!form.appName)    e.appName    = 'Required'
      if (!form.mainClass)  e.mainClass  = 'Required'
      if (!form.javaCommand) e.javaCommand = 'Required'
      if (!form.javaVersion) e.javaVersion = 'Required'
      if (!form.runAsUser)      e.runAsUser      = 'Required'
      if (!form.serverPort)     e.serverPort     = 'Required'
      if (!form.targetBasePath) e.targetBasePath = 'Required'
      break
    case 3:  // Deployment Options — JVM heap validated only when custom JVM is enabled with fixed heap
      if (jvmConfigEnabled && form.xms && form.xmx && heapMB(form.xms) > heapMB(form.xmx))
        e.xms = 'Heap min cannot exceed heap max'
      break
  }
  return e
}

// Inline banner shown at the top of a step when it has validation errors
function StepErrorBanner({ errors }: { errors: FormErrors }) {
  const keys = Object.keys(errors) as (keyof FormState)[]
  if (keys.length === 0) return null
  return (
    <div className="flex items-start gap-2.5 px-4 py-3 rounded border border-sig-red/30 bg-sig-red-dim/20 mb-4">
      <AlertTriangle size={14} className="text-sig-red flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-sig-red">Missing required fields</p>
        <p className="text-[11px] text-sig-red/70 mt-0.5">
          {keys.map((k) => FIELD_LABELS[k] ?? k).join(' · ')}
        </p>
      </div>
    </div>
  )
}

// ── ConfigSourceBadge (Phase 5 §5.3b) ─────────────────────────────────────
// Right-aligned pill on the SSH Target panel header showing the active
// saved config + how many fields have been overridden for this deploy.
//
//   0 overrides → green "From saved" pill
//   N overrides → amber "N modified" pill (acts as a quiet diff signal —
//                 user can hover to see which fields)
function ConfigSourceBadge({
  appName, envName, overriddenCount,
}: { appName: string; envName: string; overriddenCount: number }) {
  const clean = overriddenCount === 0
  return (
    <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
      <span
        className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-sig-green/80"
        title={`Loaded ${appName} → ${envName}`}
      >
        <Check size={10} />
        <span className="hidden sm:inline">From saved</span>
      </span>
      <span className="text-[10px] font-mono font-semibold text-wiz-cream/70 max-w-[180px] truncate">
        {appName} → {envName}
      </span>
      {!clean && (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border border-sig-yellow/40 bg-sig-yellow-dim text-sig-yellow"
          title="You have changed these values from the saved config — your overrides apply to this deploy only."
        >
          {overriddenCount} mod{overriddenCount === 1 ? '' : 's'}
        </span>
      )}
    </div>
  )
}

// ── Step status ───────────────────────────────────────────────────
// 'active'     — currently displayed step (gold)
// 'complete'   — visited and all required fields filled (green + check)
// 'incomplete' — visited but has validation errors (yellow + warning triangle)
// 'unvisited'  — never navigated to yet (gray, but still clickable)

type StepStatus = 'active' | 'complete' | 'incomplete' | 'unvisited'

function getStepStatus(
  stepId: number,
  activeStep: number,
  visited: Set<number>,
  form: FormState,
  jvmConfigEnabled = false,
): StepStatus {
  if (stepId === activeStep) return 'active'
  if (!visited.has(stepId))  return 'unvisited'
  return Object.keys(validateStep(stepId, form, jvmConfigEnabled)).length === 0 ? 'complete' : 'incomplete'
}

// ── Build DeploymentRequest ───────────────────────────────────────

function buildRequest(form: FormState, computedJvmFlags: string[] = []): DeploymentRequest {
  return {
    appName:        form.appName,
    environment:    form.environment,
    mainClass:      form.mainClass,
    jarName:        form.jarName || form.jarArtifact?.name || '',
    javaCommand:    form.javaCommand,
    javaVersion:    parseInt(form.javaVersion,  10),
    xms:            form.xms,
    xmx:            form.xmx,
    newRatio:       '',    // empty = omitted from Tanuki conf; modern GCs self-tune generational sizing
    extraOpts:      [...computedJvmFlags, ...form.extraOpts.filter(Boolean)],
    runAsUser:      form.runAsUser,
    serverPort:     parseInt(form.serverPort,   10),
    maxLogSize:     form.maxLogSize,
    maxLogFiles:    parseInt(form.maxLogFiles,  10),
    // 'lib' triggers EXTERNAL_LIB mode in the Tanuki wrapper config generator;
    // empty string triggers FAT_JAR mode (deploy.sh uses this to pick the classpath).
    libPath:        form.jarType === 'thin' ? 'lib' : '',
    extraDirs:      form.extraDirs
      .filter((d) => d.dirName.trim() && d.targetPath.trim() && d.file)
      .map((d) => ({ dirName: d.dirName.trim(), targetPath: d.targetPath.trim() })),
    certPaths:      form.certUploads
      .filter((c) => c.source.trim() && c.targetPath.trim() && c.file)
      .map((c) => ({ source: c.source.trim(), targetPath: c.targetPath.trim() })),
    sshUser:        form.sshUser,
    sshHost:        form.sshHost,
    sshPort:        parseInt(form.sshPort,      10),
    targetBasePath: form.targetBasePath,
    performBackup:    form.performBackup,
    maxBackups:       parseInt(form.maxBackups,   10),
    stabilityWindow:  parseInt(form.stabilityWindow, 10) || 20,
  }
}

// ── Step tab ──────────────────────────────────────────────────────

interface StepTabProps {
  num:     string
  label:   string
  status:  StepStatus
  onClick: () => void
}

// ── Review row (Step 4) ──────────────────────────────────────────

const REVIEW_ENV_BADGE: Record<string, string> = {
  SIT:  'bg-sig-blue-dim text-sig-blue border-sig-blue/25',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/25',
  PROD: 'bg-sig-purple-dim text-sig-purple border-sig-purple/25',
}

function ReviewRow({ label, value, mono, badge }: {
  label: string
  value: string
  mono?: boolean
  badge?: boolean   // render value as env badge
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 last:pb-0 first:pt-0">
      <span className="text-xs text-wiz-muted/50 w-24 flex-shrink-0">{label}</span>
      {badge ? (
        <span className={clsx(
          'inline-flex items-center px-2.5 py-0.5 rounded font-mono text-[11px] font-bold uppercase tracking-wider border',
          REVIEW_ENV_BADGE[value] ?? 'bg-wiz-surface text-wiz-muted border-wiz-border',
        )}>
          {value}
        </span>
      ) : (
        <span
          className={clsx(
            'flex-1 rounded-md bg-wiz-bg border border-wiz-border/15 px-2.5 py-1',
            'text-xs text-wiz-cream/80 break-all font-mono',
          )}
          title={value || '—'}
        >
          {value || '—'}
        </span>
      )}
    </div>
  )
}

function StepTab({ num, label, status, onClick }: StepTabProps) {
  const isActive     = status === 'active'
  const isComplete   = status === 'complete'
  const isIncomplete = status === 'incomplete'

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2.5 px-2 py-1.5 rounded transition-all duration-200 cursor-pointer min-w-0 hover:bg-wiz-bg/60"
    >
      {/* Numbered circle — the visual focal point of each step */}
      <span className="relative flex-shrink-0">
        {/* Pulse ring (active only) */}
        {isActive && (
          <span
            className="absolute inset-0 rounded-full bg-wiz-gold/35 animate-ping"
            style={{ animationDuration: '2s' }}
            aria-hidden
          />
        )}

        <span className={clsx(
          'relative flex items-center justify-center w-8 h-8 rounded-full border-2 font-mono font-bold text-[12px] transition-all duration-200',
          isActive
            ? 'border-wiz-gold bg-wiz-gold text-white shadow-[0_0_0_4px_rgba(139,26,26,0.12),0_2px_8px_rgba(139,26,26,0.30)]'
            : isComplete
            ? 'border-sig-green bg-sig-green text-white shadow-[0_2px_6px_rgba(22,163,74,0.25)]'
            : isIncomplete
            ? 'border-sig-yellow/60 bg-sig-yellow-dim text-sig-yellow group-hover:border-sig-yellow'
            : 'border-wiz-border-mid bg-wiz-surface text-wiz-muted group-hover:border-wiz-border-strong group-hover:text-wiz-cream',
        )}>
          {isComplete
            ? <Check size={14} strokeWidth={3} />
            : isIncomplete
            ? <AlertTriangle size={13} strokeWidth={2.5} />
            : num}
        </span>
      </span>

      {/* Two-line label: meta caption + step name */}
      <span className="flex flex-col items-start min-w-0">
        <span className={clsx(
          'text-[8.5px] font-bold uppercase tracking-[0.16em] leading-none transition-colors',
          isActive     ? 'text-wiz-gold' :
          isComplete   ? 'text-sig-green' :
          isIncomplete ? 'text-sig-yellow' :
                         'text-wiz-muted',
        )}>
          {isComplete   ? 'Done'    :
           isActive     ? 'Current' :
           isIncomplete ? 'Issue'   :
                          `Step ${num}`}
        </span>
        <span className={clsx(
          'text-[12.5px] font-semibold leading-tight mt-0.5 truncate transition-colors',
          isActive   ? 'text-wiz-cream' :
          isComplete ? 'text-wiz-cream' :
                       'text-wiz-muted group-hover:text-wiz-gray',
        )}>
          {label}
        </span>
      </span>
    </button>
  )
}

// ── Step Connector — animated line between step tabs ──────────────
// Becomes solid green when the step on the LEFT is complete; otherwise
// stays a subtle dotted neutral line.

interface StepConnectorProps {
  done: boolean
}

function StepConnector({ done }: StepConnectorProps) {
  return (
    <div className="flex-1 mx-1 relative h-[2px] flex items-center">
      <div className="absolute inset-x-0 h-[2px] rounded-full bg-wiz-border/60" />
      <div
        className={clsx(
          'absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out',
          done ? 'bg-sig-green w-full' : 'bg-transparent w-0',
        )}
      />
    </div>
  )
}


// ── File upload zone ──────────────────────────────────────────────

interface UploadZoneProps {
  value:    File | null
  onChange: (file: File | null) => void
  error?:   string
  /** Restrict the file picker. Defaults to '.jar,.zip'. */
  accept?:  string
  /** id for the hidden <input>. Must be unique per page when multiple zones are rendered. */
  inputId?: string
}

function UploadZone({ value, onChange, error, accept = '.jar,.zip', inputId = 'artifact-file' }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onChange(f)
  }

  // Human-readable label shown inside the empty drop zone
  const fileLabel =
    accept === '.zip' ? '.zip bundle' :
    accept === '.jar' ? '.jar file'   :
                        '.jar or .zip'

  return (
    <FieldWrapper label="" name={inputId} error={error}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById(inputId)?.click()}
        className={clsx(
          'flex flex-col items-center justify-center gap-3',
          'min-h-[200px] rounded cursor-pointer',
          'border-2 border-dashed transition-all duration-150',
          dragging
            ? 'border-wiz-gold   bg-wiz-gold/5'
            : value
            ? 'border-sig-green/50 bg-sig-green-dim'
            : error
            ? 'border-sig-red/40  bg-sig-red-dim/30'
            : 'border-wiz-border  bg-wiz-bg hover:border-wiz-border-mid hover:bg-wiz-surface',
        )}
      >
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />

        {value ? (
          <>
            <div className="w-12 h-12 rounded-full bg-sig-green/10 flex items-center justify-center">
              <Check size={22} className="text-sig-green" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-wiz-cream">{value.name}</p>
              <p className="text-sm text-wiz-muted mt-1">
                {(value.size / 1024 / 1024).toFixed(2)} MB — ready to deploy
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(null) }}
              className="btn-icon h-7 w-7 text-wiz-muted hover:text-sig-red"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-wiz-raised flex items-center justify-center">
              <Upload size={22} className="text-wiz-muted" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-wiz-gray">
                Click to select artifact
              </p>
              <p className="text-sm text-wiz-muted mt-1 font-mono">{fileLabel}</p>
            </div>
          </>
        )}
      </div>
    </FieldWrapper>
  )
}

// ── CompactUploadZone — drag-and-drop, fits inside a RowField right column ──

interface CompactUploadZoneProps {
  accept:   string
  inputId:  string
  onChange: (file: File) => void
  error?:   string
}

function CompactUploadZone({ accept, inputId, onChange, error }: CompactUploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const fileLabel = accept === '.jar' ? '.jar file' : accept === '.zip' ? '.zip bundle' : accept

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onChange(f)
  }

  return (
    <>
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f) }}
      />
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById(inputId)?.click()}
        className={clsx(
          'flex items-center gap-3 px-4 py-3 rounded cursor-pointer',
          'border-2 border-dashed transition-all duration-150',
          dragging
            ? 'border-wiz-gold bg-wiz-gold/5'
            : error
            ? 'border-sig-red/40 bg-sig-red-dim/20'
            : 'border-wiz-border bg-wiz-bg hover:border-wiz-border-mid hover:bg-wiz-surface',
        )}
      >
        <div className="w-8 h-8 rounded bg-wiz-raised flex items-center justify-center flex-shrink-0">
          <Upload size={15} className="text-wiz-muted" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-wiz-gray">Click to select or drag & drop</span>
          <span className="font-mono text-2xs text-wiz-muted/60">{fileLabel}</span>
        </div>
      </div>
    </>
  )
}

// ── Compact inline file upload (for per-row cert / extra-dir entries) ────

interface MiniUploadProps {
  value:    File | null
  onChange: (file: File | null) => void
  accept:   string
  /** Unique id for the hidden <input> element — must be distinct per row. */
  inputId:  string
}

function MiniUpload({ value, onChange, accept, inputId }: MiniUploadProps) {
  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded border border-sig-green/40 bg-sig-green-dim text-xs">
        <Check size={11} className="text-sig-green flex-shrink-0" />
        <span className="font-mono text-wiz-cream truncate flex-1">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="btn-icon h-5 w-5 text-wiz-muted hover:text-sig-red flex-shrink-0"
          aria-label="Remove file"
        >
          <X size={11} />
        </button>
      </div>
    )
  }
  return (
    <>
      <input
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => document.getElementById(inputId)?.click()}
        className={clsx(
          'flex items-center gap-1.5 px-3 py-2 rounded border border-dashed',
          'border-wiz-border bg-wiz-bg font-mono text-xs text-wiz-muted',
          'hover:border-wiz-border-mid hover:text-wiz-gray hover:bg-wiz-surface',
          'transition-all duration-150',
        )}
      >
        <Upload size={11} />
        Click to upload
      </button>
    </>
  )
}

// ── localStorage deploy history ───────────────────────────────────

/** Stores the last 5 unique (appName + environment) deployments. */

type GcType = 'G1GC' | 'ParallelGC' | 'ZGC' | 'Shenandoah'
type WorkloadProfile = 'API' | 'HighThroughput' | 'Batch' | 'MemoryIntensive'

// ── JVM Memory Presets ─────────────────────────────────────────────────────
const JVM_PRESETS = [
  { id: 'small',  label: 'Small',  heap: '512m', gc: 'G1GC',       desc: 'Lightweight APIs'        },
  { id: 'medium', label: 'Medium', heap: '1g',   gc: 'G1GC',       desc: 'Standard Spring Boot'    },
  { id: 'large',  label: 'Large',  heap: '2g',   gc: 'G1GC',       desc: 'Transaction systems'     },
  { id: 'xlarge', label: 'XLarge', heap: '4g',   gc: 'G1GC',       desc: 'High throughput / batch' },
] as const

/** minJava: minimum Java version required to use this GC */
const GC_OPTIONS: { id: GcType; label: string; desc: string; minJava: number }[] = [
  { id: 'G1GC',       label: 'G1GC',       desc: 'Balanced latency and throughput with configurable pause targets. Default since Java 9, available on 8+ — safe for most workloads.',          minJava: 8  },
  { id: 'ParallelGC', label: 'ParallelGC', desc: 'Maximum throughput using all CPU cores. Full stop-the-world pauses — best for batch jobs and ETL. Available on Java 8+.',              minJava: 8  },
  { id: 'ZGC',        label: 'ZGC',        desc: 'Sub-millisecond pauses regardless of heap size. Needs ≥ 4 GB heap, optimal at ≥ 8 GB. Production-ready since Java 15.',               minJava: 15 },
  { id: 'Shenandoah', label: 'Shenandoah', desc: 'Low-pause concurrent collector, similar to ZGC. OpenJDK 12+ only — not available on Oracle JDK.',                                    minJava: 12 },
]

const WORKLOAD_OPTIONS: { id: WorkloadProfile; label: string; desc: string }[] = [
  { id: 'API',            label: 'API',                desc: 'MaxGCPauseMillis=200 — balanced for REST APIs and web services.'                                  },
  { id: 'HighThroughput', label: 'Low Latency',        desc: 'MaxGCPauseMillis=100 — aggressive target for real-time APIs and WebSocket servers.'               },
  { id: 'Batch',          label: 'Batch / Throughput', desc: 'MaxGCPauseMillis=500 — relaxed pauses, maximises throughput for batch processing and scheduled jobs.' },
  { id: 'MemoryIntensive',label: 'Memory Intensive',   desc: 'MaxGCPauseMillis=500 + pre-touch — stable heap for large in-memory datasets and caches.'          },
]

// ── Java Installation Presets ──────────────────────────────────────────────

const JAVA_PRESETS: { id: string; label: string; path: string; version: string }[] = [
  { id: 'openjdk-8',   label: 'OpenJDK 8',    path: '/usr/lib/jvm/java-8-openjdk-amd64/bin/java',    version: '8'  },
  { id: 'openjdk-11',  label: 'OpenJDK 11',   path: '/usr/lib/jvm/java-11-openjdk-amd64/bin/java',   version: '11' },
  { id: 'openjdk-17',  label: 'OpenJDK 17',   path: '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',   version: '17' },
  { id: 'openjdk-21',  label: 'OpenJDK 21',   path: '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',   version: '21' },
  { id: 'temurin-17',  label: 'Temurin 17',   path: '/usr/lib/jvm/temurin-17-jdk-amd64/bin/java',    version: '17' },
  { id: 'temurin-21',  label: 'Temurin 21',   path: '/usr/lib/jvm/temurin-21-jdk-amd64/bin/java',    version: '21' },
  { id: 'temurin-25',  label: 'Temurin 25',   path: '/usr/lib/jvm/temurin-25-jdk-amd64/bin/java',    version: '25' },
  { id: 'corretto-11', label: 'Corretto 11',  path: '/usr/lib/jvm/java-11-amazon-corretto/bin/java', version: '11' },
  { id: 'corretto-17', label: 'Corretto 17',  path: '/usr/lib/jvm/java-17-amazon-corretto/bin/java', version: '17' },
  { id: 'corretto-21', label: 'Corretto 21',  path: '/usr/lib/jvm/java-21-amazon-corretto/bin/java', version: '21' },
  { id: 'custom',      label: 'Custom path…', path: '',                                               version: ''   },
]

// ── Java path helpers ──────────────────────────────────────────────────────

/**
 * Infer a Java major version number from a binary path reported by the server.
 * Handles common patterns: temurin-21, java-17-openjdk, jdk-11, corretto-21, etc.
 */
function inferJavaVersion(path: string): number | null {
  const m = path.match(/(?:temurin|java|jdk|corretto|openjdk)[_-](\d+)/i)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Derive a human-readable distribution label from a Java binary path.
 * Falls back to the directory name just above bin/.
 */
function inferJavaLabel(path: string): string {
  // e.g. /usr/lib/jvm/temurin-21-jdk-amd64/bin/java → "temurin-21-jdk-amd64"
  const parts = path.split('/')
  const binIdx = parts.indexOf('bin')
  if (binIdx > 0) return parts[binIdx - 1]
  return path
}

// ── SSH failure diagnosis ──────────────────────────────────────────────────
// Parses the raw SSH error message to identify whether the failure is due to
// a firewall/connectivity issue or a key/auth issue so we can mark the right
// checklist item with X rather than blindly marking both.
type SshFailTarget = 'firewall' | 'key' | 'both'

function diagnoseSshFailure(msg: string | null): SshFailTarget {
  if (!msg) return 'both'
  const m = msg.toLowerCase()
  // Firewall / connectivity — port not reachable
  if (m.includes('connection refused') || m.includes('timed out') || m.includes('timeout') ||
      m.includes('no route to host')   || m.includes('network unreachable') ||
      m.includes('host unreachable')   || m.includes('could not resolve hostname')) {
    return 'firewall'
  }
  // Key / auth — port reachable but authentication failed
  if (m.includes('permission denied') || m.includes('publickey') ||
      m.includes('authentication failed') || m.includes('auth')) {
    return 'key'
  }
  return 'both'
}

// ── JAR Manifest Parser ────────────────────────────────────────────────────

interface ManifestFields {
  mainClass:    string
  appTitle:     string
  isSpringBoot: boolean
  buildJdkSpec: string | null   // from Build-Jdk-Spec or Build-Jdk manifest attribute
}

/**
 * Read the Java major version from a .class file's bytecode header.
 * This is the definitive source — it reflects the actual compiler target,
 * not the machine that ran the build.
 *
 * Class file format: bytes 0-3 = 0xCAFEBABE, bytes 6-7 = major version
 * major version → Java version: 52=8, 55=11, 61=17, 65=21, 69=25, etc.
 */
async function detectJavaVersionFromBytecode(zip: JSZip): Promise<string | null> {
  // Prefer class files under BOOT-INF/classes/ (Spring Boot fat/thin JAR)
  let classFiles = zip.filter((p) => p.startsWith('BOOT-INF/classes/') && p.endsWith('.class'))
  // Fall back to root-level class files (non-Spring / executable JARs)
  if (classFiles.length === 0)
    classFiles = zip.filter((p) => !p.includes('/META-INF') && p.endsWith('.class'))
  if (classFiles.length === 0) return null
  try {
    const buf  = await classFiles[0].async('arraybuffer')
    const view = new DataView(buf)
    if (view.byteLength >= 8 && view.getUint32(0) === 0xCAFEBABE) {
      const major      = view.getUint16(6)
      const javaVer    = major - 44          // 52→8, 55→11, 61→17, 65→21, 69→25
      if (javaVer >= 8 && javaVer <= 40) return String(javaVer)
    }
  } catch { /* non-fatal */ }
  return null
}

async function parseJarManifest(file: File): Promise<ManifestFields> {
  const zip = await JSZip.loadAsync(file)
  const isSpringBoot = Object.keys(zip.files).some((n) => n.startsWith('BOOT-INF/'))
  let mainClass    = ''
  let appTitle     = ''
  let buildJdkSpec: string | null = null
  const manifestEntry = zip.file('META-INF/MANIFEST.MF')
  if (manifestEntry) {
    const content  = await manifestEntry.async('string')
    // Unfold multi-line values (continuation lines start with a space)
    const unfolded = content.replace(/\r?\n /g, '')
    const attrs: Record<string, string> = {}
    for (const line of unfolded.split(/\r?\n/)) {
      const colon = line.indexOf(':')
      if (colon > 0) attrs[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
    }
    mainClass = attrs['Start-Class'] || attrs['Main-Class'] || ''
    appTitle  = attrs['Implementation-Title'] || ''
  }
  // Primary: read bytecode — definitive compiler target version
  buildJdkSpec = await detectJavaVersionFromBytecode(zip)
  return { mainClass, appTitle, isSpringBoot, buildJdkSpec }
}

// ── Port detection helpers ──────────────────────────────────────────────────

function extractActiveProfile(text: string, format: 'props' | 'yml'): string | null {
  if (format === 'props') {
    const m = text.match(/^\s*spring\.profiles\.active\s*=\s*(\S+)/m)
    return m ? m[1].split(',')[0].trim() : null
  }
  // YAML flat: spring.profiles.active: uat
  const flat = text.match(/^\s*spring\.profiles\.active\s*:\s*(\S+)/m)
  if (flat) return flat[1].split(',')[0].trim()
  // YAML nested: spring: \n  profiles: \n    active: uat
  const nested = text.match(/profiles:\s*\n\s+active:\s*(\S+)/m)
  return nested ? nested[1].split(',')[0].trim() : null
}

function extractServerPort(text: string, format: 'props' | 'yml'): string | null {
  // Matches a port value: either a literal number OR a ${VAR:default} placeholder
  const portVal = (raw: string): string | null => {
    const literal     = raw.match(/^(\d+)/)
    if (literal) return literal[1]
    const placeholder = raw.match(/^\$\{[^}]*:(\d+)\}/)
    if (placeholder) return placeholder[1]
    return null
  }
  if (format === 'props') {
    const m = text.match(/^\s*server\.port\s*=\s*(.+)/m)
    return m ? portVal(m[1].trim()) : null
  }
  // YAML flat: server.port: 8080  OR  server.port: ${PORT:8080}
  const flat = text.match(/^\s*server\.port\s*:\s*(.+)/m)
  if (flat) { const v = portVal(flat[1].trim()); if (v) return v }
  // YAML nested: server:\n  port: 8080
  const serverIdx = text.search(/^server\s*:/m)
  if (serverIdx >= 0) {
    const after = text.slice(serverIdx)
    const portM = after.match(/\n[ \t]+port\s*:\s*(.+)/)
    if (portM) { const v = portVal(portM[1].trim()); if (v) return v }
  }
  return null
}

interface PortDetection {
  port:    string | null
  source:  string | null   // which file the port was found in
  profile: string | null   // which Spring profile was active (if detected)
}

/**
 * Profile-aware server.port detection from a Spring Boot fat JAR.
 * 1. Reads spring.profiles.active from the default config files.
 * 2. Checks the profile-specific config file first (application-{profile}.yml/properties).
 * 3. Falls back to the default config file.
 * Returns port, the source filename, and the detected profile.
 */
async function parseServerPort(file: File): Promise<PortDetection> {
  try {
    const zip = await JSZip.loadAsync(file)

    // Candidate config directories — Spring Boot fat/thin JARs use BOOT-INF/classes/,
    // plain JARs and non-Spring apps put configs at root or config/
    const prefixes = ['BOOT-INF/classes/', '', 'config/']

    let defaultPropsText: string | null = null
    let defaultYmlText:   string | null = null
    let activeProfile:    string | null = null
    let defaultPropsName: string | null = null
    let defaultYmlName:   string | null = null

    // Helper: try both .yml and .yaml extensions
    const readYml = async (path: string) => {
      const e = zip.file(path + '.yml') ?? zip.file(path + '.yaml')
      return e ? { text: await e.async('string'), name: e.name.split('/').pop() ?? path } : null
    }

    for (const prefix of prefixes) {
      if (!defaultPropsText) {
        const e = zip.file(`${prefix}application.properties`)
        if (e) { defaultPropsText = await e.async('string'); defaultPropsName = `${prefix}application.properties` }
      }
      if (!defaultYmlText) {
        const r = await readYml(`${prefix}application`)
        if (r) { defaultYmlText = r.text; defaultYmlName = r.name }
      }
    }

    if (defaultPropsText) activeProfile = activeProfile ?? extractActiveProfile(defaultPropsText, 'props')
    if (defaultYmlText)   activeProfile = activeProfile ?? extractActiveProfile(defaultYmlText,   'yml')

    // Check profile-specific config first
    if (activeProfile) {
      for (const prefix of prefixes) {
        const pProps = zip.file(`${prefix}application-${activeProfile}.properties`)
        if (pProps) {
          const text = await pProps.async('string')
          const port = extractServerPort(text, 'props')
          if (port) return { port, source: `application-${activeProfile}.properties`, profile: activeProfile }
        }
        const pYml = await readYml(`${prefix}application-${activeProfile}`)
        if (pYml) {
          const port = extractServerPort(pYml.text, 'yml')
          if (port) return { port, source: pYml.name, profile: activeProfile }
        }
      }
    }

    // Fall back to default configs
    if (defaultPropsText) {
      const port = extractServerPort(defaultPropsText, 'props')
      if (port) return { port, source: defaultPropsName ?? 'application.properties', profile: activeProfile }
    }
    if (defaultYmlText) {
      const port = extractServerPort(defaultYmlText, 'yml')
      if (port) return { port, source: defaultYmlName ?? 'application.yml', profile: activeProfile }
    }

    // Last resort: bootstrap.yml / bootstrap.yaml (Spring Cloud apps — Eureka, Config Server, etc.)
    for (const prefix of prefixes) {
      const bootstrap = await readYml(`${prefix}bootstrap`)
      if (bootstrap) {
        const port = extractServerPort(bootstrap.text, 'yml')
        if (port) return { port, source: bootstrap.name, profile: activeProfile }
      }
      const bProps = zip.file(`${prefix}bootstrap.properties`)
      if (bProps) {
        const text = await bProps.async('string')
        const port = extractServerPort(text, 'props')
        if (port) return { port, source: 'bootstrap.properties', profile: activeProfile }
      }
    }

  } catch { /* non-fatal */ }
  return { port: null, source: null, profile: null }
}

/** Parse a heap string like "512m" or "1g" → numeric part as string. */
function heapNum(v: string): string { return v.replace(/[mgMG]/g, '') }

/** Convert heap string to MB for comparison. */
function heapMB(v: string): number {
  const n = parseFloat(v)
  if (isNaN(n)) return 0
  return (v.endsWith('g') || v.endsWith('G')) ? n * 1024 : n
}

interface JvmConfig {
  gcType:           GcType
  workloadProfile:  WorkloadProfile
  containerAware:   boolean
  advancedGcTuning: boolean
  maxGcPauseMs:     string
  metaspaceSize:    string   // e.g. "256m" — empty = JVM default
  threadStackSize:  string   // e.g. "512k" — empty = JVM default
}

/** Full input to the JVM flag deriver — includes heap, version, and container config. */
interface JvmDeriveInput extends JvmConfig {
  xms:         string   // e.g. "1g" or "" for ergonomic default
  xmx:         string
  javaVersion: string   // e.g. "25", "21", "17", "11", "8" — drives version-gated flags
  maxRamPct:   string   // container MaxRAMPercentage override, default "70.0"
}

/** Structured result: flags to write, advisory warnings, blocking errors. */
interface JvmDeriveResult {
  flags:    string[]   // ordered JVM flags ready for Tanuki wrapper
  warnings: string[]   // non-blocking — shown in UI, do not prevent deploy
  errors:   string[]   // blocking — must be resolved before submission
}

/**
 * Single source of truth for all JVM flag generation.
 * GC-aware, Java-version-aware, container-aware.
 * Never silently generates conflicting or invalid flag combinations.
 */
function deriveJvmFlags({
  xms, xmx,
  gcType, workloadProfile, containerAware,
  advancedGcTuning, maxGcPauseMs,
  metaspaceSize, threadStackSize,
  javaVersion, maxRamPct,
}: JvmDeriveInput): JvmDeriveResult {
  const flags:    string[] = []
  const warnings: string[] = []
  const errors:   string[] = []

  const jvNum      = parseInt(javaVersion.trim(), 10)  // NaN when blank → gates open
  const hasVersion = Number.isFinite(jvNum) && jvNum > 0
  const hasFixedHeap = Boolean(xms.trim() || xmx.trim())

  // ── Errors: blocking ─────────────────────────────────────────────────────

  if (containerAware && hasFixedHeap) {
    errors.push(
      'Container Optimisation (MaxRAMPercentage) conflicts with fixed Xms/Xmx. ' +
      'Use one strategy — either fixed heap or container-aware percentage.'
    )
  }

  // GC version requirements — only raised when the Java version is known
  if (gcType === 'ZGC'        && hasVersion && jvNum < 15) {
    errors.push(`ZGC requires Java 15 or later. Configured version is Java ${jvNum} — switch to G1GC or update the Java version in the Java Config step.`)
  }
  if (gcType === 'Shenandoah' && hasVersion && jvNum < 12) {
    errors.push(`Shenandoah GC requires Java 12 or later. Configured version is Java ${jvNum} — switch to G1GC or update the Java version.`)
  }

  // ── Warnings: GC + workload compatibility ────────────────────────────────

  if (gcType === 'ZGC') {
    if (advancedGcTuning && maxGcPauseMs) {
      warnings.push('ZGC manages its own pause targets — MaxGCPauseMillis is ignored by ZGC.')
    }
    if (workloadProfile === 'Batch') {
      warnings.push('Batch / Throughput profile is tuned for G1GC or ParallelGC. With ZGC, some tuning flags have no effect.')
    }
    if (hasFixedHeap && heapMB(xmx || xms) < 4096) {
      warnings.push('ZGC is designed for large heaps — recommended ≥ 4 GB, optimal ≥ 8 GB. On smaller heaps G1GC typically performs better.')
    }
    // ZGC SoftMaxHeapSize is more effective than a hard Xmx on Java 21+
    if (hasFixedHeap && hasVersion && jvNum >= 21) {
      warnings.push('ZGC on Java 21+: consider -XX:SoftMaxHeapSize instead of a hard Xmx — ZGC can adapt heap usage within the soft limit, improving throughput under variable load. Add it in Additional JVM Options.')
    }
  }

  if (gcType === 'Shenandoah' && advancedGcTuning && maxGcPauseMs) {
    warnings.push('Shenandoah uses its own adaptive heuristics — MaxGCPauseMillis has no effect.')
  }

  // Low Latency profile targets minimal pauses — ParallelGC does the opposite
  if (gcType === 'ParallelGC' && workloadProfile === 'HighThroughput') {
    warnings.push('Low Latency profile targets minimal GC pauses but ParallelGC is optimised for throughput. Consider G1GC for low latency, or switch to Batch / Throughput for maximum throughput.')
  }

  // AlwaysPreTouch pre-allocates the full heap at startup — only valid with a fixed heap
  // and when the JVM owns its memory directly (not delegated to a container runtime).
  const canPreTouch = hasFixedHeap && !containerAware
  const preTouchProfiles: WorkloadProfile[] = ['HighThroughput', 'Batch', 'MemoryIntensive']
  if (preTouchProfiles.includes(workloadProfile) && !canPreTouch) {
    if (containerAware) {
      warnings.push('AlwaysPreTouch is skipped in container mode — heap pre-allocation is managed by the container runtime.')
    } else {
      warnings.push('AlwaysPreTouch is most effective with a fixed heap size. Set Xms/Xmx above to enable it.')
    }
  }

  // Container mode + heavy workload profile: GC tuning has reduced impact
  const performanceProfiles: WorkloadProfile[] = ['HighThroughput', 'Batch', 'MemoryIntensive']
  if (containerAware && performanceProfiles.includes(workloadProfile)) {
    warnings.push('Some GC tuning flags have reduced impact in container-managed memory — the container runtime controls memory allocation and scheduling.')
  }

  // ── GC selector ──────────────────────────────────────────────────────────
  if      (gcType === 'G1GC')       flags.push('-XX:+UseG1GC')
  else if (gcType === 'ParallelGC') flags.push('-XX:+UseParallelGC')
  else if (gcType === 'ZGC')        flags.push('-XX:+UseZGC')
  else                              flags.push('-XX:+UseShenandoahGC')

  // ── GC pause target ───────────────────────────────────────────────────────
  // G1GC: workload sets default, advanced tuning overrides.
  // ParallelGC / ZGC / Shenandoah: manage their own pause behavior — do not emit.
  if (gcType === 'G1GC') {
    const pause = advancedGcTuning && maxGcPauseMs
      ? maxGcPauseMs
      : workloadProfile === 'HighThroughput' ? '100'
      : workloadProfile === 'Batch'          ? '500'
      : '200'   // API / MemoryIntensive
    flags.push(`-XX:MaxGCPauseMillis=${pause}`)
  }

  // ── Workload-specific flags (GC-aware) ───────────────────────────────────
  if (workloadProfile === 'HighThroughput') {
    if (canPreTouch) flags.push('-XX:+AlwaysPreTouch')
    // ParallelRefProcEnabled became the G1GC default in Java 18 — only emit for older JVMs.
    // Never apply to ZGC, Shenandoah, or ParallelGC (irrelevant or harmful).
    if (gcType === 'G1GC' && (!hasVersion || jvNum < 18)) {
      flags.push('-XX:+ParallelRefProcEnabled')
    }
  } else if (workloadProfile === 'Batch' || workloadProfile === 'MemoryIntensive') {
    if (canPreTouch) flags.push('-XX:+AlwaysPreTouch')
  }

  // ── Container-aware memory — only when no fixed heap conflict ────────────
  if (containerAware && !hasFixedHeap) {
    flags.push('-XX:+UseContainerSupport')
    const pct = maxRamPct.trim() || '70.0'
    flags.push(`-XX:MaxRAMPercentage=${pct}`)
  }

  // ── Advanced: metaspace cap ───────────────────────────────────────────────
  if (metaspaceSize.trim()) flags.push(`-XX:MaxMetaspaceSize=${metaspaceSize.trim()}`)

  // ── Advanced: thread stack size ───────────────────────────────────────────
  if (threadStackSize.trim()) flags.push(`-Xss${threadStackSize.trim()}`)

  // ── Deduplicate — safety net against future logic producing duplicates ────
  return { flags: [...new Set(flags)], warnings, errors }
}

// ── Deploy History ──────────────────────────────────────────────────────────
const DEPLOY_HISTORY_KEY = 'wizardcd-deploy-history'
/** Old single-record key — migrated to array on first mount. */
const LEGACY_DEPLOY_KEY  = 'wizardcd-last-deployment'
const HISTORY_MAX        = 5

// File objects can't be serialised to JSON, so we persist every field
// EXCEPT the actual File references (JAR, libZip, cert/extra ZIPs).
interface SavedCertUpload {
  source:     string
  targetPath: string
}
interface SavedExtraDirUpload {
  dirName:    string
  targetPath: string
}
interface SavedDeployment {
  savedAt:        string   // ISO timestamp used to display "X ago"
  environment:    string
  sshUser:        string
  sshHost:        string
  sshPort:        string
  targetBasePath: string
  appName:        string
  mainClass:      string
  javaCommand:    string
  javaVersion:    string
  xms:            string
  xmx:            string
  newRatio:       string
  extraOpts:      string[]
  runAsUser:      string
  serverPort:     string
  maxLogSize:     string
  maxLogFiles:    string
  jarType:        'fat' | 'thin'
  performBackup:  boolean
  maxBackups:     string
  stabilityWindow: string
  jarName:        string
  certUploads:    SavedCertUpload[]
  extraDirs:      SavedExtraDirUpload[]
}

function formatRelativeTime(isoString: string): string {
  const diff  = Date.now() - new Date(isoString).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

// ── FirewallRulesRow — collapsible whitelist rules table ───────────

function FirewallRulesRow({ runnerPublicIp }: { runnerPublicIp: string }) {
  const ip = runnerPublicIp || '<IP>'
  const rules = [
    { platform: 'AWS',      rule: `Inbound: SSH  TCP  22  ${ip}/32` },
    { platform: 'GCP',      rule: `Source ranges: ${ip}/32  Port: 22` },
    { platform: 'Azure',    rule: `Source: ${ip}/32  Dest port: 22  Allow` },
    { platform: 'iptables', rule: `iptables -A INPUT -s ${ip} -p tcp --dport 22 -j ACCEPT` },
  ]
  return (
    <RowField label="Whitelist Rules" sublabel="Per platform" name="firewallRules">
      <div className="rounded border border-wiz-border overflow-hidden">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="bg-wiz-raised border-b border-wiz-border-strong/60">
              <th className="text-left px-4 py-2.5 text-wiz-muted font-semibold uppercase tracking-wider w-24">Platform</th>
              <th className="text-left px-4 py-2.5 text-wiz-muted font-semibold uppercase tracking-wider">Rule</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-wiz-border/40">
            {rules.map(({ platform, rule }) => (
              <tr key={platform} className="bg-wiz-bg hover:bg-wiz-surface/50 transition-colors">
                <td className="px-4 py-2.5 text-wiz-gray font-semibold">{platform}</td>
                <td className="px-4 py-2.5 text-wiz-cream/80 break-all">{rule}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </RowField>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

export default function DeployPage() {
  const navigate = useNavigate()
  const { activeEnv, setActiveEnv } = useTheme()

  const [step,      setStep]      = useState(1)
  const [visited,   setVisited]   = useState<Set<number>>(new Set([1]))
  // Steps the user has navigated AWAY from — errors only show after leaving a step
  const [departed,  setDeparted]  = useState<Set<number>>(new Set())
  const [form,      setForm]      = useState<FormState>(INITIAL)
  const [submitting,setSubmitting]= useState(false)
  // null = not uploading; 0–100 = upload in progress; 100 = upload done, awaiting server response
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  // Per-file upload info and individual progress percentages (parallel arrays)
  interface UploadFileInfo { label: string; name: string; size: number }
  const [uploadFiles, setUploadFiles] = useState<UploadFileInfo[]>([])
  const [fileProgresses, setFileProgresses] = useState<number[]>([])

  // ── Deploy history pre-fill ─────────────────────────────────────
  const [deployHistory,    setDeployHistory]    = useState<SavedDeployment[]>([])
  const [historyDismissed, setHistoryDismissed] = useState(false)
  const [historyExpanded,  setHistoryExpanded]  = useState(false)

  // ── Saved configs (Phase 5 §5.3) ────────────────────────────────
  // Pre-fill SSH/Java/runtime fields from a stored EnvironmentConfig
  // instead of asking the user to retype them. See SavedConfigsPanel.
  const [loadedConfig, setLoadedConfig] = useState<LoadedConfig | null>(null)
  const [savedConfigsDismissed, setSavedConfigsDismissed] = useState(false)
  // Snapshot of the FormState values that came from the loaded config.
  // Used to detect per-deploy overrides for the SSH Target panel badge
  // and (in §5.3c) the optional save-back modal.
  const [loadedSnapshot, setLoadedSnapshot] = useState<Partial<FormState> | null>(null)

  // ── Runner public keys, runner info & SSH test ──────────────────
  const [publicKeys,    setPublicKeys]    = useState<Record<string, string> | null>(null)
  const [keysLoading,   setKeysLoading]   = useState(false)
  const [keysError,     setKeysError]     = useState<string | null>(null)
  const [copiedKey,     setCopiedKey]     = useState(false)
  const [copiedScript,  setCopiedScript]  = useState(false)
  const [runnerPublicIp, setRunnerPublicIp] = useState<string>('')
  const [copiedIp,       setCopiedIp]      = useState(false)
  const [testConnState,   setTestConnState]   = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testConnMsg,     setTestConnMsg]     = useState<string | null>(null)
  // null = not yet checked, true = runner API responded, false = runner API unreachable
  const [runnerReachable, setRunnerReachable] = useState<boolean | null>(null)
  // null  = detection not yet run (show detect button)
  // []    = ran but no Java found on server (show install advisory)
  // [...] = ran and found Java binaries (show clickable tiles)
  const [detectedJavas,  setDetectedJavas]  = useState<string[] | null>(null)
  const [javaDetecting,    setJavaDetecting]    = useState(false)
  const [jarJavaVersion,   setJarJavaVersion]   = useState<string | null>(null)
  const [javaAutoMatched,  setJavaAutoMatched]  = useState<boolean | null>(null)
  const [showAllJavas,     setShowAllJavas]     = useState(false)
  const [portDetection,         setPortDetection]         = useState<{ source: string; profile: string | null } | null>(null)
  const [portMismatchDismissed, setPortMismatchDismissed] = useState(false)

  // ── Step 2 deploy-path preflight (Phase 4 follow-up) ──────────────────────
  // 'idle'     — nothing entered yet, no check yet
  // 'checking' — request in flight to /ssh/check-path
  // 'ok'       — path exists + owned by runAsUser
  // 'wrong_owner'         — path exists, wrong owner (amber + chown script)
  // 'missing'             — doesn't exist, parent writable (blue ℹ, runner will create)
  // 'parent_not_writable' — doesn't exist, parent root-owned (amber + sudo mkdir)
  // 'invalid_path'        — client-side guard rejected (red)
  // 'unreachable'         — SSH itself failed (red — fix Step 1 first)
  // 'stale'               — inputs changed since last successful check; click Re-check
  const [pathCheckState,  setPathCheckState]  = useState<
    'idle' | 'checking' | 'ok' | 'wrong_owner' | 'missing'
    | 'parent_not_writable' | 'invalid_path' | 'unreachable' | 'stale'
  >('idle')
  const [pathCheckResult, setPathCheckResult] = useState<import('../api/jobs').PathCheckResult | null>(null)
  /** Last-checked inputs key — used to detect when the cached result is stale. */
  const [pathCheckedKey,  setPathCheckedKey]  = useState<string | null>(null)
  const [pathCopiedIdx,   setPathCopiedIdx]   = useState<number | null>(null)

  // ── JVM heap unit toggles (used in advanced separate-heap mode) ─────────
  const [xmsUnit, setXmsUnit] = useState<'m' | 'g'>(() =>
    form.xms.endsWith('g') ? 'g' : 'm',
  )
  const [xmxUnit, setXmxUnit] = useState<'m' | 'g'>(() =>
    form.xmx.endsWith('g') ? 'g' : 'm',
  )

  // ── JVM UI state (Step 3) ─────────────────────────────────────────────────
  // false = JVM uses ergonomic defaults; no -Xms/-Xmx/-XX flags sent
  const [jvmConfigEnabled,  setJvmConfigEnabled]  = useState(false)
  const [gcType,            setGcType]            = useState<GcType>('G1GC')
  const [workloadProfile,   setWorkloadProfile]   = useState<WorkloadProfile>('API')
  const [containerAware,    setContainerAware]     = useState(false)
  const [advancedJvmEnabled,setAdvancedJvmEnabled] = useState(false)
  const [advancedGcTuning,  setAdvancedGcTuning]   = useState(false)
  const [maxGcPauseMs,      setMaxGcPauseMs]       = useState('200')
  const [metaspaceSize,     setMetaspaceSize]       = useState('')
  const [threadStackSize,   setThreadStackSize]     = useState('')
  const [advancedHeap,      setAdvancedHeap]       = useState(false)
  const [heapSize,          setHeapSize]           = useState('')
  const [heapUnit,          setHeapUnit]           = useState<'m' | 'g'>('g')
  const [activePreset,      setActivePreset]       = useState<string>('medium')
  const [maxRamPct,         setMaxRamPct]          = useState('70.0')

  // ── Phase 1 UX redesign state ─────────────────────────────────────────────
  // Java preset selector: tracks which Java distribution is selected
  const [javaPreset,        setJavaPreset]         = useState<string>(() => {
    const match = JAVA_PRESETS.find((p) => p.path === INITIAL.javaCommand)
    return match ? match.id : 'custom'
  })
  // True while JSZip parses the uploaded JAR's manifest
  const [manifestParsing,   setManifestParsing]    = useState(false)
  // Tracks which form fields were auto-filled from the JAR manifest
  const [autoFilledFields,  setAutoFilledFields]   = useState<Set<string>>(new Set())
  // Controls the Advanced Settings accordion in Step 3

  // ── Live validation errors — computed for departed steps ──────────────────
  // Only shows errors after the user has left a step and returned (or tried to submit).
  // This avoids showing red borders on first visit while fields are still being filled.
  const errors: FormErrors = useMemo(() => {
    if (!departed.has(step)) return {}
    return validateStep(step, form, jvmConfigEnabled)
  }, [step, departed, form, jvmConfigEnabled])

  // ── Mission Control sidebar — memoised JVM flags for live preview ─────────
  const missionControlJvmFlags = useMemo(() => {
    if (!jvmConfigEnabled) return []
    try {
      const derived = deriveJvmFlags({
        xms: form.xms, xmx: form.xmx,
        gcType, workloadProfile, containerAware, advancedGcTuning, maxGcPauseMs,
        metaspaceSize: advancedJvmEnabled ? metaspaceSize : '',
        threadStackSize: advancedJvmEnabled ? threadStackSize : '',
        javaVersion: form.javaVersion, maxRamPct,
      })
      return derived.flags
    } catch { return [] }
  }, [jvmConfigEnabled, form.xms, form.xmx, gcType, workloadProfile, containerAware,
      advancedGcTuning, maxGcPauseMs, advancedJvmEnabled, metaspaceSize,
      threadStackSize, form.javaVersion, maxRamPct])

  // Load deploy history from localStorage on mount.
  // Migrates the old single-record format to the new array format transparently.
  useEffect(() => {
    try {
      const newRaw  = localStorage.getItem(DEPLOY_HISTORY_KEY)
      const legacyRaw = localStorage.getItem(LEGACY_DEPLOY_KEY)

      if (newRaw) {
        setDeployHistory(JSON.parse(newRaw) as SavedDeployment[])
      } else if (legacyRaw) {
        // One-time migration from the old single-record key
        const legacy = JSON.parse(legacyRaw) as SavedDeployment
        const migrated = [legacy]
        localStorage.setItem(DEPLOY_HISTORY_KEY, JSON.stringify(migrated))
        localStorage.removeItem(LEGACY_DEPLOY_KEY)
        setDeployHistory(migrated)
      }
    } catch {
      // Corrupt or missing — ignore silently
    }
  }, [])

  // ── Draft persistence — save form text fields to sessionStorage ────────────
  // Restores config if user navigates away and comes back (files need re-upload)
  const DRAFT_KEY = 'wiz-deploy-draft'
  const DRAFT_FIELDS: (keyof FormState)[] = [
    'environment', 'sshUser', 'sshHost', 'sshPort', 'targetBasePath',
    'appName', 'mainClass', 'javaCommand', 'javaVersion',
    'xms', 'xmx', 'newRatio', 'extraOpts',
    'runAsUser', 'serverPort', 'maxLogSize', 'maxLogFiles',
    'jarType', 'performBackup', 'maxBackups', 'stabilityWindow', 'jarName',
    'hasCerts', 'hasExtraDirs',
  ]

  // Track whether the form has meaningful data (for beforeunload warning)
  const hasDraftData = form.appName.trim() !== '' || form.sshHost.trim() !== '' || form.jarArtifact !== null

  // Banner state: shows a "Continue draft" vs "Start fresh" choice after restore
  const [draftBanner, setDraftBanner] = useState<{ appName: string; jarName: string; stepLabel: string } | null>(null)

  // Reset form to initial state (for "Start fresh" action)
  const resetToFresh = useCallback(() => {
    sessionStorage.removeItem(DRAFT_KEY)
    setForm(INITIAL)
    setStep(1)
    setVisited(new Set([1]))
    setDeparted(new Set())
    setJvmConfigEnabled(false)
    setGcType('G1GC')
    setWorkloadProfile('API')
    setContainerAware(false)
    setMaxRamPct('70.0')
    setDraftBanner(null)
    setLoadedConfig(null)
    setLoadedSnapshot(null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Apply a saved EnvironmentConfig to the form (Phase 5 §5.3a) ────────────
  // Maps every field on the stored config into the wizard's FormState. We use
  // sensible coercions for nullable backend fields (mainClass / jarName / heap
  // can all be null on the server but the form holds them as strings). User
  // can still override anything for this one deploy.
  const applyEnvironmentConfig = useCallback(
    (appName: string, env: EnvironmentConfig) => {
      // Parse extraJvmOpts (stored as JSON-stringified array on the server)
      let extraOpts: string[] = []
      if (env.extraJvmOpts) {
        try {
          const parsed = JSON.parse(env.extraJvmOpts)
          if (Array.isArray(parsed)) extraOpts = parsed.map(String)
        } catch {
          // Malformed — fall back to splitting on whitespace
          extraOpts = env.extraJvmOpts.split(/\s+/).filter(Boolean)
        }
      }

      // Build the snapshot — single source of truth for what the config
      // contributed. Same shape we apply to FormState below.
      const snapshot: Partial<FormState> = {
        appName:        appName,
        environment:    env.envName.toUpperCase(),
        mainClass:      env.mainClass ?? '',
        jarName:        env.jarName ?? '',
        sshUser:        env.sshUser,
        sshHost:        env.sshHost,
        sshPort:        String(env.sshPort),
        targetBasePath: env.targetBasePath,
        javaCommand:    env.javaCommand,
        javaVersion:    env.javaVersion ?? '',
        xms:            env.xms ?? '',
        xmx:            env.xmx ?? '',
        extraOpts,
        runAsUser:      env.runAsUser,
        serverPort:     String(env.serverPort),
        maxLogSize:     env.maxLogSize,
        maxLogFiles:    String(env.maxLogFiles),
        jarType:        env.libPath === 'lib' ? 'thin' : 'fat',
        performBackup:   env.performBackup,
        maxBackups:      String(env.maxBackups),
        stabilityWindow: String(env.stabilityWindow),
      }

      setForm((prev) => ({ ...prev, ...snapshot }))
      setLoadedSnapshot(snapshot)

      setLoadedConfig({
        applicationId: env.appId,
        environmentId: env.id,
        appName,
        envName:       env.envName.toUpperCase(),
      })

      // After loading: jump back to the top of Step 1 so the user sees the
      // confirmation strip + the now-pre-filled SSH form.
      window.scrollTo({ top: 0, behavior: 'smooth' })
      toast.success(`Loaded ${appName} → ${env.envName.toUpperCase()}`, { duration: 2500 })
    },
    [],
  )

  // ── Unload the active config and clear pre-filled fields ───────────────────
  // We only clear the fields that came from the config — file uploads, JVM
  // tuning toggles, and any custom dirs/certs the user added stay intact so
  // they don't lose context when they unload.
  const unloadConfig = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      // Reset all fields that applyEnvironmentConfig sets, back to INITIAL
      environment:    INITIAL.environment,
      sshUser:        INITIAL.sshUser,
      sshHost:        INITIAL.sshHost,
      sshPort:        INITIAL.sshPort,
      targetBasePath: INITIAL.targetBasePath,
      appName:        INITIAL.appName,
      mainClass:      INITIAL.mainClass,
      javaCommand:    INITIAL.javaCommand,
      javaVersion:    INITIAL.javaVersion,
      xms:            INITIAL.xms,
      xmx:            INITIAL.xmx,
      extraOpts:      INITIAL.extraOpts,
      runAsUser:      INITIAL.runAsUser,
      serverPort:     INITIAL.serverPort,
      maxLogSize:     INITIAL.maxLogSize,
      maxLogFiles:    INITIAL.maxLogFiles,
      jarType:        INITIAL.jarType,
      jarName:        INITIAL.jarName,
      performBackup:   INITIAL.performBackup,
      maxBackups:      INITIAL.maxBackups,
      stabilityWindow: INITIAL.stabilityWindow,
    }))
    setLoadedConfig(null)
    setLoadedSnapshot(null)
    setTestConnState('idle')
    setTestConnMsg(null)
    toast('Config unloaded — fields cleared', { duration: 2000 })
  }, [])

  // ── Override detection (Phase 5 §5.3b) ─────────────────────────────────────
  // Computes which snapshot-tracked fields the user has edited since the config
  // was loaded. Empty array when nothing's been overridden. Used by the SSH
  // Target panel header badge and (in §5.3c) by the save-back modal.
  const overriddenFields = useMemo<(keyof FormState)[]>(() => {
    if (!loadedSnapshot) return []
    const diffs: (keyof FormState)[] = []
    for (const key of Object.keys(loadedSnapshot) as (keyof FormState)[]) {
      const snap = loadedSnapshot[key]
      const cur  = form[key]
      // Special-case extraOpts since it's an array — shallow compare
      if (key === 'extraOpts') {
        const a = Array.isArray(snap) ? snap : []
        const b = Array.isArray(cur)  ? cur  : []
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) diffs.push(key)
        continue
      }
      if (snap !== cur) diffs.push(key)
    }
    return diffs
  }, [form, loadedSnapshot])

  // Restore draft on mount (runs once)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const draft = JSON.parse(raw)

      // Check if draft has meaningful data worth restoring
      const hasMeaningfulData = draft.appName?.trim() || draft.sshHost?.trim() || draft.jarName?.trim()
      if (!hasMeaningfulData) return

      setForm((prev) => {
        const restored = { ...prev }
        for (const key of DRAFT_FIELDS) {
          if (key in draft && draft[key] !== undefined) {
            ;(restored as Record<string, unknown>)[key] = draft[key]
          }
        }
        // Restore cert/extra dir config (paths only — files need re-upload)
        if (Array.isArray(draft._certPaths) && draft._certPaths.length > 0) {
          restored.hasCerts = true
          restored.certUploads = draft._certPaths.map((c: { source: string; targetPath: string }) => ({
            source: c.source, targetPath: c.targetPath, file: null,
          }))
        }
        if (Array.isArray(draft._extraDirPaths) && draft._extraDirPaths.length > 0) {
          restored.hasExtraDirs = true
          restored.extraDirs = draft._extraDirPaths.map((d: { dirName: string; targetPath: string }) => ({
            dirName: d.dirName, targetPath: d.targetPath, file: null,
          }))
        }
        return restored
      })
      // Restore step position
      if (typeof draft._step === 'number') setStep(draft._step)
      // Restore JVM state
      if (typeof draft._jvmConfigEnabled === 'boolean') setJvmConfigEnabled(draft._jvmConfigEnabled)
      if (draft._gcType) setGcType(draft._gcType)
      if (draft._workloadProfile) setWorkloadProfile(draft._workloadProfile)
      if (typeof draft._containerAware === 'boolean') setContainerAware(draft._containerAware)
      if (draft._maxRamPct) setMaxRamPct(draft._maxRamPct)

      // Show draft restore banner with "Continue" / "Start fresh" options
      const stepNum = (draft._step ?? 0) + 1
      setDraftBanner({
        appName: draft.appName?.trim() || '',
        jarName: draft.jarName?.trim() || '',
        stepLabel: STEPS[Math.min(stepNum - 1, STEPS.length - 1)]?.label ?? `Step ${stepNum}`,
      })
    } catch { /* corrupt draft — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save draft on form/step/JVM change
  useEffect(() => {
    const draft: Record<string, unknown> = { _step: step }
    for (const key of DRAFT_FIELDS) {
      draft[key] = form[key]
    }
    // Persist cert/extra dir paths (without file objects)
    draft._certPaths = form.certUploads
      .filter(c => c.source.trim() || c.targetPath.trim())
      .map(c => ({ source: c.source, targetPath: c.targetPath }))
    draft._extraDirPaths = form.extraDirs
      .filter(d => d.dirName.trim() || d.targetPath.trim())
      .map(d => ({ dirName: d.dirName, targetPath: d.targetPath }))
    // Persist JVM UI state
    draft._jvmConfigEnabled = jvmConfigEnabled
    draft._gcType = gcType
    draft._workloadProfile = workloadProfile
    draft._containerAware = containerAware
    draft._maxRamPct = maxRamPct
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  }, [form, step, jvmConfigEnabled, gcType, workloadProfile, containerAware, maxRamPct])

  // Warn before unload when form has data
  useEffect(() => {
    if (!hasDraftData) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasDraftData])

  // Clear draft on successful submission
  const clearDraft = () => sessionStorage.removeItem(DRAFT_KEY)

  // Keep the environment field in sync with whatever the user picks in Settings.
  // This runs whenever activeEnv changes so the form always reflects the
  // currently active environment without requiring a page reload.
  useEffect(() => {
    setForm((prev) => ({ ...prev, environment: activeEnv }))
  }, [activeEnv])

  // Fetch runner SSH public keys and runner info once on mount
  useEffect(() => {
    setKeysLoading(true)
    fetchRunnerPublicKeys()
      .then((keys) => { setPublicKeys(keys); setKeysError(null); setRunnerReachable(true) })
      .catch(() => { setKeysError('Could not fetch runner public keys. Please contact your administrator.'); setRunnerReachable(false) })
      .finally(() => setKeysLoading(false))

    fetchRunnerInfo()
      .then((info) => setRunnerPublicIp(info.publicIp))
      .catch(() => {})
  }, [])

  // Reset test-connection state whenever SSH connection fields change
  useEffect(() => {
    setTestConnState('idle')
    setTestConnMsg(null)
  }, [form.sshUser, form.sshHost, form.sshPort, form.environment])

  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((p) => ({ ...p, [key]: value }))
  }, [])

  // Handle JAR artifact upload.
  // Auto-fills jarName and reads the manifest via JSZip to pre-fill app fields.
  const handleJarArtifact = async (file: File | null) => {
    set('jarArtifact', file)
    if (!file?.name.toLowerCase().endsWith('.jar')) {
      set('jarName', '')
      setAutoFilledFields(new Set())
      return
    }
    set('jarName', file.name)
    // Always reset dependent state on new JAR — new JAR = fresh start
    set('libZip', null)
    setManifestParsing(true)
    setJarJavaVersion(null)
    setJavaAutoMatched(null)
    setDetectedJavas(null)
    setShowAllJavas(false)
    setPortDetection(null)
    setPortMismatchDismissed(false)
    try {
      const [{ mainClass, appTitle, isSpringBoot, buildJdkSpec }, portResult] = await Promise.all([
        parseJarManifest(file),
        parseServerPort(file),
      ])
      const filled = new Set<string>()
      if (mainClass)        { set('mainClass',   mainClass);         filled.add('mainClass')   }
      if (appTitle)         { set('appName',     appTitle);          filled.add('appName')     }
      if (portResult.port)  { set('serverPort',  portResult.port);   filled.add('serverPort')  }
      if (buildJdkSpec)     { setJarJavaVersion(buildJdkSpec) }
      if (portResult.source){ setPortDetection({ source: portResult.source, profile: portResult.profile }); setPortMismatchDismissed(false) }
      const detectedType: 'fat' | 'thin' = isSpringBoot ? 'fat' : 'thin'
      set('jarType', detectedType)
      setAutoFilledFields(filled)
      if (mainClass || appTitle) {
        toast.success('Fields pre-filled from JAR manifest')
      }
    } catch {
      // Manifest parse failed silently — fields stay editable
    } finally {
      setManifestParsing(false)
    }
  }

  const goTo = (n: number) => {
    setDeparted((prev) => new Set([...prev, step]))
    setVisited((prev) => new Set([...prev, n]))
    setStep(n)
  }

  // Navigate to a step and then scroll smoothly to a specific panel within it.
  // The timeout gives React time to render the new step before scrollIntoView runs.
  const goToAndScroll = (n: number, panelId: string) => {
    goTo(n)
    setTimeout(() => {
      document.getElementById(panelId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  // Step-2 hard gate — refuse to advance into Step 3 when the deploy path is
  // known to be broken on the server. Soft states (idle / missing / ok / stale)
  // don't block; only the four "you must act on the server" states do.
  const pathBlocksStep2 =
    pathCheckState === 'wrong_owner'
    || pathCheckState === 'parent_not_writable'
    || pathCheckState === 'invalid_path'
    || pathCheckState === 'unreachable'

  const handleNext = () => {
    if (step === 2 && pathBlocksStep2) {
      toast.error('Fix the deploy path on the server (see the path-status panel) before continuing.')
      return
    }
    setDeparted((prev) => new Set([...prev, step]))
    const next = step + 1
    setVisited((prev) => new Set([...prev, next]))
    setStep(next)
  }

  const handlePrev = () => {
    setDeparted((prev) => new Set([...prev, step]))
    setStep((s) => s - 1)
  }

  const handleSubmit = async () => {
    // Reveal all step statuses before validation so the user can see which tabs
    // are highlighted as incomplete (yellow warning triangles).
    setVisited(new Set([1, 2, 3]))
    setDeparted(new Set([1, 2, 3]))

    // Final validation of all steps — collect errors and incomplete step names
    const incompleteStepLabels: string[] = []
    for (let s = 1; s <= 3; s++) {
      const stepErrors = validateStep(s, form, jvmConfigEnabled)
      if (Object.keys(stepErrors).length > 0) {
        incompleteStepLabels.push(STEPS[s - 1].label)
      }
    }
    if (incompleteStepLabels.length > 0) {
      // Navigate to the first incomplete step so the user sees the error banner
      const firstIncompleteStep = [1, 2, 3].find(
        (s) => Object.keys(validateStep(s, form, jvmConfigEnabled)).length > 0,
      ) ?? 1
      setStep(firstIncompleteStep)
      toast.error(`Incomplete: ${incompleteStepLabels.join(', ')}`)
      return
    }

    setSubmitting(true)
    setUploadProgress(0)
    try {
      // Only compute GC/workload flags when the user has opted in — otherwise
      // JVM ergonomic defaults apply (no -Xms/-Xmx/-XX flags sent at all).
      let computedFlags: string[] = []
      if (jvmConfigEnabled) {
        const derived = deriveJvmFlags({
          xms: form.xms, xmx: form.xmx,
          gcType, workloadProfile, containerAware, advancedGcTuning, maxGcPauseMs,
          metaspaceSize:   advancedJvmEnabled ? metaspaceSize   : '',
          threadStackSize: advancedJvmEnabled ? threadStackSize : '',
          javaVersion: form.javaVersion,
          maxRamPct,
        })
        if (derived.errors.length > 0) {
          toast.error(`JVM config error: ${derived.errors[0]}`)
          setSubmitting(false)
          return
        }
        computedFlags = derived.flags
      }

      // Validate user-entered extra JVM opts — each must start with '-'
      const invalidOpts = form.extraOpts
        .filter(Boolean)
        .filter((opt) => !opt.trimStart().startsWith('-'))
      if (invalidOpts.length > 0) {
        toast.error(`Invalid JVM flag: "${invalidOpts[0]}" — flags must start with '-' (e.g. -Dproperty=value, -XX:+Flag)`)
        setSubmitting(false)
        return
      }

      const req = buildRequest(form, computedFlags)
      // Use the same filter as buildRequest so certFiles[i] ↔ certPaths[i] exactly
      const activeCerts  = form.certUploads.filter((c) => c.source.trim() && c.targetPath.trim() && c.file)
      const activeExtras = form.extraDirs.filter((d) => d.dirName.trim() && d.targetPath.trim() && d.file)
      const certFiles  = activeCerts.map((c) => c.file!)
      const extraFiles = activeExtras.map((d) => d.file!)

      // Build ordered file list matching the FormData append order in submitJob
      const fileList: { label: string; name: string; size: number }[] = [
        { label: 'Application JAR', name: form.jarArtifact!.name, size: form.jarArtifact!.size },
        ...(form.libZip ? [{ label: 'Library ZIP', name: form.libZip.name, size: form.libZip.size }] : []),
        ...activeCerts.map((c, i) => ({ label: `Cert: ${c.source || i + 1}`, name: certFiles[i].name, size: certFiles[i].size })),
        ...activeExtras.map((d, i) => ({ label: `Dir: ${d.dirName || i + 1}`, name: extraFiles[i].name, size: extraFiles[i].size })),
      ]
      const totalFileBytes = fileList.reduce((s, f) => s + f.size, 0)
      setUploadFiles(fileList)
      setFileProgresses(new Array(fileList.length).fill(0))

      const res = await submitJob(
        req,
        form.jarArtifact!,
        form.libZip ?? undefined,
        certFiles.length  > 0 ? certFiles  : undefined,
        extraFiles.length > 0 ? extraFiles : undefined,
        (loaded, total) => {
          setUploadProgress(Math.round((loaded * 100) / total))
          if (totalFileBytes > 0) {
            const scale = total / totalFileBytes
            setFileProgresses(fileList.map((f, i) => {
              const cumStart = fileList.slice(0, i).reduce((s, x) => s + x.size, 0) * scale
              const scaledSize = f.size * scale
              return Math.min(100, Math.max(0, Math.round((loaded - cumStart) / scaledSize * 100)))
            }))
          }
        },
      )
      toast.success(`Deployment started — Job ${res.jobId.slice(0, 8)}`)

      // Persist a snapshot of this deployment (without File objects) so the
      // user can pre-fill the form on their next visit.
      try {
        const saved: SavedDeployment = {
          savedAt:        new Date().toISOString(),
          environment:    form.environment,
          sshUser:        form.sshUser,
          sshHost:        form.sshHost,
          sshPort:        form.sshPort,
          targetBasePath: form.targetBasePath,
          appName:        form.appName,
          mainClass:      form.mainClass,
          javaCommand:    form.javaCommand,
          javaVersion:    form.javaVersion,
          xms:            form.xms,
          xmx:            form.xmx,
          newRatio:       form.newRatio,
          extraOpts:      form.extraOpts,
          runAsUser:      form.runAsUser,
          serverPort:     form.serverPort,
          maxLogSize:     form.maxLogSize,
          maxLogFiles:    form.maxLogFiles,
          jarType:        form.jarType,
          performBackup:  form.performBackup,
          maxBackups:     form.maxBackups,
          stabilityWindow: form.stabilityWindow,
          jarName:        form.jarName,
          certUploads:    form.certUploads.map((c) => ({ source: c.source, targetPath: c.targetPath })),
          extraDirs:      form.extraDirs.map((d)  => ({ dirName: d.dirName, targetPath: d.targetPath })),
        }
        // Push to front, deduplicate by appName+environment, cap at HISTORY_MAX
        const existing = (() => {
          try { return JSON.parse(localStorage.getItem(DEPLOY_HISTORY_KEY) ?? '[]') as SavedDeployment[] }
          catch { return [] }
        })()
        const deduped  = existing.filter(d => !(d.appName === saved.appName && d.environment === saved.environment))
        const updated  = [saved, ...deduped].slice(0, HISTORY_MAX)
        localStorage.setItem(DEPLOY_HISTORY_KEY, JSON.stringify(updated))
        setDeployHistory(updated)
        setHistoryDismissed(false)
      } catch {
        // localStorage quota exceeded or unavailable — not critical
      }

      clearDraft()
      navigate(`/jobs/${res.jobId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deployment failed to start.'
      toast.error(msg)
      setUploadProgress(null)
      setUploadFiles([])
      setFileProgresses([])
    } finally {
      setSubmitting(false)
    }
  }

  // ── SSH key panel — derived values (Step 1) ───────────────────────
  const envKeyStyle = ENV_KEY_STYLE[form.environment as keyof typeof ENV_KEY_STYLE] ?? ENV_KEY_STYLE.SIT
  const envKey      = publicKeys?.[form.environment] ?? ''
  const setupScript = [
    'mkdir -p ~/.ssh && \\',
    'chmod 700 ~/.ssh && \\',
    `echo "${envKey}" >> ~/.ssh/authorized_keys && \\`,
    'chmod 600 ~/.ssh/authorized_keys',
  ].join('\n')

  // Step 1 gate: all required SSH fields must be filled AND connection test must pass
  // before the user can advance. Used to disable the Next button and show a hint.
  const isStep1Valid =
    form.sshUser.trim() !== '' &&
    form.sshHost.trim() !== '' &&
    form.sshPort.trim() !== ''

  const handleCopyKey = () => {
    if (!envKey) return
    void navigator.clipboard.writeText(envKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const handleCopyScript = () => {
    if (!envKey) return
    void navigator.clipboard.writeText(setupScript)
    setCopiedScript(true)
    setTimeout(() => setCopiedScript(false), 2000)
  }

  const handleCopyIp = () => {
    if (!runnerPublicIp) return
    void navigator.clipboard.writeText(runnerPublicIp)
    setCopiedIp(true)
    setTimeout(() => setCopiedIp(false), 2000)
  }

  // Detect Java installations on the target server, then auto-match against JAR's required version.
  const runJavaDetect = async () => {
    setJavaDetecting(true)
    try {
      const res = await testSshConnection({
        sshUser:     form.sshUser,
        sshHost:     form.sshHost,
        sshPort:     parseInt(form.sshPort, 10),
        environment: form.environment,
      })
      const installations = res.javaInstallations ?? []
      setDetectedJavas(installations)

      // Auto-match: if JAR specifies a required Java version, find it on the server
      if (jarJavaVersion && installations.length > 0) {
        const requiredVer = parseInt(jarJavaVersion, 10)
        const match = installations.find(p => inferJavaVersion(p) === requiredVer)
        if (match) {
          set('javaCommand', match)
          set('javaVersion', jarJavaVersion)
          setJavaAutoMatched(true)
        } else {
          setJavaAutoMatched(false)
        }
      } else {
        setJavaAutoMatched(null)
      }
    } catch {
      setDetectedJavas([])
      setJavaAutoMatched(null)
    } finally {
      setJavaDetecting(false)
    }
  }

  const handleTestConnection = async () => {
    setTestConnState('testing')
    setTestConnMsg(null)
    try {
      const res = await testSshConnection({
        sshUser:     form.sshUser,
        sshHost:     form.sshHost,
        sshPort:     parseInt(form.sshPort, 10),
        environment: form.environment,
      })
      // Got a response — runner service is reachable regardless of SSH result
      setRunnerReachable(true)
      setTestConnState(res.success ? 'ok' : 'fail')
      setTestConnMsg(res.message ?? null)
      if (res.success) {
        setDetectedJavas(res.javaInstallations ?? [])
      }
    } catch {
      // Fetch itself failed — runner service is down or unreachable on port 8081
      setRunnerReachable(false)
      setTestConnState('fail')
      setTestConnMsg('runner-unreachable')
    }
  }

  // ── Step 2 deploy-path preflight ─────────────────────────────────────────
  // Fires on blur of the DEPLOY PATH field, plus on demand via the Re-check
  // button. Result is cached by inputs key — changing host/user/runAs/path
  // invalidates the cache and marks the state 'stale' until the user re-checks.
  const pathCheckInputsKey = (): string =>
    [form.sshHost, form.sshPort, form.sshUser, form.environment,
     form.runAsUser, form.targetBasePath.trim()].join('|')

  const handleCheckDeployPath = useCallback(async () => {
    const path    = form.targetBasePath.trim()
    const runAs   = form.runAsUser.trim()
    const sshUser = form.sshUser.trim()
    const sshHost = form.sshHost.trim()
    const sshPort = parseInt(form.sshPort, 10)
    // Need every input filled before we can check; if anything's missing,
    // sit at 'idle' so the panel doesn't render misleading state.
    if (!path || !runAs || !sshUser || !sshHost || !sshPort) {
      setPathCheckState('idle')
      setPathCheckResult(null)
      return
    }
    setPathCheckState('checking')
    try {
      const res = await checkDeployPath({
        sshUser, sshHost, sshPort,
        environment:    form.environment,
        runAsUser:      runAs,
        targetBasePath: path,
      })
      setPathCheckResult(res)
      setPathCheckedKey(pathCheckInputsKey())
      // Map the server's status enum (uppercase) → our lowercase state token
      setPathCheckState(res.status.toLowerCase().replace(/_/g, '_') as typeof pathCheckState)
    } catch {
      // Fetch itself failed — show a generic UNREACHABLE
      setPathCheckResult({
        status: 'UNREACHABLE',
        path,
        exists: null,
        actualOwner: null,
        expectedOwner: runAs,
        parentPath: null,
        parentExists: null,
        parentWritableByRunAs: null,
        fixCommands: [],
        humanReason: 'Cannot reach the runner service — check the API connection.',
        sshErrorTail: null,
      })
      setPathCheckState('unreachable')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.targetBasePath, form.runAsUser, form.sshUser, form.sshHost, form.sshPort, form.environment])

  // Mark the cached check stale whenever any of the inputs that fed it change.
  useEffect(() => {
    if (pathCheckedKey && pathCheckedKey !== pathCheckInputsKey() && pathCheckState !== 'idle') {
      setPathCheckState('stale')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.targetBasePath, form.runAsUser, form.sshUser, form.sshHost, form.sshPort, form.environment])

  // Apply a history entry to the live form.
  // File references (JAR, ZIPs) are intentionally left as null —
  // the user will need to re-upload their files each time.
  const handlePrefill = (entry: SavedDeployment) => {
    setForm((prev) => ({
      ...prev,
      environment:    entry.environment,
      sshUser:        entry.sshUser,
      sshHost:        entry.sshHost,
      sshPort:        entry.sshPort,
      targetBasePath: entry.targetBasePath,
      appName:        entry.appName,
      mainClass:      entry.mainClass,
      javaCommand:    entry.javaCommand,
      javaVersion:    entry.javaVersion,
      xms:            entry.xms,
      xmx:            entry.xmx,
      newRatio:       entry.newRatio,
      extraOpts:      entry.extraOpts,
      runAsUser:      entry.runAsUser,
      serverPort:     entry.serverPort,
      maxLogSize:     entry.maxLogSize,
      maxLogFiles:    entry.maxLogFiles,
      jarType:        entry.jarType,
      performBackup:  entry.performBackup,
      maxBackups:     entry.maxBackups,
      stabilityWindow: entry.stabilityWindow || '20',
      jarName:        entry.jarName,
      // Restore cert / extra-dir config (paths only — files must be re-uploaded)
      hasCerts:    entry.certUploads.length > 0,
      certUploads: entry.certUploads.map((c) => ({ ...c, file: null })),
      hasExtraDirs: entry.extraDirs.length > 0,
      extraDirs:   entry.extraDirs.map((d)  => ({ ...d, file: null })),
    }))
    // Restore heap UI state from saved values
    const xmsVal = entry.xms
    const xmxVal = entry.xmx
    if (xmsVal === xmxVal && xmxVal) {
      const u = (xmxVal.endsWith('g') ? 'g' : 'm') as 'm' | 'g'
      setHeapSize(heapNum(xmxVal))
      setHeapUnit(u)
      setAdvancedHeap(false)
    } else if (xmsVal && xmxVal) {
      setAdvancedHeap(true)
      setXmsUnit(xmsVal.endsWith('g') ? 'g' : 'm')
      setXmxUnit(xmxVal.endsWith('g') ? 'g' : 'm')
    }
    setActivePreset('custom')

    // Restore Java preset selector based on the saved javaCommand path
    const matchedPreset = JAVA_PRESETS.find((p) => p.path === entry.javaCommand)
    setJavaPreset(matchedPreset ? matchedPreset.id : 'custom')

    // Pre-filled from history — fields were set by the user, not detected from manifest
    setAutoFilledFields(new Set())

    setHistoryExpanded(false)
    toast.success(`Pre-filled from ${entry.appName} (${entry.environment}) — please re-upload your files.`)
  }

  return (
    <>
    {/* ── Page header (title + history) — scrolls away naturally ── */}
    <div className="flex flex-col gap-6 max-w-3xl pt-6 mb-4 xl:!max-w-[1132px]">

      {/* ── Page title — animated crimson sweep across the headline ── */}
      <div className="flex items-end gap-3 pb-2 border-b border-wiz-border/60">
        <div className="w-1 h-9 rounded-full bg-wiz-gold flex-shrink-0" aria-hidden />
        <div className="min-w-0">
          <h1
            className="text-2xl font-serif font-bold leading-none deploy-title-shimmer"
            style={{
              backgroundImage: 'linear-gradient(90deg, #1A1A2E 0%, #1A1A2E 30%, #8B1A1A 50%, #1A1A2E 70%, #1A1A2E 100%)',
              backgroundSize: '200% 100%',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              animation: 'deploy-title-sweep 6s linear infinite',
            }}
          >
            New Deployment
          </h1>
        </div>
      </div>

      {/* ── Draft restore banner — "Continue" or "Start fresh" ──
          Informational notice (not a warning), so it lives in the
          sig-blue family. A 3px left accent gives it visual identity
          without flooding the row with fill. */}
      {draftBanner && (
        <div className="flex items-center gap-3 px-4 py-3 rounded border border-sig-blue/25 border-l-[3px] border-l-sig-blue/60 bg-sig-blue/5 animate-fade-in">
          <Info size={16} className="text-sig-blue flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-wiz-cream">
              Previous draft restored
              {draftBanner.appName && <> for <span className="font-semibold">{draftBanner.appName}</span></>}
            </p>
            <p className="text-xs text-wiz-muted/60 mt-0.5">
              Continuing from {draftBanner.stepLabel}.
              {draftBanner.jarName && <> File uploads ({draftBanner.jarName}) will need to be re-uploaded.</>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setDraftBanner(null)}
              className="text-xs font-medium px-3 py-1.5 rounded border border-sig-green/40 bg-sig-green-dim/40 text-sig-green hover:bg-sig-green-dim hover:border-sig-green/60 transition-all"
            >
              Continue
            </button>
            <button
              type="button"
              onClick={resetToFresh}
              className="text-xs font-medium px-3 py-1.5 rounded border border-wiz-border/60 text-wiz-muted hover:text-wiz-cream hover:border-wiz-border transition-all"
            >
              Start Fresh
            </button>
          </div>
        </div>
      )}

      {/* ── Saved Drafts panel ──
          Compact, brand-aligned. Crimson left border + warm gradient
          backdrop ties it to the wizard's design language. Collapses
          to a single row by default; expands to show drafts on click. */}
      {deployHistory.length > 0 && !historyDismissed && !draftBanner && (
        <div
          className="relative rounded-md border border-wiz-border border-l-[3px] border-l-wiz-gold overflow-hidden animate-fade-in"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,1) 0%, rgba(139,26,26,0.05) 100%)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          {/* Header — single compact row */}
          <div className="flex items-center gap-2.5 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setHistoryExpanded(e => !e)}
              className="flex items-center gap-2.5 flex-1 hover:opacity-80 transition-opacity text-left group"
              aria-expanded={historyExpanded}
            >
              {/* Icon chip — clock in tinted gold square */}
              <span className="flex items-center justify-center w-5 h-5 rounded-md bg-wiz-gold/12 text-wiz-gold flex-shrink-0">
                <Clock size={11} strokeWidth={2.4} />
              </span>

              {/* Label + count chip */}
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-wiz-cream/85">
                Saved Drafts
              </span>
              <span className="inline-flex items-center px-1.5 py-[1px] rounded-sm text-[9px] font-mono font-bold tabular-nums bg-wiz-gold/10 text-wiz-gold border border-wiz-gold/30">
                {deployHistory.length}
              </span>

              {/* Spacer */}
              <span className="flex-1" />

              {/* CTA chip — clearer "Resume Draft" call-to-action */}
              <span className={clsx(
                'inline-flex items-center gap-1 px-2 py-[3px] rounded-md text-[9.5px] font-bold uppercase tracking-[0.14em] border transition-all duration-150',
                historyExpanded
                  ? 'bg-wiz-bg/60 border-wiz-border text-wiz-muted group-hover:bg-wiz-raised'
                  : 'bg-wiz-gold/8 border-wiz-gold/30 text-wiz-gold group-hover:bg-wiz-gold group-hover:text-white group-hover:border-wiz-gold',
              )}>
                <ChevronDown
                  size={10}
                  strokeWidth={2.6}
                  className={clsx(
                    'transition-transform duration-200',
                    historyExpanded ? 'rotate-180' : 'rotate-0',
                  )}
                />
                {historyExpanded ? 'Hide' : 'Resume Draft'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setHistoryDismissed(true)}
              className="btn-icon h-6 w-6 text-wiz-dim hover:text-sig-red hover:bg-sig-red-dim flex-shrink-0"
              aria-label="Dismiss"
              title="Hide drafts"
            >
              <X size={11} />
            </button>
          </div>

          {/* Expanded rows — divided list */}
          {historyExpanded && (
            <div className="divide-y divide-wiz-border/40 border-t border-wiz-border/40 bg-wiz-surface/60">
              {deployHistory.map((entry, i) => {
                const envColor =
                  entry.environment === 'DEV'  ? 'bg-sig-green-dim text-sig-green border-sig-green/25' :
                  entry.environment === 'UAT'  ? 'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/25' :
                  entry.environment === 'PROD' ? 'bg-sig-purple-dim text-sig-purple border-sig-purple/25' :
                                                 'bg-sig-blue-dim text-sig-blue border-sig-blue/25'
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-wiz-bg/60 transition-colors group/row"
                  >
                    {/* Index */}
                    <span className="text-2xs font-mono text-wiz-dim w-4 shrink-0 text-right">{i + 1}</span>

                    {/* App name + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-wiz-cream truncate leading-snug">
                        {entry.appName || 'Unknown app'}
                      </p>
                      <p className="text-2xs text-wiz-muted mt-0.5 font-mono">
                        {entry.sshHost} · {formatRelativeTime(entry.savedAt)}
                      </p>
                    </div>

                    {/* Environment badge */}
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider shrink-0 ${envColor}`}>
                      {entry.environment}
                    </span>

                    {/* Pre-fill primary action */}
                    <button
                      type="button"
                      onClick={() => handlePrefill(entry)}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold text-wiz-gold bg-wiz-gold/8 hover:bg-wiz-gold hover:text-white border border-wiz-gold/30 hover:border-wiz-gold transition-all duration-150"
                    >
                      Pre-fill
                    </button>

                    {/* Remove */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        const updated = deployHistory.filter((_, j) => j !== i)
                        setDeployHistory(updated)
                        localStorage.setItem(DEPLOY_HISTORY_KEY, JSON.stringify(updated))
                      }}
                      className="btn-icon h-6 w-6 text-wiz-dim hover:text-sig-red hover:bg-sig-red-dim flex-shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
                      aria-label="Remove from list"
                      title="Remove from list"
                    >
                      <X size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div> {/* end page header block */}

    {/* ── Upload progress panel (replaces step tabs + card while uploading) ── */}
    {uploadProgress !== null ? (
      <div className="max-w-3xl">
        <div className="wiz-card p-8 flex flex-col gap-6 animate-fade-in">
          {/* Header */}
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-wiz-cream">
              {uploadProgress < 100 ? 'Uploading files to runner…' : 'Processing deployment…'}
            </p>
            <p className="text-sm text-wiz-muted">
              {uploadProgress < 100
                ? `Transferring ${form.jarArtifact?.name ?? 'artifact'} and any additional ZIPs over the network.`
                : 'Upload complete. The runner is initialising your deployment workspace.'}
            </p>
          </div>

          {/* Overall progress bar */}
          <div className="flex flex-col gap-2">
            <div className="h-2.5 rounded-full bg-wiz-raised overflow-hidden">
              <div
                className="h-full rounded-full bg-wiz-gold transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-wiz-muted font-mono">
              <span>{uploadProgress! < 100 ? `${uploadProgress}% uploaded` : '100% — awaiting server…'}</span>
              {uploadFiles.length > 0 && (
                <span>
                  {(uploadFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB total
                </span>
              )}
            </div>
          </div>

          {/* Per-file progress list */}
          <div className="flex flex-col gap-2">
            {uploadFiles.map((f, i) => {
              const pct = fileProgresses[i] ?? 0
              const done = pct >= 100
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 text-xs">
                    {done
                      ? <Check size={11} className="text-sig-green flex-shrink-0" />
                      : <Loader2 size={11} className="animate-spin text-wiz-muted flex-shrink-0" />
                    }
                    <span className={clsx('font-mono truncate flex-1', done ? 'text-wiz-gray' : 'text-wiz-muted')}>
                      {f.name}
                    </span>
                    <span className="text-wiz-dim flex-shrink-0">— {f.label}</span>
                    <span className={clsx('font-mono ml-2 flex-shrink-0 w-10 text-right', done ? 'text-sig-green' : 'text-wiz-muted')}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-wiz-raised overflow-hidden ml-[19px]">
                    <div
                      className={clsx('h-full rounded-full transition-all duration-200', done ? 'bg-sig-green' : 'bg-wiz-gold/60')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Spinner hint */}
          <div className="flex items-center gap-2 text-xs text-wiz-muted">
            <Loader2 size={13} className="animate-spin text-wiz-gold flex-shrink-0" />
            <span>
              {uploadProgress < 100
                ? 'Do not close this tab — upload in progress.'
                : 'You will be redirected to the job monitor automatically.'}
            </span>
          </div>
        </div>
      </div>
    ) : (
      <>

      {/* ── Step navigation — wrapped in a proper panel for visual anchoring ──
          Sticky at the top of the scroll area so users always see where they are. */}
      <div className="sticky top-0 z-50 -mx-6 px-6 pt-3 pb-3 bg-wiz-bg">
        <div className="max-w-3xl xl:!max-w-[1132px]">
          {(() => {
            const stepStatuses = STEPS.map(s => getStepStatus(s.id, step, visited, form, jvmConfigEnabled))
            // Step 4 (the final review screen) has no form fields — count it as
            // complete when all prior steps validate, regardless of whether the
            // user is currently parked on it. Fixes the misleading "3/4 complete"
            // pill when the user reaches the review with all data filled (natural
            // reading is 100%).
            const reviewIdx      = STEPS.length - 1
            const reviewComplete = stepStatuses.slice(0, reviewIdx).every(s => s === 'complete')
            const completed      = stepStatuses
              .filter((s, i) => s === 'complete' || (i === reviewIdx && reviewComplete))
              .length
            const progressPct  = (completed / STEPS.length) * 100
            const isAllDone    = completed === STEPS.length
            // Hide the floating chip at the extremes — at 0 it collides with
            // the status pill, and at 100 the "Ready" pill already conveys it.
            const showChip     = progressPct > 0 && progressPct < 100

            return (
              <div
                className="rounded-md border border-wiz-border border-l-[3px] border-l-wiz-gold bg-wiz-surface px-5 pt-3.5 pb-4"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.04)' }}
              >
                {/* ── Status row — left "step + hint" chip, right "complete" pill ── */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  {/* Left chip — two-section: uppercase step label + contextual hint.
                      The label section keeps the original compact pill identity
                      (pulse dot + "STEP N OF 4"); a hairline divider opens onto a
                      hint section that morphs per step (or to the "ready" line
                      once every step is complete). The hint span is keyed on
                      `step` so React remounts it and the existing fade-in
                      keyframe runs on every transition — gives the chip a
                      living, narrating quality instead of static chrome. */}
                  <div
                    className={clsx(
                      'inline-flex items-stretch rounded-md border min-w-0 transition-all duration-300 overflow-hidden',
                      isAllDone ? 'border-sig-green/35' : 'border-sig-blue/35',
                    )}
                    style={
                      isAllDone
                        ? {
                            // Completion state — left-weighted green wash with depth.
                            // The gradient fades from richer at the label end to softer
                            // at the hint end, so the eye reads label → hint naturally.
                            background:
                              'linear-gradient(90deg, rgba(22,163,74,0.20) 0%, rgba(22,163,74,0.12) 55%, rgba(22,163,74,0.06) 100%)',
                            boxShadow:
                              '0 1px 3px rgba(22,163,74,0.14), 0 0 0 1px rgba(22,163,74,0.04), inset 0 1px 0 rgba(255,255,255,0.55)',
                          }
                        : {
                            // In-progress state — same recipe in informational blue.
                            // The 1px inner top highlight lifts the chip off the page;
                            // the soft drop shadow tints with the same hue so the chip
                            // reads as "filled & sitting on the surface" instead of a
                            // ghost outline.
                            background:
                              'linear-gradient(90deg, rgba(37,99,235,0.20) 0%, rgba(37,99,235,0.12) 55%, rgba(37,99,235,0.06) 100%)',
                            boxShadow:
                              '0 1px 3px rgba(37,99,235,0.14), 0 0 0 1px rgba(37,99,235,0.04), inset 0 1px 0 rgba(255,255,255,0.55)',
                          }
                    }
                  >
                    {/* Label section */}
                    <div className={clsx(
                      'flex items-center gap-1.5 px-2 py-1 text-[9.5px] font-bold uppercase tracking-[0.16em] flex-shrink-0',
                      isAllDone ? 'text-sig-green' : 'text-sig-blue',
                    )}>
                      <span className="relative flex w-1.5 h-1.5">
                        <span
                          className={clsx(
                            'absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping',
                            isAllDone ? 'bg-sig-green' : 'bg-sig-blue',
                          )}
                          style={{ animationDuration: '1.8s' }}
                        />
                        <span className={clsx(
                          'relative inline-flex rounded-full h-1.5 w-1.5',
                          isAllDone ? 'bg-sig-green' : 'bg-sig-blue',
                        )} />
                      </span>
                      {isAllDone ? 'Ready' : `Step ${step} of ${STEPS.length}`}
                    </div>

                    {/* Hairline divider — colour matches the active accent */}
                    <div
                      className={clsx(
                        'w-px my-1 flex-shrink-0',
                        isAllDone ? 'bg-sig-green/25' : 'bg-sig-blue/20',
                      )}
                      aria-hidden
                    />

                    {/* Hint section — fades in on every step transition */}
                    <div
                      key={`step-hint-${step}-${isAllDone ? 'done' : 'active'}`}
                      className="flex items-center min-w-0 px-2.5 py-1 animate-fade-in"
                    >
                      <span
                        className="text-[11px] leading-snug font-medium text-wiz-cream/95 truncate"
                        title={
                          isAllDone
                            ? 'Every step is complete — one click away from deploying.'
                            : STEPS[step - 1]?.subtitle
                        }
                      >
                        {isAllDone
                          ? 'Every step is complete — one click away from deploying.'
                          : STEPS[step - 1]?.subtitle}
                      </span>
                    </div>
                  </div>

                  {/* Right pill — completion count.
                      Colour story: grey (idle) → blue (in progress) → green (all done).
                      Green is reserved strictly for 100% complete; partial progress
                      uses informational blue so it doesn't read as "done". */}
                  <div className={clsx(
                    'inline-flex items-center self-center gap-1.5 px-2 py-1 rounded-md border text-[9.5px] font-bold uppercase tracking-[0.16em] flex-shrink-0 transition-colors duration-300',
                    completed === STEPS.length
                      ? 'bg-sig-green-dim border-sig-green/30 text-sig-green'
                      : completed > 0
                      ? 'bg-sig-blue-dim border-sig-blue/25 text-sig-blue'
                      : 'bg-wiz-bg/60 border-wiz-border/60 text-wiz-muted',
                  )}>
                    <Check
                      size={11}
                      strokeWidth={2.8}
                      className={clsx(
                        'transition-colors duration-300',
                        completed === STEPS.length ? 'text-sig-green'
                        : completed > 0 ? 'text-sig-blue'
                        : 'text-wiz-dim/40',
                      )}
                    />
                    <span className="font-mono font-bold tabular-nums">{completed}</span>
                    <span className="opacity-60">/</span>
                    <span className="font-mono font-bold tabular-nums">{STEPS.length}</span>
                    <span className="opacity-80">complete</span>
                  </div>
                </div>

                {/* ── Progress bar — thick, gradient, with shimmer + floating chip ── */}
                <div className={clsx('relative mt-1', showChip ? 'mb-5' : 'mb-3')}>
                  {/* Track */}
                  <div className="h-2 bg-wiz-border/50 rounded-full overflow-hidden relative">
                    {/* Filled portion with gradient + shimmer */}
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out overflow-hidden"
                      style={{
                        width: `${progressPct}%`,
                        background: 'linear-gradient(90deg, rgb(22,163,74) 0%, rgb(217,119,6) 50%, rgb(139,26,26) 100%)',
                      }}
                    >
                      {progressPct > 0 && (
                        <div
                          className="absolute inset-y-0 w-1/2 rounded-full"
                          style={{
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.55) 50%, transparent 100%)',
                            animation: 'progress-shimmer 2.4s linear infinite',
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Floating progress chip — only when between 1% and 99% */}
                  {showChip && (
                    <div
                      className="absolute -top-1 transition-all duration-700 ease-out pointer-events-none"
                      style={{
                        left: `${progressPct}%`,
                        animation: 'chip-float 2.5s ease-in-out infinite',
                        transform: 'translate(-50%, 0)',
                      }}
                    >
                      {/* Marker dot anchored on the bar */}
                      <div className="absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-wiz-gold shadow-[0_2px_6px_rgba(139,26,26,0.40)]" />

                      {/* Floating percentage chip — rendered above the marker */}
                      <div className="relative -translate-y-7">
                        <div
                          className="inline-flex items-center px-1.5 py-[2px] rounded text-[9.5px] font-mono font-bold tabular-nums whitespace-nowrap bg-wiz-gold text-white"
                          style={{
                            boxShadow: '0 4px 10px rgba(139,26,26,0.30), 0 0 0 1.5px rgba(255,255,255,0.95)',
                          }}
                        >
                          {Math.round(progressPct)}%
                        </div>
                        <div className="absolute left-1/2 -translate-x-1/2 -bottom-[3px] w-1.5 h-1.5 rotate-45 bg-wiz-gold" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Step circles + connectors */}
                <div className="flex items-center">
                  {STEPS.map((s, i) => {
                    const status   = stepStatuses[i]
                    const prevDone = stepStatuses[i - 1] === 'complete'
                    const isFirst  = i === 0
                    return (
                      <Fragment key={s.id}>
                        {!isFirst && <StepConnector done={prevDone} />}
                        <StepTab
                          num={s.num}
                          label={s.label}
                          status={status}
                          onClick={() => goTo(s.id)}
                        />
                      </Fragment>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ── Step content + Mission Control sidebar ── */}
      <div className="flex gap-6 mt-5">

      {/* Left column — form content */}
      <div className="max-w-3xl flex-1 min-w-0 relative z-0" key={step}>
      <div className="wiz-card p-5">

        {/* ─── Step 1: SSH Target ────────────────────────────── */}
        {step === 1 && (
          <>
            <div className="flex flex-col gap-5">
              <StepErrorBanner errors={errors} />

              {/* ── SAVED CONFIGS (panel 0 — wiz-gold, optional shortcut) ──
                  §5.0 #1 select-don't-type: pre-fill every SSH/Java/runtime
                  field from a previously-saved EnvironmentConfig. Hidden
                  entirely once the user dismisses it (per session). */}
              <SavedConfigsPanel
                loaded={loadedConfig}
                onLoad={applyEnvironmentConfig}
                onUnload={unloadConfig}
                dismissed={savedConfigsDismissed}
                setDismissed={setSavedConfigsDismissed}
              />

              {/* ── SSH TARGET CONFIGURATION (panel 1 — green theme) ── */}
              <div id="ssh-target-panel" className="rounded border border-wiz-border border-l-2 border-l-sig-green/50 bg-wiz-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-green-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-sig-green/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-green">
                    SSH Target Configuration
                  </h3>
                  {loadedConfig && (
                    <ConfigSourceBadge
                      appName={loadedConfig.appName}
                      envName={loadedConfig.envName}
                      overriddenCount={overriddenFields.length}
                    />
                  )}
                </div>
                <div className="divide-y divide-wiz-border/30">
                  <RowSelect
                    label="Environment"
                    sublabel="Deployment profile"
                    name="environment"
                    required
                    hint="Determines which SSH key the runner uses and the Spring profile activated on the target server."
                    value={form.environment}
                    onChange={(e) => {
                      set('environment', e.target.value); setPortMismatchDismissed(false)
                      setActiveEnv(e.target.value as ActiveEnv)
                    }}
                    options={[
                      { value: 'DEV',  label: 'DEV — Development' },
                      { value: 'SIT',  label: 'SIT — System Integration Testing' },
                      { value: 'UAT',  label: 'UAT — User Acceptance Testing' },
                      { value: 'PROD', label: 'PROD — Production' },
                    ]}
                  />
                  {/* ── SSH Endpoint — three inputs fused into one connection-string row ──
                      Renders as `user @ host : port` because that's the mental
                      model every SSH user already has. The inputs share borders
                      so the row reads as one composed control; under the hood
                      each input remains independently editable, individually
                      validated (red border via wiz-input-error), and individually
                      labelled for screen readers. */}
                  <RowField
                    label="SSH Endpoint"
                    sublabel={<span className="font-mono text-[10px] tracking-wide">user @ host : port</span>}
                    name="sshEndpoint"
                    required
                    error={errors.sshUser || errors.sshHost || errors.sshPort}
                    hint="Linux user, public IP/hostname and SSH port. The runner authenticates with the per-environment SSH key."
                  >
                    <div className="flex items-stretch w-full">
                      {/* User — narrow flex */}
                      <input
                        id="sshUser"
                        name="sshUser"
                        aria-label="SSH user"
                        placeholder="deploy"
                        value={form.sshUser}
                        onChange={(e) => set('sshUser', e.target.value)}
                        className={clsx(
                          'wiz-input flex-1 min-w-[80px] rounded-r-none border-r-0 relative z-10 focus:z-20',
                          errors.sshUser && 'wiz-input-error',
                        )}
                      />
                      {/* @ separator chip */}
                      <span
                        className="inline-flex items-center justify-center px-2 border-y border-wiz-border bg-wiz-bg/50 text-wiz-muted font-mono text-sm select-none flex-shrink-0"
                        aria-hidden
                      >
                        @
                      </span>
                      {/* Host — widest flex */}
                      <input
                        id="sshHost"
                        name="sshHost"
                        aria-label="SSH host"
                        placeholder="34.201.190.116"
                        value={form.sshHost}
                        onChange={(e) => set('sshHost', e.target.value)}
                        className={clsx(
                          'wiz-input flex-[2] min-w-[140px] rounded-none border-x-0 relative z-10 focus:z-20',
                          errors.sshHost && 'wiz-input-error',
                        )}
                      />
                      {/* : separator chip */}
                      <span
                        className="inline-flex items-center justify-center px-2 border-y border-wiz-border bg-wiz-bg/50 text-wiz-muted font-mono text-sm select-none flex-shrink-0"
                        aria-hidden
                      >
                        :
                      </span>
                      {/* Port — fixed narrow width (almost always 2 digits) */}
                      <input
                        id="sshPort"
                        name="sshPort"
                        aria-label="SSH port"
                        type="number"
                        placeholder="22"
                        value={form.sshPort}
                        onChange={(e) => set('sshPort', e.target.value)}
                        className={clsx(
                          'wiz-input w-[72px] flex-shrink-0 rounded-l-none border-l-0 text-center relative z-10 focus:z-20',
                          errors.sshPort && 'wiz-input-error',
                        )}
                      />
                    </div>
                  </RowField>
                </div>

              </div>{/* ── end SSH TARGET CONFIGURATION PANEL ── */}

              {/* ── FIREWALL SETUP (panel 2 — blue theme) ── */}
              <div className="rounded border border-wiz-border border-l-2 border-l-sig-blue/50 bg-wiz-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-blue-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-sig-blue/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-blue">
                    Firewall Setup
                  </h3>
                </div>
                {/* Panel body */}
                <div className="divide-y divide-wiz-border/30">

                  {/* Runner IP row */}
                  <RowField
                    label="Runner IP"
                    sublabel="Whitelist this"
                    name="runnerIp"
                    hint="WizardCD runner's public IP — add this to your server's firewall allow rules."
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-h-[36px] flex items-center bg-wiz-bg border border-wiz-border rounded px-4 font-mono text-sm text-wiz-cream select-all">
                        {runnerPublicIp
                          ? runnerPublicIp
                          : <span className="text-wiz-muted italic text-xs">Detecting…</span>
                        }
                      </div>
                      <button
                        type="button"
                        onClick={handleCopyIp}
                        disabled={!runnerPublicIp}
                        className={clsx(
                          'inline-flex items-center gap-1.5 font-mono text-xs px-2.5 rounded-md h-9',
                          'border transition-all duration-150 disabled:opacity-40 flex-shrink-0',
                          copiedIp
                            ? 'border-sig-green/40 bg-sig-green-dim text-sig-green'
                            : 'border-wiz-border bg-wiz-raised text-wiz-gray hover:text-wiz-cream hover:border-wiz-border/60',
                        )}
                      >
                        {copiedIp ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy</>}
                      </button>
                    </div>
                  </RowField>

                  {/* Whitelist rules row — collapsible */}
                  <FirewallRulesRow runnerPublicIp={runnerPublicIp} />

                </div>
              </div>

              {/* ── SSH KEYS CONFIGURATION (panel 3 — crimson theme) ── */}
              <div className="rounded border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-surface overflow-hidden">
                <div className="flex items-center justify-between gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-gold-dim">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                    <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                      SSH Keys Configuration
                    </h3>
                  </div>
                  <span className={clsx('font-mono text-[11px] px-2 py-0.5 rounded border font-bold flex-shrink-0 tracking-widest', envKeyStyle.text, envKeyStyle.badge)}>
                    {form.environment}
                  </span>
                </div>

                {/* Panel body — rows sit directly here, no inner wrapper */}
                <div className="divide-y divide-wiz-border/30">
                  {keysLoading ? (
                    <div className="flex items-center gap-2 text-wiz-muted text-xs px-5 py-4">
                      <Loader2 size={13} className="animate-spin" />
                      Fetching runner public key…
                    </div>
                  ) : keysError ? (
                    <p className="text-xs text-sig-red px-5 py-4">{keysError}</p>
                  ) : (
                    <>
                      {/* Option A row */}
                      <RowField
                        label="Add Manually"
                        sublabel="Copy key"
                        name="optionA"
                        hint={<>Append to <span className="font-mono text-wiz-cream/70">~/.ssh/authorized_keys</span> on the target server under the <span className="font-mono text-wiz-cream/70">{form.sshUser || 'SSH user'}</span> account.</>}
                      >
                        <div className="flex flex-col gap-2">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={handleCopyKey}
                              disabled={!envKey}
                              className={clsx(
                                'inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-md',
                                'border transition-all duration-150 disabled:opacity-40',
                                copiedKey
                                  ? 'border-sig-green/40 bg-sig-green-dim text-sig-green'
                                  : 'border-wiz-border bg-wiz-raised text-wiz-gray hover:text-wiz-cream hover:border-wiz-border/60',
                              )}
                            >
                              {copiedKey ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy Key</>}
                            </button>
                          </div>
                          <div className="bg-wiz-bg border border-wiz-border rounded px-4 py-3 font-mono text-xs text-wiz-gray break-all leading-relaxed select-all">
                            {envKey || <span className="text-wiz-muted italic">Key not available for {form.environment}</span>}
                          </div>
                        </div>
                      </RowField>

                      {/* Option B row — plain div to avoid label/click issues */}
                      <div className="flex items-start gap-4 px-5 py-4">
                        <div className="flex flex-col gap-0.5 w-36 flex-shrink-0 pt-0.5">
                          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">Setup Script</span>
                          <span className="text-xs text-wiz-muted/50">Run on server</span>
                        </div>
                        <div className="flex flex-col gap-2 flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-sig-green/80">Recommended</span>
                            <button
                              type="button"
                              onClick={handleCopyScript}
                              disabled={!envKey}
                              className={clsx(
                                'inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-md flex-shrink-0',
                                'border transition-all duration-150 disabled:opacity-40',
                                copiedScript
                                  ? 'border-sig-green/40 bg-sig-green-dim text-sig-green'
                                  : 'border-wiz-border bg-wiz-raised text-wiz-gray hover:text-wiz-cream hover:border-wiz-border/60',
                              )}
                            >
                              {copiedScript ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy Script</>}
                            </button>
                          </div>
                          <div className="bg-wiz-bg border border-wiz-border rounded px-4 py-3 overflow-x-auto">
                            <pre className="font-mono text-xs text-wiz-gray leading-6 whitespace-pre m-0 select-all">{setupScript}</pre>
                          </div>
                          <p className="text-xs text-wiz-muted/50 leading-relaxed">
                            SSH into the server as the <span className="font-mono text-wiz-cream/60">{form.sshUser || 'SSH user'}</span> and run this script — it creates <span className="font-mono text-wiz-cream/60">.ssh</span> and appends the key to <span className="font-mono text-wiz-cream/60">authorized_keys</span> automatically.
                          </p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>{/* ── end SSH KEYS CONFIGURATION PANEL ── */}

              {/* ── VERIFY CONNECTION (panel 4 — green, rotation restart) ──
                  Default green theme; flips to red on test failure. */}
              <div className={clsx(
                'rounded border border-wiz-border border-l-2 bg-wiz-surface overflow-hidden transition-all duration-300',
                testConnState === 'fail' ? 'border-l-sig-red/50' : 'border-l-sig-green/50',
              )}>
                <div className={clsx(
                  'flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 transition-colors duration-300',
                  testConnState === 'fail' ? 'bg-sig-red-dim' : 'bg-sig-green-dim',
                )}>
                  <span className={clsx(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors duration-300',
                    testConnState === 'fail' ? 'bg-sig-red/70' : 'bg-sig-green/70',
                  )} />
                  <h3 className={clsx(
                    'font-mono font-semibold text-xs uppercase tracking-widest transition-colors duration-300',
                    testConnState === 'fail' ? 'text-sig-red' : 'text-sig-green',
                  )}>
                    Verify Connection
                  </h3>
                </div>

                {/* Panel body */}
                <div className="px-5 py-4 flex flex-col gap-4">

                  {/* Pre-flight checklist — precise failure targeting via SSH error diagnosis */}
                  {(() => {
                    const runnerDown    = testConnMsg === 'runner-unreachable'
                    // Only diagnose SSH failure when the runner itself is reachable — otherwise
                    // the SSH error is N/A (we never got to attempt it).
                    const failTarget    = (runnerReachable === false || runnerDown)
                                           ? 'both'
                                           : diagnoseSshFailure(testConnMsg)
                    const credsFilled   = !!(form.sshUser && form.sshHost && form.sshPort)
                    const items = [
                      {
                        label:    'Runner service reachable',
                        detail:   runnerPublicIp || '54.144.235.55',
                        isOk:     runnerReachable === true,
                        isFailed: runnerReachable === false,
                      },
                      {
                        label:    'SSH credentials entered',
                        detail:   form.sshUser && form.sshHost ? `${form.sshUser}@${form.sshHost}` : null,
                        isOk:     testConnState === 'ok' || credsFilled,
                        isFailed: false, // never mark X — we can confirm credentials directly
                      },
                      {
                        label:    'Port 22 open for runner IP',
                        detail:   runnerPublicIp || '54.144.235.55',
                        // Green when test passed OR when error is auth-only (port IS reachable — Permission denied proves TCP connected)
                        isOk:     testConnState === 'ok' || (runnerReachable === true && testConnState === 'fail' && failTarget === 'key'),
                        // Red only when error is explicitly a firewall/connectivity issue
                        isFailed: runnerReachable === true && testConnState === 'fail' && (failTarget === 'firewall' || failTarget === 'both'),
                      },
                      {
                        label:    'Runner key added to ~/.ssh/authorized_keys',
                        detail:   null,
                        isOk:     testConnState === 'ok',
                        // Only show X on key if runner is up and it's an auth error
                        isFailed: runnerReachable === true && testConnState === 'fail' && (failTarget === 'key' || failTarget === 'both'),
                      },
                    ]
                    return (
                      <div className="flex flex-col gap-2">
                        {items.map(({ label, detail, isOk, isFailed }) => (
                          <div key={label} className="flex items-center gap-2.5 text-xs">
                            {isOk
                              ? <Check size={13} className="text-sig-green flex-shrink-0" strokeWidth={2.5} />
                              : isFailed
                              ? <X     size={13} className="text-sig-red/70 flex-shrink-0" strokeWidth={2.5} />
                              : <span className="w-3.5 h-3.5 rounded-full border-2 border-wiz-border/60 flex-shrink-0" />
                            }
                            <span className={clsx('transition-colors duration-200',
                              isOk     ? 'text-wiz-cream/70' :
                              isFailed ? 'text-sig-red/70'   : 'text-wiz-muted/60',
                            )}>
                              {label}
                              {detail && <span className="font-mono ml-1 opacity-60">({detail})</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Divider */}
                  <div className="border-t border-wiz-border/40" />

                  {/* Test button + result — PROMOTED to primary action.
                      The single most important button on Step 1: filled crimson
                      (brand primary), bold + prominent, pulses when ready, and
                      flips to solid green / solid red on result. */}
                  <div className="flex flex-col gap-2.5">
                    {(() => {
                      const ready = !!form.sshUser && !!form.sshHost && !!form.sshPort
                      const showPulse = ready && testConnState !== 'ok' && testConnState !== 'fail' && testConnState !== 'testing'

                      return (
                        <button
                          type="button"
                          onClick={() => void handleTestConnection()}
                          disabled={!ready || testConnState === 'testing'}
                          className={clsx(
                            'group relative inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-bold text-white w-fit overflow-visible',
                            'transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed',
                            !((!ready) || testConnState === 'testing') && 'hover:scale-[1.03] active:scale-95',
                            testConnState === 'ok'      && 'bg-sig-green hover:bg-sig-green/90' ,
                            testConnState === 'fail'    && 'bg-sig-red hover:bg-sig-red/90' ,
                            testConnState === 'testing' && 'bg-sig-blue/90 cursor-wait' ,
                            testConnState !== 'ok' && testConnState !== 'fail' && testConnState !== 'testing' && 'bg-wiz-gold hover:bg-wiz-gold-light' ,
                          )}
                          style={{
                            boxShadow:
                              testConnState === 'ok'      ? '0 4px 14px rgba(22,163,74,0.38), 0 1px 3px rgba(22,163,74,0.22), inset 0 1px 0 rgba(255,255,255,0.18)' :
                              testConnState === 'fail'    ? '0 4px 14px rgba(220,38,38,0.38), 0 1px 3px rgba(220,38,38,0.22), inset 0 1px 0 rgba(255,255,255,0.18)' :
                              testConnState === 'testing' ? '0 4px 12px rgba(37,99,235,0.28), 0 1px 3px rgba(37,99,235,0.18), inset 0 1px 0 rgba(255,255,255,0.15)' :
                                                            '0 4px 14px rgba(139,26,26,0.36), 0 1px 3px rgba(139,26,26,0.22), inset 0 1px 0 rgba(255,255,255,0.18)',
                          }}
                        >
                          {/* Pulse ring — only when form is ready and test hasn't run.
                              Calls attention to "do this next". */}
                          {showPulse && (
                            <span
                              className="absolute inset-0 rounded-md bg-wiz-gold/40 animate-ping pointer-events-none"
                              style={{ animationDuration: '2.2s' }}
                              aria-hidden
                            />
                          )}

                          <span className="relative flex items-center gap-2">
                            {testConnState === 'testing'
                              ? <><Loader2 size={14} strokeWidth={2.5} className="animate-spin" /> Testing connection…</>
                              : testConnState === 'ok'
                              ? <><Wifi    size={14} strokeWidth={2.5} /> Connection OK</>
                              : testConnState === 'fail'
                              ? <><WifiOff size={14} strokeWidth={2.5} /> Retry test</>
                              : <><Wifi    size={14} strokeWidth={2.5} /> Test Connection</>
                            }
                          </span>
                        </button>
                      )
                    })()}

                    <p className="text-xs text-wiz-muted/60 leading-relaxed">
                      {testConnState === 'ok'
                        ? <span className="text-sig-green font-medium">✓ Runner can reach the server successfully — ready to continue.</span>
                        : testConnState === 'fail'
                        ? <span className="text-sig-red">
                            {testConnMsg === 'runner-unreachable'
                              ? 'Cannot reach the WizardCD runner service. Check that it is running and port 8081 is accessible.'
                              : testConnMsg}
                          </span>
                        : 'Verifies the runner can SSH into your target server using the credentials, firewall rule, and key above.'
                      }
                    </p>
                  </div>

                </div>
              </div>{/* ── end VERIFY CONNECTION PANEL ── */}

            </div>
          </>
        )}

        {/* ─── Step 2: Application ─────────────────────────── */}
        {step === 2 && (
          <>
            <div className="flex flex-col gap-5">
              <StepErrorBanner errors={errors} />

              {/* ── APPLICATION PANEL (panel 1 — green theme) ── */}
              <div id="app-panel" className="rounded border border-wiz-border border-l-2 border-l-sig-green/50 bg-wiz-surface overflow-hidden">

                {/* Header — always shown */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-green-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-sig-green/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-green">
                    Application
                  </h3>
                  {loadedConfig && (
                    <ConfigSourceBadge
                      appName={loadedConfig.appName}
                      envName={loadedConfig.envName}
                      overriddenCount={overriddenFields.length}
                    />
                  )}
                </div>

                {!form.jarArtifact ? (
                  /* ── No JAR yet: row layout upload ── */
                  <div className="divide-y divide-wiz-border/30">
                    <RowField
                      label="JAR Artifact"
                      sublabel="Required"
                      name="jar-artifact-file"
                      required
                      hint="WizardCD reads the manifest to auto-fill app name and entry point."
                      error={errors.jarArtifact}
                    >
                      <CompactUploadZone
                        accept=".jar"
                        inputId="jar-artifact-file"
                        onChange={(f) => void handleJarArtifact(f)}
                        error={errors.jarArtifact}
                      />
                    </RowField>
                  </div>
                ) : (
                  /* ── JAR uploaded: success banner + revealed fields ── */
                  <div className="animate-fade-in flex flex-col">

                    {/* Success banner */}
                    <div className="flex items-center justify-between gap-2 px-5 py-3.5 bg-sig-green-dim/15 border-b border-sig-green/20">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Check size={13} className="text-sig-green flex-shrink-0" strokeWidth={2.5} />
                        <span className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-green flex-shrink-0">
                          JAR Uploaded
                        </span>
                        <span className="font-mono text-xs text-wiz-muted/70 truncate">
                          {form.jarArtifact.name}
                        </span>
                        <span className="text-wiz-muted/30 flex-shrink-0">·</span>
                        <span className="font-mono text-xs text-wiz-muted/50 flex-shrink-0">
                          {(form.jarArtifact.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                        {manifestParsing && (
                          <span className="flex items-center gap-1 text-xs text-wiz-muted animate-fade-in flex-shrink-0">
                            <Loader2 size={11} className="animate-spin" />
                            Reading manifest…
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          set('jarArtifact', null)
                          set('jarName', '')
                          set('appName', '')
                          set('mainClass', '')
                        }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border border-sig-blue/40 bg-sig-blue-dim/40 text-sig-blue hover:bg-sig-blue-dim hover:border-sig-blue/60 transition-all duration-150 flex-shrink-0"
                      >
                        <Upload size={11} />
                        Replace
                      </button>
                    </div>

                    {/* Revealed fields */}
                    <div className="divide-y divide-wiz-border/30">
                      <RowInput
                        label="App Name"
                        sublabel="Service identifier"
                        name="appName"
                        required
                        placeholder="my-service"
                        hint={autoFilledFields.has('appName')
                          ? '✓ Read from JAR manifest — rename only if the deployment folder name on the server should differ.'
                          : 'Used for the deployment directory and process name on the server — e.g. my-service creates /deployments/my-service/'}
                        value={form.appName}
                        onChange={(e) => set('appName', e.target.value)}
                        error={errors.appName}
                      />
                      <RowInput
                        label="JAR File"
                        sublabel="Artifact filename"
                        name="jarName"
                        required
                        placeholder="my-service.jar"
                        hint="✓ Auto-filled from your upload — only change this if your start scripts expect a fixed name like app.jar"
                        value={form.jarName}
                        onChange={(e) => set('jarName', e.target.value)}
                        error={errors.jarName}
                      />
                      <RowInput
                        label="Entry Point"
                        sublabel="Main class"
                        name="mainClass"
                        required
                        placeholder="com.example.MyApp"
                        hint={autoFilledFields.has('mainClass')
                          ? '✓ Read from JAR manifest — the class the JVM calls to start your application.'
                          : 'Fully qualified main class — e.g. com.example.MyServiceApplication'}
                        value={form.mainClass}
                        onChange={(e) => set('mainClass', e.target.value)}
                        error={errors.mainClass}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* ── THIN JAR: Dependencies (shown inline when detected) ── */}
              {form.jarArtifact && form.jarType === 'thin' && (
                form.libZip ? (
                  /* ── Uploaded: success state ── */
                  <div className="animate-fade-in rounded border border-sig-green/40 border-l-2 border-l-sig-green/60 bg-sig-green-dim overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <Check size={13} className="text-sig-green flex-shrink-0" strokeWidth={2.5} />
                        <span className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-green">
                          Dependencies Uploaded
                        </span>
                        <span className="font-mono text-xs text-wiz-muted/70 truncate max-w-[240px]">
                          {form.libZip.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => set('libZip', null)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border border-sig-blue/40 bg-sig-blue-dim/40 text-sig-blue hover:bg-sig-blue-dim hover:border-sig-blue/60 transition-all duration-150 flex-shrink-0"
                      >
                        <Upload size={11} />
                        Replace
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── Not yet uploaded: warning state ── */
                  <div className="animate-fade-in rounded border border-sig-yellow/40 border-l-2 border-l-sig-yellow/60 bg-sig-yellow-dim overflow-hidden">
                    <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-sig-yellow/20 bg-sig-yellow-dim/30">
                      <AlertTriangle size={13} className="text-sig-yellow opacity-80 flex-shrink-0" />
                      <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-yellow">
                        Dependencies Required
                        <span className="ml-1.5 text-sig-red/70 normal-case tracking-normal font-normal">· Required for Thin JAR</span>
                      </h3>
                    </div>
                    <div className="divide-y divide-wiz-border/30">
                      <RowField
                        label="Lib ZIP"
                        sublabel="Dependencies"
                        name="lib-zip-file"
                        required
                        hint={<>JAR files must be at the <span className="font-semibold text-wiz-gray">root</span> of the ZIP — not inside a <span className="font-mono">lib/</span> subfolder.</>}
                        error={errors.libZip}
                      >
                        <CompactUploadZone
                          accept=".zip"
                          inputId="lib-zip-file"
                          onChange={(f) => set('libZip', f)}
                          error={errors.libZip}
                        />
                      </RowField>
                    </div>
                  </div>
                )
              )}


              {/* ── RUNTIME PANEL (panel 2 — blue theme) ── */}
              <div className="rounded border border-wiz-border border-l-2 border-l-sig-blue/50 bg-wiz-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-blue-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-sig-blue/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-blue">
                    Runtime
                  </h3>
                  <span className="ml-1 text-xs text-wiz-muted/50 font-normal normal-case tracking-normal">· process, port and deploy path</span>
                </div>

                <div className="divide-y divide-wiz-border/30">
                  <RowInput
                    label="Run As"
                    sublabel="Linux user on server"
                    name="runAsUser"
                    required
                    placeholder="e.g. deploy"
                    hint="The Linux user that owns the process. Must exist on the target server and have write access to the deployment directory."
                    value={form.runAsUser}
                    onChange={(e) => set('runAsUser', e.target.value)}
                    error={errors.runAsUser}
                  />
                  {(() => {
                    const detectedProfile = portDetection?.profile?.toLowerCase() ?? null
                    const deployEnv       = form.environment?.toLowerCase() ?? null
                    const profileMismatch = autoFilledFields.has('serverPort') && detectedProfile && deployEnv && detectedProfile !== deployEnv && !portMismatchDismissed
                    return (
                      <RowField
                        label="Port"
                        sublabel="Application HTTP port"
                        name="serverPort"
                        required
                        error={errors.serverPort}
                        hint={profileMismatch ? undefined : autoFilledFields.has('serverPort')
                          ? <>✓ Read from <span className="font-mono">{portDetection?.source ?? 'JAR config'}</span>{portDetection?.profile ? <> (profile: <span className="font-mono">{portDetection.profile}</span>)</> : ''} — change only if deploying on a different port.</>
                          : <>Must match <span className="font-mono">server.port</span> in your application config. WizardCD checks this port to confirm the app started successfully.</>
                        }
                      >
                        <input
                          id="serverPort"
                          name="serverPort"
                          type="number"
                          required
                          placeholder="e.g. 8080"
                          className={clsx('wiz-input', errors.serverPort && 'wiz-input-error')}
                          value={form.serverPort}
                          onChange={(e) => set('serverPort', e.target.value)}
                        />
                        {/* Profile mismatch warning card */}
                        {profileMismatch && (
                          <div className="rounded border border-sig-yellow/35 bg-sig-yellow-dim overflow-hidden">
                            {/* Card header */}
                            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-sig-yellow/20 bg-sig-yellow-dim">
                              <AlertTriangle size={13} className="text-sig-yellow flex-shrink-0" />
                              <span className="text-xs font-semibold text-sig-yellow">Profile mismatch detected</span>
                              <span className="ml-auto flex items-center gap-1.5 font-mono text-2xs">
                                <span className="px-1.5 py-0.5 rounded bg-sig-yellow/15 border border-sig-yellow/25 text-sig-yellow/80">{detectedProfile}</span>
                                <span className="text-wiz-muted/40">→</span>
                                <span className="px-1.5 py-0.5 rounded bg-wiz-raised border border-wiz-border text-wiz-muted/70">{deployEnv}</span>
                              </span>
                            </div>
                            {/* Card body */}
                            <div className="px-3.5 py-3 flex flex-col gap-3 text-xs">
                              <p className="text-wiz-muted/80 leading-relaxed">
                                Port <span className="font-mono font-medium text-wiz-cream">{form.serverPort}</span> was read from{' '}
                                <span className="font-mono text-wiz-cream/70">{portDetection?.source ?? 'JAR config'}</span>{' '}
                                (<span className="font-mono text-sig-yellow/80">{detectedProfile}</span> profile).
                                Each environment has a dedicated SSH key — the wrong profile means the wrong key, and potentially the wrong server.
                              </p>
                              {/* Two paths — both fully clickable */}
                              <div className="flex flex-col gap-2">
                                {/* Option A: dismiss and proceed */}
                                <button
                                  type="button"
                                  onClick={() => setPortMismatchDismissed(true)}
                                  className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border border-sig-green/20 bg-sig-green-dim hover:bg-sig-green-dim hover:border-sig-green/35 transition-all duration-150 text-left group"
                                >
                                  <Check size={12} className="text-sig-green flex-shrink-0 mt-0.5" strokeWidth={2.5} />
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-medium text-wiz-cream/80 group-hover:text-wiz-cream transition-colors duration-150">
                                      Continuing with {form.environment} — dismiss this warning
                                    </span>
                                    <span className="text-wiz-muted/70">
                                      Confirm port matches <span className="font-mono">server.port</span> in <span className="font-mono">application-{deployEnv}.yml</span>
                                    </span>
                                  </div>
                                </button>
                                {/* Option B: navigate to Step 1 */}
                                <button
                                  type="button"
                                  onClick={() => { setStep(1); setTimeout(() => document.getElementById('ssh-target-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }}
                                  className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border border-wiz-gold/20 bg-wiz-gold/5 hover:bg-wiz-gold/10 hover:border-wiz-gold/40 transition-all duration-150 text-left group"
                                >
                                  <ArrowLeft size={12} className="text-wiz-gold/70 group-hover:text-wiz-gold flex-shrink-0 mt-0.5 transition-colors duration-150" />
                                  <div className="flex flex-col gap-0.5">
                                    <span className="font-medium text-wiz-cream/80 group-hover:text-wiz-cream transition-colors duration-150">
                                      Meant to deploy {detectedProfile?.toUpperCase()} — go to Step 1
                                    </span>
                                    <span className="text-wiz-muted/70">
                                      Change env, copy the <span className="font-mono">{detectedProfile?.toUpperCase()}</span> SSH key, then re-test the connection.
                                    </span>
                                  </div>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </RowField>
                    )
                  })()}
                  <RowInput
                    label="Deploy Path"
                    sublabel="Base path on server"
                    name="targetBasePath"
                    required
                    placeholder="/app/home/deploy/deployments"
                    hint={<>Root directory on the target server where applications are deployed. App lands at <span className="font-mono">{form.targetBasePath.trim() || '<path>'}/{form.appName.trim() || '<appName>'}/</span></>}
                    value={form.targetBasePath}
                    onChange={(e) => set('targetBasePath', e.target.value)}
                    onBlur={handleCheckDeployPath}
                    error={errors.targetBasePath}
                  />

                  {/* Deploy-path preflight status panel */}
                  <DeployPathStatusPanel
                    state={pathCheckState}
                    result={pathCheckResult}
                    canCheck={
                      !!form.targetBasePath.trim() && !!form.runAsUser.trim() &&
                      !!form.sshUser.trim() && !!form.sshHost.trim() && !!form.sshPort.trim()
                    }
                    onRecheck={handleCheckDeployPath}
                    copiedIdx={pathCopiedIdx}
                    onCopy={(idx, text) => {
                      void navigator.clipboard.writeText(text)
                      setPathCopiedIdx(idx)
                      setTimeout(() => setPathCopiedIdx(null), 1800)
                    }}
                  />

                  {/* Live summary */}
                  {form.runAsUser && form.serverPort && (
                    <div className="animate-fade-in flex items-center gap-3 px-5 py-3 bg-wiz-raised/20">
                      <Check size={12} className="text-wiz-gold/60 flex-shrink-0" />
                      <span className="font-mono text-xs text-wiz-muted/60">
                        Process will run as{' '}
                        <span className="text-wiz-cream">{form.runAsUser}</span>
                        {' '}on port{' '}
                        <span className="text-wiz-cream">{form.serverPort}</span>
                        {form.targetBasePath && (
                          <>{' '}at <span className="text-wiz-cream">{form.targetBasePath}/{form.appName || '<app>'}</span></>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── JAVA INSTALLATION PANEL ── */}
              <div className="rounded border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-surface overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center justify-between gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-gold-dim">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                    <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                      Java Installation
                    </h3>
                    {detectedJavas !== null && (
                      <span className={clsx(
                        'font-mono text-2xs px-2 py-0.5 rounded-full border',
                        detectedJavas.length > 0
                          ? 'bg-sig-green-dim/30 border-sig-green/30 text-sig-green'
                          : 'bg-sig-yellow-dim/30 border-sig-yellow/30 text-sig-yellow',
                      )}>
                        {detectedJavas.length > 0 ? `${detectedJavas.length} found` : 'None found'}
                      </span>
                    )}
                  </div>
                  {/* Detect / re-detect / reset controls */}
                  <div className="flex items-center gap-3">
                    {detectedJavas !== null ? (
                      <>
                        {form.sshHost && form.sshUser && form.sshPort && (
                          <button
                            type="button"
                            disabled={javaDetecting}
                            onClick={() => void runJavaDetect()}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border border-sig-blue/40 bg-sig-blue-dim/40 text-sig-blue hover:bg-sig-blue-dim hover:border-sig-blue/60 transition-all duration-150 disabled:opacity-40"
                          >
                            {javaDetecting
                              ? <><Loader2 size={11} className="animate-spin" /> Scanning…</>
                              : <><Upload size={11} /> Re-detect</>
                            }
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setDetectedJavas(null); setJavaAutoMatched(null); setShowAllJavas(false); set('javaCommand', ''); set('javaVersion', '') }}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border border-wiz-gold/40 bg-wiz-gold/10 text-wiz-gold hover:bg-wiz-gold/20 hover:border-wiz-gold/60 transition-all duration-150"
                        >
                          <X size={11} /> Reset
                        </button>
                      </>
                    ) : javaDetecting ? (
                      <span className="flex items-center gap-1.5 text-xs text-wiz-muted">
                        <Loader2 size={11} className="animate-spin" />
                        Scanning {form.sshHost}…
                      </span>
                    ) : jarJavaVersion !== null ? (
                      /* Body has the check action — nothing needed in header */
                      null
                    ) : form.sshHost && form.sshUser && form.sshPort ? (
                      <button
                        type="button"
                        onClick={() => void runJavaDetect()}
                        className="flex items-center gap-1.5 text-xs font-medium text-wiz-gold/80 hover:text-wiz-gold border border-wiz-gold/30 hover:border-wiz-gold/50 rounded-md px-2.5 py-1 transition-colors duration-150"
                      >
                        Detect from {form.sshUser}@{form.sshHost}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setStep(1)
                          setTimeout(() => {
                            document.getElementById('ssh-target-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }, 50)
                        }}
                        className="flex items-center gap-1.5 text-xs font-medium text-sig-yellow/90 border border-sig-yellow/40 rounded-md px-3 py-1.5 bg-sig-yellow-dim hover:bg-sig-yellow-dim/40 hover:border-sig-yellow/60 hover:text-sig-yellow transition-all duration-150"
                      >
                        <ArrowLeft size={11} className="flex-shrink-0" />
                        SSH not configured — go to Step 1
                      </button>
                    )}
                  </div>
                </div>

                {/* Panel body */}
                <div className="divide-y divide-wiz-border/30">

                  {/* Pre-detect: JAR version known — unified action card */}
                  {detectedJavas === null && jarJavaVersion !== null && (
                    <div className="animate-fade-in px-5 py-4 flex flex-col gap-3">

                      {/* Blue info row — always visible once JAR version is known */}
                      <div className="flex items-center gap-3 px-4 py-3.5 rounded border border-wiz-gold/25 bg-wiz-gold-dim">
                        <div className="flex-shrink-0 w-8 h-8 rounded bg-wiz-gold/10 border border-wiz-gold/20 flex items-center justify-center">
                          <Info size={14} className="text-wiz-gold" />
                        </div>
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <span className="text-xs font-semibold text-wiz-gold">JAR requires Java {jarJavaVersion}</span>
                          <span className="text-2xs text-wiz-muted/70">Detected from bytecode — scan server to auto-fill path</span>
                        </div>
                        {/* Inline action when SSH is ready */}
                        {javaDetecting ? (
                          <div className="flex items-center gap-1.5 text-xs text-wiz-gold/80 flex-shrink-0">
                            <Loader2 size={12} className="animate-spin" />
                            Scanning…
                          </div>
                        ) : (form.sshHost && form.sshUser && form.sshPort) ? (
                          <button
                            type="button"
                            onClick={() => void runJavaDetect()}
                            className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md border border-wiz-gold/40 bg-wiz-gold/15 text-wiz-gold hover:bg-wiz-gold/25 hover:border-wiz-gold/60 transition-all duration-150"
                          >
                            <Search size={12} />
                            Scan for Java {jarJavaVersion}
                          </button>
                        ) : null}
                      </div>

                      {/* Amber prompt — only when SSH not yet configured */}
                      {!(form.sshHost && form.sshUser && form.sshPort) && (
                        <button
                          type="button"
                          onClick={() => {
                            setStep(1)
                            setTimeout(() => {
                              document.getElementById('ssh-target-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            }, 50)
                          }}
                          className="flex items-center gap-3 px-4 py-3 rounded border border-sig-yellow/30 bg-sig-yellow-dim hover:bg-sig-yellow-dim hover:border-sig-yellow/50 transition-all duration-150 text-left w-full group"
                        >
                          <div className="flex-shrink-0 w-7 h-7 rounded-md bg-sig-yellow/10 group-hover:bg-sig-yellow/20 border border-sig-yellow/20 group-hover:border-sig-yellow/40 flex items-center justify-center transition-all duration-150">
                            <ArrowLeft size={13} className="text-sig-yellow/70 group-hover:text-sig-yellow transition-colors duration-150" />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-semibold text-sig-yellow/80 group-hover:text-sig-yellow transition-colors duration-150">
                              SSH not configured — go to Step 1
                            </span>
                            <span className="text-2xs text-wiz-muted/60 group-hover:text-wiz-muted/80 transition-colors duration-150">
                              Fill in SSH Target Configuration to enable Java detection.
                            </span>
                          </div>
                        </button>
                      )}

                    </div>
                  )}

                  {/* Post-detect: no Java found at all */}
                  {detectedJavas !== null && detectedJavas.length === 0 && (
                    <div className="animate-fade-in px-5 py-4">
                      <div className="flex items-start gap-2.5 px-4 py-3 rounded bg-sig-yellow-dim border border-sig-yellow/20 text-xs">
                        <AlertTriangle size={13} className="text-sig-yellow flex-shrink-0 mt-0.5" />
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-sig-yellow">No Java found on target server</span>
                          <span className="text-wiz-muted">
                            No Java installation detected at standard paths on{' '}
                            <span className="font-mono text-wiz-cream">{form.sshHost}</span>.
                            Install a JDK first, then re-detect.
                          </span>
                          <pre className="mt-1 font-mono text-wiz-muted/70 text-2xs leading-5">
                            {'# Install Temurin 21 on Ubuntu/Debian:\napt install temurin-21-jdk'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Post-detect: installations found */}
                  {detectedJavas !== null && detectedJavas.length > 0 && (
                    <div className="animate-fade-in flex flex-col gap-3 px-5 py-4">

                      {/* ── Matched: compact success + collapsible list ── */}
                      {javaAutoMatched === true && (
                        <>
                          <div className="flex items-center gap-3 px-4 py-3 rounded bg-sig-green-dim border border-sig-green/30">
                            <div className="flex-shrink-0 w-7 h-7 rounded-md bg-sig-green/15 border border-sig-green/25 flex items-center justify-center">
                              <Check size={13} className="text-sig-green" strokeWidth={2.5} />
                            </div>
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-xs font-semibold text-sig-green">Java {jarJavaVersion} found on server</span>
                              <span className="text-2xs text-wiz-muted/70">Path and version filled below — edit only if needed</span>
                            </div>
                          </div>
                          {/* Collapsible: other installations on this server */}
                          <button
                            type="button"
                            onClick={() => setShowAllJavas((v) => !v)}
                            className="flex items-center gap-2 w-full px-1 py-1 group transition-colors duration-150"
                          >
                            <ChevronDown
                              size={12}
                              className={clsx('flex-shrink-0 text-wiz-muted/50 group-hover:text-wiz-muted/80 transition-all duration-200', showAllJavas && 'rotate-180')}
                            />
                            <span className="text-xs text-wiz-muted/60 group-hover:text-wiz-cream/70 transition-colors duration-150">
                              {showAllJavas
                                ? 'Hide other installations'
                                : `${detectedJavas.length - 1} other installation${detectedJavas.length - 1 !== 1 ? 's' : ''} available`
                              }
                            </span>
                            <div className="flex-1 h-px bg-wiz-border/20" />
                          </button>
                          {showAllJavas && (
                            <div className="flex flex-col gap-2">
                              {detectedJavas.map((javaPath) => {
                                const ver      = inferJavaVersion(javaPath)
                                const label    = inferJavaLabel(javaPath)
                                const selected = form.javaCommand === javaPath
                                return (
                                  <button
                                    key={javaPath}
                                    type="button"
                                    onClick={() => { set('javaCommand', javaPath); set('javaVersion', ver !== null ? String(ver) : '') }}
                                    className={clsx(
                                      'flex items-center justify-between gap-3 px-4 py-3 rounded border text-left transition-all duration-150',
                                      selected
                                        ? 'border-sig-green/50 bg-sig-green-dim'
                                        : 'border-wiz-border hover:border-wiz-border-mid bg-wiz-bg hover:bg-wiz-raised/30',
                                    )}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      {selected
                                        ? <Check size={13} className="text-sig-green flex-shrink-0" strokeWidth={2.5} />
                                        : <span className="w-3.5 h-3.5 rounded-full border-2 border-wiz-border flex-shrink-0" />
                                      }
                                      <div className="flex flex-col gap-0.5 min-w-0">
                                        <span className="font-mono text-xs text-wiz-cream truncate">{label}</span>
                                        <span className="font-mono text-2xs text-wiz-muted/60 truncate">{javaPath}</span>
                                      </div>
                                    </div>
                                    {ver !== null && (
                                      <span className={clsx(
                                        'font-mono text-2xs px-2 py-0.5 rounded-full border flex-shrink-0',
                                        selected
                                          ? 'bg-sig-green-dim/30 border-sig-green/30 text-sig-green'
                                          : 'bg-wiz-raised border-wiz-border text-wiz-muted',
                                      )}>
                                        Java {ver}
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}

                      {/* ── Not matched or no JAR version: full tile list ── */}
                      {javaAutoMatched !== true && (
                        <>
                          {javaAutoMatched === false && jarJavaVersion && (
                            <div className="flex items-start gap-2.5 px-4 py-3 rounded bg-sig-yellow-dim border border-sig-yellow/30 text-xs">
                              <AlertTriangle size={13} className="text-sig-yellow flex-shrink-0 mt-0.5" />
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-sig-yellow">Java {jarJavaVersion} not found — select the closest version</span>
                                <span className="text-wiz-muted">
                                  Your JAR was built with Java {jarJavaVersion} but it wasn't detected on{' '}
                                  <span className="font-mono text-wiz-cream">{form.sshHost}</span>.
                                  Select a compatible version below or install Java {jarJavaVersion}.
                                </span>
                              </div>
                            </div>
                          )}
                          {javaAutoMatched === null && (
                            <p className="text-xs text-wiz-muted leading-relaxed">
                              Select the Java installation to use on{' '}
                              <span className="font-mono text-wiz-cream">{form.sshHost}</span>:
                            </p>
                          )}
                          <div className="flex flex-col gap-2">
                            {detectedJavas.map((javaPath) => {
                              const ver      = inferJavaVersion(javaPath)
                              const label    = inferJavaLabel(javaPath)
                              const selected = form.javaCommand === javaPath
                              return (
                                <button
                                  key={javaPath}
                                  type="button"
                                  onClick={() => { set('javaCommand', javaPath); set('javaVersion', ver !== null ? String(ver) : '') }}
                                  className={clsx(
                                    'flex items-center justify-between gap-3 px-4 py-3 rounded border text-left transition-all duration-150',
                                    selected
                                      ? 'border-sig-green/50 bg-sig-green-dim'
                                      : 'border-wiz-border hover:border-wiz-border-mid bg-wiz-bg hover:bg-wiz-raised/30',
                                  )}
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {selected
                                      ? <Check size={13} className="text-sig-green flex-shrink-0" strokeWidth={2.5} />
                                      : <span className="w-3.5 h-3.5 rounded-full border-2 border-wiz-border flex-shrink-0" />
                                    }
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                      <span className="font-mono text-xs text-wiz-cream truncate">{label}</span>
                                      <span className="font-mono text-2xs text-wiz-muted/60 truncate">{javaPath}</span>
                                    </div>
                                  </div>
                                  {ver !== null && (
                                    <span className={clsx(
                                      'font-mono text-2xs px-2 py-0.5 rounded-full border flex-shrink-0',
                                      selected
                                        ? 'bg-sig-green-dim/30 border-sig-green/30 text-sig-green'
                                        : 'bg-wiz-raised border-wiz-border text-wiz-muted',
                                    )}>
                                      Java {ver}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )}

                    </div>
                  )}

                  {/* Always visible: Java path + version inputs */}
                  <RowInput
                    label="Java Path"
                    sublabel={javaAutoMatched === true ? 'Override if needed' : 'Binary on server'}
                    name="javaCommand"
                    placeholder={jarJavaVersion ? `/usr/lib/jvm/temurin-${jarJavaVersion}/bin/java` : '/usr/lib/jvm/temurin-21/bin/java'}
                    hint={javaAutoMatched === true
                      ? 'Auto-filled from server scan. Edit only if you need a different path.'
                      : detectedJavas !== null && detectedJavas.length > 0
                        ? 'Select an installation above or type a path manually.'
                        : 'Absolute path to the Java binary on the target server.'}
                    value={form.javaCommand}
                    onChange={(e) => set('javaCommand', e.target.value)}
                    error={errors.javaCommand}
                  />
                  <RowInput
                    label="Java Version"
                    sublabel="Major version"
                    name="javaVersion"
                    type="number"
                    placeholder={jarJavaVersion ?? '21'}
                    hint={jarJavaVersion
                      ? `JAR requires Java ${jarJavaVersion} — confirmed from bytecode.`
                      : 'Java major version number — e.g. 25, 21, 17, 11.'}
                    value={form.javaVersion}
                    onChange={(e) => set('javaVersion', e.target.value)}
                    error={errors.javaVersion}
                  />

                </div>
              </div>{/* ── end JAVA INSTALLATION PANEL ── */}

            </div>
          </>
        )}

        {/* ─── Step 3: Deployment Options ─────────────────────── */}
        {step === 3 && (
          <>
            <div className="flex flex-col gap-5">
              <StepErrorBanner errors={errors} />


              {/* ── BACKUP PANEL ── */}
              <div id="backup-panel" className="rounded border border-wiz-border border-l-2 border-l-sig-green/50 bg-wiz-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-green-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-sig-green/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-green">
                    Backup
                  </h3>
                </div>
                <div className="divide-y divide-wiz-border/30">

                  {/* Enable backup row */}
                  <RowField
                    label="Backup"
                    sublabel="Pre-deployment"
                    name="performBackup"
                    hint="Creates a timestamped archive of the current deployment before overwriting it."
                  >
                    <div className="flex items-center gap-2">
                      <div
                        role="switch"
                        aria-checked={form.performBackup}
                        onClick={() => set('performBackup', !form.performBackup)}
                        className={clsx(
                          'relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer',
                          form.performBackup ? 'bg-sig-green shadow-[0_0_8px_rgba(74,222,128,0.2)]' : 'bg-wiz-border-mid ring-1 ring-wiz-border-strong/50',
                        )}
                      >
                        <span className={clsx(
                          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                          form.performBackup ? 'translate-x-4' : 'translate-x-0',
                        )} />
                      </div>
                    </div>
                  </RowField>

                  {/* Max backups row — shown only when backup is on */}
                  {form.performBackup && (
                    <RowField
                      label="Max Backups"
                      sublabel="Retention count"
                      name="maxBackups"
                      hint={
                        form.maxBackups === '1'
                          ? 'Only the most recent backup is kept.'
                          : `The ${form.maxBackups} most recent backups are kept. Older ones are automatically removed.`
                      }
                    >
                      <div className="flex items-center gap-2">
                        {([1, 2, 3, 4, 5] as const).map((n) => {
                          const selected = form.maxBackups === n.toString()
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => set('maxBackups', n.toString())}
                              className={clsx(
                                'w-11 h-11 rounded border font-mono font-bold text-sm',
                                'transition-all duration-150 flex items-center justify-center',
                                selected
                                  ? 'border-sig-green bg-sig-green/10 text-sig-green'
                                  : 'border-wiz-border bg-wiz-bg text-wiz-gray hover:border-wiz-border-mid hover:text-wiz-cream',
                              )}
                              title={`Keep ${n} backup${n === 1 ? '' : 's'}`}
                            >
                              {n}
                            </button>
                          )
                        })}
                      </div>
                    </RowField>
                  )}

                  {/* Stability monitoring row — always visible */}
                  <RowField
                    label="Stability Check"
                    sublabel="Post-startup"
                    name="stabilityWindow"
                    hint={`After the app starts, WizardCD monitors it for ${form.stabilityWindow}s to catch delayed crashes before declaring the deploy successful.`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {([10, 20, 30, 60] as const).map((n) => {
                          const selected = form.stabilityWindow === n.toString()
                          return (
                            <button
                              key={n}
                              type="button"
                              onClick={() => set('stabilityWindow', n.toString())}
                              className={clsx(
                                'h-9 px-3 rounded border font-mono text-xs',
                                'transition-all duration-150 flex items-center justify-center',
                                selected
                                  ? 'border-sig-green bg-sig-green/10 text-sig-green'
                                  : 'border-wiz-border bg-wiz-bg text-wiz-gray hover:border-wiz-border-mid hover:text-wiz-cream',
                              )}
                              title={`Monitor for ${n} seconds after startup`}
                            >
                              {n}s
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={5}
                          max={120}
                          value={form.stabilityWindow}
                          onChange={(e) => {
                            const v = e.target.value
                            if (v === '' || (parseInt(v, 10) >= 0 && parseInt(v, 10) <= 120)) {
                              set('stabilityWindow', v)
                            }
                          }}
                          className="w-16 h-9 rounded border border-wiz-border bg-wiz-bg text-center font-mono text-xs text-wiz-cream focus:border-wiz-gold focus:outline-none"
                          title="Custom value (5–120 seconds)"
                        />
                        <span className="text-2xs text-wiz-muted">sec</span>
                      </div>
                    </div>
                  </RowField>

                </div>
              </div>


              {/* ── LOG ROTATION PANEL (panel 2 — blue theme) ── */}
              <div id="log-rotation-panel" className="rounded border border-wiz-border border-l-2 border-l-sig-blue/50 bg-wiz-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-blue-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-sig-blue/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-blue">
                    Log Rotation
                  </h3>
                </div>
                <div className="divide-y divide-wiz-border/30">
                  <RowInput
                    label="Max Log Size"
                    sublabel="Per-file limit"
                    name="maxLogSize"
                    placeholder="10m"
                    hint="Maximum size per log file before rotation — e.g. 10m, 100m."
                    value={form.maxLogSize}
                    onChange={(e) => set('maxLogSize', e.target.value)}
                  />
                  <RowInput
                    label="Max Log Files"
                    sublabel="Retention count"
                    name="maxLogFiles"
                    type="number"
                    placeholder="10"
                    hint="Number of rotated log files to keep before the oldest is deleted."
                    value={form.maxLogFiles}
                    onChange={(e) => set('maxLogFiles', e.target.value)}
                  />
                </div>
              </div>

              {/* ── SERVER FILES PANEL (panel 3 — crimson theme) ── */}
              <div className="rounded border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-surface overflow-hidden">

                {/* Outer header */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-gold-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                    Server Files
                  </h3>
                  <span className="text-wiz-muted/50 text-xs font-normal normal-case tracking-normal">· Optional files to place on the server</span>
                </div>

                <div className="divide-y divide-wiz-border/30">
                {/* ── Certificates sub-section ── */}
                <div id="certs-panel">
                  <RowField
                    label="Certificates"
                    sublabel="Keystore files"
                    name="hasCerts"
                    hint={form.hasCerts
                      ? "Certificate or keystore ZIPs extracted to custom paths — each ZIP deployed independently."
                      : "Enable if this application requires certificate or keystore files on the server."
                    }
                  >
                    <div className="flex items-center gap-2">
                      <div
                        role="switch"
                        aria-checked={form.hasCerts}
                        onClick={() => {
                          if (form.hasCerts) {
                            set('hasCerts', false)
                            set('certUploads', [])
                          } else {
                            set('hasCerts', true)
                            if (form.certUploads.length === 0)
                              set('certUploads', [{ source: '', targetPath: '', file: null }])
                          }
                        }}
                        className={clsx(
                          'relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer',
                          form.hasCerts ? 'bg-sig-blue shadow-[0_0_8px_rgba(96,165,250,0.2)]' : 'bg-wiz-border-mid ring-1 ring-wiz-border-strong/50',
                        )}
                      >
                        <span className={clsx(
                          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                          form.hasCerts ? 'translate-x-4' : 'translate-x-0',
                        )} />
                      </div>
                    </div>
                  </RowField>
                  {form.hasCerts && (
                    <div className="px-5 pb-5 flex flex-col gap-4 border-t border-wiz-border/20">
                      {form.certUploads.map((cu, idx) => (
                        <div key={idx} className="rounded border border-wiz-border-strong overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2 bg-wiz-raised border-b border-wiz-border">
                            <span className="font-mono text-xs text-wiz-muted/70">Certificate {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => set('certUploads', form.certUploads.filter((_, i) => i !== idx))}
                              className="btn-icon text-sig-red/60 hover:text-sig-red hover:bg-sig-red-dim"
                              aria-label="Remove certificate entry"
                            >
                              <X size={13} />
                            </button>
                          </div>
                          <div className="divide-y divide-wiz-border/30">
                            <RowField label="Dir Name" sublabel="Folder in ZIP" name={`cert-source-${idx}`} hint="Folder name inside the ZIP that contains your certificate files.">
                              <input
                                type="text"
                                id={`cert-source-${idx}`}
                                value={cu.source}
                                placeholder="certs"
                                onChange={(e) => {
                                  const next = [...form.certUploads]
                                  next[idx] = { ...next[idx], source: e.target.value }
                                  set('certUploads', next)
                                }}
                                className="wiz-input"
                              />
                            </RowField>
                            <RowField label="Target Path" sublabel="Destination on server" name={`cert-target-${idx}`} hint="Absolute path on the target server where the certificate files will be placed.">
                              <input
                                type="text"
                                id={`cert-target-${idx}`}
                                value={cu.targetPath}
                                placeholder="/opt/certs"
                                onChange={(e) => {
                                  const next = [...form.certUploads]
                                  next[idx] = { ...next[idx], targetPath: e.target.value }
                                  set('certUploads', next)
                                }}
                                className="wiz-input"
                              />
                            </RowField>
                            <RowField label="ZIP File" sublabel="Upload" name={`cert-zip-${idx}`}>
                              <MiniUpload
                                value={cu.file}
                                onChange={(f) => {
                                  const next = [...form.certUploads]
                                  next[idx] = { ...next[idx], file: f }
                                  set('certUploads', next)
                                }}
                                accept=".zip"
                                inputId={`cert-zip-${idx}`}
                              />
                            </RowField>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => set('certUploads', [...form.certUploads, { source: '', targetPath: '', file: null }])}
                        className="flex items-center gap-1.5 text-xs text-sig-blue hover:text-sig-blue/80 transition-colors duration-150 w-fit"
                      >
                        <Plus size={13} />
                        Add certificate path
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Additional Directories sub-section ── */}
                <div id="extra-dirs-panel">
                  <RowField
                    label="Extra Dirs"
                    sublabel="Server paths"
                    name="hasExtraDirs"
                    hint={form.hasExtraDirs
                      ? "Extra directories transferred to custom absolute paths — deployed independently of the application tarball."
                      : "Enable if this application requires extra directories to be placed on the server."
                    }
                  >
                    <div className="flex items-center gap-2">
                      <div
                        role="switch"
                        aria-checked={form.hasExtraDirs}
                        onClick={() => {
                          if (form.hasExtraDirs) {
                            set('hasExtraDirs', false)
                            set('extraDirs', [])
                          } else {
                            set('hasExtraDirs', true)
                            if (form.extraDirs.length === 0)
                              set('extraDirs', [{ dirName: '', targetPath: '', file: null }])
                          }
                        }}
                        className={clsx(
                          'relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer',
                          form.hasExtraDirs ? 'bg-wiz-gold shadow-[0_0_8px_rgba(217,170,75,0.2)]' : 'bg-wiz-border-mid ring-1 ring-wiz-border-strong/50',
                        )}
                      >
                        <span className={clsx(
                          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                          form.hasExtraDirs ? 'translate-x-4' : 'translate-x-0',
                        )} />
                      </div>
                    </div>
                  </RowField>
                  {form.hasExtraDirs && (
                    <div className="px-5 pb-5 flex flex-col gap-4 border-t border-wiz-border/20">
                      {form.extraDirs.map((ed, idx) => (
                        <div key={idx} className="rounded border border-wiz-border-strong overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2 bg-wiz-raised border-b border-wiz-border">
                            <span className="font-mono text-xs text-wiz-muted/70">Directory {idx + 1}</span>
                            <button
                              type="button"
                              onClick={() => set('extraDirs', form.extraDirs.filter((_, i) => i !== idx))}
                              className="btn-icon text-sig-red/60 hover:text-sig-red hover:bg-sig-red-dim"
                              aria-label="Remove directory entry"
                            >
                              <X size={13} />
                            </button>
                          </div>
                          <div className="divide-y divide-wiz-border/30">
                            <RowField label="Dir Name" sublabel="Folder in ZIP" name={`extra-dir-name-${idx}`} hint="Folder name inside the ZIP that contains the directory contents.">
                              <input
                                type="text"
                                id={`extra-dir-name-${idx}`}
                                value={ed.dirName}
                                placeholder="deploy"
                                onChange={(e) => {
                                  const next = [...form.extraDirs]
                                  next[idx] = { ...next[idx], dirName: e.target.value }
                                  set('extraDirs', next)
                                }}
                                className="wiz-input"
                              />
                            </RowField>
                            <RowField label="Target Path" sublabel="Destination on server" name={`extra-dir-target-${idx}`} hint="Absolute path on the target server where this directory's contents will be placed.">
                              <input
                                type="text"
                                id={`extra-dir-target-${idx}`}
                                value={ed.targetPath}
                                placeholder="/opt/apps/my-service/deploy"
                                onChange={(e) => {
                                  const next = [...form.extraDirs]
                                  next[idx] = { ...next[idx], targetPath: e.target.value }
                                  set('extraDirs', next)
                                }}
                                className="wiz-input"
                              />
                            </RowField>
                            <RowField label="ZIP File" sublabel="Upload" name={`extra-dir-zip-${idx}`}>
                              <MiniUpload
                                value={ed.file}
                                onChange={(f) => {
                                  const next = [...form.extraDirs]
                                  next[idx] = { ...next[idx], file: f }
                                  set('extraDirs', next)
                                }}
                                accept=".zip"
                                inputId={`extra-dir-zip-${idx}`}
                              />
                            </RowField>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => set('extraDirs', [...form.extraDirs, { dirName: '', targetPath: '', file: null }])}
                        className="flex items-center gap-1.5 text-xs text-wiz-gold hover:text-wiz-gold/80 transition-colors duration-150 w-fit"
                      >
                        <Plus size={13} />
                        Add directory
                      </button>
                    </div>
                  )}
                </div>
                </div>{/* end divide-y */}

              </div>


              {/* ── JVM CONFIGURATION PANEL (panel 4 — green, rotation restart) ── */}
              <div id="jvm-panel" className="rounded border border-wiz-border border-l-2 border-l-sig-green/50 bg-wiz-surface overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center justify-between gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-green-dim">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sig-green/70 flex-shrink-0" />
                    <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-green">
                      JVM Configuration
                    </h3>
                  </div>
                  {jvmConfigEnabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setJvmConfigEnabled(false)
                        set('xms', '')
                        set('xmx', '')
                        setHeapSize('')
                        setActivePreset('medium')
                        setAdvancedHeap(false)
                        setAdvancedJvmEnabled(false)
                        setContainerAware(false)
                        setAdvancedGcTuning(false)
                        setMetaspaceSize('')
                        setThreadStackSize('')
                      }}
                      className={clsx(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all duration-150',
                        'border-wiz-gold/30 text-wiz-gold/80 bg-wiz-gold/5',
                        'hover:border-wiz-gold/50 hover:text-wiz-gold hover:bg-wiz-gold/10',
                      )}
                    >
                      ↩ Reset to defaults
                    </button>
                  )}
                </div>

                {/* ── Opt-in gate — shown when JVM config is off ── */}
                {!jvmConfigEnabled ? (
                  <div className="p-5 flex flex-col gap-4">
                    <div className="flex items-start gap-3 px-4 py-3.5 rounded bg-wiz-raised border border-wiz-border/50">
                      <svg className="w-4 h-4 text-wiz-gold/70 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                      </svg>
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-semibold text-wiz-cream">
                          JVM will use ergonomic defaults
                        </p>
                        <p className="text-xs text-wiz-muted/70 leading-relaxed">
                          Modern JVMs (17+) automatically size the heap based on available server memory and select an appropriate GC strategy. Only adjust these settings if you have specific memory requirements, latency targets, or are running on a resource-constrained server.
                        </p>
                        <ul className="text-xs text-wiz-muted/70 list-disc list-inside space-y-0.5 mt-0.5">
                          <li>No <span className="font-mono">-Xms</span> / <span className="font-mono">-Xmx</span> flags — JVM auto-sizes heap</li>
                          <li>GC strategy chosen automatically by the runtime</li>
                          <li>Recommended for most deployments on modern JVMs</li>
                        </ul>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setJvmConfigEnabled(true)}
                      className={clsx(
                        'flex items-center justify-center gap-2 px-4 py-2.5 rounded border',
                        'border-wiz-gold/30 bg-wiz-gold/5 text-wiz-gold text-xs font-semibold',
                        'hover:border-wiz-gold/50 hover:bg-wiz-gold/10 transition-colors w-full',
                      )}
                    >
                      Configure JVM Settings
                    </button>
                  </div>
                ) : (

                <div className="p-5 flex flex-col gap-3">

                  {/* ── PANEL 1: MEMORY (sig-blue) ── */}
                  <div className="rounded border border-wiz-border-mid border-l-[3px] border-l-sig-blue/60 border-r-wiz-border-strong overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wiz-border/20 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-sig-blue/70 flex-shrink-0" />
                      <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-sig-blue/70">Memory</span>
                    </div>
                    <div className="divide-y divide-wiz-border/20">
                      <RowField label="Preset" sublabel="Quick-start" name="memPreset">
                        <div className="flex flex-col gap-2">
                          <p className="text-2xs text-wiz-muted/60 leading-relaxed">Each preset configures <span className="font-mono text-sig-blue/60">Xms</span> = <span className="font-mono text-sig-blue/60">Xmx</span> and selects a matching GC strategy.</p>
                          <div className="grid grid-cols-3 gap-2 rounded bg-wiz-bg border border-wiz-border/20 p-2.5">
                            {JVM_PRESETS.map((preset) => {
                              const sel = activePreset === preset.id
                              return (
                                <button key={preset.id} type="button"
                                  onClick={() => {
                                    const u = (preset.heap.endsWith('g') ? 'g' : 'm') as 'm' | 'g'
                                    setActivePreset(preset.id)
                                    setHeapSize(heapNum(preset.heap))
                                    setHeapUnit(u)
                                    setGcType(preset.gc as GcType)
                                    setAdvancedHeap(false)
                                    set('xms', preset.heap)
                                    set('xmx', preset.heap)
                                    setContainerAware(false)
                                  }}
                                  className={clsx(
                                    'flex flex-col gap-1.5 p-3 rounded border text-left transition-all',
                                    sel
                                      ? 'border-sig-blue bg-sig-blue/15 shadow-[0_0_14px_rgba(96,165,250,0.12)] ring-1 ring-sig-blue/25'
                                      : 'border-wiz-border-mid bg-wiz-raised hover:border-sig-blue/50 hover:bg-wiz-raised/80',
                                  )}>
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className={clsx('text-xs font-bold font-mono', sel ? 'text-sig-blue' : 'text-wiz-cream')}>{preset.label}</span>
                                    <span className={clsx('text-2xs font-mono font-bold tabular-nums', sel ? 'text-sig-blue/90' : 'text-wiz-cream/60')}>{preset.heap}</span>
                                  </div>
                                  <span className={clsx('text-2xs leading-snug', sel ? 'text-sig-blue/70' : 'text-wiz-muted/80')}>{preset.desc}</span>
                                </button>
                              )
                            })}
                            {(() => {
                              const sel = activePreset === 'custom'
                              return (
                                <button type="button" onClick={() => setActivePreset('custom')}
                                  className={clsx(
                                    'flex flex-col gap-1.5 p-3 rounded border text-left transition-all col-span-2',
                                    sel
                                      ? 'border-sig-blue bg-sig-blue/15 shadow-[0_0_14px_rgba(96,165,250,0.12)] ring-1 ring-sig-blue/25'
                                      : 'border-dashed border-wiz-border-mid bg-wiz-raised hover:border-sig-blue/50 hover:bg-wiz-raised/80',
                                  )}>
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className={clsx('text-xs font-bold font-mono', sel ? 'text-sig-blue' : 'text-wiz-cream')}>Custom</span>
                                    <span className={clsx('text-2xs font-mono', sel ? 'text-sig-blue/80' : 'text-wiz-cream/50')}>manual Xms / Xmx</span>
                                  </div>
                                </button>
                              )
                            })()}
                          </div>
                        </div>
                      </RowField>

                      {!containerAware && (<>
                        {!advancedHeap ? (
                          <RowField label="Heap Size" sublabel="Xms = Xmx" name="heapSize"
                            error={errors.xms}
                            hint="Initial and max heap size e.g. 512m or 2g. Leave blank for JVM ergonomic sizing.">
                            <div className="flex items-center gap-2">
                              <div className="flex rounded overflow-hidden border border-wiz-border/60 focus-within:border-sig-blue/40 transition-colors w-28">
                                <input type="number" min="1"
                                  className="w-full bg-wiz-bg px-3 py-2 text-sm text-wiz-cream font-mono placeholder-wiz-dim/30 outline-none"
                                  placeholder={heapUnit === 'g' ? '1' : '512'}
                                  value={heapSize}
                                  onChange={(e) => {
                                    setHeapSize(e.target.value)
                                    const val = e.target.value ? `${e.target.value}${heapUnit}` : ''
                                    set('xms', val); set('xmx', val)
                                  }}
                                />
                              </div>
                              <div className="flex rounded overflow-hidden border border-wiz-border/60">
                                {(['m', 'g'] as const).map((u) => (
                                  <button key={u} type="button"
                                    onClick={() => { setHeapUnit(u); if (heapSize) { set('xms', `${heapSize}${u}`); set('xmx', `${heapSize}${u}`) } }}
                                    className={clsx('px-3 py-2 text-2xs font-mono uppercase transition-colors',
                                      heapUnit === u ? 'bg-sig-blue/20 text-sig-blue font-semibold' : 'bg-wiz-raised/60 text-wiz-muted hover:text-wiz-cream')}>
                                    {u === 'm' ? 'MB' : 'GB'}
                                  </button>
                                ))}
                              </div>
                              {heapSize && (
                                <span className="text-2xs font-mono text-wiz-muted/50">= {heapSize}{heapUnit}</span>
                              )}
                            </div>
                          </RowField>
                        ) : (
                          <>
                            <RowField label="Heap Min" sublabel="Xms" name="xms" required error={errors.xms}
                              hint="Initial JVM heap size e.g. 512m or 1g">
                              <div className="flex items-center gap-2">
                                <div className="flex rounded overflow-hidden border border-wiz-border/60 focus-within:border-sig-blue/40 transition-colors w-28">
                                  <input type="number" min="1"
                                    className="w-full bg-wiz-bg px-3 py-2 text-sm text-wiz-cream font-mono placeholder-wiz-dim/30 outline-none"
                                    placeholder={xmsUnit === 'g' ? '1' : '512'}
                                    value={heapNum(form.xms)}
                                    onChange={(e) => { set('xms', e.target.value ? `${e.target.value}${xmsUnit}` : '') }}
                                  />
                                </div>
                                <div className="flex rounded overflow-hidden border border-wiz-border/60">
                                  {(['m', 'g'] as const).map((u) => (
                                    <button key={u} type="button"
                                      onClick={() => { setXmsUnit(u); const n = heapNum(form.xms); if (n) set('xms', `${n}${u}`) }}
                                      className={clsx('px-3 py-2 text-2xs font-mono uppercase transition-colors',
                                        xmsUnit === u ? 'bg-sig-blue/20 text-sig-blue font-semibold' : 'bg-wiz-raised/60 text-wiz-muted hover:text-wiz-cream')}>
                                      {u === 'm' ? 'MB' : 'GB'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </RowField>
                            <RowField label="Heap Max" sublabel="Xmx" name="xmx"
                              hint="Max JVM heap size e.g. 1024m or 2g. Must be ≥ Xms.">
                              <div className="flex items-center gap-2">
                                <div className={clsx('flex rounded overflow-hidden border transition-colors w-28',
                                  form.xms && form.xmx && heapMB(form.xms) > heapMB(form.xmx) ? 'border-sig-red/50' : 'border-wiz-border/60 focus-within:border-sig-blue/40')}>
                                  <input type="number" min="1"
                                    className="w-full bg-wiz-bg px-3 py-2 text-sm text-wiz-cream font-mono placeholder-wiz-dim/30 outline-none"
                                    placeholder={xmxUnit === 'g' ? '2' : '2048'}
                                    value={heapNum(form.xmx)}
                                    onChange={(e) => { set('xmx', e.target.value ? `${e.target.value}${xmxUnit}` : '') }}
                                  />
                                </div>
                                <div className="flex rounded overflow-hidden border border-wiz-border/60">
                                  {(['m', 'g'] as const).map((u) => (
                                    <button key={u} type="button"
                                      onClick={() => { setXmxUnit(u); const n = heapNum(form.xmx); if (n) set('xmx', `${n}${u}`) }}
                                      className={clsx('px-3 py-2 text-2xs font-mono uppercase transition-colors',
                                        xmxUnit === u ? 'bg-sig-blue/20 text-sig-blue font-semibold' : 'bg-wiz-raised/60 text-wiz-muted hover:text-wiz-cream')}>
                                      {u === 'm' ? 'MB' : 'GB'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {form.xms && form.xmx && heapMB(form.xms) > heapMB(form.xmx) && (
                                <p className="text-2xs text-sig-red flex items-center gap-1 mt-1">⚠ Heap min exceeds heap max</p>
                              )}
                            </RowField>
                          </>
                        )}
                        <RowField label="Independent" sublabel="Xms ≠ Xmx" name="advancedHeap"
                          hint="Set initial and max heap separately — useful when startup memory needs differ from peak usage.">
                          <div className="flex items-center gap-2">
                            <div role="switch" aria-checked={advancedHeap}
                              onClick={() => {
                                if (advancedHeap) {
                                  setAdvancedHeap(false)
                                  const n = heapNum(form.xmx); const u = (form.xmx.endsWith('g') ? 'g' : 'm') as 'm' | 'g'
                                  setHeapSize(n); setHeapUnit(u); set('xms', form.xmx)
                                } else { setAdvancedHeap(true) }
                              }}
                              className={clsx('relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer', advancedHeap ? 'bg-sig-blue shadow-[0_0_8px_rgba(96,165,250,0.2)]' : 'bg-wiz-border-mid ring-1 ring-wiz-border-strong/50')}>
                              <span className={clsx('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200', advancedHeap ? 'translate-x-4' : 'translate-x-0')} />
                            </div>
                          </div>
                        </RowField>
                      </>
                    )}
                    </div>
                  </div>

                  {/* ── PANEL 2: GARBAGE COLLECTOR (sig-green) ── */}
                  <div className="rounded border border-wiz-border-mid border-l-[3px] border-l-sig-green/60 border-r-wiz-border-strong overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wiz-border/20 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-sig-green/70 flex-shrink-0" />
                      <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-sig-green/70">Garbage Collector</span>
                    </div>
                    <div className="divide-y divide-wiz-border/20">
                      <RowField label="Collector" sublabel="GC strategy" name="gcType"
                        hint={GC_OPTIONS.find(o => o.id === gcType)?.desc}>
                        {(() => {
                          const jvNum = parseInt(form.javaVersion?.trim() || '', 10)
                          const hasJv = Number.isFinite(jvNum) && jvNum > 0
                          return (
                            <div className="grid grid-cols-4 gap-1.5 rounded bg-wiz-bg border border-wiz-border/20 p-2">
                              {GC_OPTIONS.map((opt) => {
                                const incompatible = hasJv && opt.minJava > jvNum
                                const selected = gcType === opt.id
                                return (
                                  <button key={opt.id} type="button"
                                    onClick={() => {
                                      setGcType(opt.id)
                                      if (containerAware) {
                                        if (opt.id === 'ZGC' || opt.id === 'Shenandoah') setMaxRamPct('65')
                                        else if (opt.id === 'ParallelGC') setMaxRamPct('75')
                                        else setMaxRamPct('70')
                                      }
                                    }}
                                    className={clsx('flex flex-col items-center gap-1 px-2 py-2.5 rounded border text-center transition-all',
                                      selected ? 'border-sig-green/60 bg-sig-green/10 ring-1 ring-sig-green/20'
                                      : incompatible ? 'border-sig-yellow/30 bg-sig-yellow-dim hover:border-sig-yellow/40'
                                      : 'border-wiz-border bg-wiz-surface hover:border-sig-green/30 hover:bg-wiz-bg')}>
                                    <span className={clsx('text-xs font-bold font-mono',
                                      selected ? 'text-sig-green' : incompatible ? 'text-sig-yellow/80' : 'text-wiz-cream')}>
                                      {opt.label}
                                    </span>
                                    {opt.minJava > 8 && (
                                      <span className={clsx('text-2xs font-mono px-1 py-0.5 rounded border',
                                        incompatible ? 'border-sig-yellow/40 bg-sig-yellow/10 text-sig-yellow/80' : 'border-wiz-border/40 bg-wiz-raised/50 text-wiz-muted/70')}>
                                        {opt.minJava}+
                                      </span>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          )
                        })()}
                      </RowField>

                      {gcType === 'G1GC' && (
                        <RowField label="Pause Target" sublabel="G1GC tuning" name="workloadProfile"
                          hint={WORKLOAD_OPTIONS.find(o => o.id === workloadProfile)?.desc}>
                          <div className="grid grid-cols-4 gap-1.5 rounded bg-wiz-bg border border-wiz-border/20 p-2">
                            {WORKLOAD_OPTIONS.map((opt) => {
                              const selected = workloadProfile === opt.id
                              return (
                                <button key={opt.id} type="button" onClick={() => setWorkloadProfile(opt.id)}
                                  className={clsx('flex flex-col items-center gap-0.5 px-2 py-2.5 rounded border text-center transition-all',
                                    selected
                                      ? 'border-sig-green/60 bg-sig-green/10 ring-1 ring-sig-green/20'
                                      : 'border-wiz-border/50 bg-wiz-surface/20 hover:border-sig-green/30 hover:bg-wiz-surface/40')}>
                                  <span className={clsx('text-xs font-bold',
                                    selected ? 'text-sig-green' : 'text-wiz-cream/90')}>
                                    {opt.label}
                                  </span>
                                  <span className={clsx('text-2xs font-mono',
                                    selected ? 'text-sig-green/60' : 'text-wiz-muted/50')}>
                                    {opt.id === 'API' ? '200ms' : opt.id === 'HighThroughput' ? '100ms' : '500ms'}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        </RowField>
                      )}
                    </div>
                  </div>

                  {/* ── PANEL 3: CONTAINER (sig-purple) ── */}
                  <div className="rounded border border-wiz-border-mid border-l-[3px] border-l-sig-purple/60 border-r-wiz-border-strong overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wiz-border/20 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-sig-purple/70 flex-shrink-0" />
                      <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-sig-purple/70">Container</span>
                    </div>
                    <div className="divide-y divide-wiz-border/20">
                      <RowField label="Container" sublabel="Docker / cgroup" name="containerAware"
                        hint={containerAware ? 'Active — JVM respects the container memory ceiling. Fixed Xms / Xmx cleared in favour of MaxRAMPercentage.' : 'Enable when the JVM runs inside Docker or a cgroup-limited VM. Tells the JVM to size its heap from the container memory limit, not the host\'s total RAM. Clears any fixed Xms / Xmx.'}>
                        <div className="flex items-center gap-2">
                          <div role="switch" aria-checked={containerAware}
                            onClick={() => { const next = !containerAware; setContainerAware(next); if (next) { set('xms', ''); set('xmx', ''); setHeapSize('') } }}
                            className={clsx('relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer', containerAware ? 'bg-sig-purple shadow-[0_0_8px_rgba(147,51,234,0.2)]' : 'bg-wiz-border-mid ring-1 ring-wiz-border-strong/50')}>
                            <span className={clsx('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200', containerAware ? 'translate-x-4' : 'translate-x-0')} />
                          </div>
                        </div>
                      </RowField>

                      {containerAware && (
                        <RowField label="Max RAM %" sublabel="Heap ceiling" name="maxRamPct"
                          hint={gcType === 'ZGC' ? 'ZGC reserves native memory for page tables — keep at 60–65% to avoid OOM kills.' : gcType === 'Shenandoah' ? 'Shenandoah needs off-heap space for concurrent structures — 65% recommended.' : gcType === 'ParallelGC' ? 'ParallelGC has minimal native overhead — 75–80% is safe for most containers.' : 'G1GC uses moderate native memory for region metadata — 70% is a safe default.'}>
                          <div className="flex items-center gap-2.5">
                            <div className="flex rounded overflow-hidden border border-wiz-border/60 focus-within:border-sig-purple/40 w-24">
                              <input type="number" min="40" max="90" step="5"
                                className="flex-1 bg-wiz-bg px-3 py-1.5 text-sm text-wiz-cream font-mono outline-none w-full placeholder-wiz-dim/30"
                                placeholder="70.0" value={maxRamPct} onChange={(e) => setMaxRamPct(e.target.value)} />
                            </div>
                            <span className="text-xs text-wiz-muted/70">%</span>
                            {(['60', '65', '70', '75', '80'] as const).map((v) => (
                              <button key={v} type="button" onClick={() => setMaxRamPct(v)}
                                className={clsx('px-2 py-1 rounded text-2xs font-mono transition-colors border',
                                  maxRamPct === v ? 'border-sig-purple/50 bg-sig-purple/10 text-sig-purple' : 'border-wiz-border/40 bg-wiz-surface/30 text-wiz-muted hover:text-wiz-cream')}>
                                {v}%
                              </button>
                            ))}
                          </div>
                        </RowField>
                      )}
                    </div>
                  </div>

                  {/* ── PANEL 4: ADVANCED TUNING (sig-orange) ── */}
                  <div className="rounded border border-wiz-border-mid border-l-[3px] border-l-sig-orange/60 border-r-wiz-border-strong overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wiz-border/20 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-sig-orange/70 flex-shrink-0" />
                        <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-sig-orange/70">Advanced Tuning</span>
                      </div>
                      <div role="switch" aria-checked={advancedJvmEnabled}
                        onClick={() => setAdvancedJvmEnabled(v => !v)}
                        className={clsx('relative w-9 h-5 rounded-full transition-colors duration-200 cursor-pointer', advancedJvmEnabled ? 'bg-sig-orange shadow-[0_0_8px_rgba(251,146,60,0.2)]' : 'bg-wiz-border-mid ring-1 ring-wiz-border-strong/50')}>
                        <span className={clsx('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200', advancedJvmEnabled ? 'translate-x-4' : 'translate-x-0')} />
                      </div>
                    </div>
                    {!advancedJvmEnabled ? (
                      <p className="px-4 py-3 text-xs text-wiz-muted/50 leading-relaxed">
                        Fine-tune GC pause targets, metaspace limits, and thread stack size. Only enable if you have profiling data or are hitting specific memory issues.
                      </p>
                    ) : (
                      <div className="divide-y divide-wiz-border/20">
                        {gcType === 'G1GC' && (
                          <RowField label="GC Pause" sublabel="MaxGCPauseMillis" name="gcPause"
                            hint={`Overrides the ${workloadProfile === 'HighThroughput' ? '100' : workloadProfile === 'Batch' || workloadProfile === 'MemoryIntensive' ? '500' : '200'}ms target set by your Pause Target profile. Only change if GC logs show the current target isn't being met.`}>
                            <div className="flex items-center gap-2">
                              <div className="flex rounded overflow-hidden border border-wiz-border/60 focus-within:border-sig-orange/40 w-24">
                                <input type="number" min="50" max="5000"
                                  className="flex-1 bg-wiz-bg px-3 py-1.5 text-sm text-wiz-cream font-mono outline-none w-full placeholder-wiz-dim/30"
                                  placeholder={workloadProfile === 'HighThroughput' ? '100' : workloadProfile === 'Batch' || workloadProfile === 'MemoryIntensive' ? '500' : '200'}
                                  value={advancedGcTuning ? maxGcPauseMs : ''}
                                  onChange={(e) => { setAdvancedGcTuning(e.target.value !== ''); setMaxGcPauseMs(e.target.value) }} />
                              </div>
                              <span className="text-xs text-wiz-muted/50">ms</span>
                              {advancedGcTuning && (
                                <button type="button" onClick={() => { setAdvancedGcTuning(false); setMaxGcPauseMs('200') }}
                                  className="text-2xs text-wiz-muted/50 hover:text-sig-orange transition-colors">reset</button>
                              )}
                            </div>
                          </RowField>
                        )}

                        <RowField label="Metaspace" sublabel="MaxMetaspaceSize" name="metaspaceSize"
                          hint="Caps memory for loaded class metadata. Set if you see metaspace OOM errors — leave blank to let the JVM grow as needed.">
                          <div className="flex items-center gap-2">
                            <div className="flex rounded overflow-hidden border border-wiz-border/60 focus-within:border-sig-orange/40 w-24">
                              <input type="text" id="metaspaceSize"
                                className="flex-1 bg-wiz-bg px-3 py-1.5 text-sm text-wiz-cream font-mono outline-none w-full placeholder-wiz-dim/30"
                                placeholder="256m" value={metaspaceSize} onChange={(e) => setMetaspaceSize(e.target.value)} />
                            </div>
                          </div>
                        </RowField>

                        <RowField label="Thread Stack" sublabel="-Xss" name="threadStackSize"
                          hint="Memory per thread. Lower to 256k for high-thread-count apps to save memory — increase if you hit StackOverflowError.">
                          <div className="flex items-center gap-2">
                            <div className="flex rounded overflow-hidden border border-wiz-border/60 focus-within:border-sig-orange/40 w-24">
                              <input type="text" id="threadStackSize"
                                className="flex-1 bg-wiz-bg px-3 py-1.5 text-sm text-wiz-cream font-mono outline-none w-full placeholder-wiz-dim/30"
                                placeholder="512k" value={threadStackSize} onChange={(e) => setThreadStackSize(e.target.value)} />
                            </div>
                          </div>
                        </RowField>
                      </div>
                    )}
                  </div>

                  {/* ── PANEL 5 — ADDITIONAL CUSTOM FLAGS (sig-blue) ── */}
                  <div className="rounded border border-wiz-border-mid border-l-[3px] border-l-sig-blue/60 border-r-wiz-border-strong overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-wiz-border/40 bg-sig-blue-dim flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-sig-blue flex-shrink-0" />
                      <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-sig-blue">Additional Custom Flags</span>
                    </div>
                    <div className="px-5 py-4">
                      <DynamicList
                        label="Additional Custom Flags"
                        name="extraOpts"
                        values={form.extraOpts}
                        onChange={(v) => set('extraOpts', v)}
                        placeholder="-Dmy.property=value"
                        addLabel="Add flag"
                        hint="Add custom JVM flags not covered above (e.g. -D, -X, -XX). These are appended to the generated configuration and may override existing settings. Use with caution."
                        hideLabel
                      />
                    </div>
                  </div>

                  {/* ── GENERATED JVM FLAGS (footer) ── */}
                  {(() => {
                    const derived = deriveJvmFlags({
                      xms: form.xms, xmx: form.xmx,
                      gcType, workloadProfile, containerAware, advancedGcTuning, maxGcPauseMs,
                      metaspaceSize:   advancedJvmEnabled ? metaspaceSize   : '',
                      threadStackSize: advancedJvmEnabled ? threadStackSize : '',
                      javaVersion: form.javaVersion, maxRamPct,
                    })
                    const previewFlags = [
                      form.xms ? `-Xms${form.xms}` : null,
                      form.xmx ? `-Xmx${form.xmx}` : null,
                      ...derived.flags,
                      ...form.extraOpts.filter(Boolean),
                    ].filter((f): f is string => Boolean(f))

                    // Heap=blue  GC=green  Tuning=yellow  Meta/stack=purple
                    const flagColor = (flag: string) => {
                      // ── Heap (blue): memory sizing ──
                      if (flag.startsWith('-Xms') || flag.startsWith('-Xmx')) return 'text-sig-blue'
                      // ── Meta / stack (purple) ──
                      if (flag.startsWith('-Xss') || flag.startsWith('-XX:MaxMetaspace') || flag.startsWith('-XX:Metaspace')) return 'text-sig-purple'
                      // ── GC (green): collector selection only ──
                      if (flag === '-XX:+UseG1GC' || flag === '-XX:+UseParallelGC'
                        || flag === '-XX:+UseZGC' || flag === '-XX:+UseShenandoahGC') return 'text-sig-green'
                      // ── Tuning (yellow): pause targets, workload flags, container ──
                      if (flag.startsWith('-XX:MaxGCPause') || flag.startsWith('-XX:+AlwaysPreTouch')
                        || flag.startsWith('-XX:+ParallelRefProc') || flag.startsWith('-XX:+UseContainerSupport')
                        || flag.startsWith('-XX:MaxRAMPercentage')) return 'text-sig-yellow'
                      // ── Fallback ──
                      return 'text-wiz-cream/70'
                    }

                    return (
                      <div className="border-t border-wiz-border/30 pt-4 mt-1 flex flex-col gap-3">
                        <span className="font-mono text-2xs font-semibold uppercase tracking-widest text-wiz-gold/70">Generated JVM Flags</span>

                        {derived.errors.length > 0 && derived.errors.map((err, i) => (
                          <div key={i} className="flex items-start gap-2 px-3 py-1.5 rounded-md border border-sig-red/30 bg-sig-red-dim text-2xs text-sig-red leading-snug">
                            <span className="flex-shrink-0">✕</span><span>{err}</span>
                          </div>
                        ))}
                        {derived.warnings.length > 0 && derived.warnings.map((warn, i) => (
                          <div key={i} className="flex items-start gap-2 px-3 py-1.5 rounded-md border border-sig-yellow/30 bg-sig-yellow-dim text-2xs text-sig-yellow leading-snug">
                            <span className="flex-shrink-0">⚠</span><span>{warn}</span>
                          </div>
                        ))}

                        {previewFlags.length > 0 ? (
                          <div className="rounded bg-wiz-bg border border-wiz-border/20 px-4 py-3">
                            <code className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
                              {previewFlags.map((flag, i) => (
                                <span key={i}>
                                  {i > 0 && ' '}
                                  <span className={flagColor(flag)}>{flag}</span>
                                </span>
                              ))}
                            </code>
                          </div>
                        ) : (
                          <p className="text-xs text-wiz-muted/40 italic">No flags configured — JVM will use ergonomic defaults</p>
                        )}

                        {previewFlags.length > 0 && (
                          <div className="flex items-center gap-4 text-2xs text-wiz-muted/50">
                            <span className="flex items-center gap-1.5"><span className="w-2 h-px bg-sig-blue" />Heap</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-px bg-sig-green" />GC</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-px bg-sig-yellow" />Tuning</span>
                            <span className="flex items-center gap-1.5"><span className="w-2 h-px bg-sig-purple" />Meta / stack</span>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                </div>
                )} {/* end jvmConfigEnabled */}
              </div>



            </div>
          </>
        )}

        {/* ─── Step 4: Review & Deploy ──────────────────────────── */}
        {step === 4 && (
          <>
            <div className="flex flex-col gap-4">

              {/* ── Info banner (top) ── */}
              {form.environment.toUpperCase() === 'PROD' ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded border border-sig-purple/30 bg-sig-purple-dim">
                  <AlertTriangle size={16} className="text-sig-purple flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-sig-purple">
                      You are deploying to <span className="font-bold">PRODUCTION</span>.
                    </span>
                    <p className="text-xs text-sig-purple/60 mt-0.5">Verify all details below before proceeding.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded border border-wiz-border bg-wiz-raised">
                  <Info size={15} className="text-wiz-gold/70 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-wiz-cream/90">Ready to deploy</span>
                    <p className="text-xs text-wiz-muted/50 mt-0.5">Review your configuration below, then click <span className="text-wiz-cream font-medium">Deploy</span> to begin. Click <span className="text-wiz-cream font-medium">Edit</span> on any section to make changes.</p>
                  </div>
                </div>
              )}

              {/* ── Target Server (panel 1 — green theme) ── */}
              <div className="rounded border border-wiz-border border-l-2 border-l-sig-green/50 bg-wiz-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-green-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-sig-green/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-green flex-1">Target Server</h3>
                  <button type="button" onClick={() => { setStep(1); setTimeout(() => document.getElementById('ssh-target-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} className="text-[11px] font-semibold px-2.5 py-1 rounded border border-sig-green/30 bg-sig-green-dim text-sig-green/70 hover:text-sig-green hover:border-sig-green/50 hover:bg-sig-green-dim/40 transition-all duration-150">Edit</button>
                </div>
                <div className="px-4 py-2.5 flex flex-col gap-0">
                  <ReviewRow label="Environment" value={form.environment.toUpperCase()} badge />
                  <ReviewRow label="SSH Target" value={`${form.sshUser}@${form.sshHost}:${form.sshPort}`} mono />
                  <ReviewRow label="Install Path" value={`${form.targetBasePath}/${form.appName || '<appName>'}`} mono />
                  <ReviewRow label="Java Binary" value={form.javaCommand} mono />

                  {/* Certificates (inline in target server) */}
                  {form.hasCerts && form.certUploads.filter(c => c.source.trim() && c.targetPath.trim() && c.file).length > 0 && (
                    <>
                      <div className="border-t border-wiz-border/20 mt-2 pt-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-wiz-muted/40">Certificates</span>
                        <button type="button" onClick={() => { setStep(3); setTimeout(() => document.getElementById('certs-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-sig-green/30 bg-sig-green-dim text-sig-green/70 hover:text-sig-green hover:border-sig-green/50 hover:bg-sig-green-dim/40 transition-all duration-150">Edit</button>
                      </div>
                      {form.certUploads
                        .filter(c => c.source.trim() && c.targetPath.trim() && c.file)
                        .map((c, i) => (
                          <ReviewRow key={`cert-${i}`} label={c.source} value={c.targetPath} mono />
                        ))}
                    </>
                  )}

                  {/* Extra Directories (inline in target server) */}
                  {form.hasExtraDirs && form.extraDirs.filter(d => d.dirName.trim() && d.targetPath.trim() && d.file).length > 0 && (
                    <>
                      <div className="border-t border-wiz-border/20 mt-2 pt-2 flex items-center justify-between">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-wiz-muted/40">Additional Directories</span>
                        <button type="button" onClick={() => { setStep(3); setTimeout(() => document.getElementById('extra-dirs-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} className="text-[10px] font-semibold px-2 py-0.5 rounded border border-sig-green/30 bg-sig-green-dim text-sig-green/70 hover:text-sig-green hover:border-sig-green/50 hover:bg-sig-green-dim/40 transition-all duration-150">Edit</button>
                      </div>
                      {form.extraDirs
                        .filter(d => d.dirName.trim() && d.targetPath.trim() && d.file)
                        .map((d, i) => (
                          <ReviewRow key={`dir-${i}`} label={d.dirName} value={d.targetPath} mono />
                        ))}
                    </>
                  )}
                </div>
              </div>

              {/* ── Application (panel 2 — blue theme) ── */}
              <div className="rounded border border-wiz-border border-l-2 border-l-sig-blue/50 bg-wiz-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-blue-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-sig-blue/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-blue flex-1">Application</h3>
                  <button type="button" onClick={() => { setStep(2); setTimeout(() => document.getElementById('app-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} className="text-[11px] font-semibold px-2.5 py-1 rounded border border-sig-blue/30 bg-sig-blue-dim/20 text-sig-blue/70 hover:text-sig-blue hover:border-sig-blue/50 hover:bg-sig-blue-dim/40 transition-all duration-150">Edit</button>
                </div>
                <div className="px-4 py-2.5 flex flex-col gap-0">
                  <ReviewRow label="Application" value={form.appName} />
                  <ReviewRow label="JAR File" value={form.jarName || form.jarArtifact?.name || '—'} mono />
                  <ReviewRow label="JAR Type" value={form.jarType === 'fat' ? 'Fat JAR (self-contained)' : 'Thin JAR (external lib/)'} />
                  <ReviewRow label="Main Class" value={form.mainClass} mono />
                  <ReviewRow label="Server Port" value={form.serverPort} />
                  <ReviewRow label="Run As User" value={form.runAsUser} />
                </div>
              </div>

              {/* ── Deployment Options (panel 3 — crimson theme) ── */}
              <div className="rounded border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-surface overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-gold-dim">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold flex-1">Deployment Options</h3>
                  <button type="button" onClick={() => { setStep(3); setTimeout(() => document.getElementById('backup-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50) }} className="text-[11px] font-semibold px-2.5 py-1 rounded border border-wiz-gold/30 bg-wiz-gold/10 text-wiz-gold/70 hover:text-wiz-gold hover:border-wiz-gold/50 hover:bg-wiz-gold/20 transition-all duration-150">Edit</button>
                </div>
                <div className="px-4 py-2.5 flex flex-col gap-0">
                  <ReviewRow label="Backup" value={form.performBackup ? `Enabled — keep ${form.maxBackups} release${parseInt(form.maxBackups) !== 1 ? 's' : ''}` : 'Disabled'} />
                  <ReviewRow label="Stability Check" value={`${form.stabilityWindow}s post-startup monitoring`} />
                  <ReviewRow label="Log Rotation" value={`${form.maxLogSize} per file, ${form.maxLogFiles} files max`} />
                  {!jvmConfigEnabled ? (
                    <ReviewRow label="JVM" value="Ergonomic defaults — no custom flags" />
                  ) : (
                    <>
                      {form.xms && (
                        <ReviewRow label="Heap" value={`${form.xms} (min) — ${form.xmx} (max)`} />
                      )}
                      {(() => {
                        const derived = deriveJvmFlags({
                          xms: form.xms, xmx: form.xmx,
                          gcType, workloadProfile, containerAware, advancedGcTuning, maxGcPauseMs,
                          metaspaceSize:   advancedJvmEnabled ? metaspaceSize   : '',
                          threadStackSize: advancedJvmEnabled ? threadStackSize : '',
                          javaVersion: form.javaVersion,
                          maxRamPct,
                        })
                        const allFlags = [
                          form.xms ? `-Xms${form.xms}` : null,
                          form.xmx ? `-Xmx${form.xmx}` : null,
                          ...derived.flags,
                          ...form.extraOpts.filter(Boolean),
                        ].filter((f): f is string => Boolean(f))

                        if (allFlags.length === 0) return null

                        return (
                          <ReviewRow label="JVM Flags" value={allFlags.join('  ')} mono />
                        )
                      })()}
                    </>
                  )}
                </div>
              </div>


            </div>
          </>
        )}

      </div> {/* end wiz-card */}

      {/* ── Navigation buttons ──
          On Step 4: sticky to viewport bottom so Deploy is always visible.
          Other steps: regular bottom placement with breathing room. */}
      <div className={clsx(
        'flex items-center justify-between mt-8 pb-4',
        step === 4 && 'sticky bottom-0 z-30 -mx-5 px-5 py-3 bg-wiz-bg/95 border-t border-wiz-border/60 backdrop-blur-sm',
      )}>
        {/* Prev — compact secondary */}
        <div>
          {step > 1 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-wiz-cream/80 bg-wiz-surface border border-wiz-border hover:border-wiz-gold/40 hover:text-wiz-cream hover:-translate-x-0.5 transition-all duration-200"
              style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
            >
              <ArrowLeft size={12} strokeWidth={2.5} className="text-wiz-gold/70 group-hover:text-wiz-gold group-hover:-translate-x-0.5 transition-all" />
              <span>Previous</span>
            </button>
          ) : <div />}
        </div>

        {/* Next / Deploy — compact primary */}
        <div className="flex flex-col items-end gap-1">
          {step < 4 ? (
            <>
              <button
                type="button"
                onClick={handleNext}
                disabled={step === 2 && pathBlocksStep2}
                title={step === 2 && pathBlocksStep2 ? 'Fix the deploy path on the server first' : undefined}
                className={clsx(
                  'group inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12px] font-semibold text-white bg-wiz-gold hover:bg-wiz-gold-light hover:translate-x-0.5 active:scale-95 transition-all duration-200',
                  step === 2 && pathBlocksStep2 && 'opacity-50 cursor-not-allowed hover:translate-x-0',
                )}
                style={{ boxShadow: '0 3px 10px rgba(139,26,26,0.28), 0 1px 2px rgba(139,26,26,0.18), inset 0 1px 0 rgba(255,255,255,0.15)' }}
                onMouseEnter={(e) => { if (!(step === 2 && pathBlocksStep2)) { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 16px rgba(139,26,26,0.36), 0 2px 4px rgba(139,26,26,0.22), inset 0 1px 0 rgba(255,255,255,0.18)' } }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 3px 10px rgba(139,26,26,0.28), 0 1px 2px rgba(139,26,26,0.18), inset 0 1px 0 rgba(255,255,255,0.15)' }}
              >
                <span>Next step</span>
                <ArrowRight size={12} strokeWidth={2.5} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
              {step === 2 && pathBlocksStep2 && (
                <p className="text-[10px] text-sig-yellow leading-tight max-w-[280px] text-right">
                  Fix the deploy path on the server (see the panel above the runtime row) before continuing.
                </p>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className={clsx(
                'group inline-flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-bold text-white bg-wiz-gold hover:bg-wiz-gold-light hover:scale-[1.03] active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed',
                submitting && 'animate-pulse',
              )}
              style={{ boxShadow: '0 4px 14px rgba(139,26,26,0.36), 0 2px 4px rgba(139,26,26,0.22), inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 3px rgba(255,255,255,0.5)' }}
            >
              <Wand2 size={14} strokeWidth={2.4} className="group-hover:rotate-[-12deg] transition-transform" />
              <span>{submitting ? 'Deploying…' : 'Deploy'}</span>
            </button>
          )}
        </div>
      </div>

      </div> {/* end left column */}

      {/* ── Right column — Mission Control sidebar (xl+ only) ──
          Sticky offset clears the redesigned step navigation panel above
          (~180px tall: status pills + progress bar + step circles).
          self-start prevents flex stretch; max-h + overflow handles
          short viewports where the panels would otherwise overflow. */}
      <div className="hidden xl:block self-start sticky" style={{ top: 200 }}>
        <div
          className="overflow-y-auto scrollbar-thin pr-1 -mr-1"
          style={{ maxHeight: 'calc(100vh - 220px)' }}
        >
          <MissionControl
            step={step}
            form={form}
            testConnState={testConnState}
            autoFilledFields={autoFilledFields}
            jvmConfigEnabled={jvmConfigEnabled}
            jvmFlags={missionControlJvmFlags}
            gcType={gcType}
            containerAware={containerAware}
          />
        </div>
      </div>

      </div> {/* end flex row */}

      </> /* end of non-uploading fragment */
    )} {/* end of uploadProgress ternary */}

    </> /* end root fragment */
  )
}
