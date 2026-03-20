import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, StopCircle, ArrowLeft, RefreshCw,
  Server, Hash, Box, Globe, Terminal,
  CheckCircle2, XCircle, Loader2, AlertCircle,
  List,
} from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { abortJob } from '../api/jobs'
import { useJobStatus } from '../hooks/useJobStatus'
import { useJobLogs } from '../hooks/useJobLogs'
import StatusBadge from '../components/StatusBadge'
import LogViewer from '../components/LogViewer'
import type { JobLifecycleStatus } from '../types/enums'
import {
  parseLogSections,
  formatSectionDuration,
  type LogSection,
} from '../utils/logParser'

// ── Metadata Row ──────────────────────────────────────────────────

interface MetaRowProps {
  icon:  React.ReactNode
  label: string
  value: React.ReactNode
  mono?: boolean
}

function MetaRow({ icon, label, value, mono }: MetaRowProps) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-wiz-border/40 last:border-b-0">
      <span className="mt-0.5 flex-shrink-0 text-wiz-muted">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-2xs text-wiz-muted uppercase tracking-wider font-mono">{label}</p>
        <p className={clsx(
          'mt-0.5 text-sm text-wiz-cream break-all',
          mono && 'font-mono text-xs text-wiz-gray',
        )}>
          {value}
        </p>
      </div>
    </div>
  )
}

// ── Abort Modal ───────────────────────────────────────────────────

interface AbortModalProps {
  jobId:     string
  onConfirm: () => void
  onCancel:  () => void
  loading:   boolean
}

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
        <p className="font-mono text-xs text-wiz-gold bg-wiz-bg border border-wiz-border rounded-md px-3 py-2 mb-5">
          {jobId}
        </p>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary">
            Cancel
          </button>
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

// ── Steps Sidebar ─────────────────────────────────────────────────

interface StepsSidebarProps {
  sections:        LogSection[]
  selectedIndex:   number        // -1 = none selected (show all)
  onSelect:        (i: number) => void
  isLive:          boolean
  jobLifecycle:    JobLifecycleStatus
}

function StepsSidebar({
  sections, selectedIndex, onSelect, isLive, jobLifecycle,
}: StepsSidebarProps) {
  const isTerminal = ['SUCCESS', 'FAILED', 'ABORTED'].includes(jobLifecycle)

  return (
    <div className="mt-4 wiz-card p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-wiz-border bg-wiz-panel/50">
        <List size={13} className="text-wiz-gold" />
        <p className="section-label">Steps</p>
        {sections.length > 0 && (
          <span className="ml-auto text-2xs font-mono text-wiz-dim">
            {sections.length} steps
          </span>
        )}
      </div>

      {sections.length === 0 ? (
        /* No sections yet */
        <div className="px-4 py-4 flex items-center gap-2 text-xs font-mono text-wiz-muted">
          {isLive
            ? <><Loader2 size={12} className="animate-spin text-sig-yellow" /> Waiting for steps…</>
            : <><AlertCircle size={12} /> No steps recorded.</>
          }
        </div>
      ) : (
        <div className="flex flex-col">
          {sections.map((section, i) => {
            const isLast   = i === sections.length - 1
            const isActive = isLast && isLive
            const status: 'error' | 'warn' | 'running' | 'success' =
              section.hasError ? 'error'   :
              section.hasWarn  ? 'warn'    :
              isActive         ? 'running' :
                                 'success'

            const nextTs  = sections[i + 1]?.titleTimestamp
            const durMs   =
              section.titleTimestamp && nextTs
                ? nextTs.getTime() - section.titleTimestamp.getTime()
                : isActive
                ? Date.now() - (section.titleTimestamp?.getTime() ?? Date.now())
                : null

            const isSelected = selectedIndex === i

            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(isSelected ? -1 : i)}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-4 py-2.5 text-left border-b border-wiz-border/30 last:border-b-0',
                  'transition-colors duration-100',
                  isSelected
                    ? 'bg-wiz-gold/10 border-l-2 border-l-wiz-gold'
                    : status === 'error'
                    ? 'hover:bg-sig-red-dim/20 border-l-2 border-l-transparent'
                    : 'hover:bg-wiz-surface/40 border-l-2 border-l-transparent',
                )}
              >
                {/* Status icon */}
                {status === 'error'   && <XCircle      size={13} className="text-sig-red flex-shrink-0" />}
                {status === 'warn'    && <AlertTriangle size={13} className="text-sig-yellow flex-shrink-0" />}
                {status === 'running' && <Loader2       size={13} className="text-sig-yellow animate-spin flex-shrink-0" />}
                {status === 'success' && <CheckCircle2  size={13} className="text-sig-green flex-shrink-0" />}

                {/* Step name */}
                <span className={clsx(
                  'font-mono text-xs flex-1 truncate text-left',
                  isSelected                     ? 'text-wiz-cream font-semibold' :
                  status === 'error'             ? 'text-sig-red'                 :
                  status === 'running'           ? 'text-sig-yellow'              :
                                                   'text-wiz-gray',
                )}>
                  {section.title}
                </span>

                {/* Duration */}
                <span className={clsx(
                  'text-2xs font-mono flex-shrink-0 w-12 text-right',
                  isActive ? 'text-sig-yellow animate-pulse' : 'text-wiz-dim',
                )}>
                  {durMs !== null && durMs >= 0
                    ? formatSectionDuration(durMs)
                    : isActive ? '…' : ''}
                </span>
              </button>
            )
          })}

          {/* Total footer — only for terminal jobs */}
          {isTerminal && sections.length > 0 &&
            sections[0].titleTimestamp &&
            sections[sections.length - 1].titleTimestamp && (() => {
              const first = sections[0].titleTimestamp!.getTime()
              const last  = sections[sections.length - 1].titleTimestamp!.getTime()
              return (
                <div className="flex items-center gap-2 px-4 py-2 bg-wiz-panel/30 border-t border-wiz-border/40">
                  <span className="text-2xs font-mono text-wiz-muted flex-1">Total</span>
                  <span className="text-2xs font-mono text-wiz-muted">
                    {formatSectionDuration(last - first)}
                  </span>
                </div>
              )
            })()
          }
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

const ABORTABLE: JobLifecycleStatus[] = ['CREATED', 'VALIDATING', 'PREPARING_WORKSPACE', 'RUNNING']

export default function JobDetailPage() {
  const { jobId }   = useParams<{ jobId: string }>()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const [showAbortModal,    setShowAbortModal]    = useState(false)
  const [selectedStepIndex, setSelectedStepIndex] = useState(-1)  // -1 = show all

  const { data: status, isLoading: statusLoading, isError: statusError, refetch: refetchStatus } =
    useJobStatus(jobId)

  const { data: logs, isLoading: logsLoading } =
    useJobLogs(jobId, status?.jobStatus)

  const isLive      = status?.jobStatus === 'RUNNING' || status?.jobStatus === 'PREPARING_WORKSPACE'
  const isAbortable = status?.jobStatus ? ABORTABLE.includes(status.jobStatus) : false

  // Parse sections from logs
  const rawLines = logs ? logs.split('\n') : []
  const { sections } = rawLines.length > 0
    ? parseLogSections(rawLines)
    : { sections: [] as LogSection[] }

  // Auto-select the last (active) section on live jobs
  useEffect(() => {
    if (isLive && sections.length > 0) {
      setSelectedStepIndex(sections.length - 1)
    }
  }, [isLive, sections.length])

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

  // ── Loading state ──
  if (statusLoading) {
    return (
      <div className="flex flex-col gap-6 animate-fade-in">
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

  // ── Error / not found ──
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
  const selectedSection: LogSection | null =
    selectedStepIndex >= 0 && sections[selectedStepIndex]
      ? sections[selectedStepIndex]
      : null

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

      <div className="flex flex-col gap-6 animate-fade-in">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate('/')} className="btn-icon h-8 w-8" title="Back">
              <ArrowLeft size={14} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-wiz-cream font-mono">{shortId}…</h1>
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
            <button type="button" onClick={() => void refetchStatus()} className="btn-secondary gap-1.5">
              <RefreshCw size={12} /> Refresh
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
          <div className="flex items-center gap-6 flex-1">
            <div>
              <p className="section-label mb-1.5">Lifecycle</p>
              <StatusBadge status={status.jobStatus} pulse size="md" />
            </div>
            <div className="w-px h-8 bg-wiz-border" />
            <div>
              <p className="section-label mb-1.5">Execution</p>
              <StatusBadge status={status.executionState} size="md" />
            </div>
          </div>
        </div>

        {/* ── Main Layout: Left sidebar + Right log viewer ── */}
        <div className="grid grid-cols-3 gap-6">

          {/* ── Left column: Metadata + Steps ── */}
          <div className="col-span-1 flex flex-col">

            {/* Job Metadata */}
            <div className="wiz-card p-0 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-wiz-border bg-wiz-panel/50">
                <Server size={13} className="text-wiz-gold" />
                <p className="section-label">Job Metadata</p>
              </div>
              <div className="px-4 divide-y divide-wiz-border/40">
                <MetaRow icon={<Hash size={13} />}     label="Job ID"    value={jobId!}  mono />
                <MetaRow icon={<Box size={13} />}      label="Status"    value={<StatusBadge status={status.jobStatus} size="sm" />} />
                <MetaRow icon={<Terminal size={13} />} label="Execution" value={<StatusBadge status={status.executionState} size="sm" />} />
              </div>
              <div className="px-4 py-3 border-t border-wiz-border/40 bg-wiz-panel/20">
                <div className="flex items-center gap-1.5 text-2xs text-wiz-dim font-mono">
                  <Globe size={11} />
                  <span>runner-service-ms</span>
                </div>
              </div>
            </div>

            {/* Steps Sidebar */}
            <StepsSidebar
              sections={sections}
              selectedIndex={selectedStepIndex}
              onSelect={setSelectedStepIndex}
              isLive={isLive}
              jobLifecycle={status.jobStatus}
            />
          </div>

          {/* ── Right column: Log Viewer ── */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <p className="section-label">Execution Logs</p>
              {selectedSection && (
                <button
                  type="button"
                  onClick={() => setSelectedStepIndex(-1)}
                  className="text-2xs font-mono text-wiz-gold hover:text-wiz-gold-light underline underline-offset-2"
                >
                  ← Show all
                </button>
              )}
              {isLive && (
                <span className="text-2xs font-mono text-sig-yellow animate-blink ml-auto">
                  auto-refreshing every 3s
                </span>
              )}
            </div>
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
