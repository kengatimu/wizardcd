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
 * JPA entity for the {@code applications} table.
 *
 * <p>One row per deployable application — the central registry the Phase 5 UI
 * hangs the "Applications" page off. Phase 4 inserts a row lazily on the first
 * deployment of a new {@code appName}.
 *
 * <p>UUID is application-managed (no {@code @GeneratedValue}). The runner
 * service generates the UUID via {@code UUID.randomUUID()} before persist,
 * matching the existing pattern in {@code RunnerServiceImpl.runDeploy()}.
 *
 * <p>{@code updatedAt} is auto-managed via {@link PrePersist} / {@link PreUpdate}
 * callbacks (we chose JPA callbacks over PL/pgSQL triggers in Stage 2 for
 * portability — see V1__init_schema.sql header).
 *
 * @see com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository
 */
@Entity
@Table(name = "applications")
public class ApplicationEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false, unique = true, length = 100)
    private String name;

    @Column(name = "description")
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ── JPA lifecycle callbacks ────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    // ── Constructors ───────────────────────────────────────────────────────

    /** Required by Hibernate. */
    protected ApplicationEntity() {}

    public ApplicationEntity(UUID id, String name, String description) {
        this.id = id;
        this.name = name;
        this.description = description;
    }

    // ── Accessors ──────────────────────────────────────────────────────────

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

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
        return "ApplicationEntity{id=" + id + ", name='" + name + "'}";
    }
}
