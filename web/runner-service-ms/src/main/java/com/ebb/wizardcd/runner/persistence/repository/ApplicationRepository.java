package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.enums.LiveConfigCapability;
import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link ApplicationEntity}.
 *
 * <h2>Soft-delete semantics</h2>
 * Phase 5 introduces a {@code deleted_at} column (V2 migration). The
 * default reads — {@code findById}, {@code findByName}, {@code findAll}
 * inherited from {@link JpaRepository} — still return ALL rows including
 * deleted ones. Callers (notably {@code ApplicationServiceImpl}) are
 * responsible for layering the "live-only" filter in the queries below.
 *
 * <p>Rationale: soft-delete-as-a-where-clause is the simplest model. We
 * don't add a {@code @SQLDelete} / {@code @Where(clause="deleted_at IS
 * NULL")} on the entity because:
 * <ul>
 *   <li>The {@code DeploymentPersistenceService} path needs to RESTORE
 *       archived apps when a deploy comes in for one (auto-resurrect).
 *       Globally-filtered reads would require {@code @SQLRestore} dances.</li>
 *   <li>Admin views (Phase 6+) need to see archived rows; explicit
 *       finder methods are clearer than {@code @Filter("includeDeleted")}.</li>
 * </ul>
 *
 * <p>CRUD inherited from {@link JpaRepository}: {@code save}, {@code findById},
 * {@code findAll}, {@code deleteById}, {@code count}, plus {@code Page<T>
 * findAll(Pageable)}.
 */
@Repository
public interface ApplicationRepository extends JpaRepository<ApplicationEntity, UUID> {

    // ── Name lookups ──────────────────────────────────────────────────────

    /**
     * Lookup an app by its unique name — INCLUDES archived rows.
     *
     * <p>The {@code applications.name} column has a UNIQUE constraint, so a
     * name lookup is ambiguous WITHOUT the archived row: a name "X" might
     * exist as a soft-deleted row, and a fresh create would collide. The
     * uniqueness includes deleted rows, so this finder must too.
     *
     * <p>The deploy pipeline (DeploymentPersistenceService) calls this and
     * auto-restores the row if it's archived — see {@code
     * ApplicationServiceImpl.findOrCreateByName}.
     */
    Optional<ApplicationEntity> findByName(String name);

    /** Existence check — INCLUDES archived rows (same reason as findByName). */
    boolean existsByName(String name);

    // ── Live (non-archived) reads ─────────────────────────────────────────

    /**
     * Live rows only, name ascending. Backs the Applications List page in
     * Phase 5.2.a. Soft-deleted rows are hidden by default.
     */
    List<ApplicationEntity> findByDeletedAtIsNullOrderByNameAsc();

    /**
     * Live row by id. Backs {@code GET /applications/:id} when the caller
     * has NOT requested archived rows.
     */
    Optional<ApplicationEntity> findByIdAndDeletedAtIsNull(UUID id);

    /**
     * Live row by name. Used by the controller's create-path duplicate check
     * (it's fine to reuse a name from an archived row — only live names
     * collide).
     */
    Optional<ApplicationEntity> findByNameAndDeletedAtIsNull(String name);

    /**
     * Count live apps. Backs the Dashboard summary widget and the empty-state
     * check on the Applications page.
     */
    long countByDeletedAtIsNull();

    // ── Capability snapshot (Phase 5.5 reads + writes) ────────────────────

    /**
     * Apps with a specific live-push capability. Used by the Applications
     * List page's "Live push: enabled" filter chip. Backed by
     * {@code idx_applications_capability}.
     */
    List<ApplicationEntity> findByLiveConfigCapabilityAndDeletedAtIsNullOrderByNameAsc(
            LiveConfigCapability capability);
}
