package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.persistence.entity.TeamEntity;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Phase 5 §5.6 — CRUD over the {@code teams} table, scoped by organization.
 *
 * <p>Single-org mode hides team management from the Phase 5 UI (no
 * dropdown until there's more than one team). The service surface is
 * complete now so Phase 6 (auth + RBAC) can wire team-scoped visibility
 * without backend changes.
 *
 * <h2>Cross-org guard</h2>
 * Every write carries an {@code orgId} parameter that must match the
 * team's parent. {@code update} and {@code delete} reject cross-org
 * access with {@link IllegalArgumentException} — same pattern as
 * {@link EnvironmentConfigService}.
 *
 * @see com.ebb.wizardcd.runner.persistence.entity.TeamEntity
 * @see com.ebb.wizardcd.runner.persistence.repository.TeamRepository
 */
public interface TeamService {

    /** Teams in one org, name ascending. */
    List<TeamEntity> findByOrg(UUID orgId);

    /** Lookup by id. Empty when missing. */
    Optional<TeamEntity> findById(UUID teamId);

    /**
     * Create a team in {@code orgId}.
     *
     * @throws java.util.NoSuchElementException if the parent org doesn't exist
     * @throws IllegalArgumentException         on blank name or
     *                                          (org_id, name) collision
     */
    TeamEntity create(UUID orgId, String name, String description);

    /**
     * Rename / re-describe a team. {@code null} fields leave columns
     * unchanged.
     *
     * @throws java.util.NoSuchElementException if the team doesn't exist
     * @throws IllegalArgumentException         if the team doesn't belong
     *                                          to {@code orgId} or the new
     *                                          name collides within the org
     */
    TeamEntity update(UUID orgId, UUID teamId, String newName, String newDescription);

    /**
     * Delete a team. Cascades remove team_members rows (DB constraint);
     * any apps with {@code team_id} = this team have it set to NULL
     * (FK ON DELETE SET NULL).
     *
     * <p>Idempotent: deleting a non-existent row is a no-op.
     *
     * @throws IllegalArgumentException if the team exists but is in a
     *                                  different org
     */
    void delete(UUID orgId, UUID teamId);
}
