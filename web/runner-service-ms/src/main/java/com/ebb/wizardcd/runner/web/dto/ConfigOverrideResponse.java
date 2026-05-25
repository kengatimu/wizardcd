package com.ebb.wizardcd.runner.web.dto;

import com.ebb.wizardcd.runner.enums.ConfigInjectionMethod;
import com.ebb.wizardcd.runner.persistence.entity.ConfigOverrideEntity;

import java.time.Instant;
import java.util.UUID;

/**
 * Response shape for config-override endpoints — Phase 5 §5.5.
 *
 * <p>Mirrored on the frontend as the {@code ConfigOverride} TypeScript
 * interface. Crucially, this DTO never masks the value — the UI is
 * responsible for that based on {@link #isSensitive}. Masking on the
 * wire would block legitimate admin Copy actions and break the "view
 * the change before pushing" affordance.
 *
 * <p>Phase 7 (secret management) will introduce a separate sensitive-
 * value flow where the value is encrypted at rest and only decrypted
 * for authorised callers.
 */
public class ConfigOverrideResponse {

    private UUID id;
    private UUID envConfigId;
    private String key;
    private String value;
    private ConfigInjectionMethod injectionMethod;
    private String description;
    private Boolean isSensitive;
    private Boolean pending;
    private Instant pushedAt;
    private Instant createdAt;
    private Instant updatedAt;

    public ConfigOverrideResponse() {}

    public static ConfigOverrideResponse from(ConfigOverrideEntity e) {
        ConfigOverrideResponse r = new ConfigOverrideResponse();
        r.id              = e.getId();
        r.envConfigId     = e.getEnvConfig() != null ? e.getEnvConfig().getId() : null;
        r.key             = e.getKey();
        r.value           = e.getValue();
        r.injectionMethod = e.getInjectionMethod();
        r.description     = e.getDescription();
        r.isSensitive     = e.getIsSensitive();
        r.pending         = e.getPending();
        r.pushedAt        = e.getPushedAt();
        r.createdAt       = e.getCreatedAt();
        r.updatedAt       = e.getUpdatedAt();
        return r;
    }

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public UUID getEnvConfigId() { return envConfigId; }
    public void setEnvConfigId(UUID envConfigId) { this.envConfigId = envConfigId; }

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
}
