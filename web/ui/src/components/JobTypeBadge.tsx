import clsx from 'clsx'

// JobSummary.jobType is `'deploy' | 'redeploy' | 'rollback' | undefined`
// (undefined for jobs persisted before the field was introduced — those
// always represent a fresh deploy).
type JobType = 'deploy' | 'redeploy' | 'rollback'

interface Props {
  /** undefined → treated as 'deploy' (back-compat with old jobs) */
  type?:  JobType | null
  /** sm: compact (default for tables), md: roomier (for page headers/cards) */
  size?:  'sm' | 'md'
  className?: string
}

interface Style {
  label: string
  cls:   string
}

// Visual language for the three job types — colour-only (no icons), so
// the three values are distinguished by tint alone:
//
//  - DEPLOY   : neutral grey  — most common operation, doesn't compete
//                with environment / status badges in the same row.
//  - REDEPLOY : sig-blue      — informational re-action.
//  - ROLLBACK : sig-yellow    — notable revert event; tinted amber so it
//                stands out in a long deploy history.
const STYLES: Record<JobType, Style> = {
  deploy:   { label: 'New Deploy', cls: 'bg-wiz-bg/60      text-wiz-muted   border-wiz-border'    },
  redeploy: { label: 'Re-deploy',  cls: 'bg-sig-blue-dim   text-sig-blue    border-sig-blue/30'   },
  rollback: { label: 'Rollback',   cls: 'bg-sig-yellow-dim text-sig-yellow  border-sig-yellow/30' },
}

export default function JobTypeBadge({ type, size = 'sm', className }: Props) {
  const resolved: JobType = type ?? 'deploy'
  const s = STYLES[resolved]
  return (
    <span
      title={s.label}
      className={clsx(
        'inline-flex items-center rounded font-mono font-bold uppercase tracking-wider border',
        size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-1',
        s.cls,
        className,
      )}
    >
      {s.label}
    </span>
  )
}
