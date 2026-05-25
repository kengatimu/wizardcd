package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.enums.ConfigInjectionMethod;
import com.ebb.wizardcd.runner.persistence.entity.ConfigOverrideEntity;
import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;
import com.ebb.wizardcd.runner.persistence.repository.ConfigOverrideRepository;
import com.ebb.wizardcd.runner.persistence.repository.EnvironmentConfigRepository;
import com.ebb.wizardcd.runner.service.AuditService;
import com.ebb.wizardcd.runner.service.ConfigOverrideService;
import com.ebb.wizardcd.runner.service.audit.AuditAction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/**
 * Default {@link ConfigOverrideService} implementation — Phase 5 §5.5.
 *
 * <p>Mirrors the {@link EnvironmentConfigServiceImpl} shape: pre-flight
 * validation, audit on every write, all reads run in read-only
 * transactions. The value field is NEVER passed into audit details —
 * even non-sensitive overrides can carry connection strings or other
 * secrets we don't want landing in audit_events.
 */
@Service
public class ConfigOverrideServiceImpl implements ConfigOverrideService {

    private static final Logger log = LoggerFactory.getLogger(ConfigOverrideServiceImpl.class);

    private final ConfigOverrideRepository overrideRepo;
    private final EnvironmentConfigRepository envRepo;
    private final AuditService auditService;

    public ConfigOverrideServiceImpl(ConfigOverrideRepository overrideRepo,
                                      EnvironmentConfigRepository envRepo,
                                      AuditService auditService) {
        this.overrideRepo = overrideRepo;
        this.envRepo = envRepo;
        this.auditService = auditService;
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public Optional<ConfigOverrideEntity> findById(UUID overrideId) {
        if (overrideId == null) return Optional.empty();
        return overrideRepo.findById(overrideId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ConfigOverrideEntity> findByEnv(UUID envConfigId) {
        if (envConfigId == null) return List.of();
        return overrideRepo.findByEnvConfig_IdOrderByKey(envConfigId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ConfigOverrideEntity> findPendingByEnv(UUID envConfigId) {
        if (envConfigId == null) return List.of();
        return overrideRepo.findByEnvConfig_IdAndPendingTrue(envConfigId);
    }

    @Override
    @Transactional(readOnly = true)
    public long countPendingByEnv(UUID envConfigId) {
        if (envConfigId == null) return 0;
        return overrideRepo.countByEnvConfig_IdAndPendingTrue(envConfigId);
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public ConfigOverrideEntity create(UUID envConfigId, ConfigOverrideEntity patch) {
        validatePresent(patch);
        EnvironmentConfigEntity env = loadEnv(envConfigId);
        String key = patch.getKey().trim();

        if (overrideRepo.existsByEnvConfig_IdAndKey(envConfigId, key)) {
            throw new IllegalArgumentException(
                    "Config override already exists for key '" + key + "' on env '"
                  + env.getEnvName() + "' — use PUT to update it");
        }

        patch.setId(patch.getId() != null ? patch.getId() : UUID.randomUUID());
        patch.setEnvConfig(env);
        patch.setKey(key);
        defaultsForNewRow(patch);
        ConfigOverrideEntity saved = overrideRepo.save(patch);

        auditOverrideAction(AuditAction.CONFIG_OVERRIDE_CREATED, env, saved);
        log.info("Config override created id={} env={} key={}",
                saved.getId(), env.getEnvName(), saved.getKey());
        return saved;
    }

    @Override
    @Transactional
    public ConfigOverrideEntity update(UUID overrideId, ConfigOverrideEntity patch) {
        ConfigOverrideEntity existing = overrideRepo.findById(overrideId)
                .orElseThrow(() -> new NoSuchElementException(
                        "No config override with id " + overrideId));

        // Track whether anything that affects the running app actually changed.
        // Pure description / is_sensitive edits don't bump pending — they only
        // affect the UI presentation, not the live runtime.
        boolean liveChange =
            (patch.getKey() != null && !patch.getKey().equals(existing.getKey())) ||
            (patch.getValue() != null && !patch.getValue().equals(existing.getValue())) ||
            (patch.getInjectionMethod() != null && patch.getInjectionMethod() != existing.getInjectionMethod());

        applyPatch(existing, patch);
        if (liveChange) {
            existing.setPending(Boolean.TRUE);
        }
        ConfigOverrideEntity saved = overrideRepo.save(existing);

        auditOverrideAction(AuditAction.CONFIG_OVERRIDE_UPDATED, existing.getEnvConfig(), saved);
        log.info("Config override updated id={} env={} key={} liveChange={}",
                saved.getId(), saved.getEnvConfig().getEnvName(), saved.getKey(), liveChange);
        return saved;
    }

    @Override
    @Transactional
    public ConfigOverrideEntity upsert(UUID envConfigId, ConfigOverrideEntity patch) {
        validatePresent(patch);
        String key = patch.getKey().trim();
        Optional<ConfigOverrideEntity> existing =
                overrideRepo.findByEnvConfig_IdAndKey(envConfigId, key);
        if (existing.isPresent()) {
            return update(existing.get().getId(), patch);
        }
        return create(envConfigId, patch);
    }

    @Override
    @Transactional
    public void delete(UUID overrideId) {
        Optional<ConfigOverrideEntity> maybe = overrideRepo.findById(overrideId);
        if (maybe.isEmpty()) {
            return;   // idempotent
        }
        ConfigOverrideEntity existing = maybe.get();
        EnvironmentConfigEntity env = existing.getEnvConfig();
        String key = existing.getKey();

        overrideRepo.delete(existing);

        Map<String, Object> details = new HashMap<>();
        details.put("overrideId",      overrideId.toString());
        details.put("envConfigId",     env.getId().toString());
        details.put("envName",         env.getEnvName());
        details.put("key",             key);
        details.put("injectionMethod", existing.getInjectionMethod().name());
        // VALUE intentionally omitted — see service-level Javadoc
        auditService.record(
                AuditAction.CONFIG_OVERRIDE_DELETED,
                env.getApplication().getName() + "/" + env.getEnvName(),
                details,
                null   // created_by — Phase 6 will fill from auth context
        );

        log.info("Config override deleted id={} env={} key={}",
                overrideId, env.getEnvName(), key);
    }

    @Override
    @Transactional
    public void markPushed(List<UUID> overrideIds) {
        if (overrideIds == null || overrideIds.isEmpty()) return;
        Instant now = Instant.now();
        List<ConfigOverrideEntity> rows = overrideRepo.findAllById(overrideIds);
        for (ConfigOverrideEntity row : rows) {
            row.setPending(Boolean.FALSE);
            row.setPushedAt(now);
        }
        overrideRepo.saveAll(rows);
        log.debug("Marked {} overrides as pushed", rows.size());
    }

    // ── Internal ──────────────────────────────────────────────────────────

    private EnvironmentConfigEntity loadEnv(UUID envConfigId) {
        return envRepo.findById(envConfigId).orElseThrow(
                () -> new NoSuchElementException("No env config with id " + envConfigId));
    }

    private static void validatePresent(ConfigOverrideEntity p) {
        if (p == null) {
            throw new IllegalArgumentException("config override must not be null");
        }
        if (p.getKey() == null || p.getKey().isBlank()) {
            throw new IllegalArgumentException("key must not be blank");
        }
        if (p.getValue() == null) {
            // empty string is valid (matches Spring Boot semantics); null is not
            throw new IllegalArgumentException("value must not be null (empty string is OK)");
        }
        if (p.getKey().length() > 255) {
            throw new IllegalArgumentException("key length must not exceed 255 chars");
        }
    }

    private static void defaultsForNewRow(ConfigOverrideEntity row) {
        if (row.getInjectionMethod() == null) {
            row.setInjectionMethod(ConfigInjectionMethod.YAML_OVERRIDE);
        }
        if (row.getIsSensitive() == null) {
            row.setIsSensitive(Boolean.FALSE);
        }
        if (row.getPending() == null) {
            row.setPending(Boolean.TRUE);
        }
    }

    /** PUT semantics: non-null fields on the patch overwrite; null = leave alone. */
    private static void applyPatch(ConfigOverrideEntity existing, ConfigOverrideEntity patch) {
        if (patch.getKey()             != null) existing.setKey(patch.getKey().trim());
        if (patch.getValue()           != null) existing.setValue(patch.getValue());
        if (patch.getInjectionMethod() != null) existing.setInjectionMethod(patch.getInjectionMethod());
        if (patch.getDescription()     != null) existing.setDescription(patch.getDescription());
        if (patch.getIsSensitive()     != null) existing.setIsSensitive(patch.getIsSensitive());
    }

    private void auditOverrideAction(String action,
                                     EnvironmentConfigEntity env,
                                     ConfigOverrideEntity row) {
        Map<String, Object> details = new HashMap<>();
        details.put("overrideId",       row.getId().toString());
        details.put("envConfigId",      env.getId().toString());
        details.put("envName",          env.getEnvName());
        details.put("key",              row.getKey());
        details.put("injectionMethod",  row.getInjectionMethod().name());
        details.put("isSensitive",      row.getIsSensitive());
        // VALUE intentionally omitted from audit details — see Javadoc
        auditService.record(
                action,
                env.getApplication().getName() + "/" + env.getEnvName(),
                details,
                null   // created_by — Phase 6 will fill from auth context
        );
    }
}
