package com.ebb.wizardcd.runner.web.dto;

import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;

/**
 * Phase 5 §5.1 — request body for create / update of an environment config.
 *
 * <p>Field names match {@link EnvironmentConfigEntity} so the controller
 * conversion stays mechanical. Boxed types throughout so PUT can use
 * "null means don't change" semantics.
 *
 * <p>{@code id} is intentionally absent — the path parameter is the source
 * of truth on PUT. The service rejects requests where the body tries to
 * override it.
 */
public record EnvironmentConfigRequest(
        // Identity
        String  envName,           // DEV / SIT / UAT / PROD (auto-uppercased)

        // SSH target
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
        String  libPath,           // "" = fat JAR, "lib" = thin JAR

        // JVM heap + flags
        String  xms,
        String  xmx,
        String  extraJvmOpts,      // JSON array of strings

        // Logging rotation
        String  maxLogSize,
        Integer maxLogFiles,

        // Backup + stability
        Boolean performBackup,
        Integer maxBackups,
        Integer stabilityWindow,

        // Deployment strategy
        String  deploymentStrategy
) {

    /**
     * Build an EnvironmentConfigEntity from this request. The {@code id}
     * and {@code application} fields are intentionally left unset — the
     * service fills them in.
     */
    public EnvironmentConfigEntity toEntity() {
        EnvironmentConfigEntity e = new EnvironmentConfigEntity(
                null,    // id — service assigns
                null,    // application — service assigns
                envName != null ? envName : ""
        );
        e.setSshUser(sshUser);
        e.setSshHost(sshHost);
        if (sshPort != null)            e.setSshPort(sshPort);
        e.setJavaCommand(javaCommand);
        e.setJavaVersion(javaVersion);
        e.setTargetBasePath(targetBasePath);
        e.setRunAsUser(runAsUser);
        if (serverPort != null)         e.setServerPort(serverPort);
        e.setMainClass(mainClass);
        e.setJarName(jarName);
        if (libPath != null)            e.setLibPath(libPath);
        e.setXms(xms);
        e.setXmx(xmx);
        e.setExtraJvmOpts(extraJvmOpts);
        if (maxLogSize != null)         e.setMaxLogSize(maxLogSize);
        if (maxLogFiles != null)        e.setMaxLogFiles(maxLogFiles);
        if (performBackup != null)      e.setPerformBackup(performBackup);
        if (maxBackups != null)         e.setMaxBackups(maxBackups);
        if (stabilityWindow != null)    e.setStabilityWindow(stabilityWindow);
        if (deploymentStrategy != null) e.setDeploymentStrategy(deploymentStrategy);
        return e;
    }
}
