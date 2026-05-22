package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;
import com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository;
import com.ebb.wizardcd.runner.persistence.repository.EnvironmentConfigRepository;
import com.ebb.wizardcd.runner.service.AuditService;
import com.ebb.wizardcd.runner.service.EnvironmentConfigService;
import com.ebb.wizardcd.runner.service.audit.AuditAction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/**
 * Default {@link EnvironmentConfigService} implementation.
 *
 * <p>Validation contract: callers pass the entity fully populated (or
 * partially for {@link #update}); we don't have a separate DTO at this
 * layer — the REST controllers convert their request bodies before
 * calling in. The entity's JPA-level NOT NULL constraints catch missing
 * required fields at flush time; we add a pre-flight check for the
 * (app_id, env_name) uniqueness so callers get a clean
 * {@link IllegalArgumentException} instead of an opaque DB exception.
 *
 * <p>All writes audit. Action types come from {@link AuditAction}.
 */
@Service
public class EnvironmentConfigServiceImpl implements EnvironmentConfigService {

    private static final Logger log = LoggerFactory.getLogger(EnvironmentConfigServiceImpl.class);

    private final EnvironmentConfigRepository envRepo;
    private final ApplicationRepository applicationRepo;
    private final AuditService auditService;

    public EnvironmentConfigServiceImpl(EnvironmentConfigRepository envRepo,
                                        ApplicationRepository applicationRepo,
                                        AuditService auditService) {
        this.envRepo = envRepo;
        this.applicationRepo = applicationRepo;
        this.auditService = auditService;
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public Optional<EnvironmentConfigEntity> findById(UUID envConfigId) {
        if (envConfigId == null) return Optional.empty();
        return envRepo.findById(envConfigId);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<EnvironmentConfigEntity> findByAppAndEnv(UUID appId, String envName) {
        if (appId == null || envName == null || envName.isBlank()) return Optional.empty();
        return envRepo.findByApplication_IdAndEnvName(appId, envName.trim().toUpperCase());
    }

    @Override
    @Transactional(readOnly = true)
    public List<EnvironmentConfigEntity> findByApp(UUID appId) {
        if (appId == null) return List.of();
        return envRepo.findByApplication_IdOrderByEnvName(appId);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByAppAndEnv(UUID appId, String envName) {
        if (appId == null || envName == null || envName.isBlank()) return false;
        return envRepo.existsByApplication_IdAndEnvName(appId, envName.trim().toUpperCase());
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public EnvironmentConfigEntity create(UUID appId, EnvironmentConfigEntity env) {
        validatePresent(env);
        String envName = normaliseEnvName(env.getEnvName());

        ApplicationEntity app = loadApp(appId);

        if (envRepo.existsByApplication_IdAndEnvName(appId, envName)) {
            throw new IllegalArgumentException(
                    "Environment config already exists for app '" + app.getName()
                  + "' and env '" + envName + "' — use PUT to update it");
        }

        env.setId(env.getId() != null ? env.getId() : UUID.randomUUID());
        env.setApplication(app);
        env.setEnvName(envName);
        EnvironmentConfigEntity saved = envRepo.save(env);

        auditEnvAction(AuditAction.ENV_CONFIG_CREATED, app, saved);
        log.info("Env config created id={} app={}/{}",
                saved.getId(), app.getName(), saved.getEnvName());
        return saved;
    }

    @Override
    @Transactional
    public EnvironmentConfigEntity update(UUID appId,
                                          UUID envConfigId,
                                          EnvironmentConfigEntity patch) {
        ApplicationEntity app = loadApp(appId);
        EnvironmentConfigEntity existing = envRepo.findById(envConfigId)
                .orElseThrow(() -> new NoSuchElementException(
                        "No env config with id " + envConfigId));

        if (!existing.getApplication().getId().equals(appId)) {
            throw new IllegalArgumentException(
                    "Env config " + envConfigId + " does not belong to application " + appId);
        }

        applyPatch(existing, patch);
        EnvironmentConfigEntity saved = envRepo.save(existing);

        auditEnvAction(AuditAction.ENV_CONFIG_UPDATED, app, saved);
        log.info("Env config updated id={} app={}/{}",
                saved.getId(), app.getName(), saved.getEnvName());
        return saved;
    }

    @Override
    @Transactional
    public EnvironmentConfigEntity upsert(UUID appId, EnvironmentConfigEntity env) {
        validatePresent(env);
        String envName = normaliseEnvName(env.getEnvName());

        Optional<EnvironmentConfigEntity> existing =
                envRepo.findByApplication_IdAndEnvName(appId, envName);
        if (existing.isPresent()) {
            return update(appId, existing.get().getId(), env);
        }
        return create(appId, env);
    }

    @Override
    @Transactional
    public void delete(UUID appId, UUID envConfigId) {
        Optional<EnvironmentConfigEntity> maybe = envRepo.findById(envConfigId);
        if (maybe.isEmpty()) {
            return;   // idempotent — nothing to delete
        }
        EnvironmentConfigEntity existing = maybe.get();
        if (!existing.getApplication().getId().equals(appId)) {
            throw new IllegalArgumentException(
                    "Env config " + envConfigId + " does not belong to application " + appId);
        }

        // Capture identifying fields BEFORE the row vanishes, so the audit
        // row has meaningful resource + details.
        ApplicationEntity app = existing.getApplication();
        String envName = existing.getEnvName();

        envRepo.delete(existing);

        Map<String, Object> details = new HashMap<>();
        details.put("envConfigId", envConfigId.toString());
        details.put("appName",     app.getName());
        details.put("envName",     envName);
        auditService.record(
                AuditAction.ENV_CONFIG_DELETED,
                app.getName() + "/" + envName,
                details,
                null   // created_by — Phase 6 will fill from auth context
        );

        log.info("Env config deleted id={} app={}/{}",
                envConfigId, app.getName(), envName);
    }

    // ── Internal ───────────────────────────────────────────────────────────

    private ApplicationEntity loadApp(UUID appId) {
        return applicationRepo.findByIdAndDeletedAtIsNull(appId).orElseThrow(
                () -> new NoSuchElementException("No application with id " + appId));
    }

    private static void validatePresent(EnvironmentConfigEntity env) {
        if (env == null) {
            throw new IllegalArgumentException("environment config must not be null");
        }
        if (env.getEnvName() == null || env.getEnvName().isBlank()) {
            throw new IllegalArgumentException("envName must not be blank");
        }
        if (env.getSshHost() == null || env.getSshHost().isBlank()) {
            throw new IllegalArgumentException("sshHost must not be blank");
        }
        if (env.getSshUser() == null || env.getSshUser().isBlank()) {
            throw new IllegalArgumentException("sshUser must not be blank");
        }
        if (env.getJavaCommand() == null || env.getJavaCommand().isBlank()) {
            throw new IllegalArgumentException("javaCommand must not be blank");
        }
        if (env.getTargetBasePath() == null || env.getTargetBasePath().isBlank()) {
            throw new IllegalArgumentException("targetBasePath must not be blank");
        }
        if (env.getRunAsUser() == null || env.getRunAsUser().isBlank()) {
            throw new IllegalArgumentException("runAsUser must not be blank");
        }
        if (env.getServerPort() == null || env.getServerPort() <= 0) {
            throw new IllegalArgumentException("serverPort must be positive");
        }
    }

    /** Uppercased, trimmed env name. Standardises DEV / SIT / UAT / PROD. */
    private static String normaliseEnvName(String envName) {
        return envName.trim().toUpperCase();
    }

    /**
     * Copy non-null fields from {@code patch} onto {@code existing}.
     * Null fields are skipped — partial updates leave unmentioned columns
     * unchanged. {@code id} and {@code application} are never modified.
     */
    private static void applyPatch(EnvironmentConfigEntity existing,
                                   EnvironmentConfigEntity patch) {
        if (patch == null) return;
        if (patch.getEnvName() != null)         existing.setEnvName(normaliseEnvName(patch.getEnvName()));
        if (patch.getSshUser() != null)         existing.setSshUser(patch.getSshUser());
        if (patch.getSshHost() != null)         existing.setSshHost(patch.getSshHost());
        if (patch.getSshPort() != null)         existing.setSshPort(patch.getSshPort());
        if (patch.getJavaCommand() != null)     existing.setJavaCommand(patch.getJavaCommand());
        if (patch.getJavaVersion() != null)     existing.setJavaVersion(patch.getJavaVersion());
        if (patch.getTargetBasePath() != null)  existing.setTargetBasePath(patch.getTargetBasePath());
        if (patch.getRunAsUser() != null)       existing.setRunAsUser(patch.getRunAsUser());
        if (patch.getServerPort() != null)      existing.setServerPort(patch.getServerPort());
        if (patch.getMainClass() != null)       existing.setMainClass(patch.getMainClass());
        if (patch.getJarName() != null)         existing.setJarName(patch.getJarName());
        if (patch.getLibPath() != null)         existing.setLibPath(patch.getLibPath());
        if (patch.getXms() != null)             existing.setXms(patch.getXms());
        if (patch.getXmx() != null)             existing.setXmx(patch.getXmx());
        if (patch.getExtraJvmOpts() != null)    existing.setExtraJvmOpts(patch.getExtraJvmOpts());
        if (patch.getMaxLogSize() != null)      existing.setMaxLogSize(patch.getMaxLogSize());
        if (patch.getMaxLogFiles() != null)     existing.setMaxLogFiles(patch.getMaxLogFiles());
        if (patch.getPerformBackup() != null)   existing.setPerformBackup(patch.getPerformBackup());
        if (patch.getMaxBackups() != null)      existing.setMaxBackups(patch.getMaxBackups());
        if (patch.getStabilityWindow() != null) existing.setStabilityWindow(patch.getStabilityWindow());
        if (patch.getDeploymentStrategy() != null) existing.setDeploymentStrategy(patch.getDeploymentStrategy());
    }

    /** Common audit emission used by create / update. */
    private void auditEnvAction(String action,
                                ApplicationEntity app,
                                EnvironmentConfigEntity env) {
        Map<String, Object> details = new HashMap<>();
        details.put("envConfigId", env.getId().toString());
        details.put("appName",     app.getName());
        details.put("envName",     env.getEnvName());
        details.put("sshHost",     env.getSshHost());
        details.put("sshPort",     env.getSshPort());
        details.put("javaCommand", env.getJavaCommand());
        auditService.record(
                action,
                app.getName() + "/" + env.getEnvName(),
                details,
                null   // created_by — Phase 6
        );
    }
}
