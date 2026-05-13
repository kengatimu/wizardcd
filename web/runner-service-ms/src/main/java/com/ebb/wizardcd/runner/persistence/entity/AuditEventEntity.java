package com.ebb.wizardcd.runner.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

/**
 * JPA entity for the {@code audit_events} table — append-only platform audit
 * log for cross-cutting actions.
 *
 * <p>Captures any noteworthy event (DEPLOY / REDEPLOY / ROLLBACK / ABORT /
 * CONFIG_CHANGE / USER_LOGIN-once-Phase-6-lands / etc.). Independent of the
 * {@link DeploymentEntity} table — an audit row survives even if the
 * referenced deployment is later deleted. No foreign keys are intentional.
 *
 * <p>Phase 11.5 introduces hash-chaining of audit rows for tamper detection;
 * the existing columns are forward-compatible (no schema change needed at
 * that point — a sidecar table holds chain hashes).
 *
 * <p>{@code details} is JSONB to allow per-action free-form payloads (e.g. a
 * DEPLOY event records the appName/env/triggeredBy; a CONFIG_CHANGE records
 * the before/after diff). Stored as raw String so action schemas can evolve
 * independently.
 *
 * @see com.ebb.wizardcd.runner.persistence.repository.AuditEventRepository
 */
@Entity
@Table(name = "audit_events")
public class AuditEventEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    /** High-level action type — DEPLOY, REDEPLOY, ROLLBACK, ABORT, CONFIG_CHANGE, ... */
    @Column(name = "action", nullable = false, length = 50)
    private String action;

    /** Free-form resource identifier this action targeted, e.g. "{@code <app>/<env>}" or a job UUID. */
    @Column(name = "resource", length = 100)
    private String resource;

    /** Per-action detail payload (JSONB). Schema varies by action type. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "details", columnDefinition = "jsonb")
    private String details;

    /** User who triggered the action. NULL until Phase 6 auth. */
    @Column(name = "created_by", length = 255)
    private String createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    // ── JPA lifecycle callbacks ────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    // ── Constructors ───────────────────────────────────────────────────────

    /** Required by Hibernate. */
    protected AuditEventEntity() {}

    public AuditEventEntity(String action, String resource, String details, String createdBy) {
        this.action = action;
        this.resource = resource;
        this.details = details;
        this.createdBy = createdBy;
    }

    // ── Accessors ──────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getResource() { return resource; }
    public void setResource(String resource) { this.resource = resource; }

    public String getDetails() { return details; }
    public void setDetails(String details) { this.details = details; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    @Override
    public String toString() {
        return "AuditEventEntity{id=" + id
            + ", action='" + action + "'"
            + ", resource='" + resource + "'"
            + ", at=" + createdAt
            + "}";
    }
}
