import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, X, Loader2, AlertTriangle, Archive, Calendar, HardDrive, Server } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { rollbackJob, type RollbackPreflightResult } from '../api/jobs'

const ENV_BADGE: Record<string, string> = {
  SIT:  'bg-sig-blue-dim text-sig-blue border-sig-blue/25',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/25',
  PROD: 'bg-sig-purple-dim text-sig-purple border-sig-purple/25',
}

interface RollbackModalProps {
  jobId:       string
  appName:     string
  environment: string
  preflight:   RollbackPreflightResult | null
  preflightLoading: boolean
  onClose:     () => void
}

export default function RollbackModal({ jobId, appName, environment, preflight, preflightLoading, onClose }: RollbackModalProps) {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const isProd = environment === 'PROD'

  const handleRollback = async () => {
    setSubmitting(true)
    try {
      const res = await rollbackJob(jobId)
      toast.success(`Rollback started: ${res.jobId.slice(0, 8)}…`)
      onClose()
      navigate(`/jobs/${res.jobId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rollback failed'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const envBadge = ENV_BADGE[environment] ?? 'bg-wiz-surface text-wiz-muted border-wiz-border'
  const backupAvailable = preflight?.available === true

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-wiz-surface border border-wiz-border rounded-2xl shadow-panel max-w-md w-full animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-wiz-border/60">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-9 h-9 rounded-full flex items-center justify-center',
              isProd ? 'bg-sig-purple/10' : 'bg-sig-yellow/10',
            )}>
              <RotateCcw size={16} className={isProd ? 'text-sig-purple' : 'text-sig-yellow'} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-wiz-cream">Rollback</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-wiz-muted font-mono">{appName}</span>
                <span className={clsx(
                  'inline-flex items-center px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider border',
                  envBadge,
                )}>
                  {environment}
                </span>
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-icon h-8 w-8" title="Close">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">

          {/* Warning for PROD */}
          {isProd && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-sig-purple/5 border border-sig-purple/20">
              <AlertTriangle size={16} className="text-sig-purple flex-shrink-0 mt-0.5" />
              <p className="text-xs text-sig-purple/90">
                You are rolling back a <span className="font-bold">PRODUCTION</span> application.
                This will restore the last known working version.
              </p>
            </div>
          )}

          <p className="text-xs text-wiz-muted leading-relaxed">
            This will restore <span className="text-wiz-cream font-medium">{appName}</span> to
            the <span className="text-wiz-cream font-medium">last successful deployment</span> state.
            The current running version will be stopped and replaced.
          </p>

          {/* Backup info panel */}
          {preflightLoading && (
            <div className="rounded-lg bg-wiz-bg/60 border border-wiz-border/15 px-4 py-4 flex items-center gap-3">
              <Loader2 size={14} className="animate-spin text-wiz-muted" />
              <span className="text-xs text-wiz-muted">Checking backup on target server…</span>
            </div>
          )}

          {!preflightLoading && preflight && backupAvailable && (
            <div className="rounded-lg bg-sig-green/5 border border-sig-green/20 px-4 py-3">
              <p className="text-2xs text-sig-green/70 uppercase font-mono tracking-wider mb-2 flex items-center gap-1.5">
                <Archive size={10} /> Last successful backup
              </p>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <Calendar size={11} className="text-wiz-muted/60 flex-shrink-0" />
                  <span className="text-wiz-muted/60">Created:</span>
                  <span className="text-wiz-cream/80 font-mono">{preflight.backupDate}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <HardDrive size={11} className="text-wiz-muted/60 flex-shrink-0" />
                  <span className="text-wiz-muted/60">Size:</span>
                  <span className="text-wiz-cream/80 font-mono">{preflight.backupSize}</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Server size={11} className="text-wiz-muted/60 flex-shrink-0" />
                  <span className="text-wiz-muted/60">Host:</span>
                  <span className="text-wiz-cream/80 font-mono">{preflight.targetHost}</span>
                </div>
              </div>
            </div>
          )}

          {!preflightLoading && preflight && !backupAvailable && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-sig-red/5 border border-sig-red/20">
              <AlertTriangle size={16} className="text-sig-red flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-sig-red font-medium">No backup available</p>
                <p className="text-xs text-sig-red/70 mt-1">
                  {preflight.reason || 'A successful deployment must complete before rollback is available.'}
                </p>
              </div>
            </div>
          )}

          {/* What happens */}
          <div className="rounded-lg bg-wiz-bg/60 border border-wiz-border/15 px-4 py-3">
            <p className="text-2xs text-wiz-muted/60 uppercase font-mono tracking-wider mb-1.5">What happens</p>
            <ul className="text-xs text-wiz-cream/70 space-y-1.5">
              <li className="flex items-start gap-2">
                <span className="text-wiz-muted/40 mt-0.5">1.</span>
                Stop the currently running application
              </li>
              <li className="flex items-start gap-2">
                <span className="text-wiz-muted/40 mt-0.5">2.</span>
                Restore files from last successful backup
              </li>
              <li className="flex items-start gap-2">
                <span className="text-wiz-muted/40 mt-0.5">3.</span>
                Start the application and verify stability
              </li>
            </ul>
          </div>

          {/* Source job reference */}
          <p className="text-2xs text-wiz-muted/40 font-mono">
            Config from job {jobId.slice(0, 8)}…
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-wiz-border/60">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleRollback()}
            disabled={submitting || preflightLoading || !backupAvailable}
            className={clsx(
              'inline-flex items-center justify-center gap-2 font-semibold text-sm px-5 py-2.5 rounded-md transition-all duration-150',
              isProd
                ? 'bg-sig-purple text-white hover:brightness-110'
                : 'bg-sig-yellow text-wiz-bg hover:brightness-110',
              (submitting || preflightLoading || !backupAvailable) && 'opacity-50 cursor-not-allowed',
              submitting && 'animate-pulse',
            )}
          >
            {submitting ? (
              <><Loader2 size={14} className="animate-spin" /> Rolling back…</>
            ) : (
              <><RotateCcw size={14} /> Rollback</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
