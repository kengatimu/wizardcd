package com.ebb.wizardcd.runner.web.dto;

import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;

import java.time.Instant;
import java.util.UUID;

/**
 * Phase 5 §5.1 — wire-format response for environment config endpoints
 * and inside {@link ApplicationResponse#environments()}.
 *
 * <p>Decoupled from {@link EnvironmentConfigEntity} for the same reasons
 * {@link ApplicationResponse} is decoupled from
 * {@link com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity}.
 * Notably it does NOT expose the {@code application} association — the
 * parent app's id is on the URL (path parameter), and including it here
 * would just double-encode the relationship.
 */
public record EnvironmentConfigResponse(
        UUID    id,
        UUID    appId,

        String  envName,

        // SSH
        String  sshUser,
        String  sshHost,
        Integer sshPort,

        // Java runtime
        String  javaCommand,
        String  javaVersion,

        // Filesystem / process
        String  targetBasePath,
        String  runAsUser,
        Integer serverPort,
        String  mainClass,
        String  jarName,
        String  libPath,

        // JVM
        String  xms,
        String  xmx,
        String  extraJvmOpts,

        // Logging
        String  maxLogSize,
        Integer maxLogFiles,

        // Backup + stability
        Boolean performBackup,
        Integer maxBackups,
        Integer stabilityWindow,

        // Strategy
        String  deploymentStrategy,

        Instant createdAt,
        Instant updatedAt
) {

    public static EnvironmentConfigResponse from(EnvironmentConfigEntity e) {
        return new EnvironmentConfigResponse(
                e.getId(),
                e.getApplication() != null ? e.getApplication().getId() : null,
                e.getEnvName(),
                e.getSshUser(),
                e.getSshHost(),
                e.getSshPort(),
                e.getJavaCommand(),
                e.getJavaVersion(),
                e.getTargetBasePath(),
                e.getRunAsUser(),
                e.getServerPort(),
                e.getMainClass(),
                e.getJarName(),
                e.getLibPath(),
                e.getXms(),
                e.getXmx(),
                e.getExtraJvmOpts(),
                e.getMaxLogSize(),
                e.getMaxLogFiles(),
                e.getPerformBackup(),
                e.getMaxBackups(),
                e.getStabilityWindow(),
                e.getDeploymentStrategy(),
                e.getCreatedAt(),
                e.getUpdatedAt()
        );
    }
}
