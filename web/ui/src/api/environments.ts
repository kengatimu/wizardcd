import apiClient from './client'
import type {
  EnvironmentConfig,
  EnvironmentConfigRequest,
} from '../types/EnvironmentConfig'

/**
 * Phase 5 §5.1 — Environment-config REST client.
 *
 * Nested under `/applications/:appId/environments` — mirrors the URL
 * hierarchy enforced by `EnvironmentConfigController`.
 */

export async function fetchEnvironments(appId: string): Promise<EnvironmentConfig[]> {
  const { data } = await apiClient.get<EnvironmentConfig[]>(
    `/applications/${appId}/environments`,
  )
  return data
}

export async function fetchEnvironment(
  appId: string,
  envConfigId: string,
): Promise<EnvironmentConfig> {
  const { data } = await apiClient.get<EnvironmentConfig>(
    `/applications/${appId}/environments/${envConfigId}`,
  )
  return data
}

export async function createEnvironment(
  appId: string,
  req: EnvironmentConfigRequest,
): Promise<EnvironmentConfig> {
  const { data } = await apiClient.post<EnvironmentConfig>(
    `/applications/${appId}/environments`,
    req,
  )
  return data
}

export async function updateEnvironment(
  appId: string,
  envConfigId: string,
  req: EnvironmentConfigRequest,
): Promise<EnvironmentConfig> {
  const { data } = await apiClient.put<EnvironmentConfig>(
    `/applications/${appId}/environments/${envConfigId}`,
    req,
  )
  return data
}

export async function deleteEnvironment(
  appId: string,
  envConfigId: string,
): Promise<void> {
  await apiClient.delete(`/applications/${appId}/environments/${envConfigId}`)
}
