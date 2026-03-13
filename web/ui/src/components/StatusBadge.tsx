import clsx from 'clsx'
import type { JobLifecycleStatus, JobExecutionStatus } from '../types/enums'

type AnyStatus = JobLifecycleStatus | JobExecutionStatus | string

interface StatusBadgeProps {
  status:  AnyStatus
  variant?: 'lifecycle' | 'execution'
  size?:   'sm' | 'md'
  pulse?:  boolean
}

// Maps status values to visual style tokens
const STATUS_CONFIG: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  // ── Lifecycle states ───────────────────────────────────────────
  CREATED:             { dot: 'bg-sig-blue',   bg: 'bg-sig-blue-dim',   text: 'text-sig-blue',   label: 'Created'            },
  VALIDATING:          { dot: 'bg-sig-blue',   bg: 'bg-sig-blue-dim',   text: 'text-sig-blue',   label: 'Validating'         },
  PREPARING_WORKSPACE: { dot: 'bg-sig-yellow', bg: 'bg-sig-yellow-dim', text: 'text-sig-yellow', label: 'Preparing Workspace'},
  RUNNING:             { dot: 'bg-sig-yellow', bg: 'bg-sig-yellow-dim', text: 'text-sig-yellow', label: 'Running'            },
  SUCCESS:             { dot: 'bg-sig-green',  bg: 'bg-sig-green-dim',  text: 'text-sig-green',  label: 'Success'            },
  FAILED:              { dot: 'bg-sig-red',    bg: 'bg-sig-red-dim',    text: 'text-sig-red',    label: 'Failed'             },
  ABORT_REQUESTED:     { dot: 'bg-sig-orange', bg: 'bg-sig-orange-dim', text: 'text-sig-orange', label: 'Abort Requested'    },
  ABORTED:             { dot: 'bg-wiz-muted',  bg: 'bg-wiz-panel',      text: 'text-wiz-gray',   label: 'Aborted'            },

  // ── Execution states ───────────────────────────────────────────
  RECEIVED:        { dot: 'bg-sig-blue',   bg: 'bg-sig-blue-dim',   text: 'text-sig-blue',   label: 'Received'       },
  WORKSPACE_READY: { dot: 'bg-sig-blue',   bg: 'bg-sig-blue-dim',   text: 'text-sig-blue',   label: 'Workspace Ready'},
  SUCCEEDED:       { dot: 'bg-sig-green',  bg: 'bg-sig-green-dim',  text: 'text-sig-green',  label: 'Succeeded'      },
  TIMEOUT:         { dot: 'bg-sig-orange', bg: 'bg-sig-orange-dim', text: 'text-sig-orange', label: 'Timed Out'      },

  // Fallback
  UNKNOWN: { dot: 'bg-wiz-muted', bg: 'bg-wiz-panel', text: 'text-wiz-muted', label: 'Unknown' },
}

function getConfig(status: AnyStatus) {
  return STATUS_CONFIG[status] ?? STATUS_CONFIG['UNKNOWN']
}

export default function StatusBadge({ status, size = 'md', pulse = false }: StatusBadgeProps) {
  const cfg = getConfig(status)
  const isLive = status === 'RUNNING' || status === 'ABORT_REQUESTED'

  return (
    <span
      className={clsx(
        'badge border',
        cfg.bg,
        cfg.text,
        size === 'sm' ? 'text-2xs px-2 py-0.5' : 'text-xs px-2.5 py-1',
        'border-transparent',
      )}
    >
      {/* Status dot */}
      <span
        className={clsx(
          'inline-block rounded-full flex-shrink-0',
          size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2',
          cfg.dot,
          (pulse && isLive) && 'animate-pulse',
        )}
      />
      {cfg.label}
    </span>
  )
}
