package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.dto.SshTestResult;

import java.util.Map;

public interface SshKeyService {

    /**
     * Returns the per-environment ED25519 public keys as a map keyed by environment name.
     * Example: { "SIT": "ssh-ed25519 AAAA...wizardcd-sit@runner", "UAT": "...", "PROD": "..." }
     * Keys are generated on first access and cached on the runner filesystem.
     */
    Map<String, String> getPublicKeys();

    /**
     * Returns the absolute path to the private key for the given environment.
     * The key is generated if it does not already exist.
     * Used by the YAML generation service to embed the correct key path in deployment configs.
     */
    String getPrivateKeyPath(String environment);

    /**
     * Tests SSH connectivity from the runner to the target server using the
     * environment-specific private key.
     */
    SshTestResult testConnection(String sshUser, String sshHost, int sshPort, String environment);
}
