package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.dto.PathCheckResult;
import com.ebb.wizardcd.runner.dto.PreflightResult;
import com.ebb.wizardcd.runner.dto.SshTestResult;

import java.util.Map;

public interface SshKeyService {

    /**
     * Returns the per-environment ED25519 public keys as a map keyed by environment name.
     * Example: { "DEV": "ssh-ed25519 AAAA...wizardcd-dev@runner", "SIT": "...", "UAT": "...", "PROD": "..." }
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

    /**
     * Runs pre-flight checks on the target server before deployment:
     *   - SSH connectivity
     *   - Write permissions on targetBasePath
     *   - Disk space availability
     *   - Existing backup presence (last-successful)
     */
    PreflightResult runPreflight(String sshUser, String sshHost, int sshPort,
                                  String environment, String targetBasePath, String appName);

    /**
     * Checks the state of a deploy-target path on the remote server.
     *
     * <p>Fires from Step 2 of the New Deploy wizard the moment the user has
     * entered a DEPLOY PATH. The returned {@link PathCheckResult.Status} drives
     * the UI panel's colour and content:
     *
     * <ul>
     *   <li>{@code OK} — path exists, owned by {@code runAsUser} → green ✓, Next enabled</li>
     *   <li>{@code WRONG_OWNER} — exists, wrong owner → amber ⚠ + chown fix-command</li>
     *   <li>{@code MISSING} — doesn't exist, parent writable → blue ℹ "runner will create"</li>
     *   <li>{@code PARENT_NOT_WRITABLE} — doesn't exist, parent root-owned → amber ⚠ + sudo mkdir fix</li>
     *   <li>{@code INVALID_PATH} — client-side guard rejected (system dir, illegal chars)</li>
     *   <li>{@code UNREACHABLE} — SSH itself failed</li>
     * </ul>
     */
    PathCheckResult checkPath(String sshUser, String sshHost, int sshPort,
                              String environment, String runAsUser, String targetBasePath);
}
