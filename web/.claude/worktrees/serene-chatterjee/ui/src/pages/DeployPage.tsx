import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Rocket, Key, Upload, Check, X, Copy, Wifi, WifiOff, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { submitJob, fetchRunnerPublicKeys, testSshConnection } from '../api/jobs'
import type { DeploymentRequest } from '../types/DeploymentRequest'
import FormField, { SelectField, FieldWrapper } from '../components/FormField'
import ToggleSwitch from '../components/ToggleSwitch'
import DynamicList from '../components/DynamicList'
import { useTheme, type ActiveEnv } from '../context/ThemeContext'

// ── Step metadata ─────────────────────────────────────────────────

const STEPS = [
  { id: 1, num: '01', label: 'Identity'   },
  { id: 2, num: '02', label: 'Java / JVM' },
  { id: 3, num: '03', label: 'Runtime'    },
  { id: 4, num: '04', label: 'SSH Target' },
  { id: 5, num: '05', label: 'Backup'     },
  { id: 6, num: '06', label: 'Artifact'   },
] as const

// ── Per-environment SSH key panel style tokens ────────────────────

const ENV_KEY_STYLE = {
  SIT:  { border: 'border-l-sig-blue/60',   dot: 'bg-sig-blue',   text: 'text-sig-blue',   header: 'bg-sig-blue-dim'   },
  UAT:  { border: 'border-l-sig-yellow/60', dot: 'bg-sig-yellow', text: 'text-sig-yellow', header: 'bg-sig-yellow-dim' },
  PROD: { border: 'border-l-sig-purple/60', dot: 'bg-sig-purple', text: 'text-sig-purple', header: 'bg-sig-purple-dim' },
} as const

// ── Form state ────────────────────────────────────────────────────

interface FormState {
  // Step 1 — Identity
  appName:     string
  environment: string
  mainClass:   string
  // Step 2 — Java / JVM
  javaCommand: string
  javaVersion: string
  xms:         string
  xmx:         string
  newRatio:    string
  extraOpts:   string[]
  // Step 3 — Runtime
  runAsUser:   string
  serverPort:  string
  maxLogSize:  string
  maxLogFiles: string
  libPath:     string
  optionalPaths: string[]
  // Step 4 — SSH Target
  sshUser:        string
  sshHost:        string
  sshPort:        string
  targetBasePath: string
  // Step 5 — Backup
  performBackup: boolean
  maxBackups:    string
  // Step 6 — Artifact
  artifact:  File | null
  jarName:   string           // auto-filled from artifact filename
}

function getDefaultEnv(): string {
  const stored = localStorage.getItem('wiz-active-env')
  return stored && ['SIT', 'UAT', 'PROD'].includes(stored)
    ? stored
    : (import.meta.env.VITE_APP_ENV ?? 'SIT')
}

const INITIAL: FormState = {
  appName:        '',
  environment:    getDefaultEnv(),
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
  libPath:        '',
  optionalPaths:  [],
  sshUser:        '',
  sshHost:        '',
  sshPort:        '22',
  targetBasePath: '',
  performBackup:  true,
  maxBackups:     '5',
  artifact:       null,
  jarName:        '',
}

// ── Per-step validation ───────────────────────────────────────────

type FormErrors = Partial<Record<keyof FormState, string>>

function validateStep(step: number, form: FormState): FormErrors {
  const e: FormErrors = {}
  switch (step) {
    case 1:
      if (!form.appName)   e.appName   = 'Required'
      if (!form.mainClass) e.mainClass = 'Required'
      break
    case 2:
      if (!form.javaCommand) e.javaCommand = 'Required'
      if (!form.javaVersion) e.javaVersion = 'Required'
      if (!form.xms)         e.xms         = 'Required'
      if (!form.xmx)         e.xmx         = 'Required'
      break
    case 3:
      if (!form.runAsUser)  e.runAsUser  = 'Required'
      if (!form.serverPort) e.serverPort = 'Required'
      break
    case 4:
      if (!form.sshUser)        e.sshUser        = 'Required'
      if (!form.sshHost)        e.sshHost        = 'Required'
      if (!form.sshPort)        e.sshPort        = 'Required'
      if (!form.targetBasePath) e.targetBasePath = 'Required'
      break
    case 5:
      // no required fields
      break
    case 6:
      if (!form.artifact) e.artifact = 'JAR artifact is required'
      break
  }
  return e
}

// ── Build DeploymentRequest ───────────────────────────────────────

function buildRequest(form: FormState): DeploymentRequest {
  return {
    appName:        form.appName,
    environment:    form.environment,
    mainClass:      form.mainClass,
    jarName:        form.jarName || form.artifact?.name || '',
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
    libPath:        form.libPath,
    optionalPaths:  form.optionalPaths.filter(Boolean),
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
  num:      string
  label:    string
  active:   boolean
  visited:  boolean
  onClick:  () => void
}

function StepTab({ num, label, active, visited, onClick }: StepTabProps) {
  // A tab is "completed" when the user has visited it but is now on a later step.
  // Active always takes precedence — the current step is never "completed".
  const completed = visited && !active

  return (
    <button
      type="button"
      onClick={visited ? onClick : undefined}
      disabled={!visited}
      className={clsx(
        'flex items-center gap-2 px-4 py-2 rounded-lg border font-mono text-sm',
        'transition-all duration-150 whitespace-nowrap',
        active
          ? 'border-wiz-gold      text-wiz-gold  bg-wiz-gold/5       shadow-gold-sm'
          : completed
          ? 'border-sig-green/40  text-sig-green bg-sig-green-dim/60  hover:border-sig-green/60 hover:bg-sig-green-dim cursor-pointer'
          : 'border-wiz-border/50 text-wiz-gray  cursor-not-allowed',
      )}
    >
      {/* Number / checkmark badge */}
      <span className={clsx(
        'flex-shrink-0 flex items-center justify-center',
        active    ? 'text-wiz-gold'  :
        completed ? 'text-sig-green' :
                    'text-wiz-muted',
      )}>
        {completed
          ? <Check size={12} strokeWidth={2.5} />
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
}

function UploadZone({ value, onChange, error }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onChange(f)
  }

  return (
    <FieldWrapper label="" name="artifact" error={error}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('artifact-file')?.click()}
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
          id="artifact-file"
          type="file"
          accept=".jar"
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
                Click to select JAR artifact
              </p>
              <p className="text-sm text-wiz-muted mt-1">.jar files only</p>
            </div>
          </>
        )}
      </div>
    </FieldWrapper>
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

  // ── Runner public keys & SSH test ──────────────────────────────
  const [publicKeys,    setPublicKeys]    = useState<Record<string, string> | null>(null)
  const [keysLoading,   setKeysLoading]   = useState(false)
  const [keysError,     setKeysError]     = useState<string | null>(null)
  const [copiedKey,     setCopiedKey]     = useState(false)
  const [copiedScript,  setCopiedScript]  = useState(false)
  const [testConnState, setTestConnState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testConnMsg,   setTestConnMsg]   = useState<string | null>(null)

  // Keep the environment field in sync with whatever the user picks in Settings.
  // This runs whenever activeEnv changes so the form always reflects the
  // currently active environment without requiring a page reload.
  useEffect(() => {
    setForm((prev) => ({ ...prev, environment: activeEnv }))
  }, [activeEnv])

  // Fetch runner SSH public keys once on mount
  useEffect(() => {
    setKeysLoading(true)
    fetchRunnerPublicKeys()
      .then((keys) => { setPublicKeys(keys); setKeysError(null) })
      .catch(() => setKeysError('Could not fetch runner public keys. Please contact your administrator.'))
      .finally(() => setKeysLoading(false))
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

  // Handle artifact upload and auto-fill jarName
  const handleArtifact = (file: File | null) => {
    set('artifact', file)
    if (file) set('jarName', file.name)
  }

  const goTo = (n: number) => {
    setErrors({})
    setStep(n)
  }

  const handleNext = () => {
    const errs = validateStep(step, form)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    const next = step + 1
    setVisited((prev) => new Set([...prev, next]))
    setStep(next)
  }

  const handlePrev = () => {
    setErrors({})
    setStep((s) => s - 1)
  }

  const handleSubmit = async () => {
    // Final validation of all steps
    let allErrors: FormErrors = {}
    for (let s = 1; s <= 6; s++) {
      allErrors = { ...allErrors, ...validateStep(s, form) }
    }
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors)
      toast.error('Please complete all required fields.')
      return
    }

    setSubmitting(true)
    try {
      const req = buildRequest(form)
      const res = await submitJob(req, form.artifact!)
      toast.success(`Deployment started — Job ${res.jobId.slice(0, 8)}`)
      navigate(`/jobs/${res.jobId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Deployment failed to start.'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  // ── SSH key panel — derived values (Step 4) ──────────────────────
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
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => (
          <StepTab
            key={s.id}
            num={s.num}
            label={s.label}
            active={step === s.id}
            visited={visited.has(s.id)}
            onClick={() => goTo(s.id)}
          />
        ))}
      </div>

      {/* ── Step content card ── */}
      <div className="wiz-card p-6 animate-fade-in" key={step}>

        {/* ─── Step 1: Identity ──────────────────────────────── */}
        {step === 1 && (
          <>
            <StepHeading num="01" label="Identity" />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="APP NAME"    name="appName" required
                placeholder="my-app-service-name"
                hint="Application Name as per application.yml file"
                value={form.appName} onChange={(e) => set('appName', e.target.value)}
                error={errors.appName}
              />
              <SelectField
                label="ENVIRONMENT" name="environment" required
                hint="Environment profile as per application.yml file"
                value={form.environment}
                onChange={(e) => {
                  set('environment', e.target.value)
                  setActiveEnv(e.target.value as ActiveEnv)
                }}
                options={[
                  { value: 'SIT',  label: 'SIT — System Integration Testing' },
                  { value: 'UAT',  label: 'UAT — User Acceptance Testing'    },
                  { value: 'PROD', label: 'PROD — Production'                },
                ]}
              />
              <FormField
                label="MAIN CLASS"  name="mainClass" required
                placeholder="com.example.MyApplication"
                hint="Required for thin JAR; Spring Boot fat JARs ignore this"
                value={form.mainClass} onChange={(e) => set('mainClass', e.target.value)}
                error={errors.mainClass}
                className="col-span-2"
              />
            </div>
          </>
        )}

        {/* ─── Step 2: Java / JVM ────────────────────────────── */}
        {step === 2 && (
          <>
            <StepHeading num="02" label="Java / JVM" />

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

        {/* ─── Step 3: Runtime ───────────────────────────────── */}
        {step === 3 && (
          <>
            <StepHeading num="03" label="Runtime" />
            <div className="flex flex-col gap-10">
              <div className="grid grid-cols-2 gap-10">
                 <FormField
                  label="RUN AS USER"
                  name="runAsUser"
                  required
                  placeholder="appuser"
                  hint="Linux user account that will run the JVM process on the target server (e.g. appuser, tomcat, vagrant)"
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
                  hint="HTTP(S) port the application listens on. Must match server.port value in application.yml"
                  value={form.serverPort}
                  onChange={(e) => set('serverPort', e.target.value)}
                  error={errors.serverPort}
                />
                <FormField
                  label="MAX LOG SIZE"
                  name="maxLogSize"
                  placeholder="10m"
                  hint="Maximum size of a single application log file before rotation (e.g. 10m, 100m)"
                  value={form.maxLogSize}
                  onChange={(e) => set('maxLogSize', e.target.value)}
                />
                <FormField
                  label="MAX LOG FILES"
                  name="maxLogFiles"
                  type="number"
                  placeholder="10"
                  hint="Maximum number of rotated log files retained before older logs are deleted"
                  value={form.maxLogFiles}
                  onChange={(e) => set('maxLogFiles', e.target.value)}
                />
              </div>
              <FormField
                label="LIB PATH"
                name="libPath"
                placeholder="lib"
                hint="Directory containing Spring Boot external dependency JARs. Set to lib for thin JARS or leave empty for fat JARs"
                value={form.libPath}
                onChange={(e) => set('libPath', e.target.value)}
              />
              <DynamicList
                label="OPTIONAL PATHS"
                name="optionalPaths"
                values={form.optionalPaths}
                onChange={(v) => set('optionalPaths', v)}
                placeholder="/opt/app/config"
                addLabel="Add path"
                hint="Additional directories to transfer to the server during deployment (e.g. certs, deploy)"
              />
            </div>
          </>
        )}

        {/* ─── Step 4: SSH Target ────────────────────────────── */}
        {step === 4 && (
          <>
            <StepHeading num="04" label="SSH Target" />
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
                      hint="Hostname or IP address of the target server (e.g. 192.168.56.10, my-server.example.com)"
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

              {/* ── USER SSH KEYS CONFIGURATION PANEL ── */}
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
              </div>{/* ── end USER SSH KEYS CONFIGURATION PANEL ── */}

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

        {/* ─── Step 6: Artifact ──────────────────────────────── */}
        {step === 6 && (
          <>
            <StepHeading num="06" label="Artifact" />
            <UploadZone
              value={form.artifact}
              onChange={handleArtifact}
              error={errors.artifact}
            />
            {form.artifact && (
              <div className="mt-4 animate-fade-in">
                <FormField
                  label="JAR NAME (auto-filled)"
                  name="jarName"
                  placeholder="my-service-1.0.0.jar"
                  hint="Override if the deployed filename should differ from the uploaded file"
                  value={form.jarName}
                  onChange={(e) => set('jarName', e.target.value)}
                />
              </div>
            )}
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
        <div>
          {step < 6 ? (
            <button type="button" onClick={handleNext} className="btn-secondary gap-2">
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
