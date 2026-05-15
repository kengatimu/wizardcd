package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.PathCheckResult;
import com.ebb.wizardcd.runner.dto.PreflightResult;
import com.ebb.wizardcd.runner.dto.SshTestResult;
import com.ebb.wizardcd.runner.service.SshKeyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
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
    private static final List<String> ENVIRONMENTS = List.of("DEV", "SIT", "UAT", "PROD");

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

    @Override
    public PreflightResult runPreflight(String sshUser, String sshHost, int sshPort,
                                         String environment, String targetBasePath, String appName) {
        try {
            ensureKeyExists(environment);
            String keyPath = resolveKeyPath(environment);

            // Build the app deployment path
            String appPath = targetBasePath + "/" + appName;
            String lastSuccessfulDir = appPath + "/backup/last-successful";
            String lastSuccessfulFile = lastSuccessfulDir + "/latest.tar.gz";
            String releasesDir = appPath + "/backup/releases";

            // Single SSH command that checks everything at once:
            //   1. Write permissions — mirrors application-deployment.sh create_dir() logic:
            //      - If appPath exists: check writable
            //      - If basePath exists but appPath doesn't: check basePath writable (can create appPath)
            //      - If neither exists: walk up to nearest existing parent, check writable OR sudo mkdir
            //   2. Disk space (df -h on nearest existing path)
            //   3. Backup existence + timestamp
            String checkScript = String.join("; ",
                    // Permissions: thorough check matching application-deployment.sh create_dir() behavior
                    // Check 3 levels: appPath, basePath, nearest existing parent
                    // Also tests sudo mkdir capability (application-deployment.sh falls back to sudo)
                    "APP_PATH='" + appPath + "'; " +
                    "BASE_PATH='" + targetBasePath + "'; " +
                    "if [ -d \"$APP_PATH\" ] && [ -w \"$APP_PATH\" ]; then " +
                    "  echo 'PERM:WRITABLE:existing'; " +
                    "elif [ -d \"$BASE_PATH\" ] && [ -w \"$BASE_PATH\" ]; then " +
                    "  echo 'PERM:WRITABLE:parent_writable'; " +
                    "elif [ -d \"$BASE_PATH\" ] && sudo -n mkdir -p \"$APP_PATH\" 2>/dev/null; then " +
                    // sudo mkdir succeeded — clean up the test dir
                    "  sudo -n rmdir \"$APP_PATH\" 2>/dev/null; " +
                    "  echo 'PERM:WRITABLE:sudo_available'; " +
                    "elif [ ! -d \"$BASE_PATH\" ]; then " +
                    // basePath doesn't exist — walk up to nearest existing parent
                    "  CHECK_DIR=\"$BASE_PATH\"; " +
                    "  while [ ! -d \"$CHECK_DIR\" ] && [ \"$CHECK_DIR\" != '/' ]; do CHECK_DIR=$(dirname \"$CHECK_DIR\"); done; " +
                    "  if [ -w \"$CHECK_DIR\" ]; then echo 'PERM:WRITABLE:parent_chain'; " +
                    "  elif sudo -n mkdir -p \"$BASE_PATH\" 2>/dev/null; then " +
                    "    sudo -n rmdir \"$BASE_PATH\" 2>/dev/null; " +
                    "    echo 'PERM:WRITABLE:sudo_available'; " +
                    "  else echo 'PERM:NOT_WRITABLE'; fi; " +
                    "else echo 'PERM:NOT_WRITABLE'; fi",

                    // Disk space: df on basePath or nearest existing parent
                    "DF_PATH='" + targetBasePath + "'; " +
                    "while [ ! -d \"$DF_PATH\" ] && [ \"$DF_PATH\" != '/' ]; do DF_PATH=$(dirname \"$DF_PATH\"); done; " +
                    "df -h \"$DF_PATH\" 2>/dev/null | awk 'NR==2{print \"DISK:\" $4 \":\" $5}' || echo 'DISK:unknown:unknown'",

                    // Backup: check both backup locations (last-successful preferred, then releases)
                    // 1. last-successful/latest.tar.gz — protected rollback copy (created after successful deploy)
                    // 2. backup/releases/*.tar.gz — rotated release backups (created before each deploy)
                    "LAST_SUCCESSFUL='" + lastSuccessfulFile + "'; " +
                    "RELEASES_DIR='" + releasesDir + "'; " +
                    "if [ -f \"$LAST_SUCCESSFUL\" ]; then " +
                    "  echo \"BACKUP:LAST_SUCCESSFUL:$(stat -c '%Y' \"$LAST_SUCCESSFUL\" 2>/dev/null || stat -f '%m' \"$LAST_SUCCESSFUL\" 2>/dev/null):" + lastSuccessfulDir + "\"; " +
                    "fi; " +
                    // Also check releases dir — count files and get latest timestamp
                    "if [ -d \"$RELEASES_DIR\" ]; then " +
                    "  RELEASE_COUNT=$(ls -1 \"$RELEASES_DIR\"/*.tar.gz 2>/dev/null | wc -l); " +
                    "  if [ \"$RELEASE_COUNT\" -gt 0 ]; then " +
                    "    LATEST_RELEASE=$(ls -1t \"$RELEASES_DIR\"/*.tar.gz 2>/dev/null | head -1); " +
                    "    echo \"BACKUP:RELEASES:${RELEASE_COUNT}:$(stat -c '%Y' \"$LATEST_RELEASE\" 2>/dev/null || stat -f '%m' \"$LATEST_RELEASE\" 2>/dev/null):" + releasesDir + "\"; " +
                    "  else echo 'BACKUP:RELEASES:0'; fi; " +
                    "else echo 'BACKUP:RELEASES:0'; fi; " +
                    // If neither exists
                    "if [ ! -f \"$LAST_SUCCESSFUL\" ] && { [ ! -d \"$RELEASES_DIR\" ] || [ $(ls -1 \"$RELEASES_DIR\"/*.tar.gz 2>/dev/null | wc -l) -eq 0 ]; }; then " +
                    "  echo 'BACKUP:NONE'; " +
                    "fi"
            );

            ProcessBuilder pb = new ProcessBuilder(
                    "ssh",
                    "-i", keyPath,
                    "-o", "BatchMode=yes",
                    "-o", "StrictHostKeyChecking=accept-new",
                    "-o", "ConnectTimeout=" + SSH_CONNECT_TIMEOUT_SECONDS,
                    "-p", String.valueOf(sshPort),
                    sshUser + "@" + sshHost,
                    checkScript
            );
            pb.redirectErrorStream(true);

            Process process = pb.start();
            String output = new String(process.getInputStream().readAllBytes()).trim();
            boolean finished = process.waitFor(SSH_PROCESS_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            if (!finished) {
                process.destroyForcibly();
                return PreflightResult.unreachable("Connection timed out after " + SSH_CONNECT_TIMEOUT_SECONDS + " seconds.");
            }

            int exitCode = process.exitValue();
            if (exitCode != 0) {
                return PreflightResult.unreachable("SSH connection failed (exit " + exitCode + "): " + output);
            }

            // Parse results
            boolean writable = false;
            String diskAvail = null;
            String diskUsed = null;
            boolean lastSuccessfulExists = false;
            String lastSuccessfulTs = null;
            String lastSuccessfulPath = null;
            int releaseCount = 0;
            String latestReleaseTs = null;
            String releasesPath = null;

            for (String line : output.split("\n")) {
                line = line.trim();
                if (line.startsWith("PERM:WRITABLE")) {
                    writable = true;
                } else if (line.startsWith("PERM:NOT_WRITABLE")) {
                    writable = false;
                } else if (line.startsWith("DISK:")) {
                    String[] parts = line.substring(5).split(":");
                    if (parts.length >= 2) {
                        diskAvail = parts[0];
                        diskUsed = parts[1];
                    }
                } else if (line.startsWith("BACKUP:LAST_SUCCESSFUL:")) {
                    lastSuccessfulExists = true;
                    String rest = line.substring("BACKUP:LAST_SUCCESSFUL:".length());
                    String[] parts = rest.split(":", 2);
                    if (parts.length >= 1) lastSuccessfulTs = parseEpochToIso(parts[0]);
                    if (parts.length >= 2) lastSuccessfulPath = parts[1];
                } else if (line.startsWith("BACKUP:RELEASES:")) {
                    String rest = line.substring("BACKUP:RELEASES:".length());
                    String[] parts = rest.split(":", 3);
                    if (parts.length >= 1) {
                        try { releaseCount = Integer.parseInt(parts[0].trim()); } catch (NumberFormatException ignored) {}
                    }
                    if (parts.length >= 2) latestReleaseTs = parseEpochToIso(parts[1]);
                    if (parts.length >= 3) releasesPath = parts[2];
                }
            }

            String msg = writable ? "Target server ready for deployment." : "Write permission denied on " + targetBasePath;

            PreflightResult result = new PreflightResult();
            result.setTargetReachable(true);
            result.setWritable(writable);
            result.setDiskAvailable(diskAvail);
            result.setDiskUsedPercent(diskUsed);
            result.setLastSuccessfulExists(lastSuccessfulExists);
            result.setLastSuccessfulTimestamp(lastSuccessfulTs);
            result.setLastSuccessfulPath(lastSuccessfulPath != null ? lastSuccessfulPath : lastSuccessfulDir);
            result.setReleaseBackupCount(releaseCount);
            result.setLatestReleaseTimestamp(latestReleaseTs);
            result.setReleasesPath(releasesPath != null ? releasesPath : releasesDir);
            result.setMessage(msg);
            return result;

        } catch (Exception e) {
            log.error("Preflight check failed for {}@{}:{}: {}", sshUser, sshHost, sshPort, e.getMessage());
            return PreflightResult.unreachable("Preflight check failed: " + e.getMessage());
        }
    }

    /** Parse epoch seconds string to ISO instant string. Returns raw value on failure. */
    private static String parseEpochToIso(String epochStr) {
        if (epochStr == null || epochStr.isBlank()) return null;
        try {
            long epoch = Long.parseLong(epochStr.trim());
            return java.time.Instant.ofEpochSecond(epoch).toString();
        } catch (NumberFormatException e) {
            return epochStr.trim();
        }
    }

    // ── Deploy path state check (Step 2 of wizard) ────────────────────────────

    /** Whitelist for the deploy path: absolute Linux path, no shell metacharacters. */
    private static final Pattern DEPLOY_PATH_ALLOWED = Pattern.compile("^/[A-Za-z0-9_\\-./]+$");

    /**
     * Top-level directories that must never be used as a deploy target. These are
     * either system-managed (filesystem won't survive deploy churn) or contain
     * sensitive content that must not be touched. Subpaths beneath them are
     * accepted (e.g. {@code /var/log/myapp} is fine; {@code /var} is not).
     */
    private static final Set<String> FORBIDDEN_PATH_PREFIXES = Set.of(
            "/etc", "/usr", "/bin", "/sbin", "/boot",
            "/dev", "/proc", "/sys", "/lib", "/lib32", "/lib64",
            "/run", "/root"
    );

    @Override
    public PathCheckResult checkPath(String sshUser, String sshHost, int sshPort,
                                     String environment, String runAsUser, String targetBasePath) {
        PathCheckResult result = new PathCheckResult();
        result.setPath(targetBasePath);
        result.setExpectedOwner(runAsUser);

        // ── 1. Client-side guards — no SSH if the input is obviously bad ──
        String invalidReason = validateDeployPath(targetBasePath);
        if (invalidReason != null) {
            result.setStatus(PathCheckResult.Status.INVALID_PATH);
            result.setHumanReason(invalidReason);
            return result;
        }

        // Normalise — strip trailing slashes (except for "/" itself which is
        // already rejected by FORBIDDEN_PATH_PREFIXES)
        String path = targetBasePath.replaceAll("/+$", "");
        result.setPath(path);
        String parentPath = parentOf(path);
        result.setParentPath(parentPath);

        // ── 2. SSH to the target and run a parseable check script ──
        try {
            ensureKeyExists(environment);
            String keyPath = resolveKeyPath(environment);

            // The path has already passed DEPLOY_PATH_ALLOWED so it cannot
            // contain quotes, backticks, $, ;, & — safe to inject into the
            // single-quoted bash variable below.
            String checkScript =
                    "P='" + path + "'; " +
                    "PARENT=\"$(dirname \"$P\")\"; " +
                    "if [ -e \"$P\" ]; then " +
                    "  OWN=$(stat -c %U \"$P\" 2>/dev/null || stat -f %Su \"$P\" 2>/dev/null || echo UNKNOWN); " +
                    "  echo \"EXISTS|$OWN\"; " +
                    "else " +
                    "  if [ -e \"$PARENT\" ]; then " +
                    "    if [ -w \"$PARENT\" ]; then echo 'MISSING|PARENT_WRITABLE'; " +
                    "    else echo 'MISSING|PARENT_NOT_WRITABLE'; fi; " +
                    "  else " +
                    "    echo 'MISSING|PARENT_MISSING'; " +
                    "  fi; " +
                    "fi";

            ProcessBuilder pb = new ProcessBuilder(
                    "ssh",
                    "-i", keyPath,
                    "-o", "BatchMode=yes",
                    "-o", "StrictHostKeyChecking=accept-new",
                    "-o", "ConnectTimeout=" + SSH_CONNECT_TIMEOUT_SECONDS,
                    "-p", String.valueOf(sshPort),
                    sshUser + "@" + sshHost,
                    checkScript);
            pb.redirectErrorStream(true);

            Process process = pb.start();
            String output = new String(process.getInputStream().readAllBytes()).trim();
            boolean finished = process.waitFor(SSH_PROCESS_TIMEOUT_SECONDS, TimeUnit.SECONDS);

            if (!finished) {
                process.destroyForcibly();
                return unreachable(result, "Connection timed out after "
                        + SSH_CONNECT_TIMEOUT_SECONDS + " seconds.");
            }

            int exitCode = process.exitValue();
            if (exitCode != 0) {
                return unreachable(result, lastNonEmptyLine(output));
            }

            // ── 3. Parse the script's structured output ──
            return interpretCheckScriptOutput(output, result, runAsUser);

        } catch (Exception e) {
            log.error("Deploy path check failed for {}@{}:{} path={} env={}: {}",
                    sshUser, sshHost, sshPort, targetBasePath, environment, e.getMessage());
            return unreachable(result, e.getMessage());
        }
    }

    /** Reject paths up-front when they don't pass the whitelist. */
    private static String validateDeployPath(String path) {
        if (path == null || path.isBlank()) return "Deploy path is empty.";
        if (path.length() > 500) return "Deploy path exceeds 500 characters.";
        if (!path.startsWith("/")) return "Deploy path must be absolute (start with /).";
        if (path.contains("..")) return "Deploy path must not contain '..' segments.";
        if (!DEPLOY_PATH_ALLOWED.matcher(path).matches()) {
            return "Deploy path contains illegal characters. Allowed: letters, digits, _ - . /";
        }
        if (path.equals("/")) return "Cannot deploy to the filesystem root.";
        // System directory guard
        for (String forbidden : FORBIDDEN_PATH_PREFIXES) {
            if (path.equals(forbidden) || path.startsWith(forbidden + "/")) {
                return "Deploy path under " + forbidden + " is not allowed — choose a non-system directory.";
            }
        }
        return null;
    }

    /**
     * Interpret the {@code EXISTS|<owner>} or {@code MISSING|<state>} line
     * returned by the remote check script.
     */
    private static PathCheckResult interpretCheckScriptOutput(String output,
                                                              PathCheckResult result,
                                                              String runAsUser) {
        String line = lastNonEmptyLine(output);
        if (line == null) {
            return unreachable(result, "Empty response from remote check script.");
        }

        String path = result.getPath();
        String parent = result.getParentPath();

        if (line.startsWith("EXISTS|")) {
            String owner = line.substring("EXISTS|".length()).trim();
            result.setExists(Boolean.TRUE);
            result.setActualOwner(owner);
            result.setParentExists(Boolean.TRUE);

            if (owner.equals(runAsUser)) {
                result.setStatus(PathCheckResult.Status.OK);
                result.setHumanReason("Path exists and is owned by " + runAsUser + ".");
            } else {
                result.setStatus(PathCheckResult.Status.WRONG_OWNER);
                result.setHumanReason("Path exists but is owned by " + owner
                        + ", not " + runAsUser + ".");
                result.setFixCommands(List.of(
                        "sudo chown -R " + runAsUser + ":" + runAsUser + " " + path
                ));
            }
            return result;
        }

        if (line.startsWith("MISSING|")) {
            result.setExists(Boolean.FALSE);
            String state = line.substring("MISSING|".length()).trim();

            switch (state) {
                case "PARENT_WRITABLE" -> {
                    result.setParentExists(Boolean.TRUE);
                    result.setParentWritableByRunAs(Boolean.TRUE);
                    result.setStatus(PathCheckResult.Status.MISSING);
                    result.setHumanReason("Path doesn't exist yet. The runner will create it on first deploy "
                            + "(parent " + parent + " is writable by " + runAsUser + ").");
                }
                case "PARENT_NOT_WRITABLE" -> {
                    result.setParentExists(Boolean.TRUE);
                    result.setParentWritableByRunAs(Boolean.FALSE);
                    result.setStatus(PathCheckResult.Status.PARENT_NOT_WRITABLE);
                    result.setHumanReason("Path doesn't exist and " + parent
                            + " is not writable by " + runAsUser + ". Create it manually:");
                    result.setFixCommands(List.of(
                            "sudo mkdir -p " + path,
                            "sudo chown -R " + runAsUser + ":" + runAsUser + " " + path
                    ));
                }
                case "PARENT_MISSING" -> {
                    result.setParentExists(Boolean.FALSE);
                    result.setParentWritableByRunAs(Boolean.FALSE);
                    result.setStatus(PathCheckResult.Status.PARENT_NOT_WRITABLE);
                    result.setHumanReason("Neither the path nor its parent " + parent
                            + " exists. Create it manually:");
                    result.setFixCommands(List.of(
                            "sudo mkdir -p " + path,
                            "sudo chown -R " + runAsUser + ":" + runAsUser + " " + path
                    ));
                }
                default -> {
                    return unreachable(result, "Unrecognised check-script response: " + line);
                }
            }
            return result;
        }

        return unreachable(result, "Unrecognised check-script response: " + line);
    }

    private static PathCheckResult unreachable(PathCheckResult r, String tail) {
        r.setStatus(PathCheckResult.Status.UNREACHABLE);
        r.setHumanReason("Cannot reach the target server — fix Step 1 (SSH connection) first.");
        r.setSshErrorTail(sanitiseTail(tail));
        return r;
    }

    /** Sanitise the SSH stderr tail to remove control characters before returning to the UI. */
    private static String sanitiseTail(String s) {
        if (s == null) return null;
        // Strip ANSI escapes + control chars; cap length.
        String clean = s.replaceAll("\\u001B\\[[;\\d]*[A-Za-z]", "")
                        .replaceAll("[\\p{Cntrl}&&[^\\n\\r\\t]]", "");
        return clean.length() > 500 ? clean.substring(0, 500) + "…" : clean;
    }

    private static String lastNonEmptyLine(String text) {
        if (text == null) return null;
        String[] lines = text.split("\\R");
        for (int i = lines.length - 1; i >= 0; i--) {
            String t = lines[i].trim();
            if (!t.isEmpty()) return t;
        }
        return null;
    }

    private static String parentOf(String path) {
        int last = path.lastIndexOf('/');
        if (last <= 0) return "/";
        return path.substring(0, last);
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
