import apiClient from './client'
import type {
  Application,
  ApplicationRequest,
  LiveConfigCapability,
} from '../types/Application'

/**
 * Phase 5 §5.1 — Application registry REST client.
 *
 * Maps 1:1 to the endpoints exposed by `ApplicationController`. All
 * paths are unprefixed (no `/api/` — matches existing convention).
 */

// ── Reads ────────────────────────────────────────────────────────────

/**
 * List live applications.
 *
 * @param options.q         case-insensitive substring search on name
 * @param options.capability filter to apps with that live-push capability
 */
export async function fetchApplications(options: {
  q?:          string
  capability?: LiveConfigCapability
} = {}): Promise<Application[]> {
  const { data } = await apiClient.get<Application[]>('/applications', {
    params: {
      q:          options.q?.trim() || undefined,
      capability: options.capability,
    },
  })
  return data
}

/**
 * Get one app by id. Optionally inline the environments[] array so the
 * App Detail page only needs one request.
 */
export async function fetchApplication(
  id: string,
  options: { expandEnvironments?: boolean } = {},
): Promise<Application> {
  const { data } = await apiClient.get<Application>(`/applications/${id}`, {
    params: {
      expand: options.expandEnvironments ? 'environments' : undefined,
    },
  })
  return data
}

/**
 * Fetch an application by NAME by listing + filtering client-side.
 * The current backend doesn't expose a /applications/by-name endpoint;
 * the app registry is small enough that a list + filter is fine. Phase 6+
 * will likely add the direct lookup when scale demands it.
 */
export async function fetchApplicationByName(name: string): Promise<Application | null> {
  const apps = await fetchApplications({ q: name })
  return apps.find(a => a.name === name) ?? null
}

// ── Writes ───────────────────────────────────────────────────────────

export async function createApplication(req: ApplicationRequest): Promise<Application> {
  const { data } = await apiClient.post<Application>('/applications', req)
  return data
}

export async function updateApplication(
  id: string,
  req: ApplicationRequest,
): Promise<Application> {
  const { data } = await apiClient.put<Application>(`/applications/${id}`, req)
  return data
}

/** Soft-delete. Backend sets deleted_at; row is hidden from default reads. */
export async function deleteApplication(id: string): Promise<void> {
  await apiClient.delete(`/applications/${id}`)
}

/** Undo a soft-delete. Backs the toast Undo button. */
export async function restoreApplication(id: string): Promise<Application> {
  const { data } = await apiClient.post<Application>(`/applications/${id}/restore`)
  return data
}
