import { useState, useEffect, useCallback, useRef } from 'react'
import { fetchJobs } from '../api/jobs'
import type { JobSummary } from '../types/JobSummary'

// ── Types ─────────────────────────────────────────────────────────

export interface Notification {
  id:          string          // jobId + status (unique per transition)
  jobId:       string
  appName:     string
  environment: string
  status:      'SUCCESS' | 'FAILED' | 'ABORTED'
  timestamp:   string          // ISO 8601
  read:        boolean
}

// ── Terminal states we care about ─────────────────────────────────

const TERMINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'ABORTED'])

// ── LocalStorage persistence ──────────────────────────────────────

const STORAGE_KEY = 'wiz-notifications'
const MAX_NOTIFICATIONS = 30

function loadNotifications(): Notification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Notification[]) : []
  } catch {
    return []
  }
}

function saveNotifications(items: Notification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_NOTIFICATIONS)))
}

// ── Hook ──────────────────────────────────────────────────────────

export function useNotifications(pollIntervalMs = 5000) {
  const [notifications, setNotifications] = useState<Notification[]>(loadNotifications)
  const prevJobsRef = useRef<Map<string, string>>(new Map()) // jobId → lifecycleStatus
  const initializedRef = useRef(false)

  // Persist whenever notifications change
  useEffect(() => {
    saveNotifications(notifications)
  }, [notifications])

  // Poll jobs and detect transitions to terminal states
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>

    const check = async () => {
      try {
        const jobs: JobSummary[] = await fetchJobs()
        const prevMap = prevJobsRef.current
        const newMap = new Map<string, string>()

        // Build new map and detect transitions
        const newNotifs: Notification[] = []

        for (const job of jobs) {
          newMap.set(job.jobId, job.lifecycleStatus)

          // Only generate notifications after initial load (skip first poll)
          if (!initializedRef.current) continue

          const prevStatus = prevMap.get(job.jobId)

          // Job transitioned TO a terminal state (was non-terminal or new)
          if (
            TERMINAL_STATUSES.has(job.lifecycleStatus) &&
            prevStatus !== undefined &&
            !TERMINAL_STATUSES.has(prevStatus)
          ) {
            const notifId = `${job.jobId}-${job.lifecycleStatus}`

            // Don't duplicate
            const alreadyExists = notifications.some((n) => n.id === notifId)
            if (!alreadyExists) {
              newNotifs.push({
                id:          notifId,
                jobId:       job.jobId,
                appName:     job.appName,
                environment: job.environment,
                status:      job.lifecycleStatus as 'SUCCESS' | 'FAILED' | 'ABORTED',
                timestamp:   job.completedAt ?? new Date().toISOString(),
                read:        false,
              })
            }
          }
        }

        prevJobsRef.current = newMap
        initializedRef.current = true

        if (newNotifs.length > 0) {
          setNotifications((prev) => [...newNotifs, ...prev].slice(0, MAX_NOTIFICATIONS))
        }
      } catch {
        // Silently ignore polling errors
      }
    }

    void check()
    timer = setInterval(() => void check(), pollIntervalMs)

    return () => clearInterval(timer)
  }, [pollIntervalMs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────────────

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    )
  }, [])

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const unreadCount = notifications.filter((n) => !n.read).length

  return {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearAll,
  }
}
