import { useEffect, useRef, useState } from 'react'
import { Download, ArrowDown, ArrowUp } from 'lucide-react'
import clsx from 'clsx'

interface LogViewerProps {
  logs:       string
  isLoading?: boolean
  jobId?:     string
  height?:    string
}

type LogLevel = 'error' | 'warn' | 'info' | 'success' | 'default'

function detectLevel(line: string): LogLevel {
  const lower = line.toLowerCase()
  if (lower.includes('error') || lower.includes('exception') || lower.includes('fatal')) return 'error'
  if (lower.includes('warn'))    return 'warn'
  if (lower.includes('info'))    return 'info'
  if (lower.includes('success') || lower.includes('completed') || lower.includes('started')) return 'success'
  return 'default'
}

function lineClass(level: LogLevel) {
  switch (level) {
    case 'error':   return 'log-line log-line-error'
    case 'warn':    return 'log-line log-line-warn'
    case 'info':    return 'log-line log-line-info'
    case 'success': return 'log-line log-line-success'
    default:        return 'log-line'
  }
}

export default function LogViewer({ logs, isLoading, jobId, height = 'h-96' }: LogViewerProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Detect manual scroll-up → disable auto-scroll
  const handleScroll = () => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 32
    setAutoScroll(isAtBottom)
  }

  const handleDownload = () => {
    const blob = new Blob([logs], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `wizardcd-${jobId ?? 'job'}-logs.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const scrollToBottom = () => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      setAutoScroll(true)
    }
  }

  const lines = logs ? logs.split('\n') : []

  return (
    <div className="flex flex-col gap-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between
                      bg-wiz-panel border border-wiz-border border-b-0
                      rounded-t-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="section-label">LOG OUTPUT</span>
          {isLoading && (
            <span className="flex items-center gap-1 text-2xs text-sig-yellow animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-sig-yellow animate-pulse" />
              Live
            </span>
          )}
          {lines.length > 0 && (
            <span className="text-2xs text-wiz-muted font-mono">
              {lines.length} lines
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!autoScroll && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="btn-icon h-7 w-7 text-wiz-gold hover:text-wiz-gold-light"
              title="Scroll to bottom"
            >
              <ArrowDown size={13} />
            </button>
          )}
          {autoScroll && lines.length > 0 && (
            <button
              type="button"
              onClick={() => { setAutoScroll(false); if (containerRef.current) containerRef.current.scrollTop = 0 }}
              className="btn-icon h-7 w-7"
              title="Scroll to top"
            >
              <ArrowUp size={13} />
            </button>
          )}
          {lines.length > 0 && (
            <button
              type="button"
              onClick={handleDownload}
              className="btn-icon h-7 w-7"
              title="Download logs"
            >
              <Download size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Log body */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={clsx(
          'log-console scrollbar-thin',
          height,
          'rounded-b-lg border-t-0',
        )}
      >
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-full text-wiz-muted text-xs font-mono">
            {isLoading ? 'Waiting for log output…' : 'No log output available.'}
          </div>
        ) : (
          <div className="py-2">
            {lines.map((line, i) => {
              const level = detectLevel(line)
              return (
                <div key={i} className={lineClass(level)}>
                  <span className="text-wiz-dim select-none mr-3 text-2xs inline-block w-8 text-right">
                    {i + 1}
                  </span>
                  {line || ' '}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
