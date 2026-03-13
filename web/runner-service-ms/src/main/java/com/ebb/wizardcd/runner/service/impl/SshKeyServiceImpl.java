package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.SshTestResult;
import com.ebb.wizardcd.runner.service.SshKeyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Manages per-environment ED25519 SSH key pairs for the runner service.
 *
 * Key pairs are stored at:
 *   ~/.ssh/wizardcd_sit_ed25519   (SIT)
 *   ~/.ssh/wizardcd_uat_ed25519   (UAT)
 *   ~/.ssh/wizardcd_prod_ed25519  (PROD)
 *
 * Keys are generated automatically on first access using ssh-keygen and are
 * intentionally not protected by a passphrase — the runner filesystem permissions
 * (chmod 600) are the primary access control.
 */
@Service
public class SshKeyServiceImpl implements SshKeyService {

    private static final Logger log = LoggerFactory.getLogger(SshKeyServiceImpl.class);

    // Environments for which keys are managed, in display order
    private static final List<String> ENVIRONMENTS = List.of("SIT", "UAT", "PROD");

    // SSH connection timeout passed to the ssh binary (-o ConnectTimeout)
    private static final int SSH_CONNECT_TIMEOUT_SECONDS = 10;

    // Hard wall-clock timeout for the whole ssh sub-process (avoids hang)
    private static final int SSH_PROCESS_TIMEOUT_SECONDS = 20;

    // ── Public API ────────────────────────────────────────────────────────────

    @Override
    public Map<String, String> getPublicKeys() {
        Map<String, String> keys = new LinkedHashMap<>();
        for (String env : ENVIRONMENTS) {
            try {
                ensureKeyExists(env);
                keys.put(env, readPublicKey(env));
            } catch (Exception e) {
                log.error("Failed to resolve public key for environment {}: {}", env, e.getMessage());
                // Return an empty string rather than omitting the environment entirely
                // so the UI can still display a placeholder for the key.
                keys.put(env, "");
            }
        }
        return keys;
    }

    @Override
    public String getPrivateKeyPath(String environment) {
        try {
            ensureKeyExists(environment);
        } catch (Exception e) {
            // Non-fatal: log and return the expected path anyway — the deploy.sh
            // script will fail with a meaningful error if the key is missing.
            log.warn("Could not ensure key exists for environment {}: {}", environment, e.getMessage());
        }
        return resolveKeyPath(environment);
    }

    @Override
    public SshTestResult testConnection(String sshUser, String sshHost, int sshPort, String environment) {
        try {
            ensureKeyExists(environment);
            String keyPath = resolveKeyPath(environment);

            ProcessBuilder pb = new ProcessBuilder(
                    "ssh",
                    "-i", keyPath,
                    "-o", "BatchMode=yes",                   // never prompt for password / passphrase
                    "-o", "StrictHostKeyChecking=accept-new", // auto-accept new hosts; reject changed keys
                    "-o", "ConnectTimeout=" + SSH_CONNECT_TIMEOUT_SECONDS,
                    "-p", String.valueOf(sshPort),
                    sshUser + "@" + sshHost,
                    "echo ok"
            );
            pb.redirectErrorStream(true); // merge stderr → stdout for easy capture

            Process process = pb.start();
            String output = new String(process.getInputStream().readAllBytes()).trim();
            boolean finished = process.waitFor(SSH_PROCESS_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            if (!finished) {
                process.destroyForcibly();
                return new SshTestResult(false,
                        "Connection timed out after " + SSH_CONNECT_TIMEOUT_SECONDS + " seconds.");
            }

            int exitCode = process.exitValue();
            if (exitCode == 0) {
                return new SshTestResult(true,
                        "Connection to " + sshUser + "@" + sshHost + ":" + sshPort + " successful.");
            }

            // Provide the raw ssh error output to help the user diagnose the problem
            String detail = output.isEmpty() ? "exit code " + exitCode : output;
            return new SshTestResult(false, "SSH connection failed: " + detail);

        } catch (Exception e) {
            log.error("SSH test connection failed for {}@{}:{} [env={}]: {}",
                    sshUser, sshHost, sshPort, environment, e.getMessage());
            return new SshTestResult(false, "Connection failed: " + e.getMessage());
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Returns the absolute path to the private key file for the given environment.
     * Example: /home/runner/.ssh/wizardcd_sit_ed25519
     */
    private String resolveKeyPath(String environment) {
        return System.getProperty("user.home")
                + "/.ssh/wizardcd_"
                + environment.toLowerCase()
                + "_ed25519";
    }

    /**
     * Generates the ED25519 key pair for the given environment if it does not
     * already exist. Synchronized to prevent concurrent generation of the same key.
     */
    private synchronized void ensureKeyExists(String environment) throws IOException, InterruptedException {
        String keyPath = resolveKeyPath(environment);
        Path keyFile   = Path.of(keyPath);

        if (Files.exists(keyFile)) {
            return; // key already present — nothing to generate
        }

        log.info("Generating ED25519 key pair for environment {} at {}", environment, keyPath);

        // Ensure ~/.ssh directory exists
        Files.createDirectories(keyFile.getParent());

        String comment = "wizardcd-" + environment.toLowerCase() + "@runner";

        Process keygen = new ProcessBuilder(
                "ssh-keygen",
                "-t", "ed25519",
                "-f", keyPath,
                "-N", "",       // no passphrase — key protected by filesystem permissions
                "-C", comment
        ).start();

        boolean done = keygen.waitFor(30, TimeUnit.SECONDS);
        if (!done || keygen.exitValue() != 0) {
            throw new IllegalStateException("ssh-keygen failed for environment " + environment
                    + " (exit=" + (done ? keygen.exitValue() : "timeout") + ")");
        }

        // Enforce correct permissions so SSH refuses to use a world-readable key
        new ProcessBuilder("chmod", "600", keyPath)
                .start().waitFor(5, TimeUnit.SECONDS);
        new ProcessBuilder("chmod", "700", keyFile.getParent().toString())
                .start().waitFor(5, TimeUnit.SECONDS);

        log.info("Key pair generated for environment {}. Public key: {}.pub", environment, keyPath);
    }

    /**
     * Reads and returns the public key content (single line, trimmed).
     */
    private String readPublicKey(String environment) throws IOException {
        String pubKeyPath = resolveKeyPath(environment) + ".pub";
        return Files.readString(Path.of(pubKeyPath)).trim();
    }
}
