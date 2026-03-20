package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.SshTestResult;
import com.ebb.wizardcd.runner.service.SshKeyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

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
                List<String> javaInstallations = detectJavaInstallations(
                        keyPath, sshUser, sshHost, sshPort);
                return new SshTestResult(true,
                        "Connection to " + sshUser + "@" + sshHost + ":" + sshPort + " successful.",
                        javaInstallations);
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
     * Runs a second SSH command on a successfully connected server to find Java binary paths.
     * Uses {@code find} across common JVM installation directories.
     * Returns an empty list if nothing is found or if the detection command fails —
     * this is non-fatal; the user can still enter the path manually.
     */
    private List<String> detectJavaInstallations(String keyPath, String sshUser,
                                                  String sshHost, int sshPort) {
        try {
            ProcessBuilder pb = new ProcessBuilder(
                    "ssh",
                    "-i", keyPath,
                    "-o", "BatchMode=yes",
                    "-o", "StrictHostKeyChecking=accept-new",
                    "-o", "ConnectTimeout=" + SSH_CONNECT_TIMEOUT_SECONDS,
                    "-p", String.valueOf(sshPort),
                    sshUser + "@" + sshHost,
                    // Cross-distro Java discovery:
                    //   -xtype f   = follow symlinks (critical — many distros use symlinked java binaries)
                    //   Covers: Debian/Ubuntu, RHEL/CentOS/Rocky/Alma, Fedora, Alpine, Arch, SDKMAN, JAVA_HOME
                    "{ " +
                    // 1. Deep find in every known JVM root across all major Linux distros
                    //    Debian/Ubuntu: /usr/lib/jvm/  |  RHEL: /usr/java/ /usr/lib/jvm/
                    //    Alpine: /usr/lib/jvm/  |  Arch: /usr/lib/jvm/
                    //    Tarball installs: /opt/java /opt/jdk /opt/jdk-* /usr/local/java /usr/local/jdk
                    //    Adoptium/Temurin: /opt/adoptium* /opt/temurin*  |  Corretto: /opt/amazon-corretto*
                    "find /usr/lib/jvm /usr/local/lib/jvm" +
                    " /usr/java /usr/local/java /usr/local/jdk" +
                    " /opt/java /opt/jdk /opt/jdk-* /opt/jre /opt/jre-*" +
                    " /opt/temurin* /opt/adoptium* /opt/amazon-corretto*" +
                    " /opt/zulu* /opt/graalvm* /opt/sapmachine*" +
                    " /app/java /usr/local/bin" +
                    " -xtype f -name java 2>/dev/null; " +
                    // 2. Debian/Ubuntu/Fedora/RHEL: both tool names resolve to same database
                    "update-alternatives --list java 2>/dev/null; " +
                    "alternatives --list java 2>/dev/null | awk 'NR>1{print $1}' 2>/dev/null; " +
                    // 3. Resolve /usr/bin/java + /usr/local/bin/java symlinks to real binary path
                    "for __b in /usr/bin/java /usr/local/bin/java; do " +
                    "  test -e \"$__b\" && readlink -f \"$__b\" 2>/dev/null; " +
                    "done; " +
                    // 4. SDKMAN-managed installs (any distro)
                    "test -d \"$HOME/.sdkman/candidates/java\" && " +
                    "  find \"$HOME/.sdkman/candidates/java\" -xtype f -name java -maxdepth 6 2>/dev/null; " +
                    // 5. JAVA_HOME env var (set by user profile or system-wide /etc/environment)
                    "test -n \"$JAVA_HOME\" && test -x \"$JAVA_HOME/bin/java\" && echo \"$JAVA_HOME/bin/java\"; " +
                    // 6. SCL (Software Collections) on RHEL/CentOS — e.g. /opt/rh/java-17-openjdk/root/...
                    "find /opt/rh -xtype f -name java -path '*/bin/java' 2>/dev/null; " +
                    "} 2>/dev/null | grep '/java$' | sort -u"
            );
            pb.redirectErrorStream(true);

            Process process = pb.start();
            String output = new String(process.getInputStream().readAllBytes()).trim();
            process.waitFor(SSH_PROCESS_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            if (output.isEmpty()) return List.of();

            return Arrays.stream(output.split("\n"))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty() && s.endsWith("/java"))
                    .distinct()
                    .collect(Collectors.toList());

        } catch (Exception e) {
            log.warn("Java detection failed for {}@{}:{}: {}", sshUser, sshHost, sshPort, e.getMessage());
            return List.of();
        }
    }

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
