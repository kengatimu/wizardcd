package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.persistence.entity.ConfigOverrideEntity;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Phase 5 §5.5 — the single API for managing rows in the
 * {@code config_overrides} table.
 *
 * <p>An override is a single key/value pair that mutates how the running
 * Spring Boot app behaves, without requiring a JAR rebuild. The §5.5 push
 * pipeline reads from this table to construct the YAML / properties files /
 * wrapper arguments that ship to the target.
 *
 * <p>All writes audit (via {@link AuditService}) and run inside the
 * caller's transaction. The value is NEVER logged — even non-sensitive
 * values can carry connection strings or other secrets we don't want
 * landing in audit_events rows.
 *
 * <h2>Uniqueness contract</h2>
 * Each (env_config_id, key) pair has at most one row — enforced both at
 * the DB level (V4 constraint {@code uq_config_overrides_env_key}) and at
 * the service level (pre-flight existence check in
 * {@link #create(UUID, ConfigOverrideEntity)} for clean error semantics).
 * Use {@link #upsert(UUID, ConfigOverrideEntity)} when you want
 * "create or update" behaviour instead.
 *
 * <h2>Pending flag</h2>
 * Newly-created and recently-edited overrides have {@code pending = true}.
 * Pending overrides appear in the App Detail UI with a yellow badge so
 * users see at a glance what hasn't been pushed yet. {@link #markPushed}
 * flips the flag — called by {@code ConfigPushService} (§5.5.2) after a
 * successful push.
 *
 * @see com.ebb.wizardcd.runner.persistence.entity.ConfigOverrideEntity
 * @see com.ebb.wizardcd.runner.persistence.repository.ConfigOverrideRepository
 */
public interface ConfigOverrideService {

    // ── Reads ──────────────────────────────────────────────────────────────

    /** Look up an override by primary key. */
    Optional<ConfigOverrideEntity> findById(UUID overrideId);

    /** All overrides for one env, sorted alphabetically by key. */
    List<ConfigOverrideEntity> findByEnv(UUID envConfigId);

    /** Pending-only overrides for one env — drives the push-live preview. */
    List<ConfigOverrideEntity> findPendingByEnv(UUID envConfigId);

    /** Count of pending overrides for an env — feeds the env-card "N pending" badge. */
    long countPendingByEnv(UUID envConfigId);

    // ── Writes ─────────────────────────────────────────────────────────────

    /**
     * Create a new override. The {@code envConfig} association is filled
     * by the service — callers can pass an entity with that field unset.
     *
     * @throws java.util.NoSuchElementException if the parent env config doesn't exist
     * @throws IllegalArgumentException         if an override already exists
     *         for ({@code envConfigId}, {@code patch.key}) — use
     *         {@link #upsert(UUID, ConfigOverrideEntity)} or
     *         {@link #update(UUID, ConfigOverrideEntity)} instead
     */
    ConfigOverrideEntity create(UUID envConfigId, ConfigOverrideEntity patch);

    /**
     * Update an existing override. Non-null fields on {@code patch}
     * replace the corresponding fields; null fields are left unchanged.
     * The {@code id} on {@code patch} is ignored — the path parameter wins.
     *
     * <p>Updating any field bumps {@code pending} back to true, so the
     * change becomes visible in the push-live preview.
     *
     * @throws java.util.NoSuchElementException if the override doesn't exist
     */
    ConfigOverrideEntity update(UUID overrideId, ConfigOverrideEntity patch);

    /**
     * "Create or update" by key. If an override exists for ({@code envConfigId},
     * {@code patch.key}), update it; otherwise create a new row. Same
     * pending-flip semantics as {@link #update}.
     */
    ConfigOverrideEntity upsert(UUID envConfigId, ConfigOverrideEntity patch);

    /**
     * Hard-delete an override. Idempotent — deleting a non-existent row is
     * a no-op. Note: this does NOT push the deletion to the live target.
     * The next push-live cycle observes the absence and removes it from
     * the live YAML (§5.5.2).
     */
    void delete(UUID overrideId);

    /**
     * Mark a set of overrides as pushed — flips {@code pending = false}
     * and sets {@code pushed_at = now}. Called by ConfigPushService on
     * successful push completion.
     */
    void markPushed(List<UUID> overrideIds);
}
