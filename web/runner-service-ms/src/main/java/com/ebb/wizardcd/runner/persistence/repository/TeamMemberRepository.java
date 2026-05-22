package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.persistence.entity.TeamMemberEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Phase 5 §5.6 — Spring Data JPA repository for {@link TeamMemberEntity}.
 *
 * <p>Defined now so the schema + entity layer is complete in Phase 5;
 * no service / controller wires it until Phase 6 (when users exist and
 * member management has somewhere meaningful to live).
 */
@Repository
public interface TeamMemberRepository
        extends JpaRepository<TeamMemberEntity, TeamMemberEntity.TeamMemberId> {
}
