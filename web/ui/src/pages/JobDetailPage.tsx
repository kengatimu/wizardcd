import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, StopCircle, ArrowLeft, RefreshCw, Wand2, RotateCcw,
  Server, Hash, Globe,
  CheckCircle2, XCircle, Loader2, AlertCircle, ShieldAlert,
  Layers, Calendar, Upload, Package, Send, Play, FlagTriangleRight,
  ChevronDown, Activity, MousePointer2,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { abortJob } from '../api/jobs'
import RedeployModal from '../components/RedeployModal'
import RollbackModal from '../components/RollbackModal'
import { useJobStatus } from '../hooks/useJobStatus'
import { useJobLogs } from '../hooks/useJobLogs'
import StatusBadge from '../components/StatusBadge'
import LogViewer from '../components/LogViewer'
import type { JobLifecycleStatus } from '../types/enums'
import {
  parseLogSections,
  formatSectionDuration,
  detectLevel,
  type LogSection,
} from '../utils/logParser'

// ── Environment config ─────────────────────────────────────────────

const ENV_CFG: Record<string, { badge: string; border: string; header: string; dim: string }> = {
  UAT:  { badge: 'bg-sig-yellow/20 text-sig-yellow', border: 'border-l-sig-yellow',  header: 'bg-sig-yellow/5',  dim: 'border-l-sig-yellow/20'  },
  PROD: { badge: 'bg-sig-purple/20 text-sig-purple', border: 'border-l-sig-purple',  header: 'bg-sig-purple/5',  dim: 'border-l-sig-purple/20'  },
  SIT:  { badge: 'bg-sig-blue/20   text-sig-blue',   border: 'border-l-sig-blue',    header: 'bg-sig-blue/5',    dim: 'border-l-sig-blue/20'    },
}
const FALLBACK_CFG = { badge: 'bg-wiz-border/20 text-wiz-muted', border: 'border-l-wiz-gold', header: 'bg-wiz-surface/20', dim: 'border-l-wiz-border/20' }
function envCfg(env?: string | null) { return (env && ENV_CFG[env]) ? ENV_CFG[env] : FALLBACK_CFG }

function EnvBadge({ env }: { env: string }) {
  return (
    <span className={clsx('text-xs font-mono font-semibold px-2 py-0.5 rounded', envCfg(env).badge)}>
      {env}
    </span>
  )
}
const ALL_ENVS = ['SIT', 'UAT', 'PROD']

// ── Phase → log-section mapping ────────────────────────────────────
// Keywords matched (case-insensitive) against LogSection.title.
// Phases with an empty array have no corresponding script log sections.

const PHASE_LOG_KEYWORDS: string[][] = [
  ['deployment job initialized'],      // 0: Deployment Job Initialization  (artifact inventory + verification)
  ['packaging', 'tanuki'],             // 1: Artifact Packaging
  ['transferring'],                    // 2: Transfer to Server
  ['executing remote'],                // 3: Remote Deployment
  ['executing remote'],                // 4: Application Started (same section, stabilization errors)
  [],                                  // 5: Final Deployment Status  (overall result)
]

/** Returns all LogSections that belong to a given phase index. */
function sectionsForPhase(phaseIndex: number, sections: LogSection[]): LogSection[] {
  const keywords = PHASE_LOG_KEYWORDS[phaseIndex] ?? []
  if (keywords.length === 0) return []
  return sections.filter(s =>
    keywords.some(kw => s.title.toLowerCase().includes(kw))
  )
}

/**
 * Merges multiple LogSections into one virtual section so LogViewer can
 * display them as a single focused view.
 */
function combineSections(phaseSections: LogSection[], phaseLabel: string): LogSection | null {
  if (phaseSections.length === 0) return null
  if (phaseSections.length === 1) return phaseSections[0]
  return {
    title:          phaseLabel,
    lines:          phaseSections.flatMap(s => s.lines),
    lineStart:      phaseSections[0].lineStart,
    hasError:       phaseSections.some(s => s.hasError),
    hasWarn:        phaseSections.some(s => s.hasWarn),
    titleTimestamp: phaseSections[0].titleTimestamp,
  }
}

/**
 * Splits a section's lines at the first line containing `keyword`.
 * mode='before' → lines strictly before the match (file deployment)
 * mode='from'   → lines at and after the match (app startup)
 * Returns the original section unchanged when keyword is not found.
 */
function sliceSection(section: LogSection, mode: 'before' | 'from', keyword: string): LogSection {
  const kw  = keyword.toLowerCase()
  const idx = section.lines.findIndex(l => l.toLowerCase().includes(kw))
  if (idx === -1) return section
  const lines = mode === 'before' ? section.lines.slice(0, idx) : section.lines.slice(idx)
  return {
    ...section,
    title:     section.title,
    lines,
    lineStart: mode === 'from' ? section.lineStart + idx : section.lineStart,
    hasError:  lines.some(l => detectLevel(l) === 'error'),
    hasWarn:   lines.some(l => detectLevel(l) === 'warn'),
  }
}

// ── Wizard-style inner panel ───────────────────────────────────────

const ACCENT: Record<string, { border: string; header: string }> = {
  gold:  { border: 'border-l-wiz-gold/50',  header: 'bg-wiz-gold/8'  },
  green: { border: 'border-l-sig-green/50', header: 'bg-sig-green/8' },
}

interface InnerPanelProps {
  icon:     React.ReactNode
  title:    string
  accent:   string
  open:     boolean
  onToggle: () => void
  badge?:   React.ReactNode
  children: React.ReactNode
}

function InnerPanel({ icon, title, accent, open, onToggle, badge, children }: InnerPanelProps) {
  const a = ACCENT[accent] ?? ACCENT.gold
  return (
    <div className={clsx('rounded-lg border border-wiz-border overflow-hidden border-l-2', a.border)}>
      <button
        type="button"
        onClick={onToggle}
        className={clsx(
          'w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b border-wiz-border/60',
          'transition-colors duration-100 hover:brightness-110',
          open ? a.header : 'bg-wiz-panel/60',
        )}
      >
        <span className="text-wiz-muted flex-shrink-0">{icon}</span>
        <span className="section-label flex-1">{title}</span>
        {badge}
        <ChevronDown
          size={11}
          className={clsx('text-wiz-dim transition-transform duration-200 flex-shrink-0', !open && '-rotate-90')}
        />
      </button>
      {open && children}
    </div>
  )
}

// ── Abort Modal ────────────────────────────────────────────────────

interface AbortModalProps { jobId: string; onConfirm: () => void; onCancel: () => void; loading: boolean }

function AbortModal({ jobId, onConfirm, onCancel, loading }: AbortModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-wiz-surface border border-wiz-border rounded-2xl shadow-panel p-6 max-w-md w-full animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-sig-red-dim flex items-center justify-center">
            <AlertTriangle size={18} className="text-sig-red" />
          </div>
          <div>
            <h3 className="font-semibold text-wiz-cream">Abort Deployment</h3>
            <p className="text-xs text-wiz-muted mt-0.5">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-wiz-gray mb-2">Are you sure you want to abort job:</p>
        <p className="font-mono text-xs text-wiz-gold bg-wiz-bg border border-wiz-border rounded-md px-3 py-2 mb-5">{jobId}</p>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className={clsx('btn-danger', loading && 'opacity-60')}>
            <StopCircle size={14} />
            {loading ? 'Aborting…' : 'Confirm Abort'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Compact metadata row ───────────────────────────────────────────

interface MetaRowProps { icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean }

function MetaRow({ icon, label, value, mono }: MetaRowProps) {
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-wiz-border/30 last:border-b-0">
      <span className="text-wiz-dim/70 flex-shrink-0">{icon}</span>
      <span className="text-2xs text-wiz-muted font-mono uppercase tracking-wider w-24 flex-shrink-0">{label}</span>
      <span className={clsx('text-xs text-wiz-cream flex-1 min-w-0 truncate', mono && 'font-mono text-wiz-gray text-2xs')}>
        {value}
      </span>
    </div>
  )
}

// ── Deployment Phases content ──────────────────────────────────────
// Each phase is a clickable row that filters the log viewer on the right.

type PhaseStatus = 'success' | 'warn' | 'error' | 'running' | 'pending'

function phaseIcon(s: PhaseStatus, size = 13) {
  if (s === 'success') return <CheckCircle2 size={size} className="text-sig-green flex-shrink-0" />
  if (s === 'warn')    return <AlertTriangle size={size} className="text-sig-yellow flex-shrink-0" />
  if (s === 'error')   return <XCircle       size={size} className="text-sig-red flex-shrink-0" />
  if (s === 'running') return <Loader2       size={size} className="text-sig-yellow animate-spin flex-shrink-0" />
  return                      <AlertCircle   size={size} className="text-wiz-dim/30 flex-shrink-0" />
}

function phaseChip(s: PhaseStatus) {
  if (s === 'success') return <span className="text-2xs font-mono text-sig-green">Done</span>
  if (s === 'warn')    return <span className="text-2xs font-mono text-sig-yellow">Warning</span>
  if (s === 'error')   return <span className="text-2xs font-mono text-sig-red">Failed</span>
  if (s === 'running') return <span className="text-2xs font-mono text-sig-yellow animate-pulse">Running</span>
  return                      <span className="text-2xs font-mono text-wiz-dim/40">—</span>
}

interface PhasesContentProps {
  sections:        LogSection[]
  lifecycleState:  JobLifecycleStatus
  isLive:          boolean
  selectedPhase:   number    // -1 = none
  onSelectPhase:   (i: number) => void
}

function PhasesContent({ sections, lifecycleState, isLive, selectedPhase, onSelectPhase }: PhasesContentProps) {
  const find   = (kw: string) => sections.find(s => s.title.toLowerCase().includes(kw.toLowerCase()))
  const lastTl = sections[sections.length - 1]?.title?.toLowerCase() ?? ''

  const isSuccess = lifecycleState === 'SUCCESS'
  const isFailed  = lifecycleState === 'FAILED'
  const isAborted = lifecycleState === 'ABORTED'
  const inWorkspace = ['PREPARING_WORKSPACE','RUNNING','SUCCESS','FAILED','ABORTED'].includes(lifecycleState)
  const inRunning   = ['RUNNING','SUCCESS','FAILED','ABORTED'].includes(lifecycleState)

  const packagingSection = find('Packaging deployment')
  const transferSection  = find('Transferring artifacts')
  const remoteSection    = find('Executing remote')

  const packagingActive = isLive && lastTl.includes('packaging')
  const transferActive  = isLive && lastTl.includes('transferring artifacts')
  const remoteActive    = isLive && lastTl.includes('executing remote')

  const workspaceStatus: PhaseStatus =
    inWorkspace ? 'success' : ['VALIDATING','CREATED'].includes(lifecycleState) ? 'running' : 'pending'

  const resolve = (sec: LogSection | undefined, active: boolean): PhaseStatus => {
    if (!inRunning) return 'pending'
    if (isSuccess)  return 'success'
    if (active)     return 'running'
    if (!sec)       return 'pending'
    if (isAborted)  return 'warn'
    return sec.hasError ? 'error' : 'success'
  }

  const packagingStatus = resolve(packagingSection, packagingActive)
  const transferStatus  = resolve(transferSection, transferActive)

  const remoteStatus: PhaseStatus =
    !inRunning     ? 'pending' :
    isSuccess      ? 'success' :
    remoteActive   ? 'running' :
    !remoteSection ? 'pending' :
    isAborted      ? 'warn'    : 'success'

  const appStartedStatus: PhaseStatus =
    isSuccess                  ? 'success' :
    isAborted && remoteSection ? 'warn'    :
    isAborted                  ? 'pending' :
    remoteSection?.hasError    ? 'error'   :
    isFailed  && remoteSection ? 'error'   :
    isFailed                   ? 'pending' :
    remoteActive               ? 'running' :
    remoteSection              ? 'running' : 'pending'

  const finalStatus: PhaseStatus =
    isSuccess ? 'success' : isFailed ? 'error' :
    isAborted ? 'warn'    : isLive   ? 'running' : 'pending'

  const phases: Array<{ icon: React.ReactNode; label: string; status: PhaseStatus }> = [
    { icon: <Upload size={11} />,            label: 'Deployment Job Initialization',  status: workspaceStatus  },
    { icon: <Package size={11} />,           label: 'Artifact Packaging',        status: packagingStatus  },
    { icon: <Send size={11} />,              label: 'Transfer to Server',        status: transferStatus   },
    { icon: <Play size={11} />,              label: 'Remote Deployment',         status: remoteStatus     },
    { icon: <Activity size={11} />,          label: 'Application Started',       status: appStartedStatus },
    { icon: <FlagTriangleRight size={11} />, label: 'Final Deployment Status',   status: finalStatus      },
  ]

  return (
    <div className="divide-y divide-wiz-border/30">
      {/* Header hint */}
      <div className="flex items-center gap-1.5 px-4 py-2 bg-wiz-bg/20">
        <MousePointer2 size={9} className="text-wiz-dim/40" />
        <span className="text-xs text-wiz-muted/70">Click a phase to filter logs</span>
      </div>

      {phases.map((p, i) => {
        const hasSections = (PHASE_LOG_KEYWORDS[i] ?? []).length > 0
        const isSelected  = selectedPhase === i
        const linked      = sectionsForPhase(i, sections)
        const hasLogs     = linked.length > 0

        // Phase duration: sum durations of all linked sections
        const durMs = (() => {
          if (linked.length === 0) return null
          const first = linked[0].titleTimestamp
          const nextAfterLast = sections[sections.indexOf(linked[linked.length - 1]) + 1]?.titleTimestamp
          const isActive = isLive && linked.some(s => s === sections[sections.length - 1])
          if (first && nextAfterLast) return nextAfterLast.getTime() - first.getTime()
          if (first && isActive) return Date.now() - first.getTime()
          return null
        })()

        const rowContent = (
          <>
            {phaseIcon(p.status)}
            <div className="flex-1 min-w-0">
              <span className={clsx(
                'text-xs',
                p.status === 'error'   ? 'text-sig-red font-mono'    :
                p.status === 'warn'    ? 'text-sig-yellow font-mono' :
                p.status === 'running' ? 'text-sig-yellow font-mono' :
                p.status === 'success' ? 'text-wiz-gray'             :
                                         'text-wiz-dim/50',
              )}>
                {p.label}
              </span>
              {hasLogs && (
                <span className={clsx(
                  'ml-2 text-2xs font-mono',
                  isSelected ? 'text-wiz-gold' : 'text-wiz-dim/40 group-hover:text-wiz-dim',
                )}>
                  {linked.reduce((n, s) => n + s.lines.filter(l => l.trim()).length, 0)} lines
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {durMs !== null && durMs >= 0 && (
                <span className={clsx(
                  'text-2xs font-mono',
                  isLive && linked.some(s => s === sections[sections.length - 1])
                    ? 'text-sig-yellow animate-pulse' : 'text-wiz-dim/50',
                )}>
                  {formatSectionDuration(durMs)}
                </span>
              )}
              {phaseChip(p.status)}
            </div>
          </>
        )

        if (hasSections) {
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onSelectPhase(isSelected ? -1 : i)}
              className={clsx(
                'group w-full flex items-center gap-3 px-4 py-2.5 text-left border-l-2 transition-colors duration-100',
                isSelected
                  ? 'bg-wiz-gold/10 border-l-wiz-gold'
                  : p.status === 'error'
                  ? 'hover:bg-sig-red/5 border-l-transparent'
                  : 'hover:bg-wiz-surface/30 border-l-transparent',
                p.status === 'running' && !isSelected && 'bg-sig-yellow/5',
              )}
            >
              {rowContent}
            </button>
          )
        }

        return (
          <div
            key={p.label}
            className={clsx(
              'flex items-center gap-3 px-4 py-2.5 border-l-2 border-l-transparent',
              p.status === 'error'   && 'bg-sig-red/5',
              p.status === 'running' && 'bg-sig-yellow/5',
            )}
          >
            {rowContent}
          </div>
        )
      })}
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────

const ABORTABLE: JobLifecycleStatus[] = ['CREATED', 'VALIDATING', 'PREPARING_WORKSPACE', 'RUNNING']

export default function JobDetailPage() {
  const { jobId }   = useParams<{ jobId: string }>()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const [showAbortModal,     setShowAbortModal]     = useState(false)
  const [showRedeployModal,  setShowRedeployModal]  = useState(false)
  const [showRollbackModal,  setShowRollbackModal]  = useState(false)
  const [selectedPhase,      setSelectedPhase]      = useState(-1)  // -1 = show all logs
  const [refreshing,         setRefreshing]         = useState(false)

  // Sub-panel open state
  const [metaOpen,   setMetaOpen]   = useState(true)
  const [phasesOpen, setPhasesOpen] = useState(true)

  const { data: status, isLoading: statusLoading, isError: statusError, refetch: refetchStatus } =
    useJobStatus(jobId)
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } =
    useJobLogs(jobId, status?.jobStatus)

  const isLive      = status?.jobStatus === 'RUNNING' || status?.jobStatus === 'PREPARING_WORKSPACE'
  const isAbortable   = status?.jobStatus ? ABORTABLE.includes(status.jobStatus) : false
  const isTerminal    = status?.jobStatus === 'SUCCESS' || status?.jobStatus === 'FAILED' || status?.jobStatus === 'ABORTED'
  const isRedeployable = isTerminal && status?.application && status?.environment
  const activeEnv     = status?.environment ?? ''

  const rawLines = logs ? logs.split('\n') : []
  const { sections } = rawLines.length > 0
    ? parseLogSections(rawLines)
    : { sections: [] as LogSection[] }

  // Auto-select the active phase on live jobs (the running one)
  useEffect(() => {
    if (isLive && sections.length > 0) {
      const lastTitle = sections[sections.length - 1]?.title?.toLowerCase() ?? ''
      const autoPhase = PHASE_LOG_KEYWORDS.findIndex(kws =>
        kws.length > 0 && kws.some(kw => lastTitle.includes(kw))
      )
      if (autoPhase !== -1) setSelectedPhase(autoPhase)
    }
  }, [isLive, sections.length])

  // Which env groups are expanded
  const [openEnvs, setOpenEnvs] = useState<Record<string, boolean>>({})
  useEffect(() => {
    if (activeEnv) {
      setOpenEnvs(prev => {
        if (prev[activeEnv] !== undefined) return prev
        return { SIT: false, UAT: false, PROD: false, [activeEnv]: true }
      })
    }
  }, [activeEnv])
  const toggleEnv = (env: string) => setOpenEnvs(prev => ({ ...prev, [env]: !prev[env] }))

  const abortMutation = useMutation({
    mutationFn: () => abortJob(jobId!),
    onSuccess: () => {
      toast.success('Abort request sent.')
      setShowAbortModal(false)
      void refetchStatus()
      void queryClient.invalidateQueries({ queryKey: ['jobs-list'] })
    },
    onError: () => toast.error('Failed to send abort request.'),
  })

  if (statusLoading) {
    return (
      <div className="flex flex-col gap-6 pt-6 animate-fade-in">
        <div className="skeleton h-8 rounded w-48" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-1 wiz-card p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="py-3 border-b border-wiz-border/40">
                <div className="skeleton h-3 rounded w-1/3 mb-2" />
                <div className="skeleton h-4 rounded w-2/3" />
              </div>
            ))}
          </div>
          <div className="col-span-2 wiz-card h-96" />
        </div>
      </div>
    )
  }

  if (statusError || !status) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 animate-fade-in">
        <AlertTriangle size={32} className="text-sig-red" />
        <p className="text-wiz-gray text-sm">
          {statusError ? 'Failed to load job details.' : 'Job not found.'}
        </p>
        <button type="button" onClick={() => navigate('/')} className="btn-secondary gap-2">
          <ArrowLeft size={13} /> Back to Dashboard
        </button>
      </div>
    )
  }

  const shortId = jobId!.slice(0, 8)

  // Derive the focused section(s) from the selected phase.
  // Phases 3 (Remote Deployment) and 4 (Application Started) share the same
  // bash log section but are split at the "Starting application" boundary so
  // each phase shows only its relevant lines.
  const APP_START_SPLIT = 'starting application with'
  const selectedSection: LogSection | null = (() => {
    if (selectedPhase < 0) return null
    const matched = sectionsForPhase(selectedPhase, sections)
    if (matched.length === 0) return null
    const combined = combineSections(matched, phases_labels[selectedPhase])
    if (!combined) return null
    if (selectedPhase === 3) return sliceSection(combined, 'before', APP_START_SPLIT)
    if (selectedPhase === 4) return sliceSection(combined, 'from',   APP_START_SPLIT)
    return combined
  })()

  // Informational note shown above log viewer for Remote Deployment:
  // tells the user app startup is in the next phase.
  const phaseContextNote: string | null = (() => {
    if (selectedPhase !== 3) return null
    const remoteSection = sections.find(s => s.title.toLowerCase().includes('executing remote'))
    if (!remoteSection) return null
    const hasSplit = remoteSection.lines.some(l => l.toLowerCase().includes(APP_START_SPLIT))
    if (hasSplit) {
      return 'Files deployed to target server successfully. Application startup is tracked in "Application Started".'
    }
    return null
  })()

  // Detect SSH public-key auth failure in the raw logs
  const sshAuthFailure: { env: string; host: string } | null = (() => {
    if (!logs) return null
    const lower = logs.toLowerCase()
    if (!lower.includes('permission denied (publickey)')) return null
    return { env: status.environment ?? 'the selected', host: status.application ?? '' }
  })()

  const sortedEnvs = [activeEnv || 'UAT', ...ALL_ENVS.filter(e => e !== activeEnv)]

  return (
    <>
      {showAbortModal && (
        <AbortModal
          jobId={jobId!}
          onConfirm={() => abortMutation.mutate()}
          onCancel={() => setShowAbortModal(false)}
          loading={abortMutation.isPending}
        />
      )}

      {showRedeployModal && status && (
        <RedeployModal
          jobId={jobId!}
          appName={status.application ?? ''}
          environment={status.environment ?? ''}
          onClose={() => setShowRedeployModal(false)}
        />
      )}

      {showRollbackModal && status && (
        <RollbackModal
          jobId={jobId!}
          appName={status.application ?? ''}
          environment={status.environment ?? ''}
          onClose={() => setShowRollbackModal(false)}
        />
      )}

      <div className="flex flex-col gap-6 pt-6 animate-fade-in">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/')} className="btn-icon h-8 w-8" title="Back">
              <ArrowLeft size={14} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-wiz-cream font-mono">
                  {status.application ?? `${shortId}…`}
                </h1>
                {activeEnv && <EnvBadge env={activeEnv} />}
                {isLive && (
                  <span className="flex items-center gap-1.5 text-xs text-sig-yellow animate-pulse font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-sig-yellow" />
                    Live
                  </span>
                )}
              </div>
              <p className="text-xs text-wiz-muted mt-0.5 font-mono">{jobId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRedeployable && (
              <>
                <button type="button" onClick={() => setShowRedeployModal(true)} className="btn-primary gap-1.5">
                  <Wand2 size={12} /> Re-deploy
                </button>
                <button
                  type="button"
                  onClick={() => setShowRollbackModal(true)}
                  className="inline-flex items-center justify-center gap-2 font-semibold text-sm px-5 py-2.5 rounded-md
                             transition-all duration-150 border border-sig-yellow/25 bg-sig-yellow/10 text-sig-yellow
                             hover:bg-sig-yellow/15 hover:border-sig-yellow/40"
                >
                  <RotateCcw size={12} /> Rollback
                </button>
              </>
            )}
            <button
              type="button"
              disabled={refreshing}
              onClick={async () => {
                setRefreshing(true)
                await Promise.all([refetchStatus(), refetchLogs()])
                setRefreshing(false)
                toast.success('Refreshed')
              }}
              className="inline-flex items-center justify-center gap-2 font-semibold text-sm px-5 py-2.5 rounded-md
                         transition-all duration-150 border border-wiz-cream/25 bg-wiz-cream/10 text-wiz-cream
                         hover:bg-wiz-cream/15 hover:border-wiz-cream/40"
            >
              <RefreshCw size={12} className={clsx(refreshing && 'animate-spin')} /> Refresh
            </button>
            {isAbortable && (
              <button type="button" onClick={() => setShowAbortModal(true)} className="btn-danger gap-1.5">
                <StopCircle size={14} /> Abort
              </button>
            )}
          </div>
        </div>

        {/* ── Status Row ── */}
        <div className={clsx(
          'flex items-center gap-4 p-4 rounded-xl border bg-wiz-surface border-wiz-border',
          isLive && 'animate-pulse-green border-sig-green/20',
        )}>
          <div className="flex items-center gap-6 flex-1 flex-wrap">
            <div>
              <p className="section-label mb-1.5">Lifecycle</p>
              <StatusBadge status={status.jobStatus} pulse size="md" />
            </div>
            <div className="w-px h-8 bg-wiz-border" />
            <div>
              <p className="section-label mb-1.5">Execution</p>
              <StatusBadge status={status.executionState} size="md" />
            </div>
            {(status.application || activeEnv) && (
              <>
                <div className="w-px h-8 bg-wiz-border" />
                <div>
                  <p className="section-label mb-1.5">Target</p>
                  <div className="flex items-center gap-1.5">
                    {status.application && <span className="text-sm font-mono text-wiz-cream">{status.application}</span>}
                    {activeEnv && <EnvBadge env={activeEnv} />}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Main Layout ── */}
        <div className="grid grid-cols-3 gap-6">

          {/* ── Left column ── */}
          <div className="col-span-1 flex flex-col gap-2.5">
            {sortedEnvs.map(env => {
              const cfg      = envCfg(env)
              const isActive = env === activeEnv
              const isOpen   = openEnvs[env] ?? false

              return (
                <div
                  key={env}
                  className={clsx(
                    'rounded-xl border border-wiz-border overflow-hidden border-l-2 transition-opacity duration-200',
                    isActive ? cfg.border : cfg.dim,
                    !isActive && 'opacity-55 hover:opacity-75',
                  )}
                >
                  {/* Environment header */}
                  <button
                    type="button"
                    onClick={() => toggleEnv(env)}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors duration-100',
                      isActive && isOpen ? cfg.header : 'bg-wiz-panel/70',
                      'hover:bg-wiz-surface/40',
                    )}
                  >
                    <ChevronDown
                      size={12}
                      className={clsx(
                        'flex-shrink-0 transition-transform duration-200',
                        isActive ? 'text-wiz-muted' : 'text-wiz-dim/40',
                        !isOpen && '-rotate-90',
                      )}
                    />
                    <EnvBadge env={env} />
                    <span className={clsx(
                      'text-xs font-mono flex-1 truncate',
                      isActive ? 'text-wiz-cream' : 'text-wiz-dim/60',
                    )}>
                      {status.application ?? shortId}
                    </span>
                    {isActive
                      ? <StatusBadge status={status.jobStatus} size="sm" pulse={isLive} />
                      : <span className="text-2xs font-mono text-wiz-dim/40">—</span>
                    }
                  </button>

                  {isOpen && (
                    isActive ? (
                      <div className="px-3 py-3 flex flex-col gap-2.5 bg-wiz-bg/30 border-t border-wiz-border/40">

                        {/* Job Metadata */}
                        <InnerPanel
                          icon={<Server size={12} />}
                          title="JOB METADATA"
                          accent="gold"
                          open={metaOpen}
                          onToggle={() => setMetaOpen(!metaOpen)}
                        >
                          <div className="px-4 py-1.5">
                            <MetaRow icon={<Hash size={11} />}              label="Job ID"      value={jobId!} mono />
                            {status.application && (
                              <MetaRow icon={<Layers size={11} />}          label="Application" value={status.application} />
                            )}
                            {activeEnv && (
                              <MetaRow icon={<Layers size={11} />}          label="Environment" value={<EnvBadge env={activeEnv} />} />
                            )}
                            {status.createdAt && (
                              <MetaRow icon={<Calendar size={11} />}        label="Started"     value={
                                new Date(status.createdAt).toLocaleString(undefined, {
                                  month: 'short', day: 'numeric',
                                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                                })
                              } />
                            )}
                            <MetaRow icon={<FlagTriangleRight size={11} />} label="Lifecycle"   value={<StatusBadge status={status.jobStatus} size="sm" />} />
                            <div className="flex items-center gap-1.5 py-2 text-2xs text-wiz-dim font-mono">
                              <Globe size={10} /><span>runner-service-ms</span>
                            </div>
                          </div>
                        </InnerPanel>

                        {/* Deployment Phases — clickable, drives the log viewer */}
                        <InnerPanel
                          icon={<FlagTriangleRight size={12} />}
                          title="DEPLOYMENT PHASES"
                          accent="green"
                          open={phasesOpen}
                          onToggle={() => setPhasesOpen(!phasesOpen)}
                        >
                          <PhasesContent
                            sections={sections}
                            lifecycleState={status.jobStatus}
                            isLive={isLive}
                            selectedPhase={selectedPhase}
                            onSelectPhase={setSelectedPhase}
                          />
                        </InnerPanel>

                      </div>
                    ) : (
                      <div className="px-4 py-3 bg-wiz-bg/20 border-t border-wiz-border/30">
                        <p className="text-xs text-wiz-muted/70">
                          No deployment for this environment in this job.
                        </p>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Right column: Log Viewer ── */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <p className="section-label">Execution Logs</p>
              {selectedSection && (
                <>
                  <span className="text-2xs font-mono text-wiz-dim">·</span>
                  <span className="text-2xs font-mono text-wiz-gold">
                    {selectedSection.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedPhase(-1)}
                    className="text-2xs font-mono text-wiz-muted hover:text-wiz-gold underline underline-offset-2 ml-1"
                  >
                    ← All logs
                  </button>
                </>
              )}
              {isLive && (
                <span className="text-2xs font-mono text-sig-yellow animate-blink ml-auto">
                  auto-refreshing every 3s
                </span>
              )}
            </div>
            {phaseContextNote && (
              <div className="flex items-start gap-2.5 mb-2 px-3 py-2.5 rounded-lg bg-sig-green/8 border border-sig-green/20 text-xs text-sig-green">
                <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
                <span>{phaseContextNote}</span>
              </div>
            )}
            {sshAuthFailure && (
              <div className="flex items-start gap-2.5 mb-2 px-3 py-2.5 rounded-lg bg-sig-red/8 border border-sig-red/25 text-xs text-sig-red">
                <ShieldAlert size={13} className="flex-shrink-0 mt-0.5 shrink-0" />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">SSH Authentication Failed — Public Key Not Authorised</span>
                  <span className="text-wiz-muted">
                    The runner's <span className="font-mono text-sig-red/80">{sshAuthFailure.env} ED25519 public key</span> is not in the target server's{' '}
                    <span className="font-mono text-sig-red/80">~/.ssh/authorized_keys</span>. To fix:
                  </span>
                  <ol className="list-decimal list-inside space-y-0.5 text-wiz-muted mt-0.5">
                    <li>Go to <strong className="text-wiz-cream">New Deploy → Step 1 (Target Server)</strong></li>
                    <li>Copy the <strong className="text-wiz-cream">{sshAuthFailure.env} public key</strong> from the SSH Keys panel</li>
                    <li>Append it to <span className="font-mono">~/.ssh/authorized_keys</span> on your target server</li>
                    <li>Run <strong className="text-wiz-cream">Test Connection</strong> to confirm access, then retry</li>
                  </ol>
                </div>
              </div>
            )}
            <LogViewer
              logs={logs ?? ''}
              isLoading={logsLoading || isLive}
              jobId={jobId}
              height="h-[calc(100vh-22rem)]"
              selectedSection={selectedSection}
            />
          </div>

        </div>
      </div>
    </>
  )
}

// Phase label lookup used by combineSections (mirrors the phases array order)
const phases_labels = [
  'Deployment Job Initialization',
  'Artifact Packaging',
  'Transfer to Server',
  'Remote Deployment',
  'Application Started',
  'Final Deployment Status',
]
