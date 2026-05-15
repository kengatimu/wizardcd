package com.ebb.wizardcd.runner.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity for the {@code deployments} table — the core history record for
 * every deploy / redeploy / rollback job ever submitted.
 *
 * <p>This entity replaces the file-based triplet
 * {@code status.json + metadata.json + request.json} that
 * {@code RunnerJobStateServiceImpl} writes today. Phase 4 Stage 4 introduces a
 * {@code DeploymentPersistenceService} that writes into this entity instead;
 * Stage 6's migration tool back-fills the table from existing workspace dirs.
 *
 * <p>{@code app_id} and {@code env_config_id} are nullable FKs with
 * {@code ON DELETE SET NULL} at the schema level (see V1__init_schema.sql)
 * so the deployment row survives even if the underlying app or env config is
 * later deleted. The denormalised {@code appName} + {@code envName} columns
 * preserve historical context in that case.
 *
 * <p>{@code config_snapshot} is a PostgreSQL JSONB column holding the full
 * serialised {@code DeploymentRequest} JSON. We deliberately store it as a
 * {@link String} (not a typed POJO) so future evolution of
 * {@code DeploymentRequest} doesn't break deserialisation of older rows.
 * The {@code @JdbcTypeCode(SqlTypes.JSON)} hint lets Hibernate marshal
 * String ↔ JSONB cleanly on PostgreSQL and falls back gracefully on H2 in
 * PG-compat mode for tests.
 *
 * @see com.ebb.wizardcd.runner.persistence.repository.DeploymentRepository
 */
@Entity
@Table(name = "deployments")
public class DeploymentEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** Nullable FK → applications. SET NULL on app delete. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "app_id")
    private ApplicationEntity application;

    /** Nullable FK → environment_configs. SET NULL on env config delete. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "env_config_id")
    private EnvironmentConfigEntity environmentConfig;

    /** Denormalised — preserves the name even if the parent application row is deleted. */
    @Column(name = "app_name", nullable = false, length = 100)
    private String appName;

    /** Denormalised — preserves the env name even if the env config row is deleted. */
    @Column(name = "env_name", nullable = false, length = 20)
    private String envName;

    /** {@code "deploy"} / {@code "redeploy"} / {@code "rollback"}. Defaults to deploy. */
    @Column(name = "job_type", nullable = false, length = 20)
    private String jobType = "deploy";

    /** Lifecycle state — see {@code JobStatus} enum for canonical values. */
    @Column(name = "status", nullable = false, length = 30)
    private String status;

    /**
     * Full {@code DeploymentRequest} JSON at time of deploy. Stored as raw text
     * to decouple persisted data from the current DTO shape.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "config_snapshot", columnDefinition = "jsonb")
    private String configSnapshot;

    @Column(name = "jar_name", length = 255)
    private String jarName;

    /** For redeploy/rollback: UUID of the original deployment this one was derived from. */
    @Column(name = "source_job_id")
    private UUID sourceJobId;

    /** Filesystem path to the job workspace directory (artifacts + logs live here). */
    @Column(name = "workspace_path", length = 500)
    private String workspacePath;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** Set when the job reaches a terminal state (SUCCESS / FAILED / ABORTED). */
    @Column(name = "completed_at")
    private Instant completedAt;

    /** User who triggered the job. NULL until Phase 6 auth. */
    @Column(name = "created_by", length = 255)
    private String createdBy;

    // ── JPA lifecycle callbacks ────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    // ── Constructors ───────────────────────────────────────────────────────

    /** Required by Hibernate. */
    protected DeploymentEntity() {}

    public DeploymentEntity(UUID id, String appName, String envName, String status) {
        this.id = id;
        this.appName = appName;
        this.envName = envName;
        this.status = status;
    }

    // ── Accessors ──────────────────────────────────────────────────────────

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public ApplicationEntity getApplication() { return application; }
    public void setApplication(ApplicationEntity application) { this.application = application; }

    public EnvironmentConfigEntity getEnvironmentConfig() { return environmentConfig; }
    public void setEnvironmentConfig(EnvironmentConfigEntity environmentConfig) { this.environmentConfig = environmentConfig; }

    public String getAppName() { return appName; }
    public void setAppName(String appName) { this.appName = appName; }

    public String getEnvName() { return envName; }
    public void setEnvName(String envName) { this.envName = envName; }

    public String getJobType() { return jobType; }
    public void setJobType(String jobType) { this.jobType = jobType; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getConfigSnapshot() { return configSnapshot; }
    public void setConfigSnapshot(String configSnapshot) { this.configSnapshot = configSnapshot; }

    public String getJarName() { return jarName; }
    public void setJarName(String jarName) { this.jarName = jarName; }

    public UUID getSourceJobId() { return sourceJobId; }
    public void setSourceJobId(UUID sourceJobId) { this.sourceJobId = sourceJobId; }

    public String getWorkspacePath() { return workspacePath; }
    public void setWorkspacePath(String workspacePath) { this.workspacePath = workspacePath; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    @Override
    public String toString() {
        return "DeploymentEntity{id=" + id
            + ", app='" + appName + "'"
            + ", env='" + envName + "'"
            + ", status='" + status + "'"
            + ", jobType='" + jobType + "'"
            + "}";
    }
}
