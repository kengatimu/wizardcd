import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Rocket, Key, Upload, Check, X, Copy, Wifi, WifiOff, Loader2, Shield, Plus, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { submitJob, fetchRunnerPublicKeys, fetchRunnerInfo, testSshConnection } from '../api/jobs'
import type { DeploymentRequest } from '../types/DeploymentRequest'
import FormField, { SelectField, FieldWrapper } from '../components/FormField'
import ToggleSwitch from '../components/ToggleSwitch'
import DynamicList from '../components/DynamicList'
import { useTheme, type ActiveEnv } from '../context/ThemeContext'

// ── Step metadata ─────────────────────────────────────────────────

const STEPS = [
  { id: 1, num: '01', label: 'Target Server' },
  { id: 2, num: '02', label: 'Application' },
  { id: 3, num: '03', label: 'Java'        },
  { id: 4, num: '04', label: 'Process'     },
  { id: 5, num: '05', label: 'Backup'      },
  { id: 6, num: '06', label: 'File Uploads' },
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
  SIT:  { border: 'border-l-sig-blue/60',   dot: 'bg-sig-blue',   text: 'text-sig-blue',   header: 'bg-sig-blue-dim'   },
  UAT:  { border: 'border-l-sig-yellow/60', dot: 'bg-sig-yellow', text: 'text-sig-yellow', header: 'bg-sig-yellow-dim' },
  PROD: { border: 'border-l-sig-purple/60', dot: 'bg-sig-purple', text: 'text-sig-purple', header: 'bg-sig-purple-dim' },
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
  // Step 5 — Backup
  performBackup: boolean
  maxBackups:    string
  // Step 6 — File Uploads
  jarArtifact: File | null      // the application JAR (always required)
  libZip:      File | null      // lib/ dependencies ZIP (thin JAR mode only)
  certUploads: CertUpload[]     // cert/keystore entries, each with its own ZIP
  extraDirs:   ExtraDirUpload[] // extra directory entries, each with its own ZIP
  jarName:     string           // auto-filled from jarArtifact filename
}

function getDefaultEnv(): string {
  const stored = localStorage.getItem('wiz-active-env')
  return stored && ['SIT', 'UAT', 'PROD'].includes(stored)
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
  maxLogSize:     '',
  maxLogFiles:    '',
  jarType:        'fat',
  performBackup:  true,
  maxBackups:     '5',
  jarArtifact:    null,
  libZip:         null,
  certUploads:    [],
  extraDirs:      [],
  jarName:        '',
}

// ── Per-step validation ───────────────────────────────────────────

type FormErrors = Partial<Record<keyof FormState, string>>

function validateStep(step: number, form: FormState): FormErrors {
  const e: FormErrors = {}
  switch (step) {
    case 1:  // SSH Target
      if (!form.sshUser)        e.sshUser        = 'Required'
      if (!form.sshHost)        e.sshHost        = 'Required'
      if (!form.sshPort)        e.sshPort        = 'Required'
      if (!form.targetBasePath) e.targetBasePath = 'Required'
      break
    case 2:  // Identity
      if (!form.appName)   e.appName   = 'Required'
      if (!form.mainClass) e.mainClass = 'Required'
      break
    case 3:  // Java / JVM
      if (!form.javaCommand) e.javaCommand = 'Required'
      if (!form.javaVersion) e.javaVersion = 'Required'
      if (!form.xms)         e.xms         = 'Required'
      if (!form.xmx)         e.xmx         = 'Required'
      break
    case 4:  // Runtime
      if (!form.runAsUser)  e.runAsUser  = 'Required'
      if (!form.serverPort) e.serverPort = 'Required'
      break
    case 5:
      // no required fields
      break
    case 6:
      if (!form.jarArtifact) {
        e.jarArtifact = 'Required'
      } else if (!form.jarArtifact.name.toLowerCase().endsWith('.jar')) {
        e.jarArtifact = 'Must be a .jar file'
      }
      if (!form.jarName.trim()) e.jarName = 'Required'
      if (form.jarType === 'thin') {
        if (!form.libZip) {
          e.libZip = 'Required for Thin JAR — upload your lib/ directory as a .zip'
        } else if (!form.libZip.name.toLowerCase().endsWith('.zip')) {
          e.libZip = 'Must be a .zip file'
        }
      }
      break
  }
  return e
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
): StepStatus {
  if (stepId === activeStep) return 'active'
  if (!visited.has(stepId))  return 'unvisited'
  return Object.keys(validateStep(stepId, form)).length === 0 ? 'complete' : 'incomplete'
}

// ── Build DeploymentRequest ───────────────────────────────────────

function buildRequest(form: FormState): DeploymentRequest {
  return {
    appName:        form.appName,
    environment:    form.environment,
    mainClass:      form.mainClass,
    jarName:        form.jarName || form.jarArtifact?.name || '',
    javaCommand:    form.javaCommand,
    javaVersion:    parseInt(form.javaVersion,  10),
    xms:            form.xms,
    xmx:            form.xmx,
    newRatio:       form.newRatio,
    extraOpts:      form.extraOpts.filter(Boolean),
    runAsUser:      form.runAsUser,
    serverPort:     parseInt(form.serverPort,   10),
    maxLogSize:     form.maxLogSize,
    maxLogFiles:    parseInt(form.maxLogFiles,  10),
    // 'lib' triggers EXTERNAL_LIB mode in the Tanuki wrapper config generator;
    // empty string triggers FAT_JAR mode (deploy.sh uses this to pick the classpath).
    libPath:        form.jarType === 'thin' ? 'lib' : '',
    extraDirs:      form.extraDirs
      .filter((d) => d.dirName.trim() && d.targetPath.trim())
      .map((d) => ({ dirName: d.dirName.trim(), targetPath: d.targetPath.trim() })),
    certPaths:      form.certUploads
      .filter((c) => c.source.trim() && c.targetPath.trim())
      .map((c) => ({ source: c.source.trim(), targetPath: c.targetPath.trim() })),
    sshUser:        form.sshUser,
    sshHost:        form.sshHost,
    sshPort:        parseInt(form.sshPort,      10),
    targetBasePath: form.targetBasePath,
    performBackup:  form.performBackup,
    maxBackups:     parseInt(form.maxBackups,   10),
  }
}

// ── Step tab ──────────────────────────────────────────────────────

interface StepTabProps {
  num:     string
  label:   string
  status:  StepStatus
  onClick: () => void
}

function StepTab({ num, label, status, onClick }: StepTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-lg border font-mono text-sm',
        'transition-all duration-150 whitespace-nowrap cursor-pointer',
        status === 'active'
          ? 'border-wiz-gold       text-wiz-gold    bg-wiz-gold/5          shadow-gold-sm'
          : status === 'complete'
          ? 'border-sig-green/40   text-sig-green   bg-sig-green-dim/60    hover:border-sig-green/60  hover:bg-sig-green-dim'
          : status === 'incomplete'
          ? 'border-sig-yellow/40  text-sig-yellow  bg-sig-yellow-dim/40   hover:border-sig-yellow/60 hover:bg-sig-yellow-dim'
          : /* unvisited */
            'border-wiz-border/50  text-wiz-muted   bg-wiz-bg              hover:border-wiz-border    hover:text-wiz-gray',
      )}
    >
      {/* Number / icon badge */}
      <span className={clsx(
        'flex-shrink-0 flex items-center justify-center',
        status === 'active'     ? 'text-wiz-gold'   :
        status === 'complete'   ? 'text-sig-green'  :
        status === 'incomplete' ? 'text-sig-yellow' :
                                  'text-wiz-muted',
      )}>
        {status === 'complete'
          ? <Check         size={12} strokeWidth={2.5} />
          : status === 'incomplete'
          ? <AlertTriangle size={12} strokeWidth={2.5} />
          : <span className="font-bold text-xs">{num}</span>
        }
      </span>
      <span className="font-medium">{label}</span>
    </button>
  )
}

// ── Section heading ───────────────────────────────────────────────

function StepHeading({ num, label }: { num: string; label: string }) {
  return (
    <h2 className="flex items-center gap-2 font-mono font-bold text-sm text-wiz-gold tracking-wider mb-6">
      <span>{num} —</span>
      <span className="uppercase">{label}</span>
    </h2>
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
          'min-h-[200px] rounded-xl cursor-pointer',
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
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-sig-green/40 bg-sig-green-dim text-xs">
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
          'flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed',
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

// ── Main Page ─────────────────────────────────────────────────────

export default function DeployPage() {
  const navigate = useNavigate()
  const { activeEnv, setActiveEnv } = useTheme()

  const [step,      setStep]      = useState(1)
  const [visited,   setVisited]   = useState<Set<number>>(new Set([1]))
  const [form,      setForm]      = useState<FormState>(INITIAL)
  const [errors,    setErrors]    = useState<FormErrors>({})
  const [submitting,setSubmitting]= useState(false)

  // ── Runner public keys, runner info & SSH test ──────────────────
  const [publicKeys,    setPublicKeys]    = useState<Record<string, string> | null>(null)
  const [keysLoading,   setKeysLoading]   = useState(false)
  const [keysError,     setKeysError]     = useState<string | null>(null)
  const [copiedKey,     setCopiedKey]     = useState(false)
  const [copiedScript,  setCopiedScript]  = useState(false)
  const [runnerPublicIp, setRunnerPublicIp] = useState<string>('')
  const [copiedIp,       setCopiedIp]      = useState(false)
  const [testConnState, setTestConnState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testConnMsg,   setTestConnMsg]   = useState<string | null>(null)

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
      .then((keys) => { setPublicKeys(keys); setKeysError(null) })
      .catch(() => setKeysError('Could not fetch runner public keys. Please contact your administrator.'))
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
    setErrors((p) => { const n = { ...p }; delete n[key]; return n })
  }, [])

  // Handle JAR artifact upload.
  // Auto-fills jarName from the filename when a .jar is selected.
  const handleJarArtifact = (file: File | null) => {
    set('jarArtifact', file)
    if (file?.name.toLowerCase().endsWith('.jar')) {
      set('jarName', file.name)
    } else {
      set('jarName', '')
    }
  }

  const goTo = (n: number) => {
    setErrors({})
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

  const handleNext = () => {
    setErrors({})
    const next = step + 1
    setVisited((prev) => new Set([...prev, next]))
    setStep(next)
  }

  const handlePrev = () => {
    setErrors({})
    setStep((s) => s - 1)
  }

  const handleSubmit = async () => {
    // Reveal all step statuses before validation so the user can see which tabs
    // are highlighted as incomplete (yellow warning triangles).
    setVisited(new Set([1, 2, 3, 4, 5, 6]))

    // Final validation of all steps — collect errors and incomplete step names
    let allErrors: FormErrors = {}
    const incompleteStepLabels: string[] = []
    for (let s = 1; s <= 6; s++) {
      const stepErrors = validateStep(s, form)
      if (Object.keys(stepErrors).length > 0) {
        incompleteStepLabels.push(STEPS[s - 1].label)
        allErrors = { ...allErrors, ...stepErrors }
      }
    }
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors)
      toast.error(`Incomplete: ${incompleteStepLabels.join(', ')}`)
      return
    }

    setSubmitting(true)
    try {
      const req        = buildRequest(form)
      const certFiles  = form.certUploads.filter((c) => c.file).map((c) => c.file!)
      const extraFiles = form.extraDirs.filter((d) => d.file).map((d) => d.file!)
      const res = await submitJob(
        req,
        form.jarArtifact!,
        form.libZip ?? undefined,
        certFiles.length  > 0 ? certFiles  : undefined,
        extraFiles.length > 0 ? extraFiles : undefined,
      )
      toast.success(`Deployment started — Job ${res.jobId.slice(0, 8)}`)
      navigate(`/jobs/${res.jobId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deployment failed to start.'
      toast.error(msg)
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
      setTestConnState(res.success ? 'ok' : 'fail')
      setTestConnMsg(res.message ?? null)
    } catch {
      setTestConnState('fail')
      setTestConnMsg('Connection test failed. Verify host, port, and that the key is authorized.')
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl animate-fade-in">

      {/* ── Page title ── */}
      <div>
        <h1 className="text-2xl font-bold text-wiz-cream">New Deployment</h1>
        <p className="text-sm text-wiz-muted mt-0.5">
          One Config. One Command. Continuous Magic.
        </p>
      </div>

      {/* ── Step tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((s) => (
          <StepTab
            key={s.id}
            num={s.num}
            label={s.label}
            status={getStepStatus(s.id, step, visited, form)}
            onClick={() => goTo(s.id)}
          />
        ))}
      </div>

      {/* ── Step content card ── */}
      <div className="wiz-card p-6 animate-fade-in" key={step}>

        {/* ─── Step 1: SSH Target ────────────────────────────── */}
        {step === 1 && (
          <>
            <StepHeading num="01" label="Target Server" />
            <div className="flex flex-col gap-5">

              {/* ── SSH TARGET CONFIGURATION PANEL ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-panel overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                    SSH Target Configuration
                  </h3>
                </div>
                {/* Panel body */}
                <div className="p-5 flex flex-col gap-5">
                  {/* Environment — determines which SSH key the runner uses */}
                  <SelectField
                    label="ENVIRONMENT"
                    name="environment"
                    required
                    hint="Deployment environment profile. Determines which SSH key the runner uses to connect, and the Spring profile activated on the target server."
                    value={form.environment}
                    onChange={(e) => {
                      set('environment', e.target.value)
                      setActiveEnv(e.target.value as ActiveEnv)
                    }}
                    options={[
                      { value: 'SIT',  label: 'SIT — System Integration Testing' },
                      { value: 'UAT',  label: 'UAT — User Acceptance Testing' },
                      { value: 'PROD', label: 'PROD — Production' },
                    ]}
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      label="SSH USER"
                      name="sshUser"
                      required
                      placeholder="deploy"
                      hint="Linux user used to connect to the target server via SSH (e.g. deploy, ubuntu, ec2-user)"
                      value={form.sshUser}
                      onChange={(e) => set('sshUser', e.target.value)}
                      error={errors.sshUser}
                    />
                    <FormField
                      label="SSH HOST"
                      name="sshHost"
                      required
                      placeholder="192.168.56.10"
                      hint="Public IP or hostname the runner uses to SSH into this server. Use the server's Elastic IP (AWS), static public IP (GCP/Azure), or a DNS hostname."
                      value={form.sshHost}
                      onChange={(e) => set('sshHost', e.target.value)}
                      error={errors.sshHost}
                    />
                    <FormField
                      label="SSH PORT"
                      name="sshPort"
                      required
                      type="number"
                      placeholder="22"
                      hint="Port used by the SSH service on the target server (default: 22)"
                      value={form.sshPort}
                      onChange={(e) => set('sshPort', e.target.value)}
                      error={errors.sshPort}
                    />
                  </div>
                  <FormField
                    label="TARGET BASE PATH"
                    name="targetBasePath"
                    required
                    placeholder="/opt/apps/my-service"
                    hint="Directory on the target server where the application will be deployed"
                    value={form.targetBasePath}
                    onChange={(e) => set('targetBasePath', e.target.value)}
                    error={errors.targetBasePath}
                  />
                </div>
              </div>

              {/* ── FIREWALL SETUP PANEL ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-sig-blue/50 bg-wiz-panel overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-blue-dim/40">
                  <Shield size={13} className="text-sig-blue opacity-80 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-blue">
                    Firewall Setup
                  </h3>
                </div>
                {/* Panel body */}
                <div className="p-5 flex flex-col gap-5">
                  <p className="text-xs text-wiz-muted leading-relaxed">
                    Before testing the connection, allow SSH (port&nbsp;22) from the WizardCD
                    runner on your target server's firewall.
                  </p>

                  {/* Runner IP display + copy */}
                  <div className="flex flex-col gap-2">
                    <p className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                      Runner Public IP
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-h-[40px] flex items-center bg-wiz-bg border border-wiz-border rounded-lg px-4
                                      font-mono text-sm text-wiz-cream select-all">
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
                          'inline-flex items-center gap-1.5 font-mono text-xs px-2.5 rounded-md h-10',
                          'border transition-all duration-150 disabled:opacity-40',
                          copiedIp
                            ? 'border-sig-green/40 bg-sig-green-dim text-sig-green'
                            : 'border-wiz-border bg-wiz-raised text-wiz-gray hover:text-wiz-cream hover:border-wiz-border/60',
                        )}
                      >
                        {copiedIp
                          ? <><Check size={11} /> Copied!</>
                          : <><Copy  size={11} /> Copy</>
                        }
                      </button>
                    </div>
                  </div>

                  {/* Per-platform whitelist reference table */}
                  <div className="flex flex-col gap-2">
                    <p className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                      Whitelist Command Reference
                    </p>
                    <div className="rounded-lg border border-wiz-border overflow-hidden">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="bg-wiz-raised border-b border-wiz-border/60">
                            <th className="text-left px-4 py-2.5 text-wiz-muted font-semibold uppercase tracking-wider w-44">
                              Platform
                            </th>
                            <th className="text-left px-4 py-2.5 text-wiz-muted font-semibold uppercase tracking-wider">
                              Rule
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-wiz-border/40">
                          {[
                            {
                              platform: 'AWS Security Group',
                              rule: `Inbound: SSH  TCP  22  ${runnerPublicIp || '<IP>'}/32`,
                            },
                            {
                              platform: 'GCP Firewall',
                              rule: `Source ranges: ${runnerPublicIp || '<IP>'}/32  Port: 22`,
                            },
                            {
                              platform: 'Azure NSG',
                              rule: `Source: ${runnerPublicIp || '<IP>'}/32  Dest port: 22  Allow`,
                            },
                            {
                              platform: 'iptables',
                              rule: `sudo iptables -A INPUT -s ${runnerPublicIp || '<IP>'} -p tcp --dport 22 -j ACCEPT`,
                            },
                          ].map(({ platform, rule }) => (
                            <tr key={platform} className="bg-wiz-bg hover:bg-wiz-surface/50 transition-colors">
                              <td className="px-4 py-2.5 text-wiz-gray font-semibold">{platform}</td>
                              <td className="px-4 py-2.5 text-wiz-cream/80 break-all">{rule}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              </div>

              {/* ── SSH KEYS CONFIGURATION PANEL ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-panel overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                    SSH Keys Configuration
                  </h3>
                </div>
                {/* Panel body */}
                <div className="p-5 flex flex-col gap-5">

                  {/* ── Per-environment runner public key panel ── */}
                  <div className={clsx(
                    'rounded-xl border border-wiz-border border-l-2 bg-wiz-panel overflow-hidden',
                    envKeyStyle.border,
                  )}>
                    {/* Panel header */}
                    <div className={clsx(
                      'flex items-center gap-2.5 px-5 py-3.5',
                      'border-b border-wiz-border/60',
                      envKeyStyle.header,
                    )}>
                      <Key size={13} className={clsx(envKeyStyle.text, 'flex-shrink-0 opacity-80')} />
                      <h3 className={clsx('font-mono font-semibold text-xs uppercase tracking-widest', envKeyStyle.text)}>
                        {form.environment} — Runner Public Key
                      </h3>
                    </div>

                    {/* Panel body */}
                    <div className="p-5 flex flex-col gap-5">
                      {keysLoading ? (
                        <div className="flex items-center gap-2 text-wiz-muted text-xs py-2">
                          <Loader2 size={13} className="animate-spin" />
                          Fetching runner public key…
                        </div>
                      ) : keysError ? (
                        <p className="text-xs text-sig-red">{keysError}</p>
                      ) : (
                        <>
                          {/* Intro */}
                          <p className="text-xs text-wiz-muted leading-relaxed">
                            The runner uses this key to SSH into your server. Authorise it for the{' '}
                            <span className="font-mono text-wiz-cream">{form.sshUser || 'SSH user'}</span>{' '}
                            account on{' '}
                            <span className="font-mono text-wiz-cream">{form.sshHost || 'your target server'}</span>{' '}
                            using either option below.
                          </p>

                          {/* ── Option A — Add key manually ── */}
                          <div className="flex flex-col gap-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                                Option A — Add key manually
                              </p>
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
                                {copiedKey
                                  ? <><Check size={11} /> Copied!</>
                                  : <><Copy  size={11} /> Copy Key</>
                                }
                              </button>
                            </div>
                            <p className="text-xs text-wiz-muted leading-relaxed">
                              Copy this key and append it to{' '}
                              <span className="font-mono text-wiz-cream">~/.ssh/authorized_keys</span>{' '}
                              on{' '}
                              <span className="font-mono text-wiz-cream">{form.sshHost || 'your target server'}</span>{' '}
                              under the{' '}
                              <span className="font-mono text-wiz-cream">{form.sshUser || 'SSH user'}</span>{' '}
                              account.
                            </p>
                            <div className="bg-wiz-bg border border-wiz-border rounded-lg px-4 py-3
                                            font-mono text-xs text-wiz-gray break-all leading-relaxed select-all">
                              {envKey || (
                                <span className="text-wiz-muted italic">
                                  Key not available for {form.environment}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ── "or" divider ── */}
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-wiz-border/60" />
                            <span className="font-mono text-xs text-wiz-muted uppercase tracking-widest">or</span>
                            <div className="flex-1 h-px bg-wiz-border/60" />
                          </div>

                          {/* ── Option B — Setup Script (Recommended) ── */}
                          <div className="flex flex-col gap-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                                Option B — Setup script{' '}
                                <span className="ml-1 normal-case tracking-normal font-normal text-sig-green">
                                  · Recommended
                                </span>
                              </p>
                              <button
                                type="button"
                                onClick={handleCopyScript}
                                disabled={!envKey}
                                className={clsx(
                                  'inline-flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-md',
                                  'border transition-all duration-150 disabled:opacity-40',
                                  copiedScript
                                    ? 'border-sig-green/40 bg-sig-green-dim text-sig-green'
                                    : 'border-wiz-border bg-wiz-raised text-wiz-gray hover:text-wiz-cream hover:border-wiz-border/60',
                                )}
                              >
                                {copiedScript
                                  ? <><Check size={11} /> Copied!</>
                                  : <><Copy  size={11} /> Copy Script</>
                                }
                              </button>
                            </div>
                            <p className="text-xs text-wiz-muted leading-relaxed">
                              SSH into{' '}
                              <span className="font-mono text-wiz-cream">{form.sshHost || 'your target server'}</span>{' '}
                              as{' '}
                              <span className="font-mono text-wiz-cream">{form.sshUser || 'the SSH user'}</span>{' '}
                              and run this script. It creates{' '}
                              <span className="font-mono text-wiz-cream">.ssh</span>{' '}
                              with correct permissions and appends the key to{' '}
                              <span className="font-mono text-wiz-cream">authorized_keys</span>{' '}
                              automatically.
                            </p>
                            <div className="bg-wiz-bg border border-wiz-border rounded-lg px-4 py-3 overflow-x-auto">
                              <pre className="font-mono text-xs text-wiz-gray leading-6 whitespace-pre m-0 select-all">{setupScript}</pre>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Test Connection ── */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleTestConnection()}
                      disabled={!form.sshUser || !form.sshHost || !form.sshPort || testConnState === 'testing'}
                      className={clsx(
                        'btn-secondary gap-2',
                        testConnState === 'ok'   && 'border-sig-green/40 text-sig-green hover:border-sig-green/60',
                        testConnState === 'fail' && 'border-sig-red/40   text-sig-red   hover:border-sig-red/60',
                      )}
                    >
                      {testConnState === 'testing'
                        ? <><Loader2 size={13} className="animate-spin" /> Testing Connection…</>
                        : testConnState === 'ok'
                        ? <><Wifi    size={13} /> Connection OK</>
                        : testConnState === 'fail'
                        ? <><WifiOff size={13} /> Connection Failed</>
                        : <><Wifi    size={13} /> Test Connection</>
                      }
                    </button>
                    {testConnMsg && (
                      <p className={clsx(
                        'text-xs',
                        testConnState === 'ok' ? 'text-sig-green' : 'text-sig-red',
                      )}>
                        {testConnMsg}
                      </p>
                    )}
                  </div>

                </div>{/* ── end SSH KEYS panel body ── */}
              </div>{/* ── end SSH KEYS CONFIGURATION PANEL ── */}

            </div>
          </>
        )}

        {/* ─── Step 2: Identity ──────────────────────────────── */}
        {step === 2 && (
          <>
            <StepHeading num="02" label="Application" />
            <div className="flex flex-col gap-5">
              <FormField
                label="APP NAME"
                name="appName"
                required
                placeholder="my-service-ms"
                hint="Unique application identifier. Typically the Spring Boot service name defined in application.yml (spring.application.name)"
                value={form.appName}
                onChange={(e) => set('appName', e.target.value)}
                error={errors.appName}
              />
              <FormField
                label="MAIN CLASS"
                name="mainClass"
                required
                placeholder="com.example.MyServiceMsApplication"
                hint="Fully qualified Spring Boot main class used to start the application"
                value={form.mainClass}
                onChange={(e) => set('mainClass', e.target.value)}
                error={errors.mainClass}
              />
            </div>
          </>
        )}

        {/* ─── Step 3: Java / JVM ────────────────────────────── */}
        {step === 3 && (
          <>
            <StepHeading num="03" label="Java" />

            <div className="flex flex-col gap-5">

              {/* ── JAVA CONFIGURATION PANEL ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-panel overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                    Java Configuration
                  </h3>
                </div>
                {/* Panel body */}
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      label="JAVA PATH"
                      name="javaCommand"
                      required
                      placeholder="/usr/lib/jvm/temurin-21/bin/java"
                      hint="Absolute path to the Java binary on the target server."
                      value={form.javaCommand}
                      onChange={(e) => set('javaCommand', e.target.value)}
                      error={errors.javaCommand}
                    />
                    <FormField
                      label="JAVA VERSION"
                      name="javaVersion"
                      required
                      type="number"
                      placeholder="21"
                      hint="Java major version installed on the target server e.g. 21"
                      value={form.javaVersion}
                      onChange={(e) => set('javaVersion', e.target.value)}
                      error={errors.javaVersion}
                    />
                  </div>
                </div>
              </div>

              {/* ── JVM CONFIGURATION PANEL ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-panel overflow-hidden">
                {/* Panel header */}
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                    JVM Configuration
                  </h3>
                </div>
                {/* Panel body */}
                <div className="p-5 flex flex-col gap-5">
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      label="XMS (HEAP MIN)"
                      name="xms"
                      required
                      placeholder="512m"
                      hint="Initial JVM heap size e.g. 512m or 1g"
                      value={form.xms}
                      onChange={(e) => set('xms', e.target.value)}
                      error={errors.xms}
                    />
                    <FormField
                      label="XMX (HEAP MAX)"
                      name="xmx"
                      required
                      placeholder="2048m"
                      hint="Max JVM heap size e.g. 1024m or 1g. Must be greater than Xms."
                      value={form.xmx}
                      onChange={(e) => set('xmx', e.target.value)}
                      error={errors.xmx}
                    />
                    <FormField
                      label="NEW RATIO"
                      name="newRatio"
                      placeholder="3"
                      hint="Ratio of Old to Young generation heap. Example: 3"
                      value={form.newRatio}
                      onChange={(e) => set('newRatio', e.target.value)}
                    />
                  </div>
                  <DynamicList
                    label="EXTRA JVM OPTIONS"
                    name="extraOpts"
                    values={form.extraOpts}
                    onChange={(v) => set('extraOpts', v)}
                    placeholder="-Dspring.profiles.active=uat"
                    addLabel="Add JVM option"
                    hint="Each entry becomes a separate argument (e.g. -Dprop=value)"
                  />
                </div>
              </div>

            </div>
          </>
        )}

        {/* ─── Step 4: Runtime ───────────────────────────────── */}
        {step === 4 && (
          <>
            <StepHeading num="04" label="Process" />
            <div className="flex flex-col gap-5">
              {/* ── PROCESS CONFIGURATION PANEL ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-panel overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                    Process Configuration
                  </h3>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      label="RUN AS USER"
                      name="runAsUser"
                      required
                      placeholder="appuser"
                      hint="Linux user that runs the JVM process on the target server"
                      value={form.runAsUser}
                      onChange={(e) => set('runAsUser', e.target.value)}
                      error={errors.runAsUser}
                    />
                    <FormField
                      label="SERVER PORT"
                      name="serverPort"
                      required
                      type="number"
                      placeholder="8080"
                      hint="Port the application listens on (must match server.port in application.yml)"
                      value={form.serverPort}
                      onChange={(e) => set('serverPort', e.target.value)}
                      error={errors.serverPort}
                    />
                    <FormField
                      label="MAX LOG SIZE"
                      name="maxLogSize"
                      placeholder="10m"
                      hint="Max size per log file before rotation (e.g. 10m, 100m)"
                      value={form.maxLogSize}
                      onChange={(e) => set('maxLogSize', e.target.value)}
                    />
                    <FormField
                      label="MAX LOG FILES"
                      name="maxLogFiles"
                      type="number"
                      placeholder="10"
                      hint="Number of rotated log files to keep"
                      value={form.maxLogFiles}
                      onChange={(e) => set('maxLogFiles', e.target.value)}
                    />
                  </div>
                </div>
              </div>
              {/* ── JAR TYPE PANEL ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-panel overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                    JAR Type
                  </h3>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  {/* Two-card selector */}
                  <div className="grid grid-cols-2 gap-3">

                    {/* Fat JAR card */}
                    <button
                      type="button"
                      onClick={() => set('jarType', 'fat')}
                      className={clsx(
                        'flex flex-col gap-2.5 p-4 rounded-xl border text-left transition-all duration-150',
                        form.jarType === 'fat'
                          ? 'border-wiz-gold/50 bg-wiz-gold/5 shadow-gold-sm'
                          : 'border-wiz-border bg-wiz-bg hover:border-wiz-border-mid hover:bg-wiz-surface',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                          form.jarType === 'fat' ? 'border-wiz-gold' : 'border-wiz-muted',
                        )}>
                          {form.jarType === 'fat' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold" />
                          )}
                        </span>
                        <span className={clsx(
                          'font-mono font-bold text-xs uppercase tracking-wider',
                          form.jarType === 'fat' ? 'text-wiz-gold' : 'text-wiz-gray',
                        )}>
                          Fat JAR
                        </span>
                      </div>
                      <p className="text-xs text-wiz-muted leading-relaxed">
                        All dependencies bundled inside the JAR.
                        Upload a <span className="font-mono text-wiz-cream">.jar</span> file in Step 6.
                      </p>
                    </button>

                    {/* Thin JAR card */}
                    <button
                      type="button"
                      onClick={() => set('jarType', 'thin')}
                      className={clsx(
                        'flex flex-col gap-2.5 p-4 rounded-xl border text-left transition-all duration-150',
                        form.jarType === 'thin'
                          ? 'border-wiz-gold/50 bg-wiz-gold/5 shadow-gold-sm'
                          : 'border-wiz-border bg-wiz-bg hover:border-wiz-border-mid hover:bg-wiz-surface',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={clsx(
                          'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                          form.jarType === 'thin' ? 'border-wiz-gold' : 'border-wiz-muted',
                        )}>
                          {form.jarType === 'thin' && (
                            <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold" />
                          )}
                        </span>
                        <span className={clsx(
                          'font-mono font-bold text-xs uppercase tracking-wider',
                          form.jarType === 'thin' ? 'text-wiz-gold' : 'text-wiz-gray',
                        )}>
                          Thin JAR
                        </span>
                      </div>
                      <p className="text-xs text-wiz-muted leading-relaxed">
                        App JAR + separate <span className="font-mono text-wiz-cream">lib/</span> directory.
                        Upload both files separately in Step 6.
                      </p>
                    </button>

                  </div>

                  {/* Thin JAR: hint + CTA to Library Dependencies panel in File Uploads */}
                  {form.jarType === 'thin' && (
                    <div className="animate-fade-in rounded-lg bg-wiz-raised/40 border border-wiz-border/60 px-4 py-3 flex items-start justify-between gap-4">
                      <p className="text-xs text-wiz-muted leading-relaxed">
                        <span className="font-semibold text-wiz-gray">Thin JAR: </span>
                        Pack your dependency JARs into a{' '}
                        <span className="font-mono text-wiz-cream">.zip</span>{' '}
                        with the JAR files at the root — not inside a{' '}
                        <span className="font-mono text-wiz-cream">lib/</span>{' '}
                        subfolder. Upload both the app JAR and this ZIP in File Uploads.
                      </p>
                      <button
                        type="button"
                        onClick={() => goToAndScroll(6, 'lib-deps-panel')}
                        className="flex-shrink-0 inline-flex items-center gap-1 font-mono text-xs
                                   text-wiz-gold hover:text-wiz-cream transition-colors duration-150 whitespace-nowrap"
                      >
                        File Uploads <ArrowRight size={11} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── CERTIFICATE PATHS CONFIG PANEL (Step 4 — config only, uploads in Step 6) ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-sig-blue/40 bg-wiz-panel overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-blue-dim/30">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-sig-blue/70 flex-shrink-0" />
                    <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-blue">
                      Certificate Paths
                      <span className="ml-1.5 text-wiz-muted/60 normal-case tracking-normal font-normal">· Optional</span>
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToAndScroll(6, 'cert-files-panel')}
                    className="flex-shrink-0 inline-flex items-center gap-1 font-mono text-xs
                               text-sig-blue hover:text-sig-blue/70 transition-colors duration-150 whitespace-nowrap"
                  >
                    Upload ZIPs <ArrowRight size={11} />
                  </button>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-xs text-wiz-muted leading-relaxed">
                    Define cert / keystore directories and their absolute target paths on the server.
                    Each ZIP is transferred independently of the application tarball.
                    Upload the ZIP files in the File Uploads step.
                  </p>

                  {form.certUploads.map((cu, idx) => (
                    <div key={idx} className="flex items-end gap-2">
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        <div className="flex flex-col gap-1">
                          <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                            Dir name (in ZIP)
                          </label>
                          <input
                            type="text"
                            value={cu.source}
                            placeholder="certs"
                            onChange={(e) => {
                              const next = [...form.certUploads]
                              next[idx] = { ...next[idx], source: e.target.value }
                              set('certUploads', next)
                            }}
                            className="wiz-input"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                            Target path on server
                          </label>
                          <input
                            type="text"
                            value={cu.targetPath}
                            placeholder="/opt/certs"
                            onChange={(e) => {
                              const next = [...form.certUploads]
                              next[idx] = { ...next[idx], targetPath: e.target.value }
                              set('certUploads', next)
                            }}
                            className="wiz-input"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => set('certUploads', form.certUploads.filter((_, i) => i !== idx))}
                        className="btn-icon flex-shrink-0 mb-0 text-sig-red/70 hover:text-sig-red hover:bg-sig-red-dim"
                        aria-label="Remove certificate entry"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => set('certUploads', [...form.certUploads, { source: '', targetPath: '', file: null }])}
                    className="flex items-center gap-1.5 text-xs text-sig-blue hover:text-sig-blue/80
                               transition-colors duration-150 w-fit"
                  >
                    <Plus size={13} />
                    Add certificate path
                  </button>
                </div>
              </div>

              {/* ── ADDITIONAL DIRECTORIES CONFIG PANEL (Step 4 — config only, uploads in Step 6) ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/40 bg-wiz-panel overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                  <div className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/60 flex-shrink-0" />
                    <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                      Additional Directories
                      <span className="ml-1.5 text-wiz-muted/60 normal-case tracking-normal font-normal">· Optional</span>
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => goToAndScroll(6, 'extra-dirs-panel')}
                    className="flex-shrink-0 inline-flex items-center gap-1 font-mono text-xs
                               text-wiz-gold hover:text-wiz-cream transition-colors duration-150 whitespace-nowrap"
                  >
                    Upload ZIPs <ArrowRight size={11} />
                  </button>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-xs text-wiz-muted leading-relaxed">
                    Define extra directories and their absolute target paths on the server.
                    Each ZIP is transferred independently of the application tarball.
                    Upload the ZIP files in the File Uploads step.
                  </p>

                  {form.extraDirs.map((ed, idx) => (
                    <div key={idx} className="flex items-end gap-2">
                      <div className="grid grid-cols-2 gap-2 flex-1">
                        <div className="flex flex-col gap-1">
                          <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                            Directory name
                          </label>
                          <input
                            type="text"
                            value={ed.dirName}
                            placeholder="deploy"
                            onChange={(e) => {
                              const next = [...form.extraDirs]
                              next[idx] = { ...next[idx], dirName: e.target.value }
                              set('extraDirs', next)
                            }}
                            className="wiz-input"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                            Target path on server
                          </label>
                          <input
                            type="text"
                            value={ed.targetPath}
                            placeholder="/opt/apps/my-service/deploy"
                            onChange={(e) => {
                              const next = [...form.extraDirs]
                              next[idx] = { ...next[idx], targetPath: e.target.value }
                              set('extraDirs', next)
                            }}
                            className="wiz-input"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => set('extraDirs', form.extraDirs.filter((_, i) => i !== idx))}
                        className="btn-icon flex-shrink-0 mb-0 text-sig-red/70 hover:text-sig-red hover:bg-sig-red-dim"
                        aria-label="Remove directory entry"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => set('extraDirs', [...form.extraDirs, { dirName: '', targetPath: '', file: null }])}
                    className="flex items-center gap-1.5 text-xs text-wiz-gold hover:text-wiz-gold/80
                               transition-colors duration-150 w-fit"
                  >
                    <Plus size={13} />
                    Add directory
                  </button>
                </div>
              </div>

            </div>
          </>
        )}

        {/* ─── Step 5: Backup ────────────────────────────────── */}
        {step === 5 && (
          <>
            <StepHeading num="05" label="Backup" />
            <div className="flex flex-col gap-5">
              {/* Styled checkbox matching mockup */}
              <label className="flex items-center gap-3 cursor-pointer group w-fit">
                <div
                  onClick={() => set('performBackup', !form.performBackup)}
                  className={clsx(
                    'w-5 h-5 rounded flex items-center justify-center flex-shrink-0',
                    'border-2 transition-all duration-150 cursor-pointer',
                    form.performBackup
                      ? 'bg-wiz-gold border-wiz-gold'
                      : 'bg-wiz-bg border-wiz-border group-hover:border-wiz-border-mid',
                  )}
                >
                  {form.performBackup && <Check size={12} className="text-wiz-bg" strokeWidth={3} />}
                </div>
                <span className="text-base font-semibold text-wiz-cream">
                  Enable pre-deployment backup
                </span>
              </label>

              {form.performBackup && (
                <div className="animate-fade-in flex flex-col gap-2">
                  {/* Label — same style as section-label */}
                  <p className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                    Max Backups to Retain
                  </p>

                  {/* Tile picker — 1 through 5 only, no free-text entry */}
                  <div className="flex items-center gap-2">
                    {([1, 2, 3, 4, 5] as const).map((n) => {
                      const selected = form.maxBackups === n.toString()
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => set('maxBackups', n.toString())}
                          className={clsx(
                            'w-12 h-12 rounded-lg border font-mono font-bold text-base',
                            'transition-all duration-150 flex items-center justify-center',
                            selected
                              ? 'border-wiz-gold bg-wiz-gold/10 text-wiz-gold shadow-gold-sm'
                              : 'border-wiz-border bg-wiz-bg text-wiz-gray hover:border-wiz-border-mid hover:text-wiz-cream',
                          )}
                          title={`Keep ${n} backup${n === 1 ? '' : 's'}`}
                        >
                          {n}
                        </button>
                      )
                    })}
                  </div>

                  {/* Contextual hint */}
                  <p className="text-xs text-wiz-muted">
                    {form.maxBackups === '1'
                      ? 'Only the most recent backup is kept.'
                      : `The ${form.maxBackups} most recent backups are kept. Older ones are automatically removed.`}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ─── Step 6: File Uploads ──────────────────────────── */}
        {step === 6 && (
          <>
            <StepHeading num="06" label="File Uploads" />
            <div className="flex flex-col gap-5">

              {/* ── APPLICATION JAR PANEL ── */}
              <div className="rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-panel overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                    Application JAR
                    <span className="ml-1.5 text-sig-red/70 normal-case tracking-normal font-normal">· Required</span>
                  </h3>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <UploadZone
                    value={form.jarArtifact}
                    onChange={handleJarArtifact}
                    error={errors.jarArtifact}
                    accept=".jar"
                    inputId="jar-artifact-file"
                  />
                  <FormField
                    label="JAR NAME"
                    name="jarName"
                    required
                    placeholder="my-service-1.0.0.jar"
                    hint="Name of the main application JAR. Auto-filled from the uploaded filename; override if the deployed filename should differ."
                    value={form.jarName}
                    onChange={(e) => set('jarName', e.target.value)}
                    error={errors.jarName}
                  />
                </div>
              </div>

              {/* ── LIBRARY DEPENDENCIES PANEL ── (thin JAR mode only) */}
              {form.jarType === 'thin' && (
                <div id="lib-deps-panel" className="animate-fade-in rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/50 bg-wiz-panel overflow-hidden">
                  <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/70 flex-shrink-0" />
                    <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                      Library Dependencies
                      <span className="ml-1.5 text-sig-red/70 normal-case tracking-normal font-normal">· Required</span>
                    </h3>
                  </div>
                  <div className="p-5 flex flex-col gap-4">
                    <p className="text-xs text-wiz-muted leading-relaxed">
                      Upload a <span className="font-mono text-wiz-cream">.zip</span> containing your dependency JARs.
                      JAR files must be at the <span className="font-semibold text-wiz-gray">root</span> of the ZIP —
                      not inside a <span className="font-mono text-wiz-cream">lib/</span> subfolder.
                      The runner extracts the ZIP contents into{' '}
                      <span className="font-mono text-wiz-cream">lib/</span> on the target server.
                    </p>
                    <UploadZone
                      value={form.libZip}
                      onChange={(f) => set('libZip', f)}
                      error={errors.libZip}
                      accept=".zip"
                      inputId="lib-zip-file"
                    />
                  </div>
                </div>
              )}

              {/* ── CERTIFICATE FILES PANEL ── */}
              <div id="cert-files-panel" className="rounded-xl border border-wiz-border border-l-2 border-l-sig-blue/40 bg-wiz-panel overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-blue-dim/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-sig-blue/70 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-blue">
                    Certificate Files
                    <span className="ml-1.5 text-wiz-muted/60 normal-case tracking-normal font-normal">· Optional</span>
                  </h3>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-xs text-wiz-muted leading-relaxed">
                    Upload cert or keystore ZIPs that must live at a custom server path outside
                    the application directory (e.g.{' '}
                    <span className="font-mono text-wiz-cream">/opt/certs</span>).
                    Each ZIP is extracted to its target path independently.
                  </p>

                  {form.certUploads.map((cu, idx) => (
                    <div key={idx} className="flex items-end gap-2">
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                              Dir name (in ZIP)
                            </label>
                            <input
                              type="text"
                              value={cu.source}
                              placeholder="certs"
                              onChange={(e) => {
                                const next = [...form.certUploads]
                                next[idx] = { ...next[idx], source: e.target.value }
                                set('certUploads', next)
                              }}
                              className="wiz-input"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                              Target path on server
                            </label>
                            <input
                              type="text"
                              value={cu.targetPath}
                              placeholder="/opt/certs"
                              onChange={(e) => {
                                const next = [...form.certUploads]
                                next[idx] = { ...next[idx], targetPath: e.target.value }
                                set('certUploads', next)
                              }}
                              className="wiz-input"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                            ZIP file
                          </label>
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
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => set('certUploads', form.certUploads.filter((_, i) => i !== idx))}
                        className="btn-icon flex-shrink-0 mb-0 text-sig-red/70 hover:text-sig-red hover:bg-sig-red-dim"
                        aria-label="Remove certificate entry"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => set('certUploads', [...form.certUploads, { source: '', targetPath: '', file: null }])}
                    className="flex items-center gap-1.5 text-xs text-sig-blue hover:text-sig-blue/80
                               transition-colors duration-150 w-fit"
                  >
                    <Plus size={13} />
                    Add certificate path
                  </button>
                </div>
              </div>

              {/* ── ADDITIONAL DIRECTORIES PANEL ── */}
              <div id="extra-dirs-panel" className="rounded-xl border border-wiz-border border-l-2 border-l-wiz-gold/40 bg-wiz-panel overflow-hidden">
                <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-wiz-raised/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-wiz-gold/60 flex-shrink-0" />
                  <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-wiz-gold">
                    Additional Directories
                    <span className="ml-1.5 text-wiz-muted/60 normal-case tracking-normal font-normal">· Optional</span>
                  </h3>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <p className="text-xs text-wiz-muted leading-relaxed">
                    Upload extra directories that must land at a custom absolute path on the server.
                    Each ZIP is transferred to its configured target path independently of the application tarball.
                  </p>

                  {form.extraDirs.map((ed, idx) => (
                    <div key={idx} className="flex items-end gap-2">
                      <div className="flex flex-col gap-2 flex-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                              Directory name
                            </label>
                            <input
                              type="text"
                              value={ed.dirName}
                              placeholder="deploy"
                              onChange={(e) => {
                                const next = [...form.extraDirs]
                                next[idx] = { ...next[idx], dirName: e.target.value }
                                set('extraDirs', next)
                              }}
                              className="wiz-input"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                              Target path on server
                            </label>
                            <input
                              type="text"
                              value={ed.targetPath}
                              placeholder="/opt/apps/my-service/deploy"
                              onChange={(e) => {
                                const next = [...form.extraDirs]
                                next[idx] = { ...next[idx], targetPath: e.target.value }
                                set('extraDirs', next)
                              }}
                              className="wiz-input"
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="font-mono text-xs font-semibold uppercase tracking-widest text-wiz-muted">
                            ZIP file
                          </label>
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
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => set('extraDirs', form.extraDirs.filter((_, i) => i !== idx))}
                        className="btn-icon flex-shrink-0 mb-0 text-sig-red/70 hover:text-sig-red hover:bg-sig-red-dim"
                        aria-label="Remove directory entry"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => set('extraDirs', [...form.extraDirs, { dirName: '', targetPath: '', file: null }])}
                    className="flex items-center gap-1.5 text-xs text-wiz-gold hover:text-wiz-gold/80
                               transition-colors duration-150 w-fit"
                  >
                    <Plus size={13} />
                    Add directory
                  </button>
                </div>
              </div>

            </div>
          </>
        )}
      </div>

      {/* ── Navigation buttons ── */}
      <div className="flex items-center justify-between">
        {/* Prev */}
        <div>
          {step > 1 && (
            <button type="button" onClick={handlePrev} className="btn-secondary gap-2">
              <ArrowLeft size={13} />
              Prev
            </button>
          )}
        </div>

        {/* Next / Submit */}
        <div className="flex flex-col items-end gap-1.5">
          {step < 6 ? (
            <button
              type="button"
              onClick={handleNext}
              className="btn-secondary gap-2"
            >
              Next
              <ArrowRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className={clsx('btn-primary gap-2', submitting && 'animate-pulse')}
            >
              <Rocket size={14} />
              {submitting ? 'Deploying…' : 'Submit Deployment →'}
            </button>
          )}
        </div>
      </div>

    </div>
  )
}
