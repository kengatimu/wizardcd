package com.ebb.wizardcd.runner.persistence.entity;

import com.ebb.wizardcd.runner.enums.ConfigInjectionMethod;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity for the {@code config_overrides} table — Phase 5 §5.5.
 *
 * <p>One row per (env_config, key) pair. Owned by an {@link EnvironmentConfigEntity};
 * cascading delete from the env config side. See the V4 migration header
 * comment for the full schema rationale.
 *
 * <p>This is the central data structure for Live Config Push — every override
 * the user creates in the UI is a row here, and the push pipeline reads from
 * this table to construct the YAML / properties files / wrapper arguments
 * that ship to the target.
 */
@Entity
@Table(
    name = "config_overrides",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_config_overrides_env_key",
        columnNames = {"env_config_id", "override_key"}
    )
)
public class ConfigOverrideEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** Owning env config. ON DELETE CASCADE on the DB side. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "env_config_id", nullable = false)
    private EnvironmentConfigEntity envConfig;

    @Column(name = "override_key", nullable = false, length = 255)
    private String key;

    @Column(name = "override_value", nullable = false, columnDefinition = "TEXT")
    private String value;

    @Enumerated(EnumType.STRING)
    @Column(name = "injection_method", nullable = false, length = 30)
    private ConfigInjectionMethod injectionMethod = ConfigInjectionMethod.YAML_OVERRIDE;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /**
     * UI masking flag. Phase 7 will replace this with real secret-management
     * (encrypted at rest, provider-backed). For now: presentation-only — the
     * value is still stored plaintext. {@link com.ebb.wizardcd.runner.service.audit.AuditAction}
     * never logs the value (sensitive or not) regardless of this flag.
     */
    @Column(name = "is_sensitive", nullable = false)
    private Boolean isSensitive = Boolean.FALSE;

    /**
     * TRUE until this override has been pushed to the live target. UI shows
     * the "pending" badge on the env card whenever any override is pending.
     */
    @Column(name = "pending", nullable = false)
    private Boolean pending = Boolean.TRUE;

    /** Last successful push timestamp. NULL until first push. */
    @Column(name = "pushed_at")
    private Instant pushedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ── JPA lifecycle callbacks ──────────────────────────────────────────

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

    // ── Constructors ──────────────────────────────────────────────────────

    /** Required by Hibernate. */
    protected ConfigOverrideEntity() {}

    public ConfigOverrideEntity(UUID id, EnvironmentConfigEntity envConfig,
                                 String key, String value) {
        this.id = id;
        this.envConfig = envConfig;
        this.key = key;
        this.value = value;
    }

    // ── Accessors ─────────────────────────────────────────────────────────

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public EnvironmentConfigEntity getEnvConfig() { return envConfig; }
    public void setEnvConfig(EnvironmentConfigEntity envConfig) { this.envConfig = envConfig; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }

    public ConfigInjectionMethod getInjectionMethod() { return injectionMethod; }
    public void setInjectionMethod(ConfigInjectionMethod injectionMethod) { this.injectionMethod = injectionMethod; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public Boolean getIsSensitive() { return isSensitive; }
    public void setIsSensitive(Boolean isSensitive) { this.isSensitive = isSensitive; }

    public Boolean getPending() { return pending; }
    public void setPending(Boolean pending) { this.pending = pending; }

    public Instant getPushedAt() { return pushedAt; }
    public void setPushedAt(Instant pushedAt) { this.pushedAt = pushedAt; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    @Override
    public String toString() {
        return "ConfigOverrideEntity{id=" + id + ", key='" + key + "', pending=" + pending + "}";
    }
}
