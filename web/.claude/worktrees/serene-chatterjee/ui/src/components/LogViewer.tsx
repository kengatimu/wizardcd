import { useEffect, useRef, useState } from 'react'
import {
  Download, ArrowDown, ArrowUp, ChevronDown,
  CheckCircle2, XCircle, AlertTriangle, Loader2, AlignLeft,
  ChevronsDownUp, ChevronsUpDown,
} from 'lucide-react'
import clsx from 'clsx'
import {
  type LogSection,
  detectLevel,
  lineClass,
  formatLogLine,
  formatSectionDuration,
  parseLogSections,
} from '../utils/logParser'

// ── Props ─────────────────────────────────────────────────────────

interface LogViewerProps {
  logs:              string
  isLoading?:        boolean
  jobId?:            string
  height?:           string
  /** When set, viewer shows only this section's lines (step-focused mode). */
  selectedSection?:  LogSection | null
}

// ── Section panel (used in the full sectioned view) ───────────────

interface SectionPanelProps {
  section:        LogSection
  index:          number
  isLast:         boolean
  isLive:         boolean
  nextTimestamp?: Date
  expanded:       boolean
  onToggle:       () => void
}

function SectionPanel({
  section, isLast, isLive, nextTimestamp, expanded, onToggle,
}: SectionPanelProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isLast && isLive && expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [section.lines, isLast, isLive, expanded])

  const status =
    section.hasError ? 'error'   :
    section.hasWarn  ? 'warn'    :
    isLast && isLive ? 'running' :
                       'success'

  const durationMs =
    section.titleTimestamp && nextTimestamp
      ? nextTimestamp.getTime() - section.titleTimestamp.getTime()
      : null

  const StatusIcon = () => {
    switch (status) {
      case 'error':   return <XCircle      size={13} className="text-sig-red flex-shrink-0" />
      case 'warn':    return <AlertTriangle size={13} className="text-sig-yellow flex-shrink-0" />
      case 'running': return <Loader2       size={13} className="text-sig-yellow animate-spin flex-shrink-0" />
      default:        return <CheckCircle2  size={13} className="text-sig-green flex-shrink-0" />
    }
  }

  return (
    <div className={clsx(
      'border-b border-wiz-border/30 last:border-b-0',
      status === 'error' && 'border-l-2 border-l-sig-red/40',
    )}>
      <button
        type="button"
        className={clsx(
          'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors',
          status === 'error'   ? 'hover:bg-sig-red-dim/30'    :
          status === 'warn'    ? 'hover:bg-sig-yellow-dim/20' :
          status === 'running' ? 'hover:bg-sig-yellow-dim/20' :
                                 'hover:bg-wiz-surface/30',
        )}
        onClick={onToggle}
      >
        <StatusIcon />
        <span className={clsx(
          'font-mono text-xs font-semibold flex-1 truncate',
          status === 'error'   ? 'text-sig-red'    :
          status === 'warn'    ? 'text-sig-yellow'  :
          status === 'running' ? 'text-sig-yellow'  :
                                 'text-wiz-cream',
        )}>
          {section.title}
        </span>

        {section.lines.filter(l => l.trim()).length > 0 && (
          <span className="text-2xs font-mono text-wiz-dim flex-shrink-0">
            {section.lines.filter(l => l.trim()).length} lines
          </span>
        )}

        {durationMs !== null && durationMs >= 0 ? (
          <span className="text-2xs font-mono text-wiz-muted flex-shrink-0 w-14 text-right">
            {formatSectionDuration(durationMs)}
          </span>
        ) : isLast && isLive ? (
          <span className="text-2xs font-mono text-sig-yellow animate-pulse flex-shrink-0 w-14 text-right">
            running…
          </span>
        ) : (
          <span className="w-14 flex-shrink-0" />
        )}

        <ChevronDown
          size={13}
          className={clsx(
            'text-wiz-muted transition-transform duration-200 flex-shrink-0',
            expanded ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>

      {expanded && (
        <>
          {/* Azure-style section header — pinned above scroll area */}
          <SectionHeader title={section.title} status={status} durationMs={durationMs} />

          {/* Scrollable log lines */}
          <div
            ref={contentRef}
            className="max-h-72 overflow-y-auto scrollbar-thin bg-wiz-bg/30"
          >
            {section.lines.length === 0 ? (
              <div className="px-4 py-2 text-2xs font-mono text-wiz-dim italic">
                No output for this step.
              </div>
            ) : (
              <div className="py-1">
                {section.lines.map((line, j) => {
                  if (!line.trim()) return null
                  const level = detectLevel(line)
                  const fmt   = formatLogLine(line)
                  return (
                    <div key={j} className={clsx(lineClass(level), 'flex items-start text-2xs leading-relaxed')}>
                      <span className="text-wiz-dim/50 select-none font-mono shrink-0 w-8 text-right mr-2">
                        {section.lineStart + j}
                      </span>
                      <span className="font-mono shrink-0 w-16 mr-3 select-none text-wiz-dim/40">
                        {fmt.time ?? ''}
                      </span>
                      <span className="font-mono flex-1 min-w-0 break-words">
                        {fmt.message || ' '}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Section footer — pinned below scroll area */}
          <SectionFooter title={section.title} status={status} />
        </>
      )}
    </div>
  )
}

// ── Section header / footer banners ──────────────────────────────

type SectionStatus = 'success' | 'warn' | 'error' | 'running'

const SEP_BAR = '='.repeat(78)

function statusLabel(s: SectionStatus): string {
  switch (s) {
    case 'success': return 'Completed successfully'
    case 'error':   return 'Failed'
    case 'warn':    return 'Completed with warnings'
    default:        return 'Running...'
  }
}

function statusColor(s: SectionStatus): string {
  switch (s) {
    case 'success': return 'text-sig-green'
    case 'error':   return 'text-sig-red'
    case 'warn':    return 'text-sig-yellow'
    default:        return 'text-sig-yellow animate-pulse'
  }
}

function SectionHeader({ title, status, durationMs }: {
  title:      string
  status:     SectionStatus
  durationMs: number | null
}) {
  return (
    <div className="font-mono text-2xs px-4 pt-2 pb-2 select-none bg-wiz-bg/40 border-b border-wiz-border/20">
      <div className="text-wiz-dim/20 overflow-hidden whitespace-nowrap mb-1.5 tracking-widest">{SEP_BAR}</div>
      <div className="space-y-0.5">
        <div className="flex gap-2">
          <span className="w-20 shrink-0 text-wiz-dim/50">Section</span>
          <span className="text-wiz-dim/30 shrink-0">:</span>
          <span className="text-wiz-cream/80">{title}</span>
        </div>
        {durationMs !== null && durationMs >= 0 && (
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-wiz-dim/50">Duration</span>
            <span className="text-wiz-dim/30 shrink-0">:</span>
            <span className="text-wiz-muted">{formatSectionDuration(durationMs)}</span>
          </div>
        )}
        <div className="flex gap-2">
          <span className="w-20 shrink-0 text-wiz-dim/50">Status</span>
          <span className="text-wiz-dim/30 shrink-0">:</span>
          <span className={statusColor(status)}>{statusLabel(status)}</span>
        </div>
      </div>
      <div className="text-wiz-dim/20 overflow-hidden whitespace-nowrap mt-1.5 tracking-widest">{SEP_BAR}</div>
    </div>
  )
}

function SectionFooter({ title, status }: { title: string; status: SectionStatus }) {
  return (
    <div className="font-mono text-2xs px-4 py-1.5 select-none bg-wiz-bg/40 border-t border-wiz-border/20 flex items-center gap-2 flex-wrap">
      <span className="text-wiz-dim/50 uppercase tracking-wide">Section</span>
      <span className="text-wiz-dim/30">—</span>
      <span className="text-wiz-cream/70">{title}</span>
      <span className={clsx(statusColor(status), 'font-semibold')}>{statusLabel(status)}</span>
    </div>
  )
}

// ── Flat line renderer (raw / focused) ───────────────────────────

function FlatLines({
  lines,
  lineOffset = 0,
}: {
  lines:       string[]
  lineOffset?: number
}) {
  return (
    <div className="py-2">
      {lines.map((line, i) => {
        if (!line.trim()) return null
        const level = detectLevel(line)
        const fmt   = formatLogLine(line)
        return (
          <div key={i} className={clsx(lineClass(level), 'flex items-start')}>
            <span className="text-wiz-dim/50 select-none font-mono text-2xs shrink-0 w-8 text-right mr-2">
              {lineOffset + i + 1}
            </span>
            <span className="font-mono text-2xs shrink-0 w-16 mr-3 select-none text-wiz-dim/40">
              {fmt.time ?? ''}
            </span>
            <span className="font-mono text-2xs flex-1 min-w-0 break-words">
              {fmt.message || ' '}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main LogViewer ────────────────────────────────────────────────

export default function LogViewer({
  logs,
  isLoading,
  jobId,
  height = 'h-96',
  selectedSection,
}: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [rawMode,    setRawMode]    = useState(false)

  const rawLines = logs ? logs.split('\n') : []
  const { sections, prelude } = rawLines.length > 0
    ? parseLogSections(rawLines)
    : { sections: [], prelude: [] }

  const hasSections  = sections.length > 0
  const isFocused    = selectedSection != null

  // Default: last section expanded
  const [expandedSet, setExpandedSet] = useState<Set<number>>(() => new Set([0]))
  useEffect(() => {
    if (sections.length > 0) {
      setExpandedSet(prev => {
        const next = new Set(prev)
        next.add(sections.length - 1)
        return next
      })
    }
  }, [sections.length])

  // Focused mode: auto-scroll when new lines arrive
  useEffect(() => {
    if ((isFocused || rawMode) && autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, isFocused, rawMode, autoScroll])

  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 32)
  }

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `wizardcd-${jobId ?? 'job'}-deploy.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const scrollToBottom = () => {
    containerRef.current && (containerRef.current.scrollTop = containerRef.current.scrollHeight)
    setAutoScroll(true)
  }

  const toggleSection = (i: number) =>
    setExpandedSet(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  // Focused lines to display when a step is selected
  const focusedLines = selectedSection
    ? selectedSection.lines.filter(l => l.trim())
    : []

  // ── Render ──────────────────────────────────────────────────────

  // ── Toolbar ──
  const toolbar = (
    <div className="flex items-center justify-between
                    bg-wiz-panel border border-wiz-border border-b-0
                    rounded-t-lg px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="section-label flex-shrink-0">
          {isFocused ? selectedSection!.title.toUpperCase() : 'LOG OUTPUT'}
        </span>
        {isLoading && (
          <span className="flex items-center gap-1 text-2xs text-sig-yellow animate-pulse flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-sig-yellow" />
            Live
          </span>
        )}
        <span className="text-2xs text-wiz-muted font-mono truncate">
          {isFocused
            ? `${focusedLines.length} lines`
            : rawLines.length > 0
            ? `${rawLines.length} lines${hasSections && !rawMode ? ` · ${sections.length} steps` : ''}`
            : ''}
        </span>
      </div>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Expand/Collapse All — full sectioned view only */}
        {!isFocused && hasSections && !rawMode && (
          <>
            <button type="button" onClick={() => setExpandedSet(new Set(sections.map((_, i) => i)))}
              className="btn-icon h-7 w-7" title="Expand all">
              <ChevronsUpDown size={13} />
            </button>
            <button type="button" onClick={() => setExpandedSet(new Set())}
              className="btn-icon h-7 w-7" title="Collapse all">
              <ChevronsDownUp size={13} />
            </button>
          </>
        )}

        {/* Raw toggle — only in full mode when sections exist */}
        {!isFocused && hasSections && (
          <button type="button" onClick={() => setRawMode(r => !r)}
            className={clsx('btn-icon h-7 w-7', rawMode && 'text-wiz-gold')}
            title={rawMode ? 'Section view' : 'Raw view'}>
            <AlignLeft size={13} />
          </button>
        )}

        {/* Scroll controls */}
        {(isFocused || rawMode) && !autoScroll && (
          <button type="button" onClick={scrollToBottom}
            className="btn-icon h-7 w-7 text-wiz-gold" title="Scroll to bottom">
            <ArrowDown size={13} />
          </button>
        )}
        {(isFocused || rawMode) && autoScroll && rawLines.length > 0 && (
          <button type="button"
            onClick={() => { setAutoScroll(false); containerRef.current && (containerRef.current.scrollTop = 0) }}
            className="btn-icon h-7 w-7" title="Scroll to top">
            <ArrowUp size={13} />
          </button>
        )}

        {rawLines.length > 0 && (
          <button type="button" onClick={handleDownload}
            className="btn-icon h-7 w-7" title="Download full log">
            <Download size={13} />
          </button>
        )}
      </div>
    </div>
  )

  // ── Body ──

  const bodyClass = clsx(
    'log-console scrollbar-thin',
    height,
    'rounded-b-lg border-t-0',
    // sectioned view needs no default padding; focused/raw uses default
    !isFocused && hasSections && !rawMode && 'p-0',
  )

  const empty = (
    <div className="flex items-center justify-center h-full text-wiz-muted text-xs font-mono">
      {isLoading ? 'Waiting for log output…' : 'No log output available.'}
    </div>
  )

  let body: React.ReactNode

  if (isFocused) {
    // ── Step-focused mode ──
    const focusedStatus: SectionStatus =
      isLoading                   ? 'running' :
      selectedSection!.hasError   ? 'error'   :
      selectedSection!.hasWarn    ? 'warn'     : 'success'

    body = (
      <div className="flex flex-col log-console border border-wiz-border rounded-b-lg border-t-0" style={{ height: undefined }}>
        {/* Azure-style header — outside scroll */}
        <SectionHeader
          title={selectedSection!.title}
          status={focusedStatus}
          durationMs={null}
        />

        {/* Scrollable lines */}
        <div ref={containerRef} onScroll={handleScroll} className={clsx('flex-1 overflow-y-auto scrollbar-thin', height)}>
          {focusedLines.length === 0
            ? <div className="flex items-center justify-center h-full text-wiz-muted text-xs font-mono italic">
                No output for this step.
              </div>
            : <FlatLines
                lines={focusedLines}
                lineOffset={selectedSection!.lineStart - 1}
              />
          }
        </div>

        {/* Footer — outside scroll */}
        <SectionFooter title={selectedSection!.title} status={focusedStatus} />
      </div>
    )
  } else if (rawMode || !hasSections) {
    // ── Raw / flat mode ──
    body = (
      <div ref={containerRef} onScroll={handleScroll} className={bodyClass}>
        {rawLines.length === 0 ? empty : <FlatLines lines={rawLines} />}
      </div>
    )
  } else {
    // ── Full sectioned mode ──
    body = (
      <div className={bodyClass}>
        {rawLines.length === 0 ? empty : (
          <div className="flex flex-col">
            {/* Prelude */}
            {prelude.filter(l => l.trim()).length > 0 && (
              <div className="border-b border-wiz-border/30">
                <button type="button"
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-wiz-surface/30 transition-colors"
                  onClick={() => toggleSection(-1)}>
                  <ChevronDown size={13}
                    className={clsx('text-wiz-muted transition-transform duration-200 flex-shrink-0',
                      expandedSet.has(-1) ? 'rotate-0' : '-rotate-90')} />
                  <span className="font-mono text-xs text-wiz-dim flex-1">Initialization</span>
                  <span className="text-2xs font-mono text-wiz-dim">
                    {prelude.filter(l => l.trim()).length} lines
                  </span>
                  <span className="w-14 flex-shrink-0" />
                  <span className="w-4 flex-shrink-0" />
                </button>
                {expandedSet.has(-1) && (
                  <div className="max-h-48 overflow-y-auto scrollbar-thin border-t border-wiz-border/20 bg-wiz-bg/30 py-1">
                    {prelude.filter(l => l.trim()).map((line, j) => {
                      const level = detectLevel(line)
                      const fmt   = formatLogLine(line)
                      return (
                        <div key={j} className={clsx(lineClass(level), 'flex items-start text-2xs leading-relaxed')}>
                          <span className="text-wiz-dim/50 select-none font-mono shrink-0 w-8 text-right mr-2">{j + 1}</span>
                          <span className="font-mono shrink-0 w-16 mr-3 select-none text-wiz-dim/40">{fmt.time ?? ''}</span>
                          <span className="font-mono flex-1 min-w-0 break-words">{fmt.message || ' '}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {sections.map((section, i) => (
              <SectionPanel
                key={i}
                index={i}
                section={section}
                isLast={i === sections.length - 1}
                isLive={!!isLoading}
                nextTimestamp={sections[i + 1]?.titleTimestamp}
                expanded={expandedSet.has(i)}
                onToggle={() => toggleSection(i)}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {toolbar}
      {body}
    </div>
  )
}
