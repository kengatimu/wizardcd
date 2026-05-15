package com.ebb.wizardcd.runner.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * JPA entity for the {@code deployment_states} table — the append-only state
 * transition log for a deployment.
 *
 * <p>One row is inserted per state change. Sorting by {@code timestamp}
 * reconstructs the lifecycle:
 * {@code CREATED → VALIDATING → PREPARING_WORKSPACE → RUNNING → SUCCESS|FAILED|ABORTED}.
 *
 * <p>This entity replaces the {@code stateHistory} JSON array embedded in the
 * old file-based {@code status.json}. Storing transitions as rows enables
 * indexed time-range queries (e.g. "average RUNNING duration last 7 days")
 * that the JSON array could not support.
 *
 * <p>{@code id} is a {@code BIGSERIAL} primary key — auto-incrementing bigint
 * managed by PostgreSQL. We map it with
 * {@link GenerationType#IDENTITY} which Hibernate translates to the right
 * sequence/identity strategy per database.
 *
 * @see com.ebb.wizardcd.runner.persistence.repository.DeploymentStateRepository
 */
@Entity
@Table(name = "deployment_states")
public class DeploymentStateEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false, updatable = false)
    private Long id;

    /** Parent deployment. ON DELETE CASCADE at the DB level. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "deployment_id", nullable = false)
    private DeploymentEntity deployment;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "timestamp", nullable = false)
    private Instant timestamp;

    // ── JPA lifecycle callbacks ────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        if (timestamp == null) {
            timestamp = Instant.now();
        }
    }

    // ── Constructors ───────────────────────────────────────────────────────

    /** Required by Hibernate. */
    protected DeploymentStateEntity() {}

    public DeploymentStateEntity(DeploymentEntity deployment, String status) {
        this.deployment = deployment;
        this.status = status;
    }

    public DeploymentStateEntity(DeploymentEntity deployment, String status, Instant timestamp) {
        this.deployment = deployment;
        this.status = status;
        this.timestamp = timestamp;
    }

    // ── Accessors ──────────────────────────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public DeploymentEntity getDeployment() { return deployment; }
    public void setDeployment(DeploymentEntity deployment) { this.deployment = deployment; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getTimestamp() { return timestamp; }
    public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }

    @Override
    public String toString() {
        return "DeploymentStateEntity{id=" + id
            + ", deploymentId=" + (deployment != null ? deployment.getId() : null)
            + ", status='" + status + "'"
            + ", at=" + timestamp
            + "}";
    }
}
