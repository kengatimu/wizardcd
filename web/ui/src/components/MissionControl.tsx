/**
 * MissionControl — contextual right-side panel for the deploy wizard.
 *
 * Two sections:
 *   1. Deploy Summary  — live config card (Steps 1–3 only; Step 4 = review IS the summary)
 *   2. Context Block   — changes per step (connection / JAR analysis / JVM preview / recent deploys)
 *
 * Design rules:
 *   - Fixed 280px width — predictable layout, step tabs align to its edge
 *   - Long values (class names, paths) are intelligently abbreviated, full value on hover
 *   - Default/unchanged values hidden (JVM defaults, standard log rotation)
 *   - Cards have env-coloured left border accent
 *
 * 🛡️  Pure read-only observer — no inputs, no mutations.
 *     To revert: remove <MissionControl .../> + the xl:flex wrapper in DeployPage.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Server, ArrowDown, Check, Minus, Package, Cpu, FileText,
  Activity, ShieldCheck, AlertTriangle, HardDrive, FolderArchive,
  RotateCcw, Loader2, Circle,
} from 'lucide-react'
import clsx from 'clsx'
import { fetchJobs, runPreflight } from '../api/jobs'
import type { PreflightResult } from '../api/jobs'
import type { JobSummary } from '../types/JobSummary'

// ── Constants ─────────────────────────────────────────────────────────

/** Min/max sidebar width constraints */
export const SIDEBAR_MIN_W = 240
export const SIDEBAR_MAX_W = 400

// ── Types ─────────────────────────────────────────────────────────────

export interface MissionControlProps {
  step: number
  form: {
    environment:    string
    sshUser:        string
    sshHost:        string
    sshPort:        string
    targetBasePath: string
    appName:        string
    mainClass:      string
    javaCommand:    string
    javaVersion:    string
    jarType:        'fat' | 'thin'
    jarName:        string
    runAsUser:      string
    serverPort:     string
    xms:            string
    xmx:            string
    maxLogSize:     string
    maxLogFiles:    string
    performBackup:  boolean
    maxBackups:     string
    stabilityWindow: string
    hasCerts:       boolean
    certUploads:    { source: string; targetPath: string; file: File | null }[]
    hasExtraDirs:   boolean
    extraDirs:      { dirName: string; targetPath: string; file: File | null }[]
    jarArtifact:    File | null
  }
  testConnState: 'idle' | 'testing' | 'ok' | 'fail'
  autoFilledFields: Set<string>
  jvmConfigEnabled: boolean
  jvmFlags: string[]
  gcType: string
  containerAware: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────

const ENV_COLORS: Record<string, { text: string; badge: string; border: string }> = {
  SIT:  { text: 'text-sig-blue',   badge: 'border-sig-blue/30 bg-sig-blue-dim/40 text-sig-blue',       border: 'border-l-sig-blue/40' },
  UAT:  { text: 'text-sig-yellow', badge: 'border-sig-yellow/30 bg-sig-yellow-dim/40 text-sig-yellow',  border: 'border-l-sig-yellow/40' },
  PROD: { text: 'text-sig-purple', badge: 'border-sig-purple/30 bg-sig-purple-dim/40 text-sig-purple',  border: 'border-l-sig-purple/40' },
}

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  SUCCESS: { icon: '✓', color: 'text-sig-green' },
  FAILED:  { icon: '✗', color: 'text-sig-red'   },
  ABORTED: { icon: '○', color: 'text-sig-yellow' },
  RUNNING: { icon: '●', color: 'text-wiz-gold'   },
}

/** Extract the JVM directory name before /bin/java  (e.g. "temurin-17-jdk-amd64") */
function javaLabel(path: string): string {
  if (!path) return ''
  const parts = path.split('/')
  const binIdx = parts.indexOf('bin')
  if (binIdx > 0) return parts[binIdx - 1]
  return parts[parts.length - 1]
}

/** Extract simple class name from FQCN  (e.g. "EurekaRegistryMsApplication") */
function simpleClassName(fqcn: string): string {
  if (!fqcn) return ''
  const idx = fqcn.lastIndexOf('.')
  return idx >= 0 ? fqcn.substring(idx + 1) : fqcn
}

/** Abbreviate JAR name: strip version/SNAPSHOT suffix
 *  e.g. "papss-outbound-technical-service-ms-0.0.1-SNAPSHOT.jar" → "papss-outbound-technical-service-ms"
 */
function abbreviateJarName(jarName: string): string {
  if (!jarName) return ''
  // Strip .jar extension, then strip version pattern (-X.X.X...) and -SNAPSHOT
  return jarName
    .replace(/\.jar$/i, '')
    .replace(/-\d+[\d.]*(-SNAPSHOT)?$/i, '')
}

/** Abbreviate a path: keep last N segments to fit ~30 chars  (e.g. "/u01/gag/registry/my-app" → ".../registry/my-app") */
function abbreviatePath(path: string, maxLen = 32): string {
  if (!path) return ''
  if (path.length <= maxLen) return path
  const parts = path.split('/').filter(Boolean)
  // Try last 2 segments, fall back to last 1 if still too long
  const two = '…/' + parts.slice(-2).join('/')
  if (two.length <= maxLen) return two
  return '…/' + parts[parts.length - 1]
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ── Summary line — fixed width, values abbreviated with tooltip ───────

function SummaryLine({ label, value, title, mono, badge }: {
  label: string
  value: string | null | undefined
  title?: string            // full value for hover tooltip (falls back to value)
  mono?: boolean
  badge?: { text: string; className: string }
}) {
  const filled = !!value && value.trim() !== ''
  return (
    <div className="flex items-center gap-2.5 py-[4px]">
      <span className="text-[10px] uppercase tracking-wider text-wiz-muted/50 w-[46px] flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0">
        {badge ? (
          <span className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded border', badge.className)}>
            {badge.text}
          </span>
        ) : filled ? (
          <span
            className={clsx('text-[11px] text-wiz-cream/75 block whitespace-nowrap', mono && 'font-mono')}
            title={title || value!}
          >
            {value}
          </span>
        ) : (
          <span className="text-[11px] text-wiz-muted/25">—</span>
        )}
      </div>
    </div>
  )
}

// ── Context blocks per step ───────────────────────────────────────────

function ConnectionVisual({ form, testConnState }: Pick<MissionControlProps, 'form' | 'testConnState'>) {
  const hasHost = form.sshHost.trim() !== ''
  const connected = testConnState === 'ok'
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <div className="flex items-center gap-2 text-2xs text-wiz-muted/70">
        <Server size={11} className="text-wiz-gold/60" />
        <span className="font-mono">WizardCD Runner</span>
      </div>
      <div className="flex flex-col items-center gap-0.5 py-1">
        <div className={clsx('w-px h-4', connected ? 'bg-sig-green/50' : hasHost ? 'bg-wiz-border-mid' : 'bg-wiz-border/40')} />
        <span className={clsx(
          'text-[9px] px-1.5 py-0.5 rounded-full border',
          connected ? 'text-sig-green border-sig-green/30 bg-sig-green-dim/20' : 'text-wiz-muted/40 border-wiz-border/40',
        )}>
          SSH{form.sshPort && form.sshPort !== '22' ? ` :${form.sshPort}` : ''}
        </span>
        <div className={clsx('w-px h-4', connected ? 'bg-sig-green/50' : hasHost ? 'bg-wiz-border-mid' : 'bg-wiz-border/40')} />
        <ArrowDown size={9} className={connected ? 'text-sig-green/60' : 'text-wiz-muted/30'} />
      </div>
      <div className="flex items-center gap-2 text-2xs">
        <Server size={11} className={hasHost ? 'text-sig-green/60' : 'text-wiz-muted/30'} />
        <span className={clsx('font-mono', hasHost ? 'text-wiz-cream/70' : 'text-wiz-muted/30')}>
          {hasHost ? `${form.sshUser || '?'}@${form.sshHost}` : 'target server'}
        </span>
      </div>
      {connected && (
        <div className="flex items-center gap-1 mt-1.5 text-[9px] text-sig-green/70">
          <Check size={8} /> Connected
        </div>
      )}
    </div>
  )
}

function JarAnalysis({ form, autoFilledFields }: Pick<MissionControlProps, 'form' | 'autoFilledFields'>) {
  if (!form.jarArtifact) {
    return (
      <div className="flex items-center gap-2 py-3 text-2xs text-wiz-muted/40">
        <Package size={11} />
        <span>Upload a JAR to see analysis</span>
      </div>
    )
  }
  const items: { label: string; value: string; full?: string; auto: boolean }[] = [
    { label: form.jarType === 'fat' ? 'Fat JAR' : 'Thin JAR', value: form.jarType === 'fat' ? 'BOOT-INF/' : 'External lib/', auto: true },
    { label: 'Main', value: simpleClassName(form.mainClass) || '—', full: form.mainClass, auto: autoFilledFields.has('mainClass') },
    { label: 'Port', value: form.serverPort || '—', auto: autoFilledFields.has('serverPort') },
    { label: 'App', value: form.appName || '—', auto: autoFilledFields.has('appName') },
  ]
  return (
    <div className="flex flex-col gap-1.5 py-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-2xs min-w-0">
          {it.auto ? (
            <Check size={9} className="text-sig-green/70 flex-shrink-0" />
          ) : (
            <Minus size={9} className="text-wiz-muted/30 flex-shrink-0" />
          )}
          <span className="text-wiz-muted/50 w-12 flex-shrink-0">{it.label}</span>
          <span className="text-wiz-cream/70 font-mono whitespace-nowrap" title={it.full || it.value}>{it.value}</span>
        </div>
      ))}
    </div>
  )
}

function JvmPreview({ jvmConfigEnabled, jvmFlags, gcType, containerAware }: Pick<MissionControlProps, 'jvmConfigEnabled' | 'jvmFlags' | 'gcType' | 'containerAware'>) {
  if (!jvmConfigEnabled) {
    return (
      <div className="flex items-center gap-2 py-3 text-2xs text-wiz-muted/40">
        <Cpu size={11} />
        <span>JVM uses ergonomic defaults</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1 py-1">
      <div className="flex items-center gap-2 text-2xs text-wiz-muted/50 mb-0.5">
        <Cpu size={9} />
        <span>{gcType}{containerAware ? ' · Container' : ''}</span>
      </div>
      <div className="rounded-md bg-wiz-bg/60 border border-wiz-border/20 px-2.5 py-2 max-h-[140px] overflow-y-auto">
        {jvmFlags.slice(0, 12).map((flag, i) => (
          <div key={i} className="text-[10px] font-mono text-wiz-cream/60 leading-relaxed truncate" title={flag}>
            {flag}
          </div>
        ))}
        {jvmFlags.length > 12 && (
          <div className="text-[10px] text-wiz-muted/30 mt-0.5">+{jvmFlags.length - 12} more</div>
        )}
      </div>
    </div>
  )
}

// ── Pre-flight Check (Step 4 context block) ──────────────────────────────

function PreflightCheck({ form }: { form: MissionControlProps['form'] }) {
  const [result, setResult] = useState<PreflightResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-run preflight when component mounts (user arrives at Step 4)
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (!form.sshUser || !form.sshHost || !form.appName || !form.targetBasePath) {
        setError('Missing SSH or target details — go back to Step 1.')
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await runPreflight({
          sshUser: form.sshUser,
          sshHost: form.sshHost,
          sshPort: parseInt(form.sshPort) || 22,
          environment: form.environment,
          targetBasePath: form.targetBasePath,
          appName: form.appName,
        })
        if (!cancelled) setResult(res)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Pre-flight check failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isProd = form.environment === 'PROD'

  // Check item renderer
  const CheckItem = ({ ok, label, detail, warn }: {
    ok: boolean | null   // null = pending/unknown
    label: string
    detail?: string
    warn?: boolean       // amber warning instead of red fail
  }) => (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="flex-shrink-0 mt-0.5">
        {ok === null ? (
          <Circle size={10} className="text-wiz-muted/30" />
        ) : ok ? (
          <Check size={10} className="text-sig-green/80" />
        ) : warn ? (
          <AlertTriangle size={10} className="text-sig-yellow/80" />
        ) : (
          <AlertTriangle size={10} className="text-sig-red/70" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <span className={clsx(
          'text-[11px] block',
          ok === null ? 'text-wiz-muted/40' : ok ? 'text-wiz-cream/70' : warn ? 'text-sig-yellow/80' : 'text-sig-red/70',
        )}>
          {label}
        </span>
        {detail && (
          <span className="text-[10px] text-wiz-muted/40 block mt-0.5">{detail}</span>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 justify-center">
        <Loader2 size={12} className="text-wiz-gold animate-spin" />
        <span className="text-2xs text-wiz-muted/50">Running checks…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-3 text-2xs text-sig-red/70 flex items-center gap-2">
        <AlertTriangle size={11} />
        <span>{error}</span>
      </div>
    )
  }

  const r = result
  const hasArtifact = !!form.jarArtifact
  const jarLabel = form.jarName || form.jarArtifact?.name || 'JAR'
  const jarDetail = form.jarType === 'thin' ? `${jarLabel} + lib.zip` : jarLabel

  // Format backup timestamp
  const formatBackupTime = (ts: string | null): string => {
    if (!ts) return ''
    try {
      const d = new Date(ts)
      if (isNaN(d.getTime())) return ts
      const now = Date.now()
      const diff = now - d.getTime()
      const mins = Math.floor(diff / 60_000)
      if (mins < 60) return `${mins}m ago`
      const hrs = Math.floor(mins / 60)
      if (hrs < 24) return `${hrs}h ago`
      return `${Math.floor(hrs / 24)}d ago`
    } catch { return ts }
  }

  return (
    <div className="flex flex-col py-1 divide-y divide-wiz-border/20">
      {/* Artifact */}
      <CheckItem
        ok={hasArtifact}
        label="Artifact ready"
        detail={hasArtifact ? jarDetail : 'No JAR uploaded'}
      />

      {/* Target reachable */}
      <CheckItem
        ok={r?.targetReachable ?? null}
        label="Target reachable"
        detail={r?.targetReachable ? `${form.sshUser}@${form.sshHost}:${form.sshPort}` : r?.message ?? undefined}
      />

      {/* Write permissions */}
      <CheckItem
        ok={r?.writable ?? null}
        label="Permissions OK"
        detail={r?.writable
          ? `Write access to ${abbreviatePath(form.targetBasePath)}`
          : r?.targetReachable ? 'No write access to deploy path' : undefined}
      />

      {/* Disk space */}
      <CheckItem
        ok={r?.diskAvailable != null ? true : null}
        label={r?.diskAvailable ? `Disk: ${r.diskAvailable} available (${r.diskUsedPercent} used)` : 'Disk space'}
        detail={r?.diskAvailable ? `on ${abbreviatePath(form.targetBasePath)}` : undefined}
        warn={r?.diskUsedPercent ? parseInt(r.diskUsedPercent) >= 90 : false}
      />

      {/* Backup config */}
      <CheckItem
        ok={form.performBackup ? true : null}
        label={form.performBackup ? `Backup enabled (keep ${form.maxBackups})` : 'Backup disabled'}
        detail={form.performBackup ? 'Current release archived before deploy' : 'No rollback safety net'}
        warn={!form.performBackup}
      />

      {/* Release backups (rotated pre-deploy snapshots) */}
      {r?.targetReachable && (
        <CheckItem
          ok={r.releaseBackupCount > 0 ? true : null}
          label={r.releaseBackupCount > 0
            ? `${r.releaseBackupCount} pre-deploy snapshot${r.releaseBackupCount !== 1 ? 's' : ''} stored`
            : 'No previous releases on server'}
          detail={r.releaseBackupCount > 0
            ? `Most recent: ${formatBackupTime(r.latestReleaseTimestamp)} · backup/releases/`
            : 'A snapshot is taken before each deploy'}
        />
      )}

      {/* Last-successful backup — the ONLY source for rollback */}
      {r?.targetReachable && (
        <CheckItem
          ok={r.lastSuccessfulExists ? true : null}
          label={r.lastSuccessfulExists ? 'Rollback point saved' : 'No rollback point yet'}
          detail={r.lastSuccessfulExists
            ? `Verified working version from ${formatBackupTime(r.lastSuccessfulTimestamp)} · backup/last-successful/`
            : 'Created after a deploy passes health checks · backup/last-successful/'}
          warn={!r.lastSuccessfulExists}
        />
      )}

      {/* Rollback capability — strictly tied to last-successful */}
      {r?.targetReachable && (
        <CheckItem
          ok={r.lastSuccessfulExists}
          label={r.lastSuccessfulExists ? 'Rollback available' : 'Rollback not available'}
          detail={r.lastSuccessfulExists
            ? 'Can restore to the last verified working version'
            : 'Requires at least one successful deploy with health check passed'}
          warn={!r.lastSuccessfulExists}
        />
      )}

      {/* Production warning */}
      {isProd && (
        <div className="flex items-start gap-2.5 py-2 mt-1">
          <AlertTriangle size={10} className="text-sig-purple/80 flex-shrink-0 mt-0.5" />
          <span className="text-[11px] text-sig-purple/80 font-medium">
            Deploying to PRODUCTION
          </span>
        </div>
      )}

      {/* What will happen */}
      <div className="pt-2 pb-1">
        <span className="text-[10px] text-wiz-muted/40 block font-medium mb-1">What happens next</span>
        <div className="flex flex-col gap-0.5">
          {['Stop current instance', 'Back up running version', 'Deploy new release', 'Start and verify health'].map((s, i) => (
            <span key={i} className="text-[10px] text-wiz-muted/30 flex items-center gap-1.5">
              <span className="text-wiz-muted/20">{i + 1}.</span> {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function RecentDeploys() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchJobs()
      .then((data) => { if (!cancelled) { setJobs(data.slice(0, 5)); setLoaded(true) } })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [])

  if (!loaded) return <div className="py-3 text-2xs text-wiz-muted/30 text-center">Loading…</div>
  if (jobs.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-2xs text-wiz-muted/40">
        <Activity size={11} /><span>No previous deployments</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 py-1">
      {jobs.map((j) => {
        const s = STATUS_ICONS[j.lifecycleStatus] ?? { icon: '?', color: 'text-wiz-muted' }
        const envC = ENV_COLORS[j.environment]
        return (
          <button
            key={j.jobId}
            type="button"
            onClick={() => window.open(`/jobs/${j.jobId}`, '_blank')}
            className="flex items-center gap-2 text-2xs rounded-md px-2 py-1.5 hover:bg-wiz-raised/50 transition-colors text-left group"
          >
            <span className={clsx('flex-shrink-0 font-mono', s.color)}>{s.icon}</span>
            <span className="flex-1 truncate text-wiz-cream/60 group-hover:text-wiz-cream/80">
              {j.appName || j.jobId.slice(0, 8)}
            </span>
            {envC && <span className={clsx('text-[9px] px-1 rounded', envC.text)}>{j.environment}</span>}
            <span className="text-wiz-muted/30 flex-shrink-0">{timeAgo(j.createdAt)}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────

export default function MissionControl(props: MissionControlProps) {
  const { step, form, testConnState, autoFilledFields, jvmConfigEnabled, jvmFlags, gcType, containerAware } = props

  const envColors = ENV_COLORS[form.environment]
  const borderAccent = envColors?.border ?? 'border-l-wiz-border-mid'

  // ── Abbreviated values ──────────────────────────────────────────────
  const targetStr = form.sshHost
    ? `${form.sshUser || '?'}@${form.sshHost}${form.sshPort && form.sshPort !== '22' ? `:${form.sshPort}` : ''}`
    : null

  // Install path: abbreviated display, full on hover
  const installFull = form.targetBasePath && form.appName
    ? `${form.targetBasePath}/${form.appName}`
    : form.targetBasePath || null
  const installShort = installFull ? abbreviatePath(installFull) : null

  const javaStr = form.javaCommand ? javaLabel(form.javaCommand) : null

  // JAR: abbreviated name (strip version/SNAPSHOT), type in parentheses
  const jarStr = form.jarArtifact
    ? `${abbreviateJarName(form.jarName || form.jarArtifact.name)} (${form.jarType})`
    : null

  const portStr = form.serverPort || null

  // Main class: simple name displayed, FQCN on hover
  const mainShort = form.mainClass ? simpleClassName(form.mainClass) : null

  // JVM — only when user opted in
  let jvmStr: string | null = null
  if (jvmConfigEnabled) {
    const parts: string[] = [gcType]
    if (form.xms && form.xmx) parts.push(`${form.xms}–${form.xmx}`)
    else if (form.xmx) parts.push(form.xmx)
    if (containerAware) parts.push('container')
    jvmStr = parts.join(' · ')
  }

  // Always show backup and logs
  const backupStr = form.performBackup ? `On (keep ${form.maxBackups})` : 'Off'
  const logStr = `${form.maxLogSize} × ${form.maxLogFiles}`

  // Certs & extra dirs — collect names for display
  const activeCerts = form.hasCerts ? form.certUploads.filter(c => c.file && c.source.trim()) : []
  const activeExtras = form.hasExtraDirs ? form.extraDirs.filter(d => d.file && d.dirName.trim()) : []

  // Context block
  const contextTitle = step === 1 ? 'Connection'
    : step === 2 ? 'JAR Analysis'
    : step === 3 ? 'JVM Preview'
    : 'Pre-flight Check'
  const contextIcon = step === 1 ? <Server size={10} className="text-wiz-muted/40" />
    : step === 2 ? <Package size={10} className="text-wiz-muted/40" />
    : step === 3 ? <Cpu size={10} className="text-wiz-muted/40" />
    : <ShieldCheck size={10} className="text-wiz-muted/40" />

  return (
    <div className="flex flex-col gap-3 w-fit flex-shrink-0" style={{ minWidth: SIDEBAR_MIN_W, maxWidth: SIDEBAR_MAX_W }}>

      {/* ── Deploy Summary — Steps 1–3 only ── */}
      {step < 4 && (
        <div className={clsx(
          'rounded-lg border border-wiz-border/50 border-l-2 bg-wiz-surface/80 overflow-hidden',
          borderAccent,
        )}>
          <div className="flex items-center gap-2 px-3 py-2 border-b border-wiz-border/25 bg-wiz-raised/15">
            <FileText size={10} className="text-wiz-gold/50" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-wiz-muted/50">Deploy Summary</span>
          </div>

          <div className="px-3 py-1.5 divide-y divide-wiz-border/10">
            {/* Target */}
            <div className="pb-1.5">
              <SummaryLine
                label="Env"
                value={form.environment}
                badge={envColors ? { text: form.environment, className: envColors.badge } : undefined}
              />
              <SummaryLine label="Target" value={targetStr} mono />
              <SummaryLine label="Install" value={installShort} title={installFull ?? undefined} mono />
              <SummaryLine label="Java" value={javaStr} title={form.javaCommand || undefined} />
            </div>

            {/* App — only after JAR uploaded */}
            {form.jarArtifact && (
              <div className="py-1.5">
                <SummaryLine label="App" value={jarStr} title={form.jarName || form.jarArtifact?.name || undefined} />
                <SummaryLine label="Port" value={portStr} mono />
                <SummaryLine label="Main" value={mainShort} title={form.mainClass || undefined} />
              </div>
            )}

            {/* Config — always visible */}
            <div className="pt-1.5">
              {jvmStr && <SummaryLine label="JVM" value={jvmStr} />}
              <SummaryLine label="Backup" value={backupStr} />
              <SummaryLine label="Stability" value={`${form.stabilityWindow}s`} />
              <SummaryLine label="Logs" value={logStr} />
              {/* Certs — individual rows with target path */}
              {activeCerts.map((c, i) => (
                <SummaryLine
                  key={`cert-${i}`}
                  label={i === 0 ? 'Certs' : ''}
                  value={`${c.source}: ${abbreviatePath(c.targetPath)}`}
                  title={`${c.source}: ${c.targetPath}`}
                  mono
                />
              ))}
              {/* Extra dirs — individual rows with target path */}
              {activeExtras.map((d, i) => (
                <SummaryLine
                  key={`extra-${i}`}
                  label={i === 0 ? 'Dirs' : ''}
                  value={`${d.dirName}: ${abbreviatePath(d.targetPath)}`}
                  title={`${d.dirName}: ${d.targetPath}`}
                  mono
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Context Block ── */}
      <div className={clsx(
        'rounded-lg border border-wiz-border/50 border-l-2 bg-wiz-surface/80 overflow-hidden',
        borderAccent,
      )}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-wiz-border/25 bg-wiz-raised/15">
          {contextIcon}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-wiz-muted/50">{contextTitle}</span>
        </div>
        <div className="px-3 py-1">
          {step === 1 && <ConnectionVisual form={form} testConnState={testConnState} />}
          {step === 2 && <JarAnalysis form={form} autoFilledFields={autoFilledFields} />}
          {step === 3 && <JvmPreview jvmConfigEnabled={jvmConfigEnabled} jvmFlags={jvmFlags} gcType={gcType} containerAware={containerAware} />}
          {step === 4 && <PreflightCheck form={form} />}
        </div>
      </div>
    </div>
  )
}
