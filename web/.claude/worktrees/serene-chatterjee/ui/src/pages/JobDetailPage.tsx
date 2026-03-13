import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, StopCircle, ArrowLeft, RefreshCw,
  Server, Clock, Hash, Box, Globe, User, Terminal
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

// ── Abort confirmation modal ──────────────────────────────────────

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
        <p className="text-sm text-wiz-gray mb-2">
          Are you sure you want to abort job:
        </p>
        <p className="font-mono text-xs text-wiz-gold bg-wiz-bg border border-wiz-border rounded-md px-3 py-2 mb-5">
          {jobId}
        </p>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={clsx('btn-danger', loading && 'opacity-60')}
          >
            <StopCircle size={14} />
            {loading ? 'Aborting…' : 'Confirm Abort'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────

const ABORTABLE: JobLifecycleStatus[] = ['CREATED', 'VALIDATING', 'PREPARING_WORKSPACE', 'RUNNING']

export default function JobDetailPage() {
  const { jobId }   = useParams<{ jobId: string }>()
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const [showAbortModal, setShowAbortModal] = useState(false)

  const { data: status, isLoading: statusLoading, isError: statusError, refetch: refetchStatus } =
    useJobStatus(jobId)

  const { data: logs, isLoading: logsLoading } =
    useJobLogs(jobId, status?.jobStatus)

  const isLive      = status?.jobStatus === 'RUNNING' || status?.jobStatus === 'PREPARING_WORKSPACE'
  const isAbortable = status?.jobStatus ? ABORTABLE.includes(status.jobStatus) : false

  const abortMutation = useMutation({
    mutationFn: () => abortJob(jobId!),
    onSuccess: () => {
      toast.success('Abort request sent.')
      setShowAbortModal(false)
      void refetchStatus()
      void queryClient.invalidateQueries({ queryKey: ['jobs-list'] })
    },
    onError: () => {
      toast.error('Failed to send abort request.')
    },
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
          <ArrowLeft size={13} />
          Back to Dashboard
        </button>
      </div>
    )
  }

  const shortId = jobId!.slice(0, 8)

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
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-icon h-8 w-8"
              title="Back"
            >
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

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refetchStatus()}
              className="btn-secondary gap-1.5"
            >
              <RefreshCw size={12} />
              Refresh
            </button>
            {isAbortable && (
              <button
                type="button"
                onClick={() => setShowAbortModal(true)}
                className="btn-danger gap-1.5"
              >
                <StopCircle size={14} />
                Abort
              </button>
            )}
          </div>
        </div>

        {/* ── Status Row ── */}
        <div className={clsx(
          'flex items-center gap-4 p-4 rounded-xl border',
          'bg-wiz-surface border-wiz-border',
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

        {/* ── Two-column: Metadata + Logs ── */}
        <div className="grid grid-cols-3 gap-6">

          {/* Left: Metadata */}
          <div className="col-span-1">
            <div className="wiz-card p-0 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-wiz-border bg-wiz-panel/50">
                <Server size={13} className="text-wiz-gold" />
                <p className="section-label">Job Metadata</p>
              </div>
              <div className="px-4 divide-y divide-wiz-border/40">
                <MetaRow icon={<Hash size={13} />}    label="Job ID"      value={jobId!}          mono />
                <MetaRow icon={<Box size={13} />}     label="Status"      value={<StatusBadge status={status.jobStatus} size="sm" />} />
                <MetaRow icon={<Terminal size={13} />} label="Execution"   value={<StatusBadge status={status.executionState} size="sm" />} />
              </div>
              <div className="px-4 py-3 border-t border-wiz-border/40 bg-wiz-panel/20">
                <div className="flex items-center gap-1.5 text-2xs text-wiz-dim font-mono">
                  <Globe size={11} />
                  <span>runner-service-ms</span>
                </div>
              </div>
            </div>

            {/* Additional metadata placeholders */}
            <div className="mt-4 wiz-card p-0 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-wiz-border bg-wiz-panel/50">
                <Clock size={13} className="text-wiz-gold" />
                <p className="section-label">Timeline</p>
              </div>
              <div className="px-4 py-3 text-xs text-wiz-muted font-mono text-center">
                Timeline data available after job completes.
              </div>
            </div>
          </div>

          {/* Right: Log Viewer */}
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-2">
              <User size={13} className="text-wiz-gold" />
              <p className="section-label">Execution Logs</p>
              {isLive && (
                <span className="text-2xs font-mono text-sig-yellow animate-blink">
                  auto-refreshing every 3s
                </span>
              )}
            </div>
            <LogViewer
              logs={logs ?? ''}
              isLoading={logsLoading || isLive}
              jobId={jobId}
              height="h-[calc(100vh-22rem)]"
            />
          </div>
        </div>

      </div>
    </>
  )
}
