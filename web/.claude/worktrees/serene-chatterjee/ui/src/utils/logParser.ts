/**
 * logParser.ts
 *
 * Parses the deploy.sh / helpers.sh log format into sections.
 *
 * helpers.sh `log_section` emits:
 *   echo ""
 *   echo "=================================================================="
 *   echo "TIMESTAMP [INFO ] [job=UUID] Section Title"
 *   echo "=================================================================="
 *   … content lines …
 *
 * Exported for use by LogViewer (sectioned display) and
 * JobDetailPage (steps sidebar).
 */

// ── Separator detector ────────────────────────────────────────────
/** Matches a line of 10+ '=' characters (the deploy.sh section separator). */
export const SEP_RE = /^={10,}\s*$/

// ── Types ─────────────────────────────────────────────────────────

export type LogLevel = 'error' | 'warn' | 'info' | 'success' | 'default'

export interface LogSection {
  /** Human-readable section title extracted from the INFO line. */
  title:           string
  /** Timestamp parsed from the section title line; used for duration calc. */
  titleTimestamp?: Date
  /** Log content lines belonging to this section. */
  lines:           string[]
  /** 1-based line number of the first content line in the raw log. */
  lineStart:       number
  hasError:        boolean
  hasWarn:         boolean
}

// ── Styling helpers ───────────────────────────────────────────────

export function detectLevel(line: string): LogLevel {
  if (/\[ERROR\]|exception|fatal/i.test(line)) return 'error'
  if (/\[WARN\s*\]/i.test(line))               return 'warn'
  if (/\[INFO\s*\]/i.test(line))               return 'info'
  if (/success|completed|started/i.test(line)) return 'success'
  return 'default'
}

export function lineClass(level: LogLevel): string {
  switch (level) {
    case 'error':   return 'log-line log-line-error'
    case 'warn':    return 'log-line log-line-warn'
    case 'info':    return 'log-line log-line-info'
    case 'success': return 'log-line log-line-success'
    default:        return 'log-line'
  }
}

// ── Duration formatter ────────────────────────────────────────────

export function formatSectionDuration(ms: number): string {
  if (ms < 1000)  return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60)     return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

// ── Parser ────────────────────────────────────────────────────────

/**
 * Splits raw log lines into sections based on the deploy.sh
 * `log_section` separator pattern:
 *
 *   [blank]
 *   ==================================================================
 *   TIMESTAMP [INFO ] [job=UUID] Section Title
 *   ==================================================================
 *   [content lines …]
 *
 * Lines before the first section header are returned as `prelude`.
 */
export function parseLogSections(rawLines: string[]): {
  sections: LogSection[]
  prelude:  string[]
} {
  const sections: LogSection[] = []
  const prelude:  string[]     = []
  let current: LogSection | null = null
  let lineNum = 1   // 1-based counter tracking original line numbers

  let i = 0
  while (i < rawLines.length) {
    const line = rawLines[i]

    if (SEP_RE.test(line.trim())) {
      // Peek ahead: sep → non-empty non-sep title → sep  ⟹  section header
      const titleLine = rawLines[i + 1] ?? ''
      const closeSep  = rawLines[i + 2] ?? ''

      if (
        titleLine.trim() !== ''         &&
        !SEP_RE.test(titleLine.trim())  &&
        SEP_RE.test(closeSep.trim())
      ) {
        if (current) sections.push(current)

        // Extract human-readable title (strip timestamp + level + job tag)
        const matchMsg = titleLine.match(/\[INFO\s*\]\s*\[job=[^\]]+\]\s*(.+)/)
        const title    = matchMsg ? matchMsg[1].trim() : titleLine.trim()

        // Parse timestamp for duration calculation
        const matchTs = titleLine.match(
          /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)/
        )
        const titleTimestamp = matchTs
          ? new Date(matchTs[1].replace(' ', 'T'))
          : undefined

        current = {
          title,
          titleTimestamp,
          lines:     [],
          lineStart: lineNum + 3,   // first content line follows 3 header lines
          hasError:  false,
          hasWarn:   false,
        }

        i       += 3
        lineNum += 3
        continue
      }
      // Not a section header — fall through and treat as regular content
    }

    if (current) {
      current.lines.push(line)
      if (/\[ERROR\]|exception|fatal/i.test(line)) current.hasError = true
      else if (/\[WARN\s*\]/i.test(line))          current.hasWarn  = true
    } else {
      prelude.push(line)
    }

    i++
    lineNum++
  }

  if (current) sections.push(current)
  return { sections, prelude }
}
