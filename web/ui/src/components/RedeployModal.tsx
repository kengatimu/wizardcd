import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, X, Wand2, FileArchive, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { redeployJob } from '../api/jobs'

// ── Environment badge colours ────────────────────────────────────────
const ENV_BADGE: Record<string, string> = {
  SIT:  'bg-sig-blue-dim text-sig-blue border-sig-blue/25',
  UAT:  'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/25',
  PROD: 'bg-sig-purple-dim text-sig-purple border-sig-purple/25',
}

interface RedeployModalProps {
  jobId:       string
  appName:     string
  environment: string
  jarType?:    'fat' | 'thin'
  onClose:     () => void
}

export default function RedeployModal({ jobId, appName, environment, jarType, onClose }: RedeployModalProps) {
  const navigate = useNavigate()
  const fileRef  = useRef<HTMLInputElement>(null)
  const libRef   = useRef<HTMLInputElement>(null)

  const [jarFile,    setJarFile]    = useState<File | null>(null)
  const [libFile,    setLibFile]    = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [progress,   setProgress]   = useState(0)

  const isThin = jarType === 'thin'

  const handleJarDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.jar')) setJarFile(f)
    else toast.error('Please drop a .jar file')
  }, [])

  const handleSubmit = async () => {
    if (!jarFile) { toast.error('Upload a JAR file'); return }
    setSubmitting(true)
    setProgress(0)
    try {
      const res = await redeployJob(
        jobId,
        jarFile,
        libFile ?? undefined,
        undefined,
        undefined,
        (loaded, total) => setProgress(Math.round((loaded * 100) / total)),
      )
      toast.success(`Re-deploy started: ${res.jobId.slice(0, 8)}…`)
      onClose()
      navigate(`/jobs/${res.jobId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Re-deploy failed'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const envBadge = ENV_BADGE[environment] ?? 'bg-wiz-surface text-wiz-muted border-wiz-border'

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-wiz-surface border border-wiz-border rounded-2xl shadow-panel max-w-lg w-full animate-fade-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-wiz-border/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-wiz-gold/10 flex items-center justify-center">
              <Wand2 size={16} className="text-wiz-gold" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-wiz-cream">Re-deploy</h2>
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

          <p className="text-xs text-wiz-muted">
            Upload a new JAR to re-deploy <span className="text-wiz-cream font-medium">{appName}</span> with
            the same configuration as the previous deployment.
          </p>

          {/* JAR dropzone */}
          {!jarFile ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleJarDrop}
              onClick={() => fileRef.current?.click()}
              className="flex flex-col items-center gap-2 py-8 rounded-xl border-2 border-dashed border-wiz-border-mid
                         hover:border-wiz-gold/40 hover:bg-wiz-gold/5 transition-all duration-150 cursor-pointer"
            >
              <Upload size={24} className="text-wiz-muted" />
              <span className="text-xs text-wiz-muted">Drop JAR here or click to browse</span>
              <input
                ref={fileRef}
                type="file"
                accept=".jar"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setJarFile(f)
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-sig-green-dim/30 border border-sig-green/20">
              <CheckCircle2 size={16} className="text-sig-green flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-wiz-cream truncate">{jarFile.name}</p>
                <p className="text-2xs text-wiz-muted">{(jarFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button
                type="button"
                onClick={() => { setJarFile(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-xs text-wiz-muted hover:text-wiz-cream transition-colors px-2 py-1 rounded border border-wiz-border/60"
              >
                Replace
              </button>
            </div>
          )}

          {/* Lib ZIP — only for thin JAR */}
          {isThin && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <FileArchive size={12} className="text-wiz-muted" />
                <span className="text-xs text-wiz-muted">Dependencies ZIP</span>
                <span className="text-2xs text-wiz-muted/50">(thin JAR)</span>
              </div>
              {!libFile ? (
                <button
                  type="button"
                  onClick={() => libRef.current?.click()}
                  className="w-full text-left px-4 py-3 rounded-lg border border-dashed border-wiz-border-mid
                             hover:border-wiz-gold/40 hover:bg-wiz-gold/5 transition-all duration-150 text-xs text-wiz-muted"
                >
                  Upload lib ZIP (optional — uses previous if omitted)
                </button>
              ) : (
                <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-sig-green-dim/30 border border-sig-green/20">
                  <CheckCircle2 size={14} className="text-sig-green flex-shrink-0" />
                  <span className="text-xs text-wiz-cream truncate flex-1">{libFile.name}</span>
                  <button
                    type="button"
                    onClick={() => { setLibFile(null); if (libRef.current) libRef.current.value = '' }}
                    className="text-2xs text-wiz-muted hover:text-wiz-cream px-2 py-0.5 rounded border border-wiz-border/60"
                  >
                    Remove
                  </button>
                </div>
              )}
              <input
                ref={libRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setLibFile(f)
                }}
              />
            </div>
          )}

          {/* Upload progress */}
          {submitting && progress > 0 && (
            <div className="w-full bg-wiz-raised rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-wiz-gold rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

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
            onClick={() => void handleSubmit()}
            disabled={!jarFile || submitting}
            className={clsx('btn-primary gap-2', submitting && 'animate-pulse')}
          >
            {submitting ? (
              <><Loader2 size={14} className="animate-spin" /> Deploying…</>
            ) : (
              <><Wand2 size={14} /> Deploy</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
