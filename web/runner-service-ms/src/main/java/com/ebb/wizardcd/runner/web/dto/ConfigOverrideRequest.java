package com.ebb.wizardcd.runner.web.dto;

import com.ebb.wizardcd.runner.enums.ConfigInjectionMethod;
import com.ebb.wizardcd.runner.persistence.entity.ConfigOverrideEntity;

/**
 * Request body for POST/PUT config-override endpoints — Phase 5 §5.5.
 *
 * <p>Every field is optional. POST validates that {@code key} and
 * {@code value} are present and non-blank; PUT treats nulls as "leave
 * unchanged" so partial updates are first-class (matches the EnvConfig
 * upsert pattern).
 */
public class ConfigOverrideRequest {

    private String key;
    private String value;
    private ConfigInjectionMethod injectionMethod;
    private String description;
    private Boolean isSensitive;

    public ConfigOverrideRequest() {}

    /**
     * Build a {@link ConfigOverrideEntity} from this request. The
     * {@code id} and {@code envConfig} fields are intentionally left
     * unset — the service fills them in. Nulls are preserved (PUT-as-patch
     * semantics — service-layer {@code applyPatch} skips null fields).
     */
    public ConfigOverrideEntity toEntity() {
        ConfigOverrideEntity e = new ConfigOverrideEntity(
                null,        // id — service assigns on POST, path-param wins on PUT
                null,        // envConfig — service resolves from path parameter
                key,         // may be null on PUT
                value        // may be null on PUT (service rejects null on POST)
        );
        if (injectionMethod != null) e.setInjectionMethod(injectionMethod);
        if (description     != null) e.setDescription(description);
        if (isSensitive     != null) e.setIsSensitive(isSensitive);
        return e;
    }

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
}
