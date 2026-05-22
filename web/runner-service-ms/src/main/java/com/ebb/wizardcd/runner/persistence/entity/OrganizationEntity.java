package com.ebb.wizardcd.runner.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

/**
 * Phase 5 §5.6 — JPA entity for the {@code organizations} table.
 *
 * <p>Top-level tenant boundary. Every {@link ApplicationEntity} belongs
 * to exactly one organization (FK NOT NULL).
 *
 * <h2>Single-org mode (Phase 5 default)</h2>
 * The V3 migration seeds one row with id {@link #DEFAULT_ORG_ID} and
 * slug {@code "default"}. All existing applications are back-filled to
 * that org during the migration. The Phase 5 UI never exposes an org
 * picker; admins rename the default org via Settings, that's it.
 *
 * <h2>Multi-org mode (Phase 15)</h2>
 * The same entity supports N organizations once billing + RBAC arrive.
 * No schema migration needed at that point — the column + FK are
 * already in place.
 *
 * @see com.ebb.wizardcd.runner.persistence.repository.OrganizationRepository
 */
@Entity
@Table(name = "organizations")
public class OrganizationEntity {

    /**
     * Deterministic UUID of the default organization seeded by V3.
     *
     * <p>Hard-coded (not random) so every environment — local dev, CI,
     * the runner VM — shares the same default-org id. The service layer
     * uses this constant when auto-assigning an org to a newly registered
     * application; tests use it when creating fixtures.
     *
     * <p>The literal {@code d0c1} mnemonic = "default org seed 1".
     */
    public static final UUID DEFAULT_ORG_ID =
            UUID.fromString("00000000-0000-0000-0000-00000000d0c1");

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    /** URL-friendly slug. UNIQUE. Phase 15 uses this as the org path segment. */
    @Column(name = "slug", nullable = false, unique = true, length = 100)
    private String slug;

    /** First user of the org. Set in Phase 6 after the OAuth flow lands. */
    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    /** Subscription plan. Phase 15 lights up plan-based feature gating. */
    @Column(name = "plan", nullable = false, length = 30)
    private String plan = "FREE";

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
    protected OrganizationEntity() {}

    public OrganizationEntity(UUID id, String name, String slug) {
        this.id = id;
        this.name = name;
        this.slug = slug;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public UUID getOwnerUserId() { return ownerUserId; }
    public void setOwnerUserId(UUID ownerUserId) { this.ownerUserId = ownerUserId; }

    public String getPlan() { return plan; }
    public void setPlan(String plan) { this.plan = plan; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    @Override
    public String toString() {
        return "OrganizationEntity{id=" + id + ", name='" + name + "', slug='" + slug + "'}";
    }
}
