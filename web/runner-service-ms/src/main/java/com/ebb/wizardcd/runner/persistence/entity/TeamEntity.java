package com.ebb.wizardcd.runner.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Phase 5 §5.6 — JPA entity for the {@code teams} table.
 *
 * <p>Sub-grouping within an {@link OrganizationEntity}. Team membership
 * lives in {@link TeamMemberEntity}; Phase 5 doesn't populate that yet
 * because users don't exist until Phase 6.
 *
 * <h2>Uniqueness</h2>
 * Team names are unique <em>within an org</em> (not globally). The DB
 * constraint {@code uq_teams_org_name} enforces this.
 *
 * @see com.ebb.wizardcd.runner.persistence.repository.TeamRepository
 */
@Entity
@Table(name = "teams")
public class TeamEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "org_id", nullable = false,
                foreignKey = @jakarta.persistence.ForeignKey(name = "fk_teams_org"))
    private OrganizationEntity organization;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    /** Required by Hibernate. */
    protected TeamEntity() {}

    public TeamEntity(UUID id, OrganizationEntity organization, String name, String description) {
        this.id = id;
        this.organization = organization;
        this.name = name;
        this.description = description;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public OrganizationEntity getOrganization() { return organization; }
    public void setOrganization(OrganizationEntity organization) { this.organization = organization; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    @Override
    public String toString() {
        return "TeamEntity{id=" + id + ", name='" + name + "'}";
    }
}
