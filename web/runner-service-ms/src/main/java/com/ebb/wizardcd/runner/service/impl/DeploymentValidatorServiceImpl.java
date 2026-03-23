package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.DeploymentRequest;
import com.ebb.wizardcd.runner.service.DeploymentValidatorService;
import org.springframework.stereotype.Service;

@Service
public class DeploymentValidatorServiceImpl implements DeploymentValidatorService {

    @Override
    public void validate(DeploymentRequest request) {

        if (request == null) {
            throw new IllegalArgumentException("Deployment request must not be null");
        }

        // -----------------------------
        // Application identity
        // -----------------------------
        if (isBlank(request.getAppName())) {
            throw new IllegalArgumentException("appName must not be blank");
        }

        if (isBlank(request.getEnvironment())) {
            throw new IllegalArgumentException("environment must not be blank");
        }

        if (isBlank(request.getMainClass())) {
            throw new IllegalArgumentException("mainClass must not be blank");
        }

        if (isBlank(request.getJarName())) {
            throw new IllegalArgumentException("jarName must not be blank");
        }

        // -----------------------------
        // Java runtime
        // -----------------------------
        if (isBlank(request.getJavaCommand())) {
            throw new IllegalArgumentException("javaCommand must not be blank");
        }

        if (request.getJavaVersion() == null || request.getJavaVersion() <= 0) {
            throw new IllegalArgumentException("javaVersion must be positive");
        }

        // -----------------------------
        // Runtime configuration
        // -----------------------------
        if (request.getServerPort() == null || request.getServerPort() <= 0 || request.getServerPort() > 65535) {
            throw new IllegalArgumentException("serverPort must be between 1 and 65535");
        }

        if (isBlank(request.getRunAsUser())) {
            throw new IllegalArgumentException("runAsUser must not be blank");
        }

        if (isBlank(request.getTargetBasePath())) {
            throw new IllegalArgumentException("targetBasePath must not be blank");
        }

        // -----------------------------
        // SSH target
        // -----------------------------
        if (isBlank(request.getSshUser())) {
            throw new IllegalArgumentException("sshUser must not be blank");
        }

        if (isBlank(request.getSshHost())) {
            throw new IllegalArgumentException("sshHost must not be blank");
        }

        if (request.getSshPort() == null || request.getSshPort() <= 0 || request.getSshPort() > 65535) {
            throw new IllegalArgumentException("sshPort must be between 1 and 65535");
        }

        // privateKeyPath is resolved server-side from the environment field — never from the client.

        // -----------------------------
        // JVM configuration
        // -----------------------------
        // xms and xmx are OPTIONAL — empty/null means the JVM uses ergonomic defaults.
        // The Tanuki wrapper conf generator (generate-tanuki-wrapper-conf.sh) already
        // handles empty values by simply not emitting -Xms/-Xmx flags.
        // When provided, validate format (e.g. "512m", "2g")
        if (!isBlank(request.getXms()) && !isValidHeapSize(request.getXms())) {
            throw new IllegalArgumentException("xms has invalid format — use e.g. 512m, 1g");
        }
        if (!isBlank(request.getXmx()) && !isValidHeapSize(request.getXmx())) {
            throw new IllegalArgumentException("xmx has invalid format — use e.g. 512m, 2g");
        }

        // newRatio is OPTIONAL — always empty in current UI (modern GCs self-tune).
        // extraOpts are OPTIONAL — validated by frontend (must start with '-').

        // -----------------------------
        // Logging
        // -----------------------------
        if (isBlank(request.getMaxLogSize())) {
            throw new IllegalArgumentException("maxLogSize must not be blank");
        }

        if (request.getMaxLogFiles() == null || request.getMaxLogFiles() <= 0) {
            throw new IllegalArgumentException("maxLogFiles must be positive");
        }

        // -----------------------------
        // Backup
        // -----------------------------
        if (Boolean.TRUE.equals(request.getPerformBackup())) {
            if (request.getMaxBackups() == null || request.getMaxBackups() <= 0) {
                throw new IllegalArgumentException("maxBackups must be positive when performBackup is true");
            }
        }

        // -----------------------------
        // Deployment options
        // -----------------------------
        if (request.getStabilityWindow() != null) {
            if (request.getStabilityWindow() < 5 || request.getStabilityWindow() > 120) {
                throw new IllegalArgumentException("stabilityWindow must be between 5 and 120 seconds");
            }
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /**
     * Validates JVM heap size format: number followed by m, M, g, or G.
     * Examples: "512m", "2G", "1024M", "4g"
     */
    private boolean isValidHeapSize(String size) {
        return size.matches("^\\d+[mMgG]$");
    }
}
