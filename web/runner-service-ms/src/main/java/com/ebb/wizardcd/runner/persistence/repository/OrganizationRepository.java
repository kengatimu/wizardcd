package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Phase 5 §5.6 — Spring Data JPA repository for {@link OrganizationEntity}.
 *
 * <p>Most callers only ever need {@link #findById(Object)} with
 * {@link OrganizationEntity#DEFAULT_ORG_ID} (single-org mode). The slug
 * finder exists because Phase 15 multi-org routes URLs by slug.
 */
@Repository
public interface OrganizationRepository extends JpaRepository<OrganizationEntity, UUID> {

    Optional<OrganizationEntity> findBySlug(String slug);

    boolean existsBySlug(String slug);
}
