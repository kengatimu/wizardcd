package com.ebb.wizardcd.runner.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Phase 5 §5.6 — JPA entity for the {@code team_members} join table.
 *
 * <p>Composite primary key on (team_id, user_id). The {@code user_id}
 * has no FK yet because the {@code users} table arrives in Phase 6;
 * a follow-up migration there adds the FK constraint.
 *
 * <p>This entity is defined now so the schema + entity layer are
 * complete in Phase 5 — but no service / controller exposes it until
 * Phase 6 (otherwise users would have to type raw UUIDs as members,
 * which violates §5.0 principle 1).
 *
 * @see com.ebb.wizardcd.runner.persistence.repository.TeamMemberRepository
 */
@Entity
@Table(name = "team_members")
public class TeamMemberEntity {

    @EmbeddedId
    private TeamMemberId id;

    /** MEMBER or LEAD. Future: ADMIN, VIEWER, etc. — see Phase 6 RBAC. */
    @Column(name = "role", nullable = false, length = 30)
    private String role = "MEMBER";

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    @PrePersist
    protected void onJoin() {
        if (joinedAt == null) joinedAt = Instant.now();
    }

    /** Required by Hibernate. */
    protected TeamMemberEntity() {}

    public TeamMemberEntity(UUID teamId, UUID userId, String role) {
        this.id = new TeamMemberId(teamId, userId);
        this.role = role;
    }

    public TeamMemberId getId() { return id; }
    public void setId(TeamMemberId id) { this.id = id; }

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }

    public Instant getJoinedAt() { return joinedAt; }
    public void setJoinedAt(Instant joinedAt) { this.joinedAt = joinedAt; }

    /** Composite-key holder. Implements equals/hashCode for the JPA contract. */
    @Embeddable
    public static class TeamMemberId implements Serializable {

        @Column(name = "team_id", nullable = false)
        private UUID teamId;

        @Column(name = "user_id", nullable = false)
        private UUID userId;

        protected TeamMemberId() {}

        public TeamMemberId(UUID teamId, UUID userId) {
            this.teamId = teamId;
            this.userId = userId;
        }

        public UUID getTeamId() { return teamId; }
        public UUID getUserId() { return userId; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof TeamMemberId other)) return false;
            return Objects.equals(teamId, other.teamId)
                && Objects.equals(userId, other.userId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(teamId, userId);
        }
    }
}
