import { Check, AlertTriangle, Info, RefreshCw, Loader2, Copy, ServerOff } from 'lucide-react'
import clsx from 'clsx'
import type { PathCheckResult } from '../api/jobs'

/**
 * Step 2 deploy-path preflight status panel.
 *
 * The panel sits directly beneath the DEPLOY PATH input field and gives the
 * user real, actionable feedback the moment they enter a path — instead of
 * discovering the problem 2 steps later at Step 4 pre-flight (or, worse, when
 * the deploy itself fails).
 *
 * Six possible states drive the visual treatment:
 *
 *   ok                   green — Path exists + owned by runAsUser. Next enabled.
 *   missing              blue  — Doesn't exist, parent writable → runner will create.
 *   wrong_owner          amber — Exists, wrong owner → copy the chown fix-script.
 *   parent_not_writable  amber — Missing + root parent → copy the sudo mkdir script.
 *   invalid_path         red   — Failed client-side whitelist (e.g. /etc/...).
 *   unreachable          red   — SSH to the target itself failed.
 *
 * Plus the meta-states:
 *   idle      — nothing entered yet; we don't render the panel.
 *   checking  — request in flight; spinner + muted hint.
 *   stale     — inputs changed since last successful check; user must re-check.
 *
 * Visual language follows the WizardCD design system (§6 of design-system.md):
 * panel shell with coloured left border + `<color>-dim` header bar + sig-{green,
 * yellow, blue, red} accents per state. Fix-command copy block matches the
 * SSH Keys Setup Script panel in Step 1 so the user sees a familiar pattern.
 */
export type PathCheckState =
  | 'idle' | 'checking'
  | 'ok' | 'wrong_owner' | 'missing' | 'parent_not_writable'
  | 'invalid_path' | 'unreachable' | 'stale'

interface Props {
  state:        PathCheckState
  result:       PathCheckResult | null
  /** Are all the input fields needed for a check filled? */
  canCheck:     boolean
  onRecheck:    () => void
  copiedIdx:    number | null
  onCopy:       (idx: number, text: string) => void
}

export function DeployPathStatusPanel({ state, result, canCheck, onRecheck, copiedIdx, onCopy }: Props) {
  // Don't render the panel until the user has something for us to evaluate.
  if (state === 'idle') return null

  // Resolve presentation tokens from state ----------------------------------
  const v = resolveVisuals(state)

  return (
    <div
      className={clsx(
        'rounded border border-wiz-border border-l-2 overflow-hidden mt-1',
        v.borderL, 'bg-wiz-surface'
      )}
    >
      {/* Header — coloured tint background + dot + label + Re-check action */}
      <div className={clsx('flex items-center justify-between gap-2.5 px-4 py-2.5 border-b border-wiz-border/60', v.headerBg)}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={clsx('flex items-center justify-center w-4 h-4 flex-shrink-0', v.dotColor)}>
            {state === 'checking'
              ? <Loader2 size={12} className="animate-spin" />
              : v.icon}
          </span>
          <span className={clsx('text-[10px] font-bold uppercase tracking-[0.16em]', v.titleColor)}>
            {v.title}
          </span>
        </div>
        {(state === 'wrong_owner' || state === 'parent_not_writable' || state === 'stale' || state === 'unreachable') && (
          <button
            type="button"
            onClick={onRecheck}
            disabled={!canCheck}
            className={clsx(
              'inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-semibold uppercase tracking-wide',
              'transition-colors',
              v.btnBorder, v.btnText,
              canCheck ? v.btnHover : 'opacity-50 cursor-not-allowed',
            )}
          >
            <RefreshCw size={10} />
            Re-check
          </button>
        )}
      </div>

      {/* Body — humanReason + (when present) fix-command code block */}
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {state === 'checking' ? (
          <p className="text-[12px] text-wiz-muted">
            Checking <span className="font-mono text-wiz-cream/85">{result?.path || '...'}</span> on the target server…
          </p>
        ) : (
          <p className={clsx('text-[12px] leading-snug', v.bodyText)}>
            {state === 'stale'
              ? 'Inputs changed since the last check. Click Re-check to verify the new combination.'
              : (result?.humanReason ?? 'Status unavailable.')}
          </p>
        )}

        {/* Fix-command code block — only when fix commands are returned */}
        {result && result.fixCommands.length > 0 && state !== 'checking' && state !== 'stale' && (
          <div className="rounded border border-wiz-border bg-wiz-bg/60 overflow-hidden">
            <pre className="font-mono text-[11px] leading-relaxed px-3 py-2.5 text-wiz-cream whitespace-pre-wrap break-all">
{result.fixCommands.join('\n')}
            </pre>
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-wiz-border/60 bg-wiz-raised/30">
              <span className="text-[10px] text-wiz-muted">
                Run on <span className="font-mono">{result.actualOwner ? `${result.expectedOwner}@<target>` : '<target>'}</span>, then click Re-check.
              </span>
              <button
                type="button"
                onClick={() => onCopy(0, result.fixCommands.join('\n'))}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-wiz-cream/85 hover:text-wiz-cream"
              >
                {copiedIdx === 0 ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
              </button>
            </div>
          </div>
        )}

        {/* SSH error tail — for UNREACHABLE only */}
        {state === 'unreachable' && result?.sshErrorTail && (
          <pre className="font-mono text-[10px] text-wiz-muted bg-wiz-bg/60 border border-wiz-border rounded px-2 py-1.5 whitespace-pre-wrap break-all">
            {result.sshErrorTail}
          </pre>
        )}

        {/* Path / owner expander — small forensic line on resolved states */}
        {result && (state === 'ok' || state === 'wrong_owner' || state === 'missing' || state === 'parent_not_writable') && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[10px] text-wiz-muted">
            <span>
              Path: <span className="font-mono text-wiz-cream/80">{result.path}</span>
            </span>
            {result.exists !== null && (
              <span>
                Exists: <span className={clsx(result.exists ? 'text-sig-green' : 'text-wiz-muted')}>
                  {result.exists ? 'yes' : 'no'}
                </span>
              </span>
            )}
            {result.actualOwner && (
              <span>
                Owner: <span className={clsx('font-mono', state === 'ok' ? 'text-sig-green' : 'text-sig-yellow')}>
                  {result.actualOwner}
                </span>
              </span>
            )}
            <span>
              Expected: <span className="font-mono text-wiz-cream/80">{result.expectedOwner}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Per-state visual tokens
// ────────────────────────────────────────────────────────────────────────────

interface Visuals {
  borderL:     string
  headerBg:    string
  dotColor:    string
  titleColor:  string
  bodyText:    string
  title:       string
  icon:        React.ReactNode
  btnBorder:   string
  btnText:     string
  btnHover:    string
}

function resolveVisuals(state: PathCheckState): Visuals {
  switch (state) {
    case 'ok': return {
      borderL: 'border-l-sig-green/50', headerBg: 'bg-sig-green-dim',
      dotColor: 'text-sig-green', titleColor: 'text-sig-green', bodyText: 'text-wiz-cream/85',
      title: 'Deploy Path · Verified',
      icon: <Check size={12} strokeWidth={3} />,
      btnBorder: 'border-sig-green/40', btnText: 'text-sig-green/85',
      btnHover: 'hover:bg-sig-green-dim hover:text-sig-green',
    }
    case 'missing': return {
      borderL: 'border-l-sig-blue/50', headerBg: 'bg-sig-blue-dim',
      dotColor: 'text-sig-blue', titleColor: 'text-sig-blue', bodyText: 'text-wiz-cream/85',
      title: 'Deploy Path · Will be created',
      icon: <Info size={12} strokeWidth={2.5} />,
      btnBorder: 'border-sig-blue/40', btnText: 'text-sig-blue/85',
      btnHover: 'hover:bg-sig-blue-dim hover:text-sig-blue',
    }
    case 'wrong_owner':
    case 'parent_not_writable': return {
      borderL: 'border-l-sig-yellow/50', headerBg: 'bg-sig-yellow-dim',
      dotColor: 'text-sig-yellow', titleColor: 'text-sig-yellow', bodyText: 'text-wiz-cream/90',
      title: state === 'wrong_owner' ? 'Deploy Path · Ownership mismatch' : 'Deploy Path · Manual setup required',
      icon: <AlertTriangle size={12} strokeWidth={2.5} />,
      btnBorder: 'border-sig-yellow/45', btnText: 'text-sig-yellow',
      btnHover: 'hover:bg-sig-yellow-dim hover:text-sig-yellow',
    }
    case 'invalid_path': return {
      borderL: 'border-l-sig-red/50', headerBg: 'bg-sig-red-dim',
      dotColor: 'text-sig-red', titleColor: 'text-sig-red', bodyText: 'text-wiz-cream/90',
      title: 'Deploy Path · Invalid',
      icon: <AlertTriangle size={12} strokeWidth={2.5} />,
      btnBorder: 'border-sig-red/40', btnText: 'text-sig-red/85',
      btnHover: 'hover:bg-sig-red-dim hover:text-sig-red',
    }
    case 'unreachable': return {
      borderL: 'border-l-sig-red/50', headerBg: 'bg-sig-red-dim',
      dotColor: 'text-sig-red', titleColor: 'text-sig-red', bodyText: 'text-wiz-cream/90',
      title: 'Deploy Path · Server unreachable',
      icon: <ServerOff size={12} strokeWidth={2.5} />,
      btnBorder: 'border-sig-red/40', btnText: 'text-sig-red/85',
      btnHover: 'hover:bg-sig-red-dim hover:text-sig-red',
    }
    case 'stale': return {
      borderL: 'border-l-wiz-border-mid', headerBg: 'bg-wiz-raised/40',
      dotColor: 'text-wiz-muted', titleColor: 'text-wiz-muted', bodyText: 'text-wiz-muted',
      title: 'Deploy Path · Re-check needed',
      icon: <RefreshCw size={12} strokeWidth={2.5} />,
      btnBorder: 'border-wiz-border', btnText: 'text-wiz-muted',
      btnHover: 'hover:bg-wiz-raised hover:text-wiz-cream',
    }
    case 'checking':
    default: return {
      borderL: 'border-l-wiz-border-mid', headerBg: 'bg-wiz-raised/40',
      dotColor: 'text-wiz-muted', titleColor: 'text-wiz-muted', bodyText: 'text-wiz-muted',
      title: 'Deploy Path · Checking…',
      icon: <Loader2 size={12} className="animate-spin" />,
      btnBorder: 'border-wiz-border', btnText: 'text-wiz-muted',
      btnHover: '',
    }
  }
}
