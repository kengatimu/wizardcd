import { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, XCircle, StopCircle, Inbox, RotateCcw, RefreshCw, Rocket } from 'lucide-react'
import clsx from 'clsx'
import type { Notification, JobType } from '../hooks/useNotifications'

// ── Notification label matrix ────────────────────────────────────

type StatusKey = 'SUCCESS' | 'FAILED' | 'ABORTED'

const LABELS: Record<JobType, Record<StatusKey, string>> = {
  deploy: {
    SUCCESS: 'Deployed successfully',
    FAILED:  'Deployment failed',
    ABORTED: 'Deployment aborted',
  },
  redeploy: {
    SUCCESS: 'Re-deployed successfully',
    FAILED:  'Re-deployment failed',
    ABORTED: 'Re-deployment aborted',
  },
  rollback: {
    SUCCESS: 'Rolled back successfully',
    FAILED:  'Rollback failed',
    ABORTED: 'Rollback aborted',
  },
}

// ── Status styling ───────────────────────────────────────────────

const STATUS_STYLE: Record<StatusKey, {
  icon:  typeof CheckCircle2
  color: string
  bg:    string
}> = {
  SUCCESS: {
    icon:  CheckCircle2,
    color: 'text-sig-green',
    bg:    'bg-sig-green-dim/40',
  },
  FAILED: {
    icon:  XCircle,
    color: 'text-sig-red',
    bg:    'bg-sig-red-dim/40',
  },
  ABORTED: {
    icon:  StopCircle,
    color: 'text-sig-orange',
    bg:    'bg-sig-orange-dim/40',
  },
}

// ── Job type icon (subtle, secondary) ────────────────────────────

const JOB_TYPE_META: Record<JobType, { icon: typeof Rocket; label: string }> = {
  deploy:   { icon: Rocket,    label: 'New deploy' },
  redeploy: { icon: RefreshCw, label: 'Re-deploy' },
  rollback: { icon: RotateCcw, label: 'Rollback' },
}

const ENV_DOT: Record<string, string> = {
  SIT:  'bg-sig-blue',
  UAT:  'bg-sig-yellow',
  PROD: 'bg-sig-purple',
}

// ── Time formatting ───────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ── Props ─────────────────────────────────────────────────────────

interface NotificationDropdownProps {
  notifications:  Notification[]
  onMarkAsRead:   (id: string) => void
  onMarkAllAsRead: () => void
  onClearAll:     () => void
  onClose:        () => void
}

// ── Component ─────────────────────────────────────────────────────

export default function NotificationDropdown({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onClose,
}: NotificationDropdownProps) {
  const navigate = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 w-[380px] max-h-[480px] flex flex-col
                 rounded-xl border border-wiz-border bg-wiz-panel shadow-2xl z-50
                 animate-fade-in overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-wiz-border/50 bg-wiz-surface/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-wiz-cream">Notifications</span>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1
                             rounded-full bg-sig-red text-white text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="text-[11px] text-wiz-gold hover:text-wiz-gold/80 font-medium transition-colors"
            >
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="text-[11px] text-wiz-muted/60 hover:text-wiz-muted font-medium transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* ── Notification list ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-wiz-muted/40">
            <Inbox size={28} />
            <span className="text-xs">No notifications yet</span>
            <span className="text-[10px] text-wiz-muted/30">
              You'll be notified when deployments complete
            </span>
          </div>
        ) : (
          notifications.map((notif) => {
            const style = STATUS_STYLE[notif.status] ?? STATUS_STYLE.FAILED
            const Icon = style.icon
            const envDot = ENV_DOT[notif.environment.toUpperCase()] ?? 'bg-wiz-muted'
            const jobType: JobType = notif.jobType ?? 'deploy'
            const label = LABELS[jobType]?.[notif.status] ?? LABELS.deploy[notif.status]
            const typeMeta = JOB_TYPE_META[jobType]
            const TypeIcon = typeMeta.icon

            return (
              <button
                key={notif.id}
                type="button"
                onClick={() => {
                  onMarkAsRead(notif.id)
                  navigate(`/jobs/${notif.jobId}`)
                  onClose()
                }}
                className={clsx(
                  'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors',
                  'border-b border-wiz-border/20 last:border-b-0',
                  'hover:bg-wiz-raised/60',
                  !notif.read && 'bg-wiz-surface/40',
                )}
              >
                {/* Status icon */}
                <div className={clsx(
                  'flex-shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center',
                  style.bg,
                )}>
                  <Icon size={14} className={style.color} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-wiz-cream truncate">
                      {notif.appName}
                    </span>
                    <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', envDot)} />
                    <span className="text-[10px] font-mono text-wiz-muted/50 uppercase">
                      {notif.environment}
                    </span>
                  </div>
                  <p className={clsx('text-xs mt-0.5', style.color)}>
                    {label}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex items-center gap-1 text-wiz-muted/35">
                      <TypeIcon size={10} />
                      <span className="text-[10px]">{typeMeta.label}</span>
                    </div>
                    <span className="text-wiz-muted/20">·</span>
                    <span className="text-[10px] text-wiz-muted/40">
                      {timeAgo(notif.timestamp)}
                    </span>
                  </div>
                </div>

                {/* Unread dot */}
                {!notif.read && (
                  <span className="flex-shrink-0 mt-2 w-2 h-2 rounded-full bg-sig-blue" />
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
