import { useMemo, useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  GitCompareArrows, ChevronDown, Loader2, AlertTriangle,
  ArrowRight, Check, FileCheck2,
} from 'lucide-react'

import { fetchJobs, fetchJobConfig } from '../api/jobs'
import { diffConfigs, formatDiffValue, CATEGORY_STYLE, type DiffEntry } from '../utils/configDiff'
import type { JobSummary } from '../types/JobSummary'
import type { DeploymentRequest } from '../types/DeploymentRequest'

/**
 * Phase 5 §5.4 — Config Diff panel.
 *
 * Renders the "Changes since last deploy" section on JobDetailPage. Compares
 * the current job's stored DeploymentRequest snapshot to the previous
 * successful deploy of the same app + environment, and surfaces the field
 * deltas as a scannable table (no noise — unchanged fields are hidden).
 *
 * The user can also pick a different prior deploy via the "Compare with"
 * dropdown — useful for "what changed between this run and 3 deploys ago?".
 *
 * Roadmap §5.4 deliverable:
 *   • Endpoint surface remains client-side for now (no backend changes)
 *   • Picks the most recent SUCCESS of the same app/env as the default
 *     comparison target — matches the roadmap mock
 *   • Semantic English hints come from configDiff.ts (best-effort)
 */

interface Props {
  /** Job we are viewing — the "to" side of the diff. */
  currentJobId: string
  /** Application name (used to filter the "compare with" list). */
  currentApp:   string | undefined
  /** Environment (used to filter the "compare with" list). */
  currentEnv:   string | undefined
  /** Created-at of the current job — picks the previous deploy before this. */
  currentCreatedAt?: string
}

// ── Component ────────────────────────────────────────────────────────────

export default function ConfigDiffPanel({
  currentJobId, currentApp, currentEnv, currentCreatedAt,
}: Props) {
  // ── Build the candidate list of comparable deploys ───────────────────
  const jobsQuery = useQuery({
    queryKey: ['jobs-for-diff', currentApp, currentEnv],
    queryFn:  () => fetchJobs(),
    enabled:  !!currentApp && !!currentEnv,
    staleTime: 30_000,
  })

  const comparableJobs = useMemo<JobSummary[]>(() => {
    if (!jobsQuery.data || !currentApp || !currentEnv) return []
    return jobsQuery.data
      .filter(j =>
        j.jobId !== currentJobId
        && j.appName === currentApp
        && j.environment === currentEnv
        && j.lifecycleStatus === 'SUCCESS',
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [jobsQuery.data, currentApp, currentEnv, currentJobId])

  // Default to the most recent prior successful deploy that's older than
  // the current job — most useful "what changed since last time?" answer.
  const defaultFromJob = useMemo(() => {
    if (!currentCreatedAt) return comparableJobs[0] ?? null
    const prior = comparableJobs.find(j => j.createdAt.localeCompare(currentCreatedAt) < 0)
    return prior ?? comparableJobs[0] ?? null
  }, [comparableJobs, currentCreatedAt])

  // ── Selected comparison target — user can override via the dropdown ──
  const [selectedFromId, setSelectedFromId] = useState<string | null>(null)
  const fromJobId = selectedFromId ?? defaultFromJob?.jobId ?? null

  // ── Fetch both configs in parallel ──────────────────────────────────
  const configQueries = useQueries({
    queries: [
      {
        queryKey: ['job-config', fromJobId],
        queryFn:  () => fetchJobConfig(fromJobId!),
        enabled:  !!fromJobId,
        staleTime: 60_000,
      },
      {
        queryKey: ['job-config', currentJobId],
        queryFn:  () => fetchJobConfig(currentJobId),
        staleTime: 60_000,
      },
    ],
  })
  const fromConfigQuery    = configQueries[0]
  const currentConfigQuery = configQueries[1]

  // ── Compute the diff ─────────────────────────────────────────────────
  const diff = useMemo(() => {
    return diffConfigs(
      fromConfigQuery.data as DeploymentRequest | undefined,
      currentConfigQuery.data as DeploymentRequest | undefined,
    )
  }, [fromConfigQuery.data, currentConfigQuery.data])

  // ── Lifecycle gates ──────────────────────────────────────────────────
  if (jobsQuery.isLoading) {
    return <PanelShell><LoadingRow label="Loading deploy history…" /></PanelShell>
  }
  if (jobsQuery.isError) {
    return <PanelShell><ErrorRow message="Couldn't load deploy history for comparison." /></PanelShell>
  }

  if (comparableJobs.length === 0) {
    return (
      <PanelShell>
        <EmptyRow>
          <FileCheck2 size={14} className="text-sig-green flex-shrink-0" />
          <span>
            First successful deploy of <span className="font-mono font-semibold text-wiz-cream">{currentApp ?? 'app'}</span>
            {' '}to <span className="font-mono font-semibold text-wiz-cream">{currentEnv ?? 'env'}</span> — no earlier deploy to compare against.
          </span>
        </EmptyRow>
      </PanelShell>
    )
  }

  if (!fromJobId) {
    return <PanelShell><EmptyRow>No comparable deploy selected.</EmptyRow></PanelShell>
  }

  if (fromConfigQuery.isLoading || currentConfigQuery.isLoading) {
    return <PanelShell><LoadingRow label="Loading configs to compare…" /></PanelShell>
  }
  if (fromConfigQuery.isError || currentConfigQuery.isError) {
    return <PanelShell><ErrorRow message="Couldn't load one of the deploy configs." /></PanelShell>
  }

  // ── Render ───────────────────────────────────────────────────────────
  const selectedJob = comparableJobs.find(j => j.jobId === fromJobId)
  return (
    <PanelShell>
      <DiffHeader
        fromJob={selectedJob}
        jobs={comparableJobs}
        selectedId={fromJobId}
        onSelect={(id) => setSelectedFromId(id)}
        totalCount={diff.totalCount}
      />
      {diff.totalCount === 0 ? (
        <EmptyRow>
          <Check size={14} className="text-sig-green flex-shrink-0" />
          <span>Same config as the previous deploy — every field matches.</span>
        </EmptyRow>
      ) : (
        <DiffTable diff={diff} />
      )}
    </PanelShell>
  )
}

// ── PanelShell (consistent visual wrapper) ───────────────────────────────

function PanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-wiz-border border-l-2 border-l-sig-blue/50 bg-wiz-surface overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-wiz-border/60 bg-sig-blue-dim">
        <span className="w-1.5 h-1.5 rounded-full bg-sig-blue/70 flex-shrink-0" />
        <h3 className="font-mono font-semibold text-xs uppercase tracking-widest text-sig-blue">
          Config Diff
        </h3>
        <span className="ml-1 text-xs text-wiz-muted/50 font-normal normal-case tracking-normal">
          · what changed since the last deploy
        </span>
      </div>
      <div className="divide-y divide-wiz-border/30">
        {children}
      </div>
    </div>
  )
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="p-5 flex items-center gap-2 text-sm text-wiz-muted">
      <Loader2 size={14} className="animate-spin" />
      {label}
    </div>
  )
}

function ErrorRow({ message }: { message: string }) {
  return (
    <div className="p-5 flex items-center gap-2 text-sm text-sig-red">
      <AlertTriangle size={14} />
      {message}
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-5 flex items-center gap-2.5 text-sm text-wiz-cream/85">
      {children}
    </div>
  )
}

// ── Header — comparison summary + dropdown ────────────────────────────────

function DiffHeader({
  fromJob, jobs, selectedId, onSelect, totalCount,
}: {
  fromJob:    JobSummary | undefined
  jobs:       JobSummary[]
  selectedId: string
  onSelect:   (id: string) => void
  totalCount: number
}) {
  const shortId = (id: string) => id.slice(0, 8)
  return (
    <div className="p-5 flex flex-wrap items-center gap-3">
      <GitCompareArrows size={14} className="text-sig-blue flex-shrink-0" />
      <div className="flex items-center gap-2 text-sm text-wiz-cream flex-1 min-w-0 flex-wrap">
        <span>
          Comparing against deploy{' '}
          <span className="font-mono font-semibold">{fromJob ? shortId(fromJob.jobId) : '—'}</span>
          {fromJob && (
            <span className="text-xs text-wiz-muted/70 ml-1">
              ({new Date(fromJob.createdAt).toLocaleDateString()})
            </span>
          )}
        </span>
        <ArrowRight size={12} className="text-wiz-muted/60 flex-shrink-0" />
        <span className="font-mono font-semibold text-sig-blue">this deploy</span>
      </div>
      <div className="flex items-center gap-3 ml-auto flex-shrink-0">
        <span
          className={clsx(
            'inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border',
            totalCount === 0
              ? 'bg-sig-green-dim text-sig-green border-sig-green/30'
              : 'bg-sig-yellow-dim text-sig-yellow border-sig-yellow/30',
          )}
        >
          {totalCount === 0 ? 'no changes' : `${totalCount} field${totalCount === 1 ? '' : 's'} changed`}
        </span>
        <CompareDropdown jobs={jobs} selectedId={selectedId} onSelect={onSelect} />
      </div>
    </div>
  )
}

function CompareDropdown({
  jobs, selectedId, onSelect,
}: { jobs: JobSummary[]; selectedId: string; onSelect: (id: string) => void }) {
  // Only render if there's a real choice to make
  if (jobs.length <= 1) return null
  return (
    <div className="relative">
      <select
        value={selectedId}
        onChange={(e) => onSelect(e.target.value)}
        className="appearance-none pl-3 pr-9 py-1.5 text-xs font-mono rounded border border-wiz-border bg-wiz-bg text-wiz-cream focus:outline-none focus:ring-2 focus:ring-sig-blue/40 focus:border-sig-blue/40"
        title="Compare with a different prior deploy"
      >
        {jobs.map(j => {
          const date = new Date(j.createdAt).toLocaleDateString()
          return (
            <option key={j.jobId} value={j.jobId}>
              {j.jobId.slice(0, 8)} · {date}
            </option>
          )
        })}
      </select>
      <ChevronDown
        size={12}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-wiz-muted pointer-events-none"
      />
    </div>
  )
}

// ── Diff table ────────────────────────────────────────────────────────────

function DiffTable({ diff }: { diff: ReturnType<typeof diffConfigs> }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      {diff.changed.length > 0 && (
        <DiffSection title="Changed" entries={diff.changed} />
      )}
      {diff.added.length > 0 && (
        <DiffSection title="Added"   entries={diff.added} variant="added" />
      )}
      {diff.removed.length > 0 && (
        <DiffSection title="Removed" entries={diff.removed} variant="removed" />
      )}
    </div>
  )
}

function DiffSection({
  title, entries, variant = 'changed',
}: {
  title:    string
  entries:  DiffEntry[]
  variant?: 'changed' | 'added' | 'removed'
}) {
  const accentClass =
    variant === 'added'   ? 'text-sig-green' :
    variant === 'removed' ? 'text-sig-red'   :
                            'text-sig-yellow'
  return (
    <div>
      <div className={clsx('flex items-center gap-2 mb-2', accentClass)}>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
          {title}
        </span>
        <span className="text-[10px] text-wiz-muted/70 font-mono">
          {entries.length} field{entries.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="rounded border border-wiz-border/40 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-wiz-bg/40">
            <tr>
              <th className="px-3 py-2 text-left font-mono font-semibold uppercase tracking-wider text-wiz-muted/70 text-[10px] w-[28%]">Field</th>
              <th className="px-3 py-2 text-left font-mono font-semibold uppercase tracking-wider text-wiz-muted/70 text-[10px] w-[24%]">Before</th>
              <th className="px-3 py-2 text-center font-mono font-semibold uppercase tracking-wider text-wiz-muted/70 text-[10px] w-[3%]"></th>
              <th className="px-3 py-2 text-left font-mono font-semibold uppercase tracking-wider text-wiz-muted/70 text-[10px] w-[24%]">After</th>
              <th className="px-3 py-2 text-left font-mono font-semibold uppercase tracking-wider text-wiz-muted/70 text-[10px] w-[21%]">Note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-wiz-border/30">
            {entries.map((e) => (
              <DiffRow key={e.field} entry={e} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DiffRow({ entry }: { entry: DiffEntry }) {
  const before = formatDiffValue(entry.before)
  const after  = formatDiffValue(entry.after)
  const cat = entry.category ?? 'other'
  return (
    <tr className="hover:bg-wiz-bg/30 transition-colors">
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-wiz-cream">{entry.label}</span>
          <span
            className={clsx(
              'inline-flex items-center text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border',
              CATEGORY_STYLE[cat],
            )}
          >
            {cat}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <code className="text-wiz-muted/80 font-mono text-[11px]" title={String(entry.before)}>
          {before}
        </code>
      </td>
      <td className="px-3 py-2 align-top text-center">
        <ArrowRight size={11} className="text-wiz-muted/50 mx-auto" />
      </td>
      <td className="px-3 py-2 align-top">
        <code className="text-wiz-cream font-mono text-[11px] font-semibold" title={String(entry.after)}>
          {after}
        </code>
      </td>
      <td className="px-3 py-2 align-top">
        {entry.description && (
          <span className="text-[11px] text-sig-blue/85 italic">{entry.description}</span>
        )}
      </td>
    </tr>
  )
}
