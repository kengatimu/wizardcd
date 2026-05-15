package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;

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

    /** Look up by primary key. Empty when not found (never throws). */
    Optional<ApplicationEntity> findById(UUID id);

    /** Look up by unique name. Empty when not found (never throws). */
    Optional<ApplicationEntity> findByName(String name);

    /** Cheap existence check — uses {@code SELECT 1 ...} without loading the row. */
    boolean existsByName(String name);

    /** All apps, ordered by name ascending (case-insensitive). */
    List<ApplicationEntity> findAll();

    /**
     * Case-insensitive substring search on {@code name}. Empty/blank query
     * returns the full list (treated as "no filter").
     *
     * <p>Phase 5 will swap this for a pageable / fuzzy implementation when
     * the app list grows; for now an in-memory filter on the {@code findAll}
     * result is plenty (the app registry is rarely more than a handful).
     */
    List<ApplicationEntity> search(String query);

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
     * Race-safe under concurrent writes thanks to the {@code UNIQUE(name)}
     * constraint — a duplicate insert will fail at the DB and the caller
     * can retry to fall through to the {@code findByName} branch.
     *
     * <p>This is the path the deploy pipeline takes — it should never reject
     * a deploy just because the user hasn't registered the app yet.
     */
    ApplicationEntity findOrCreateByName(String name, String description);

    /**
     * Update the {@code name} / {@code description} of an existing row.
     *
     * <p>Either field may be {@code null} to leave it unchanged. Renaming
     * fails fast if the new name collides with another app.
     *
     * @throws java.util.NoSuchElementException if no application with this id exists
     */
    ApplicationEntity update(UUID id, String newName, String newDescription);

    /**
     * Hard-delete an application row. Phase 5 will likely flip this to a
     * soft delete (with a {@code deleted_at} column) so deployment history
     * isn't orphaned; the API surface stays the same.
     *
     * @throws java.util.NoSuchElementException if no application with this id exists
     */
    void delete(UUID id);
}
