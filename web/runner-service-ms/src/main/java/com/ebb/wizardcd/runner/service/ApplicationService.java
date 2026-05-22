package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.enums.LiveConfigCapability;
import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Phase 4 — the single API for managing rows in the {@code applications}
 * table. Wraps {@link com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository}
 * with explicit CRUD semantics, name validation, and "find-or-create"
 * upsert behaviour that the deploy pipeline depends on.
 *
 * <p>The {@code applications} row is the central registry hung off by:
 * <ul>
 *   <li><b>Phase 4</b> — auto-upserted by {@link DeploymentPersistenceService}
 *       on every deploy (so the dashboard "filter by app" and Application
 *       page work without manual registration).</li>
 *   <li><b>Phase 5</b> — exposed through a REST controller so users can
 *       explicitly create / rename / describe / delete apps from the UI.</li>
 *   <li><b>Phase 6</b> — gains an {@code owner_user_id} column and the
 *       service will start scoping listings by the caller.</li>
 * </ul>
 *
 * <p>All write methods are transactional. Reads are read-only transactions
 * to avoid Hibernate flush overhead.
 *
 * @see com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity
 * @see com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository
 */
public interface ApplicationService {

    // ── Reads ──────────────────────────────────────────────────────────────
    //
    // Default reads filter OUT soft-deleted rows. The "...IncludingDeleted"
    // variants exist for admin-style views (the future Phase 6+ "Archived"
    // tab on the Applications page) and for the deploy pipeline's
    // findOrCreateByName auto-resurrect path.

    /** Look up a LIVE app by id. Soft-deleted rows return empty. */
    Optional<ApplicationEntity> findById(UUID id);

    /** Look up by id INCLUDING soft-deleted rows. Admin / undo path. */
    Optional<ApplicationEntity> findByIdIncludingDeleted(UUID id);

    /** Look up a LIVE app by unique name. Soft-deleted rows return empty. */
    Optional<ApplicationEntity> findByName(String name);

    /**
     * Look up by name INCLUDING soft-deleted rows. Used by the deploy
     * pipeline to auto-resurrect an archived app when a deploy targets it.
     */
    Optional<ApplicationEntity> findByNameIncludingDeleted(String name);

    /**
     * Cheap existence check — INCLUDES archived rows. Because the
     * {@code name} column has a UNIQUE constraint across all rows
     * (deleted or not), a duplicate-name check must too.
     */
    boolean existsByName(String name);

    /** All LIVE apps, name ascending. Backs the Applications List page. */
    List<ApplicationEntity> findAll();

    /**
     * Case-insensitive substring search on LIVE app names. Empty / blank
     * query returns the full live list (treated as "no filter").
     */
    List<ApplicationEntity> search(String query);

    /** Apps with the given live-push capability. Backs §5.2.a filter chips. */
    List<ApplicationEntity> findByCapability(LiveConfigCapability capability);

    /** Count of LIVE apps. Powers the Dashboard summary widget. */
    long countLive();

    // ── Writes ─────────────────────────────────────────────────────────────

    /**
     * Create a brand-new application row. Fails fast if an app with the same
     * name already exists — callers that want upsert behaviour should use
     * {@link #findOrCreateByName(String, String)} instead.
     *
     * @throws IllegalArgumentException if {@code name} is blank or already
     *         exists (the unique constraint would also catch this at flush
     *         time, but raising here gives a cleaner error message).
     */
    ApplicationEntity create(String name, String description);

    /**
     * Find an application by name; create it lazily if it doesn't exist yet.
     * If a SOFT-DELETED row exists with this name, it is auto-resurrected
     * (deleted_at cleared) — a deploy targeting an archived app means the
     * user is using it again.
     *
     * <p>Race-safe under concurrent writes thanks to the {@code UNIQUE(name)}
     * constraint.
     *
     * <p>This is the path the deploy pipeline takes — it should never reject
     * a deploy just because the user hasn't registered the app yet.
     */
    ApplicationEntity findOrCreateByName(String name, String description);

    /**
     * Update the {@code name} / {@code description} of an existing row.
     * Works on archived rows too (admin can rename an archived app).
     *
     * <p>Either field may be {@code null} to leave it unchanged. Renaming
     * fails fast if the new name collides with another app.
     *
     * @throws java.util.NoSuchElementException if no application with this id exists
     */
    ApplicationEntity update(UUID id, String newName, String newDescription);

    /**
     * Soft-delete an application — sets {@code deleted_at = now()}. The row
     * stays in the DB so deploy history references survive. The UI hides it
     * from list/get and offers an Undo affordance for 5 s (toast pattern).
     *
     * <p>Idempotent: deleting an already-archived row is a no-op.
     *
     * @throws java.util.NoSuchElementException if no application with this id exists
     */
    void delete(UUID id);

    /**
     * Restore a soft-deleted application — clears {@code deleted_at}. Used
     * by the toast Undo and by {@link #findOrCreateByName(String, String)}'s
     * auto-resurrect path.
     *
     * <p>Idempotent: restoring a live row is a no-op.
     *
     * @throws java.util.NoSuchElementException if no application with this id exists
     */
    ApplicationEntity restore(UUID id);

    // ── Capability snapshot (Phase 5.5 — runtime probe writer) ────────────

    /**
     * Persist the latest live-push capability probe result. Called by the
     * {@code LiveConfigCapabilityProbe} immediately after every deploy's
     * stability check passes. The {@code capability_last_checked} column
     * is set to {@code now}. Details payload is stored as JSONB; pass
     * {@code null} when no enrichment data is available.
     *
     * @throws java.util.NoSuchElementException if no application with this id exists
     */
    ApplicationEntity recordCapability(UUID id,
                                       LiveConfigCapability capability,
                                       String detailsJson,
                                       Instant probedAt);
}
