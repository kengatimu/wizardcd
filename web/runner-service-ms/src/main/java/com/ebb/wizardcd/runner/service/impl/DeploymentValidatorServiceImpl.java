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
        // Identity validation
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

        // -----------------------------
        // Java configuration validation
        // -----------------------------
        if (isBlank(request.getJavaCommand())) {
            throw new IllegalArgumentException("javaCommand must not be blank");
        }

        if (request.getJavaVersion() == null || request.getJavaVersion() <= 0) {
            throw new IllegalArgumentException("javaVersion must be positive");
        }

        // -----------------------------
        // Runtime validation
        // -----------------------------
        if (request.getServerPort() == null || request.getServerPort() <= 0 || request.getServerPort() > 65535) {
            throw new IllegalArgumentException("serverPort must be between 1 and 65535");
        }

        // -----------------------------
        // SSH validation
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

        // privateKeyPath is no longer supplied by the client — the runner resolves the
        // per-environment key automatically via SshKeyService.

        // -----------------------------
        // Backup validation
        // -----------------------------
        if (Boolean.TRUE.equals(request.getPerformBackup())) {
            if (request.getMaxBackups() == null || request.getMaxBackups() <= 0) {
                throw new IllegalArgumentException("maxBackups must be positive when performBackup is true");
            }
        }

        // -----------------------------
        // JVM memory sanity check
        // -----------------------------
        if (isBlank(request.getXms()) || isBlank(request.getXmx())) {
            throw new IllegalArgumentException("xms and xmx must not be blank");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}