package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.dto.SshTestRequest;
import com.ebb.wizardcd.runner.dto.SshTestResult;
import com.ebb.wizardcd.runner.service.SshKeyService;
import com.ebb.wizardcd.runner.service.impl.RunnerPublicIpResolver;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Exposes endpoints consumed by the WizardCD UI on the SSH Target step:
 *
 *   GET  /runner/info         — returns the runner's auto-detected public IP so the
 *                               user knows what IP to whitelist in their firewall.
 *
 *   GET  /runner/public-keys  — returns per-environment ED25519 public keys so the
 *                               user can authorise the runner on their target server.
 *
 *   POST /ssh/test            — tests SSH connectivity from the runner to the user's
 *                               target server using the environment-specific key.
 */
@RestController
public class SshController {

    private static final Logger log = LoggerFactory.getLogger(SshController.class);

    private final SshKeyService sshKeyService;
    private final RunnerPublicIpResolver publicIpResolver;

    public SshController(SshKeyService sshKeyService, RunnerPublicIpResolver publicIpResolver) {
        this.sshKeyService = sshKeyService;
        this.publicIpResolver = publicIpResolver;
    }

    // ── Response record ───────────────────────────────────────────

    record RunnerInfoResponse(String publicIp) {}

    /**
     * Returns the runner's public IP address (auto-detected at startup).
     * The UI uses this to display the IP the customer must whitelist in their
     * firewall before the SSH connection test can succeed.
     *
     * Response shape: { "publicIp": "54.144.235.55" }
     * (empty string if detection failed — UI handles this gracefully)
     */
    @GetMapping("/runner/info")
    public ResponseEntity<RunnerInfoResponse> getRunnerInfo() {
        log.info("Runner info request received");
        return ResponseEntity.ok(new RunnerInfoResponse(publicIpResolver.getPublicIp()));
    }

    /**
     * Returns the per-environment ED25519 public keys.
     * Keys are generated on demand if they don't exist yet.
     * Response shape: { "SIT": "ssh-ed25519 AAAA...", "UAT": "...", "PROD": "..." }
     */
    @GetMapping("/runner/public-keys")
    public ResponseEntity<Map<String, String>> getPublicKeys() {
        log.info("Public key request received");
        Map<String, String> keys = sshKeyService.getPublicKeys();
        return ResponseEntity.ok(keys);
    }

    /**
     * Tests SSH connectivity from the runner to the target server using the
     * environment-specific private key.
     * Returns { "success": true/false, "message": "..." }
     */
    @PostMapping("/ssh/test")
    public ResponseEntity<SshTestResult> testConnection(@RequestBody SshTestRequest request) {
        log.info("SSH test connection requested for {}@{}:{} [env={}]",
                request.getSshUser(), request.getSshHost(),
                request.getSshPort(), request.getEnvironment());

        SshTestResult result = sshKeyService.testConnection(
                request.getSshUser(),
                request.getSshHost(),
                request.getSshPort() != null ? request.getSshPort() : 22,
                request.getEnvironment()
        );

        log.info("SSH test result for {}@{}: success={}, message={}",
                request.getSshUser(), request.getSshHost(),
                result.isSuccess(), result.getMessage());

        return ResponseEntity.ok(result);
    }
}
