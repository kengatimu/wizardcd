package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.persistence.entity.TeamEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Phase 5 §5.6 — Spring Data JPA repository for {@link TeamEntity}.
 *
 * <p>Teams are scoped by organization; every read/write through the
 * service layer carries an {@code orgId} so cross-org access can't leak.
 */
@Repository
public interface TeamRepository extends JpaRepository<TeamEntity, UUID> {

    /** All teams in one org, name ascending. */
    List<TeamEntity> findByOrganization_IdOrderByNameAsc(UUID orgId);

    /** Lookup by (org, name) — DB has UNIQUE(org_id, name). */
    Optional<TeamEntity> findByOrganization_IdAndName(UUID orgId, String name);

    /** Existence check for rename / create collision. */
    boolean existsByOrganization_IdAndName(UUID orgId, String name);
}
