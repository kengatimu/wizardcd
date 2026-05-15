import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  AlertTriangle, StopCircle, ArrowLeft, RefreshCw, Wand2, RotateCcw,
  Server, Hash, Globe,
  CheckCircle2, XCircle, Loader2, AlertCircle, ShieldAlert,
  Layers, Calendar, Upload, Package, Send, Play, FlagTriangleRight,
  ChevronDown, Activity, MousePointer2, Clock, Trash2,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { abortJob, fetchJobs, rollbackPreflight, type RollbackPreflightResult } from '../api/jobs'
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
  DEV:  { badge: 'bg-sig-green/20  text-sig-green',  border: 'border-l-sig-green',   header: 'bg-sig-green-dim',   dim: 'border-l-sig-green/20'   },
  SIT:  { badge: 'bg-sig-blue/20   text-sig-blue',   border: 'border-l-sig-blue',    header: 'bg-sig-blue-dim',    dim: 'border-l-sig-blue/20'    },
  UAT:  { badge: 'bg-sig-yellow/20 text-sig-yellow', border: 'border-l-sig-yellow',  header: 'bg-sig-yellow-dim',  dim: 'border-l-sig-yellow/20'  },
  PROD: { badge: 'bg-sig-purple/20 text-sig-purple', border: 'border-l-sig-purple',  header: 'bg-sig-purple-dim',  dim: 'border-l-sig-purple/20'  },
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

// ── Phase → log-section mapping ────────────────────────────────────

const DEPLOY_PHASE_KEYWORDS: string[][] = [
  ['deployment job initialized'],
  ['packaging', 'tanuki'],
  ['transferring'],
  ['executing remote'],
  ['stability check'],
  ['cleanup'],
]

const ROLLBACK_PHASE_KEYWORDS: string[][] = [
  ['rollback job initialized'],
  ['verifying rollback backup', 'verifying backup'],
  ['executing remote rollback'],
  ['stability check'],
  ['cleanup'],
]

function sectionsForPhase(phaseIndex: number, sections: LogSection[], keywordList: string[][] = DEPLOY_PHASE_KEYWORDS): LogSection[] {
  const keywords = keywordList[phaseIndex] ?? []
  if (keywords.length === 0) return []
  return sections.filter(s =>
    keywords.some(kw => s.title.toLowerCase().includes(kw))
  )
}

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

// ── Abort Modal ────────────────────────────────────────────────────

interface AbortModalProps { jobId: string; onConfirm: () => void; onCancel: () => void; loading: boolean }

function AbortModal({ jobId, onConfirm, onCancel, loading }: AbortModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-wiz-surface border border-wiz-border rounded shadow-panel p-6 max-w-md w-full animate-fade-in">
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
        <p className="font-mono text-xs text-wiz-gold bg-wiz-bg border border-wiz-border rounded px-3 py-2 mb-5">{jobId}</p>
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

type PhaseStatus = 'success' | 'warn' | 'error' | 'running' | 'pending' | 'aborted'

function phaseIcon(s: PhaseStatus, size = 13) {
  if (s === 'success') return <CheckCircle2 size={size} className="text-sig-green flex-shrink-0" />
  if (s === 'aborted') return <StopCircle   size={size} className="text-wiz-muted flex-shrink-0" />
  if (s === 'warn')    return <AlertTriangle size={size} className="text-sig-yellow flex-shrink-0" />
  if (s === 'error')   return <XCircle       size={size} className="text-sig-red flex-shrink-0" />
  if (s === 'running') return <Loader2       size={size} className="text-sig-yellow animate-spin flex-shrink-0" />
  return                      <AlertCircle   size={size} className="text-wiz-dim/30 flex-shrink-0" />
}

function phaseChip(s: PhaseStatus, skipped = false) {
  if (s === 'success') return <span className="text-2xs font-mono text-sig-green">Done</span>
  if (s === 'aborted') return <span className="text-2xs font-mono text-wiz-muted">Aborted</span>
  if (s === 'warn')    return <span className="text-2xs font-mono text-sig-yellow">Warning</span>
  if (s === 'error')   return <span className="text-2xs font-mono text-sig-red">Failed</span>
  if (s === 'running') return <span className="text-2xs font-mono text-sig-yellow animate-pulse">Running</span>
  if (skipped)         return <span className="text-2xs font-mono text-wiz-dim/50 italic">Skipped</span>
  return                      <span className="text-2xs font-mono text-wiz-dim/40">—</span>
}

interface PhasesContentProps {
  sections:        LogSection[]
  lifecycleState:  JobLifecycleStatus
  isLive:          boolean
  selectedPhase:   number
  onSelectPhase:   (i: number) => void
}

function PhasesContent({ sections, lifecycleState, isLive, selectedPhase, onSelectPhase }: PhasesContentProps) {
  const find   = (kw: string) => sections.find(s => s.title.toLowerCase().includes(kw.toLowerCase()))
  const lastTl = sections[sections.length - 1]?.title?.toLowerCase() ?? ''

  const isSuccess  = lifecycleState === 'SUCCESS'
  const isFailed   = lifecycleState === 'FAILED'
  const isAborted  = lifecycleState === 'ABORTED'
  const isTerminal = isSuccess || isFailed || isAborted
  const inWorkspace = ['PREPARING_WORKSPACE','RUNNING','SUCCESS','FAILED','ABORTED'].includes(lifecycleState)
  const inRunning   = ['RUNNING','SUCCESS','FAILED','ABORTED'].includes(lifecycleState)

  // Detect rollback jobs from log content
  const isRollback = sections.some(s => s.title.toLowerCase().includes('rollback'))

  const resolve = (sec: LogSection | undefined, active: boolean): PhaseStatus => {
    if (!inRunning) return 'pending'
    if (isSuccess)  return 'success'
    if (active)     return 'running'
    if (!sec)       return isAborted ? 'aborted' : 'pending'
    if (isAborted)  return sec.hasError ? 'error' : 'success'
    return sec.hasError ? 'error' : 'success'
  }

  let phases: Array<{ icon: React.ReactNode; label: string; status: PhaseStatus }>

  if (isRollback) {
    // ── Rollback phases (5 phases) ──
    const initSection      = find('Rollback Job Initialized')
    const verifySection    = find('Verifying rollback backup')
    const executeSection   = find('Executing remote rollback')
    const stabilitySection = find('Stability check')
    const cleanupSection   = find('Cleanup')

    const verifyActive    = isLive && lastTl.includes('verifying')
    const executeActive   = isLive && (lastTl.includes('executing remote') && !stabilitySection)
    const stabilityActive = isLive && lastTl.includes('stability check')
    const cleanupActive   = isLive && lastTl.includes('cleanup')

    const initStatus: PhaseStatus =
      inWorkspace ? 'success' : ['VALIDATING','CREATED'].includes(lifecycleState) ? 'running' : 'pending'

    const verifyStatus  = resolve(verifySection, verifyActive)

    const executeStatus: PhaseStatus =
      !inRunning      ? 'pending' :
      isSuccess       ? 'success' :
      executeActive   ? 'running' :
      !executeSection ? (isAborted ? 'aborted' : 'pending') :
      isAborted       ? (executeSection.hasError ? 'error' : 'success') :
      executeSection.hasError ? 'error' : 'success'

    // Stability Check stays "pending" until its own log section actually
    // appears. The previous logic flipped it to "running" the moment the
    // Execute Remote section started, which made Remote and Stability paint
    // as simultaneously running. The only "running" path now is the explicit
    // stabilityActive branch (last log line mentions "stability check").
    const stabilityStatus: PhaseStatus =
      !inRunning        ? 'pending' :
      isSuccess         ? 'success' :
      stabilityActive   ? 'running' :
      !stabilitySection ? (isAborted ? 'aborted' : 'pending') :
      isAborted         ? (stabilitySection.hasError ? 'error' : 'success') :
      stabilitySection.hasError ? 'error' : 'success'

    const cleanupStatus: PhaseStatus =
      isSuccess                      ? 'success' :
      cleanupActive                  ? 'running' :
      cleanupSection                 ? 'success' :
      isFailed || isAborted          ? 'aborted' :
      stabilityStatus === 'success'  ? 'running' : 'pending'

    phases = [
      { icon: <RotateCcw size={11} />,         label: 'Rollback Job Initialized',        status: initStatus       },
      { icon: <ShieldAlert size={11} />,       label: 'Verifying Backup on Target',      status: verifyStatus     },
      { icon: <Play size={11} />,              label: 'Executing Remote Rollback',       status: executeStatus    },
      { icon: <Activity size={11} />,          label: 'Stability Check',                 status: stabilityStatus  },
      { icon: <Trash2 size={11} />,            label: 'Cleanup',                         status: cleanupStatus    },
    ]
  } else {
    // ── Deploy phases ──
    const packagingSection  = find('Packaging deployment')
    const transferSection   = find('Transferring artifacts')
    const remoteSection     = find('Executing remote')
    const stabilitySection  = find('Stability check')
    const cleanupSection    = find('Cleanup')

    const packagingActive  = isLive && lastTl.includes('packaging')
    const transferActive   = isLive && lastTl.includes('transferring artifacts')
    const remoteActive     = isLive && (lastTl.includes('executing remote') && !stabilitySection)
    const stabilityActive  = isLive && lastTl.includes('stability check')
    const cleanupActive    = isLive && lastTl.includes('cleanup')

    const workspaceStatus: PhaseStatus =
      inWorkspace ? 'success' : ['VALIDATING','CREATED'].includes(lifecycleState) ? 'running' : 'pending'

    const packagingStatus = resolve(packagingSection, packagingActive)
    const transferStatus  = resolve(transferSection, transferActive)

    const remoteStatus: PhaseStatus =
      !inRunning     ? 'pending' :
      isSuccess      ? 'success' :
      remoteActive   ? 'running' :
      !remoteSection ? (isAborted ? 'aborted' : 'pending') :
      isAborted      ? (remoteSection.hasError ? 'error' : 'success') :
      remoteSection.hasError ? 'error' : 'success'

    // Stability Check stays "pending" until its own log section actually
    // appears. The previous logic flipped it to "running" the moment the
    // Remote Deployment section started, which made Remote and Stability
    // paint as simultaneously running. The only "running" path now is the
    // explicit stabilityActive branch (last log line mentions "stability
    // check").
    const stabilityStatus: PhaseStatus =
      !inRunning        ? 'pending' :
      isSuccess         ? 'success' :
      stabilityActive   ? 'running' :
      !stabilitySection ? (isAborted ? 'aborted' : 'pending') :
      isAborted         ? (stabilitySection.hasError ? 'error' : 'success') :
      stabilitySection.hasError ? 'error' : 'success'

    const cleanupStatus: PhaseStatus =
      isSuccess                      ? 'success' :
      cleanupActive                  ? 'running' :
      cleanupSection                 ? 'success' :
      isFailed || isAborted          ? 'aborted' :
      stabilityStatus === 'success'  ? 'running' : 'pending'

    phases = [
      { icon: <Upload size={11} />,            label: 'Deployment Job Initialization',  status: workspaceStatus   },
      { icon: <Package size={11} />,           label: 'Artifact Packaging',        status: packagingStatus  },
      { icon: <Send size={11} />,              label: 'Transfer to Server',        status: transferStatus   },
      { icon: <Play size={11} />,              label: 'Remote Deployment',         status: remoteStatus     },
      { icon: <Activity size={11} />,          label: 'Stability Check',           status: stabilityStatus  },
      { icon: <Trash2 size={11} />,            label: 'Cleanup',                   status: cleanupStatus    },
    ]
  }

  return (
    <div className="divide-y divide-wiz-border/30">
      <div className="flex items-center gap-1.5 px-4 py-2 bg-wiz-bg/20">
        <MousePointer2 size={9} className="text-wiz-dim/40" />
        <span className="text-xs text-wiz-muted/70">Click a phase to filter logs</span>
      </div>

      {phases.map((p, i) => {
        const activeKeywords = isRollback ? ROLLBACK_PHASE_KEYWORDS : DEPLOY_PHASE_KEYWORDS
        const hasSections = (activeKeywords[i] ?? []).length > 0
        const isSelected  = selectedPhase === i
        const linked      = sectionsForPhase(i, sections, activeKeywords)
        const hasLogs     = linked.length > 0

        const durMs = (() => {
          if (linked.length === 0) return null
          const first = linked[0].titleTimestamp
          const nextAfterLast = sections[sections.indexOf(linked[linked.length - 1]) + 1]?.titleTimestamp
          const isActive = isLive && linked.some(s => s === sections[sections.length - 1])
          if (first && nextAfterLast) return nextAfterLast.getTime() - first.getTime()
          if (first && isActive) return Date.now() - first.getTime()
          return null
        })()

        // A pending phase in a terminal job = "Skipped" — never ran due to earlier failure
        const isSkipped = p.status === 'pending' && isTerminal

        const rowContent = (
          <>
            {phaseIcon(p.status)}
            <div className="flex-1 min-w-0">
              <span className={clsx(
                'text-xs',
                p.status === 'error'   ? 'text-sig-red font-mono'    :
                p.status === 'warn'    ? 'text-sig-yellow font-mono' :
                p.status === 'aborted' ? 'text-wiz-muted font-mono'  :
                p.status === 'running' ? 'text-sig-yellow font-mono' :
                p.status === 'success' ? 'text-wiz-gray'             :
                isSkipped              ? 'text-wiz-dim/40'           :
                                         'text-wiz-dim/50',
              )}>
                {p.label}
              </span>
              {hasLogs && !isSkipped && (
                <span className={clsx(
                  'ml-2 text-2xs font-mono',
                  isSelected ? 'text-wiz-gold' : 'text-wiz-dim/40 group-hover:text-wiz-dim',
                )}>
                  {linked.reduce((n, s) => n + s.lines.filter(l => l.trim()).length, 0)} lines
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {durMs !== null && durMs >= 0 && !isSkipped && (
                <span className={clsx(
                  'text-2xs font-mono',
                  isLive && linked.some(s => s === sections[sections.length - 1])
                    ? 'text-sig-yellow animate-pulse' : 'text-wiz-dim/50',
                )}>
                  {formatSectionDuration(durMs)}
                </span>
              )}
              {phaseChip(p.status, isSkipped)}
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
                isSkipped && 'opacity-50 cursor-default',
                !isSkipped && isSelected
                  ? 'bg-wiz-gold/10 border-l-wiz-gold'
                  : p.status === 'success'
                  ? 'bg-sig-green/[0.04] hover:bg-sig-green/[0.08] border-l-sig-green/30'
                  : p.status === 'error'
                  ? 'hover:bg-sig-red/[0.05] border-l-sig-red/50'
                  : p.status === 'warn'
                  ? 'bg-sig-yellow/[0.04] hover:bg-sig-yellow/[0.07] border-l-sig-yellow/30'
                  : p.status === 'running'
                  ? 'bg-sig-yellow/[0.05] hover:bg-sig-yellow/[0.09] border-l-sig-yellow/40'
                  : 'border-l-transparent',
              )}
              disabled={isSkipped}
            >
              {rowContent}
            </button>
          )
        }

        return (
          <div
            key={p.label}
            className={clsx(
              'flex items-center gap-3 px-4 py-2.5 border-l-2',
              isSkipped              && 'opacity-50 border-l-transparent',
              !isSkipped && p.status === 'success' && 'bg-sig-green/[0.04] border-l-sig-green/30',
              !isSkipped && p.status === 'error'   && 'border-l-sig-red/50',
              !isSkipped && p.status === 'warn'    && 'bg-sig-yellow/[0.04] border-l-sig-yellow/30',
              !isSkipped && p.status === 'running' && 'bg-sig-yellow/[0.05] border-l-sig-yellow/40',
              !isSkipped && p.status === 'pending' && 'border-l-transparent',
              p.status === 'aborted'               && 'border-l-transparent',
            )}
          >
            {rowContent}
          </div>
        )
      })}
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function totalDuration(createdAt?: string, completedAt?: string): string | null {
  if (!createdAt) return null
  const start = new Date(createdAt).getTime()
  const end = completedAt ? new Date(completedAt).getTime() : Date.now()
  const ms = end - start
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  return `${mins}m ${secs % 60}s`
}

// ── Main Page ──────────────────────────────────────────────────────

const ABORTABLE: JobLifecycleStatus[] = ['CREATED', 'VALIDATING', 'PREPARING_WORKSPACE', 'RUNNING']
const ALL_ENVS = ['DEV', 'SIT', 'UAT', 'PROD']

export default function JobDetailPage() {
  const { jobId }   = useParams<{ jobId: string }>()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const [showAbortModal,     setShowAbortModal]     = useState(false)
  const [showRedeployModal,  setShowRedeployModal]  = useState(false)
  const [showRollbackModal,  setShowRollbackModal]  = useState(false)
  const [rollbackPreflightData, setRollbackPreflightData] = useState<RollbackPreflightResult | null>(null)
  const [rollbackPreflightLoading, setRollbackPreflightLoading] = useState(false)
  const [selectedPhase,      setSelectedPhase]      = useState(-1)
  const [refreshing,         setRefreshing]         = useState(false)
  const [metaOpen,           setMetaOpen]           = useState(false) // collapsed by default

  // Reset state when navigating between jobs
  useEffect(() => {
    setSelectedPhase(-1)
    setMetaOpen(false)
    setShowAbortModal(false)
    setShowRedeployModal(false)
    setShowRollbackModal(false)
    window.scrollTo({ top: 0 })
  }, [jobId])

  const { data: status, isLoading: statusLoading, isError: statusError, refetch: refetchStatus } =
    useJobStatus(jobId)
  const { data: logs, isLoading: logsLoading, refetch: refetchLogs } =
    useJobLogs(jobId, status?.jobStatus)

  // Fetch all jobs to build Environment Status strip
  const { data: allJobs } = useQuery({
    queryKey: ['jobs-list'],
    queryFn: () => fetchJobs(),
    staleTime: 30_000,
  })

  const isLive        = status?.jobStatus === 'RUNNING' || status?.jobStatus === 'PREPARING_WORKSPACE'
  const isAbortable   = status?.jobStatus ? ABORTABLE.includes(status.jobStatus) : false
  const isTerminal    = status?.jobStatus === 'SUCCESS' || status?.jobStatus === 'FAILED' || status?.jobStatus === 'ABORTED'
  const isRedeployable = isTerminal && status?.application && status?.environment
  const activeEnv     = status?.environment ?? ''
  const appName       = status?.application ?? ''

  const rawLines = logs ? logs.split('\n') : []
  const { sections } = rawLines.length > 0
    ? parseLogSections(rawLines)
    : { sections: [] as LogSection[] }

  // Detect rollback job from log sections
  const isRollbackJob = sections.some(s => s.title.toLowerCase().includes('rollback'))
  const activeKeywords = isRollbackJob ? ROLLBACK_PHASE_KEYWORDS : DEPLOY_PHASE_KEYWORDS

  // Auto-select the active phase on live jobs
  useEffect(() => {
    if (isLive && sections.length > 0) {
      const lastTitle = sections[sections.length - 1]?.title?.toLowerCase() ?? ''
      const autoPhase = activeKeywords.findIndex(kws =>
        kws.length > 0 && kws.some(kw => lastTitle.includes(kw))
      )
      if (autoPhase !== -1) setSelectedPhase(autoPhase)
    }
  }, [isLive, sections.length])

  // Auto-expand metadata when job reaches terminal state
  useEffect(() => {
    if (isTerminal) setMetaOpen(true)
  }, [isTerminal])

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

  // Build Environment Status: latest job per env for this app
  // Always include the current job so it shows up even before allJobs refreshes
  const envStatus = (() => {
    if (!allJobs || !appName) return {}
    const appJobs = allJobs
      .filter(j => j.appName === appName)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const byEnv: Record<string, typeof allJobs[0]> = {}
    for (const job of appJobs) {
      if (!byEnv[job.environment]) {
        byEnv[job.environment] = job
      }
    }
    // Ensure current job overrides its env slot if it's newer
    if (activeEnv && status?.createdAt && jobId) {
      const current = byEnv[activeEnv]
      if (!current || new Date(status.createdAt).getTime() >= new Date(current.createdAt).getTime()) {
        byEnv[activeEnv] = {
          jobId: jobId,
          appName,
          environment: activeEnv,
          lifecycleStatus: status.jobStatus,
          createdAt: status.createdAt,
          completedAt: (allJobs.find(j => j.jobId === jobId))?.completedAt,
        }
      }
    }
    return byEnv
  })()

  // Compute total duration
  const duration = (() => {
    if (!status?.createdAt) return null
    // Find completedAt from the allJobs list for this job
    const thisJob = allJobs?.find(j => j.jobId === jobId)
    return totalDuration(status.createdAt, thisJob?.completedAt ?? undefined)
  })()

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

  const activeLabels = isRollbackJob ? ROLLBACK_PHASE_LABELS : DEPLOY_PHASE_LABELS
  const selectedSection: LogSection | null = (() => {
    if (selectedPhase < 0) return null
    const matched = sectionsForPhase(selectedPhase, sections, activeKeywords)
    if (matched.length === 0) return null
    const combined = combineSections(matched, activeLabels[selectedPhase])
    return combined
  })()

  const phaseContextNote: string | null = (() => {
    if (selectedPhase !== 3) return null
    const remoteSection = sections.find(s => s.title.toLowerCase().includes('executing remote'))
    if (!remoteSection) return null
    const hasStability = sections.some(s => s.title.toLowerCase().includes('stability check'))
    if (hasStability) {
      return 'Files deployed and application started. Stability verification is tracked in "Stability Check".'
    }
    return null
  })()

  const sshAuthFailure: { env: string; host: string } | null = (() => {
    if (!logs) return null
    const lower = logs.toLowerCase()
    if (!lower.includes('permission denied (publickey)')) return null
    return { env: status.environment ?? 'the selected', host: status.application ?? '' }
  })()

  // ── Status banner config ────────────────────────────────────────
  const statusLabel =
    status.jobStatus === 'SUCCESS'         ? 'Deployment Successful'  :
    status.jobStatus === 'FAILED'          ? 'Deployment Failed'      :
    status.jobStatus === 'ABORTED'         ? 'Deployment Aborted'     :
    status.jobStatus === 'ABORT_REQUESTED' ? 'Abort Requested…'       :
    isLive                                 ? 'Deploying…'             : 'Deployment Pending'

  const bannerBg =
    status.jobStatus === 'SUCCESS'         ? 'border-sig-green    bg-sig-green-dim'   :
    status.jobStatus === 'FAILED'          ? 'border-sig-red      bg-sig-red-dim'     :
    status.jobStatus === 'ABORTED'         ? 'border-sig-yellow/60 bg-sig-yellow-dim' :
    status.jobStatus === 'ABORT_REQUESTED' ? 'border-sig-yellow/40 bg-sig-yellow/5'   :
    isLive                                 ? 'border-sig-yellow/40 bg-sig-yellow/5'   :
                                             'border-wiz-border   bg-wiz-surface'

  const bannerIconBg =
    status.jobStatus === 'SUCCESS' ? 'bg-sig-green/15'  :
    status.jobStatus === 'FAILED'  ? 'bg-sig-red/15'    :
    status.jobStatus === 'ABORTED' ? 'bg-sig-yellow/15' :
    isLive || status.jobStatus === 'ABORT_REQUESTED' ? 'bg-sig-yellow/15' :
                                     'bg-wiz-raised'

  const bannerTextClass =
    status.jobStatus === 'SUCCESS' ? 'text-sig-green text-lg'    :
    status.jobStatus === 'FAILED'  ? 'text-sig-red   text-lg'    :
    status.jobStatus === 'ABORTED' ? 'text-sig-yellow text-base' :
    isLive || status.jobStatus === 'ABORT_REQUESTED' ? 'text-sig-yellow text-base' :
                                     'text-wiz-cream  text-base'

  const bannerIconEl =
    status.jobStatus === 'SUCCESS'         ? <CheckCircle2 size={26} className="text-sig-green" />          :
    status.jobStatus === 'FAILED'          ? <XCircle      size={26} className="text-sig-red" />            :
    status.jobStatus === 'ABORTED'         ? <StopCircle   size={26} className="text-sig-yellow" />         :
    status.jobStatus === 'ABORT_REQUESTED' ? <StopCircle   size={26} className="text-sig-yellow animate-pulse" /> :
    isLive                                 ? <Loader2      size={26} className="text-sig-yellow animate-spin" />  :
                                             <AlertCircle  size={26} className="text-wiz-muted" />

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
          preflight={rollbackPreflightData}
          preflightLoading={rollbackPreflightLoading}
          onClose={() => setShowRollbackModal(false)}
        />
      )}

      <div className="flex flex-col gap-5 pt-6 animate-fade-in">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/')} className="btn-icon h-8 w-8" title="Back">
              <ArrowLeft size={14} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-wiz-cream font-mono">
                  {appName || `${shortId}…`}
                </h1>
                {activeEnv && <EnvBadge env={activeEnv} />}
                {isLive && (
                  <span className="flex items-center gap-1.5 text-xs text-sig-yellow animate-pulse font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-sig-yellow" />
                    Live
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-wiz-muted font-mono">{jobId}</p>
                {duration && (
                  <>
                    <span className="text-wiz-dim">·</span>
                    <span className="flex items-center gap-1 text-xs text-wiz-muted">
                      <Clock size={10} />
                      {duration}
                    </span>
                  </>
                )}
              </div>
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
                  onClick={async () => {
                    setShowRollbackModal(true)
                    setRollbackPreflightLoading(true)
                    setRollbackPreflightData(null)
                    try {
                      const result = await rollbackPreflight(jobId!)
                      setRollbackPreflightData(result)
                    } catch {
                      setRollbackPreflightData({ available: false, reason: 'Failed to check backup on target server' })
                    } finally {
                      setRollbackPreflightLoading(false)
                    }
                  }}
                  className="inline-flex items-center justify-center gap-2 font-semibold text-sm px-5 py-2.5 rounded
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
              className="inline-flex items-center justify-center gap-2 font-semibold text-sm px-5 py-2.5 rounded
                         transition-all duration-150 border border-wiz-border text-wiz-muted
                         hover:bg-wiz-raised hover:text-wiz-cream hover:border-wiz-border-mid"
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

        {/* ── Unified Status Banner — bold ── */}
        <div className={clsx('flex items-center gap-5 px-6 py-4 rounded border-2', bannerBg)}>
          {/* Large status icon */}
          <div className={clsx(
            'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center',
            bannerIconBg,
          )}>
            {bannerIconEl}
          </div>

          {/* Status text + timestamp */}
          <div className="flex-1 min-w-0">
            <p className={clsx('font-bold tracking-tight leading-tight', bannerTextClass)}>
              {statusLabel}
            </p>
            {status.createdAt && (
              <p className="text-xs text-wiz-muted mt-1 flex items-center gap-2 flex-wrap">
                <span>{new Date(status.createdAt).toLocaleString(undefined, {
                  month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit',
                })}</span>
                {duration && (
                  <>
                    <span className="text-wiz-border-mid">·</span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {duration}
                    </span>
                  </>
                )}
                {appName && activeEnv && (
                  <>
                    <span className="text-wiz-border-mid">·</span>
                    <EnvBadge env={activeEnv} />
                  </>
                )}
              </p>
            )}
          </div>

          {/* App name display */}
          {appName && (
            <span className="flex-shrink-0 flex items-center gap-1.5 text-xs text-wiz-muted">
              <Layers size={12} />
              <span className="font-mono">{appName}</span>
            </span>
          )}
        </div>

        {/* ── Main Layout ── */}
        <div className="grid grid-cols-3 gap-6">

          {/* ── Left column ── */}
          <div className="col-span-1 flex flex-col gap-3">

            {/* Deployment Phases — primary content */}
            <div className="rounded border border-wiz-border overflow-hidden border-l-2 border-l-sig-green/50">
              <button
                type="button"
                onClick={() => {/* always open */}}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b border-wiz-border/60 bg-sig-green/8"
              >
                <FlagTriangleRight size={12} className="text-wiz-muted" />
                <span className="section-label flex-1">DEPLOYMENT PHASES</span>
                <span className="text-2xs font-mono text-wiz-dim">{sections.length} steps</span>
              </button>
              <PhasesContent
                sections={sections}
                lifecycleState={status.jobStatus}
                isLive={isLive}
                selectedPhase={selectedPhase}
                onSelectPhase={setSelectedPhase}
              />
            </div>

            {/* Job Metadata — hidden while live, auto-expanded on completion */}
            {!isLive && <div className="rounded border border-wiz-border overflow-hidden border-l-2 border-l-wiz-gold/50">
              <button
                type="button"
                onClick={() => setMetaOpen(!metaOpen)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b border-wiz-border/60 transition-colors',
                  metaOpen ? 'bg-wiz-gold/8 border-b border-wiz-border/60' : 'bg-wiz-bg',
                )}
              >
                <Server size={12} className="text-wiz-muted" />
                <span className="section-label flex-1">JOB METADATA</span>
                <ChevronDown
                  size={11}
                  className={clsx('text-wiz-dim transition-transform duration-200', !metaOpen && '-rotate-90')}
                />
              </button>
              {metaOpen && (
                <div className="px-4 py-1.5">
                  <MetaRow icon={<Hash size={11} />}              label="Job ID"      value={jobId!} mono />
                  {appName && (
                    <MetaRow icon={<Layers size={11} />}          label="Application" value={appName} />
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
              )}
            </div>}

            {/* Environment Status — hidden while job is live to avoid false alarm from historical failures */}
            {appName && !isLive && (
              <div className="rounded border border-wiz-border overflow-hidden border-l-2 border-l-wiz-gold/30">
                <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-wiz-border/60 bg-wiz-bg">
                  <Globe size={12} className="text-wiz-muted" />
                  <span className="section-label flex-1">ENVIRONMENT STATUS</span>
                </div>
                <div className="divide-y divide-wiz-border/30">
                  {ALL_ENVS.map(env => {
                    const latest = envStatus[env]
                    const isCurrent = env === activeEnv && latest?.jobId === jobId
                    const cfg = envCfg(env)

                    return (
                      <div
                        key={env}
                        className={clsx(
                          'flex items-center gap-3 px-4 py-2.5',
                          isCurrent && 'bg-wiz-gold/5',
                        )}
                      >
                        <EnvBadge env={env} />
                        <div className="flex-1 min-w-0">
                          {latest ? (
                            <div className="flex items-center gap-2">
                              <StatusBadge status={latest.lifecycleStatus} size="sm" />
                              <span className="text-2xs text-wiz-dim font-mono">
                                {timeAgo(latest.createdAt)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-2xs text-wiz-dim/50 font-mono">No deploys</span>
                          )}
                        </div>
                        {isCurrent ? (
                          <span className="text-2xs text-wiz-gold/60 font-mono">current</span>
                        ) : latest ? (
                          <Link
                            to={`/jobs/${latest.jobId}`}
                            className="text-2xs text-wiz-muted hover:text-wiz-gold transition-colors font-mono"
                          >
                            view
                          </Link>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
              <div className="flex items-start gap-2.5 mb-2 px-3 py-2.5 rounded bg-sig-green-dim border border-sig-green/20 text-xs text-sig-green">
                <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
                <span>{phaseContextNote}</span>
              </div>
            )}
            {sshAuthFailure && (
              <div className="flex items-start gap-2.5 mb-2 px-4 py-3 rounded text-xs
                              bg-wiz-surface border border-wiz-border/60
                              border-l-[3px] border-l-sig-red">
                <ShieldAlert size={13} className="flex-shrink-0 mt-0.5 shrink-0 text-sig-red" />
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-sig-red">SSH Authentication Failed — Public Key Not Authorised</span>
                  <span className="text-wiz-muted">
                    The runner's <span className="font-mono text-wiz-cream">{sshAuthFailure.env} ED25519 public key</span> is not in the target server's{' '}
                    <span className="font-mono text-wiz-cream">~/.ssh/authorized_keys</span>. To fix:
                  </span>
                  <ol className="list-decimal list-inside space-y-0.5 text-wiz-muted mt-0.5">
                    <li>Go to <strong className="text-wiz-cream">New Deploy, Step 1 (Target Server)</strong></li>
                    <li>Copy the <strong className="text-wiz-cream">{sshAuthFailure.env} public key</strong> from the SSH Keys panel</li>
                    <li>Append it to <span className="font-mono text-wiz-cream">~/.ssh/authorized_keys</span> on your target server</li>
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

const DEPLOY_PHASE_LABELS = [
  'Deployment Job Initialization',
  'Artifact Packaging',
  'Transfer to Server',
  'Remote Deployment',
  'Stability Check',
  'Cleanup',
]

const ROLLBACK_PHASE_LABELS = [
  'Rollback Job Initialized',
  'Verifying Backup on Target',
  'Executing Remote Rollback',
  'Stability Check',
  'Cleanup',
]
