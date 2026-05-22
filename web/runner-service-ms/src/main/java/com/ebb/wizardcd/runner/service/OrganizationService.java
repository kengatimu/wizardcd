package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Phase 5 §5.6 — read + minimal-write surface over the
 * {@code organizations} table.
 *
 * <p>Phase 5 is single-org mode: the V3 migration seeds one row and the
 * UI exposes a single "Organization" panel under Settings where the
 * admin can rename it. No create / delete is exposed in Phase 5;
 * multi-org provisioning arrives in Phase 15 alongside billing.
 *
 * <p>{@link #findDefault()} is the canonical way to resolve "the org
 * everything currently belongs to". In Phase 15 the
 * {@code OrganizationContextHolder} will replace it for request-scoped
 * resolution.
 *
 * @see com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity
 * @see com.ebb.wizardcd.runner.persistence.repository.OrganizationRepository
 */
public interface OrganizationService {

    /** All orgs in the system, name ascending. Single-org → 1 row. */
    List<OrganizationEntity> findAll();

    /** Look up by id. Empty when missing. */
    Optional<OrganizationEntity> findById(UUID id);

    /** Look up by URL-friendly slug. Phase 15 routes URLs by slug. */
    Optional<OrganizationEntity> findBySlug(String slug);

    /**
     * Resolve the seeded default organization
     * ({@link OrganizationEntity#DEFAULT_ORG_ID}). Thrown
     * {@link IllegalStateException} on missing seed is treated as an
     * environment-setup bug — V3 migration didn't run.
     */
    OrganizationEntity findDefault();

    /**
     * Update name / slug / plan on an existing org. Any {@code null}
     * field on the patch leaves the corresponding column unchanged.
     * Slug uniqueness is checked when it actually changes.
     *
     * @throws java.util.NoSuchElementException if the id doesn't exist
     * @throws IllegalArgumentException         on blank name, slug
     *         collision, or plan outside the allowed set
     */
    OrganizationEntity update(UUID id, String newName, String newSlug, String newPlan);
}
