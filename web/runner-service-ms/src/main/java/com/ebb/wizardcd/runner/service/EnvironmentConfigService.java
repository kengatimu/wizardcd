package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Phase 5 §5.1 — the single API for managing rows in the
 * {@code environment_configs} table.
 *
 * <p>An environment config is a saved bundle of SSH target + JVM + runtime
 * settings for one (app, env) pair. The Phase 5 deploy wizard reads these
 * to auto-fill Step 1, removing the "type 20 fields" pattern.
 *
 * <p>All writes audit (via {@link AuditService}) and run inside the
 * caller's transaction. Reads use read-only transactions.
 *
 * <h2>Uniqueness contract</h2>
 * Each (app_id, env_name) pair has at most one config row — enforced
 * both at the DB level (V1 constraint {@code uq_environment_configs_app_env})
 * and at the service level (pre-flight existence check in
 * {@link #create(UUID, EnvironmentConfigEntity)} for clean error
 * semantics). Use {@link #upsert(UUID, EnvironmentConfigEntity)} when you
 * want "create or update" behaviour instead of failing on duplicate.
 *
 * @see com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity
 * @see com.ebb.wizardcd.runner.persistence.repository.EnvironmentConfigRepository
 */
public interface EnvironmentConfigService {

    // ── Reads ──────────────────────────────────────────────────────────────

    /** Look up an env config by primary key. */
    Optional<EnvironmentConfigEntity> findById(UUID envConfigId);

    /** Look up the env config for a specific (app, env) pair. */
    Optional<EnvironmentConfigEntity> findByAppAndEnv(UUID appId, String envName);

    /** All env configs for an application, env-name ascending. */
    List<EnvironmentConfigEntity> findByApp(UUID appId);

    /** Does an env config exist for this (app, env) pair? */
    boolean existsByAppAndEnv(UUID appId, String envName);

    // ── Writes ─────────────────────────────────────────────────────────────

    /**
     * Create a new env config for {@code appId}. The {@code application}
     * association is filled by the service — callers can pass an entity
     * with that field unset.
     *
     * @throws java.util.NoSuchElementException if the parent app doesn't exist
     * @throws IllegalArgumentException         if a config already exists
     *         for ({@code appId}, {@code env.envName}) — use
     *         {@link #upsert(UUID, EnvironmentConfigEntity)} or
     *         {@link #update(UUID, UUID, EnvironmentConfigEntity)} instead
     */
    EnvironmentConfigEntity create(UUID appId, EnvironmentConfigEntity env);

    /**
     * Update an existing env config. Non-null fields on {@code patch}
     * replace the corresponding fields on the stored row; null fields
     * are left unchanged. The {@code id} on {@code patch} is ignored —
     * the path parameter wins.
     *
     * @throws java.util.NoSuchElementException if the env config doesn't exist
     * @throws IllegalArgumentException         if the env config doesn't
     *         belong to {@code appId}
     */
    EnvironmentConfigEntity update(UUID appId, UUID envConfigId, EnvironmentConfigEntity patch);

    /**
     * "Create or update". If an env config exists for ({@code appId},
     * {@code env.envName}), update its fields from {@code env}; otherwise
     * create a new row. Used by the deploy pipeline's "save these settings
     * as default" path (Phase 5.3).
     */
    EnvironmentConfigEntity upsert(UUID appId, EnvironmentConfigEntity env);

    /**
     * Delete an env config. Hard-delete is fine here — env configs are not
     * referenced from deployment history (deployments store {@code env_name}
     * by value, not {@code env_config_id}). The FK on
     * {@code deployments.env_config_id} is SET NULL on delete.
     *
     * <p>Idempotent: deleting a non-existent row is a no-op.
     *
     * @throws IllegalArgumentException if the env config exists but doesn't
     *         belong to {@code appId}
     */
    void delete(UUID appId, UUID envConfigId);
}
