/**
 * Phase 5 §5.4a — Configuration diff utility.
 *
 * Pure data layer. Computes the field-level delta between two
 * DeploymentRequest snapshots and enriches each change with a
 * plain-English semantic hint when one can be inferred.
 *
 * Used by:
 *   • ConfigDiffPanel on JobDetailPage — "Changes since last deploy"
 *   • (future) ConfigSourceBadge popover — "What did I override?"
 *
 * Design notes
 *   1. We diff at the FIELD level, not the byte level. Booleans, numbers,
 *      strings compare with === ; arrays use shallow per-index compare.
 *   2. Unchanged fields are filtered out — the panel shows ONLY deltas
 *      (roadmap requirement: "no noise").
 *   3. Semantic hints are best-effort. A diff entry with no recognised
 *      semantic just renders the raw before → after, no false claim.
 *   4. We don't try to "explain" the diff. The user already knows what
 *      they changed; we surface the change, the hint is a sanity check.
 */

import type { DeploymentRequest } from '../types/DeploymentRequest'

// ── Types ────────────────────────────────────────────────────────────────

export interface DiffEntry {
  /** DeploymentRequest field key (e.g. "stabilityWindow"). */
  field:       keyof DeploymentRequest | string
  /** Human-readable label for the field (e.g. "Stability window"). */
  label:       string
  /** Value on the "from" side — may be null/undefined when added. */
  before:      unknown
  /** Value on the "to" side — may be null/undefined when removed. */
  after:       unknown
  /**
   * Optional one-line plain-English description of the change direction.
   * Surfaces alongside the values when present, e.g. "heap raised",
   * "stability window extended", "backups disabled".
   */
  description?: string
  /**
   * Optional category — useful when grouping the diff in the UI
   * (SSH / Java / JVM / Runtime / Backup / Logging / Files).
   */
  category?:   DiffCategory
}

export type DiffCategory =
  | 'identity'
  | 'ssh'
  | 'java'
  | 'jvm'
  | 'runtime'
  | 'backup'
  | 'logging'
  | 'files'
  | 'other'

export interface ConfigDiff {
  /** Fields present in both snapshots but with different values. */
  changed: DiffEntry[]
  /** Fields present in the "to" snapshot but missing/null in the "from". */
  added:   DiffEntry[]
  /** Fields present in the "from" snapshot but missing/null in the "to". */
  removed: DiffEntry[]
  /** Total entries across all three buckets. Useful for empty-state checks. */
  totalCount: number
}

// ── Field metadata ───────────────────────────────────────────────────────

/**
 * Per-field metadata for diff rendering. Drives the human label, the
 * category badge colour, and (when applicable) the semantic-hint formatter.
 *
 * Fields not listed here still appear in the diff with a fall-back label
 * (the raw key) and category "other" — no field is silently dropped.
 */
interface FieldMeta {
  label:    string
  category: DiffCategory
  /** Optional semantic-hint formatter (before, after) → description. */
  hint?:    (before: unknown, after: unknown) => string | undefined
}

const FIELD_META: Partial<Record<keyof DeploymentRequest, FieldMeta>> = {
  // Identity
  appName:     { label: 'Application name', category: 'identity' },
  environment: { label: 'Environment',      category: 'identity' },
  mainClass:   { label: 'Main class',       category: 'identity' },
  jarName:     { label: 'JAR name',         category: 'identity' },

  // SSH
  sshUser:        { label: 'SSH user', category: 'ssh' },
  sshHost:        { label: 'SSH host', category: 'ssh' },
  sshPort:        { label: 'SSH port', category: 'ssh' },
  targetBasePath: { label: 'Target base path', category: 'ssh' },

  // Java
  javaCommand: { label: 'Java binary',  category: 'java' },
  javaVersion: { label: 'Java version', category: 'java', hint: javaVersionHint },

  // JVM
  xms:       { label: 'Initial heap (Xms)',   category: 'jvm', hint: heapHint },
  xmx:       { label: 'Max heap (Xmx)',       category: 'jvm', hint: heapHint },
  newRatio:  { label: 'NewRatio',             category: 'jvm' },
  extraOpts: { label: 'Extra JVM options',    category: 'jvm', hint: arrayHint },

  // Runtime
  runAsUser:   { label: 'Run-as user',  category: 'runtime' },
  serverPort:  { label: 'Server port',  category: 'runtime', hint: portHint },

  // Logging
  maxLogSize:  { label: 'Max log size',  category: 'logging' },
  maxLogFiles: { label: 'Max log files', category: 'logging' },

  // Build / Files
  libPath:   { label: 'lib path (fat/thin)',  category: 'files', hint: libPathHint },
  extraDirs: { label: 'Extra directories',    category: 'files', hint: arrayHint },
  certPaths: { label: 'Certificate paths',    category: 'files', hint: arrayHint },

  // Backup
  performBackup: { label: 'Pre-deploy backup',    category: 'backup', hint: boolToggleHint('backups') },
  maxBackups:    { label: 'Max backups retained', category: 'backup', hint: countHint('backup') },

  // Stability
  stabilityWindow: { label: 'Stability window', category: 'other', hint: stabilityHint },
}

// ── Semantic-hint formatters ─────────────────────────────────────────────
//
// Each takes the before/after values and returns an optional one-line
// description. Returning undefined → no semantic hint, the row renders the
// raw values only. Hint phrasing is deliberately short and neutral.

function javaVersionHint(b: unknown, a: unknown): string | undefined {
  const bn = Number(b)
  const an = Number(a)
  if (Number.isFinite(bn) && Number.isFinite(an)) {
    if (an > bn) return `Java ${bn} → Java ${an} (upgraded)`
    if (an < bn) return `Java ${bn} → Java ${an} (downgraded)`
  }
  return undefined
}

function heapHint(b: unknown, a: unknown): string | undefined {
  const bytes = (s: unknown): number | null => {
    if (typeof s !== 'string') return null
    const m = s.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)b?$/)
    if (!m) return null
    const n = parseFloat(m[1])
    const unit = m[2]
    const mult: Record<string, number> = { '': 1, k: 1024, m: 1024**2, g: 1024**3, t: 1024**4 }
    return n * (mult[unit] ?? 1)
  }
  const bb = bytes(b)
  const aa = bytes(a)
  if (bb === null || aa === null) return undefined
  if (aa > bb) return 'heap raised'
  if (aa < bb) return 'heap lowered'
  return undefined
}

function portHint(b: unknown, a: unknown): string | undefined {
  if (typeof b !== 'number' || typeof a !== 'number') return undefined
  if (a === b) return undefined
  return `port ${b} → ${a}`
}

function libPathHint(b: unknown, a: unknown): string | undefined {
  // "" = fat JAR, "lib" = thin JAR
  const label = (v: unknown) => v === 'lib' ? 'thin' : 'fat'
  if (b === a) return undefined
  return `${label(b)} JAR → ${label(a)} JAR`
}

function stabilityHint(b: unknown, a: unknown): string | undefined {
  if (typeof b !== 'number' || typeof a !== 'number') return undefined
  if (a === b) return undefined
  return a > b ? `stability window extended ${b}s → ${a}s` : `stability window shortened ${b}s → ${a}s`
}

function arrayHint(b: unknown, a: unknown): string | undefined {
  const ba = Array.isArray(b) ? b.length : 0
  const aa = Array.isArray(a) ? a.length : 0
  if (ba === aa) return undefined
  if (aa > ba) return `${aa - ba} added`
  return `${ba - aa} removed`
}

function boolToggleHint(noun: string) {
  return (b: unknown, a: unknown): string | undefined => {
    if (typeof b !== 'boolean' || typeof a !== 'boolean') return undefined
    if (a === b) return undefined
    return a ? `${noun} enabled` : `${noun} disabled`
  }
}

function countHint(noun: string) {
  return (b: unknown, a: unknown): string | undefined => {
    if (typeof b !== 'number' || typeof a !== 'number') return undefined
    if (a === b) return undefined
    return a > b ? `${noun} count raised ${b} → ${a}` : `${noun} count lowered ${b} → ${a}`
  }
}

// ── Equality + nullishness helpers ───────────────────────────────────────

/**
 * Treat empty strings + empty arrays as "absent" alongside null/undefined,
 * so a config that goes from `xms: ""` to `xms: "512m"` is reported as an
 * ADD rather than a CHANGE (the field genuinely wasn't being set before).
 */
function isAbsent(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string' && v.trim() === '') return true
  if (Array.isArray(v) && v.length === 0) return true
  return false
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      // Arrays of CertPath / ExtraDir are objects — compare by JSON stringify
      // (small payloads, order matters; user's free to re-order intentionally).
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return false
    }
    return true
  }
  return false
}

// ── Main diff entry point ────────────────────────────────────────────────

/**
 * Compute the field-level delta between two DeploymentRequest snapshots.
 *
 * @param from  The earlier deploy's config (the "before").
 * @param to    The later  deploy's config (the "after").
 * @returns ConfigDiff with three buckets and a totalCount.
 */
export function diffConfigs(
  from: DeploymentRequest | null | undefined,
  to:   DeploymentRequest | null | undefined,
): ConfigDiff {
  const changed: DiffEntry[] = []
  const added:   DiffEntry[] = []
  const removed: DiffEntry[] = []

  if (!from || !to) {
    return { changed, added, removed, totalCount: 0 }
  }

  // Union of keys across both — we drive iteration by the "to" side first
  // (lists every key currently in use) then add removed-only keys from
  // the "from" side.
  const keys = new Set<string>([...Object.keys(from), ...Object.keys(to)])

  for (const key of keys) {
    const b = (from as Record<string, unknown>)[key]
    const a = (to   as Record<string, unknown>)[key]

    const meta  = FIELD_META[key as keyof DeploymentRequest]
    const label = meta?.label ?? key

    const bAbsent = isAbsent(b)
    const aAbsent = isAbsent(a)

    // Both absent → nothing to surface
    if (bAbsent && aAbsent) continue

    // Values equal → not a change
    if (!bAbsent && !aAbsent && shallowEqual(a, b)) continue

    const entry: DiffEntry = {
      field:       key,
      label,
      before:      b,
      after:       a,
      category:    meta?.category ?? 'other',
      description: meta?.hint?.(b, a),
    }

    if (bAbsent && !aAbsent)      added.push(entry)
    else if (!bAbsent && aAbsent) removed.push(entry)
    else                          changed.push(entry)
  }

  // Sort each bucket by category then label for stable, scannable output.
  const sortFn = (x: DiffEntry, y: DiffEntry) => {
    const ca = x.category ?? 'other'
    const cb = y.category ?? 'other'
    if (ca !== cb) return ca.localeCompare(cb)
    return x.label.localeCompare(y.label)
  }
  changed.sort(sortFn)
  added.sort(sortFn)
  removed.sort(sortFn)

  return {
    changed,
    added,
    removed,
    totalCount: changed.length + added.length + removed.length,
  }
}

// ── Display helpers ──────────────────────────────────────────────────────

/**
 * Format a value for the diff table's Before / After columns. Arrays
 * render as their count; null/undefined as an em-dash; everything else
 * as JSON-ish string. We don't try to pretty-print nested objects — the
 * panel's job is to surface CHANGE, not to be a JSON editor.
 */
export function formatDiffValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'on' : 'off'
  if (typeof v === 'string') {
    if (v.trim() === '') return '—'
    return v.length > 40 ? v.slice(0, 38) + '…' : v
  }
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) {
    if (v.length === 0) return '—'
    // Strings stay as comma-list; objects render their count.
    if (v.every(item => typeof item === 'string')) {
      const joined = v.join(', ')
      return joined.length > 40 ? `${v.length} items` : joined
    }
    return `${v.length} item${v.length === 1 ? '' : 's'}`
  }
  try {
    const json = JSON.stringify(v)
    return json.length > 40 ? json.slice(0, 38) + '…' : json
  } catch {
    return String(v)
  }
}

/** Category → tailwind class for the small category pill on each row. */
export const CATEGORY_STYLE: Record<DiffCategory, string> = {
  identity: 'bg-wiz-gold-dim    text-wiz-gold    border-wiz-gold/30',
  ssh:      'bg-sig-green-dim   text-sig-green   border-sig-green/30',
  java:     'bg-sig-blue-dim    text-sig-blue    border-sig-blue/30',
  jvm:      'bg-sig-purple-dim  text-sig-purple  border-sig-purple/30',
  runtime:  'bg-sig-yellow-dim  text-sig-yellow  border-sig-yellow/30',
  backup:   'bg-sig-blue-dim    text-sig-blue    border-sig-blue/30',
  logging:  'bg-wiz-bg/60       text-wiz-muted   border-wiz-border',
  files:    'bg-sig-green-dim   text-sig-green   border-sig-green/30',
  other:    'bg-wiz-bg/60       text-wiz-muted   border-wiz-border',
}
