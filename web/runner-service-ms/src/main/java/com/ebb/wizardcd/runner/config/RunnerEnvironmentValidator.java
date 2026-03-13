package com.ebb.wizardcd.runner.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.File;

/**
 * Validates the runner execution environment at application startup.
 * The application WILL NOT start if any validation fails.
 */
@Configuration
public class RunnerEnvironmentValidator {
    private static final Logger log = LoggerFactory.getLogger(RunnerEnvironmentValidator.class);

    // Absolute path to the runner scripts directory
    private final String scriptsDir;

    // Absolute path to the workspace root for job execution
    private final String workspaceRoot;

    public RunnerEnvironmentValidator(
            @Value("${runner.scriptsDir}") String scriptsDir,
            @Value("${runner.workspaceRoot}") String workspaceRoot) {
        this.scriptsDir = scriptsDir;
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Executes once at application startup.
     * Any failure here aborts application boot.
     */
    @Bean
    ApplicationRunner validateRunnerEnvironment() {
        return args -> {

            // Visual boundary for startup logs
            log.info("==================================================");
            log.info("Validating runner environment");
            log.info("==================================================");

            // Validate scripts directory presence and structure
            validateScriptsDir();

            // Validate deploy.sh existence and permissions
            validateDeployScript();

            // Validate required system binaries
            validateBinary("ssh");
            validateBinary("scp");
            validateBinary("yq");

            // Validate workspace availability and write access
            validateWorkspace();

            // Signal readiness after all validations pass
            log.info("Runner environment validation successful");
            log.info("Runner is READY to accept jobs");
            log.info("==================================================");
            log.info("==================================================");
        };
    }

    // Ensures scriptsDir exists and is a directory
    private void validateScriptsDir() {
        File dir = new File(scriptsDir);

        // Warn (do not fail) if running with relative paths — acceptable in dev
        if (!dir.isAbsolute()) {
            log.warn("scriptsDir is not absolute (dev mode?): {}", scriptsDir);
        }

        if (!dir.exists() || !dir.isDirectory()) {
            fail("scriptsDir does not exist or is not a directory: " + scriptsDir);
        }

        log.info("scriptsDir validated: {}", scriptsDir);
    }

    // Ensures deploy.sh exists and is executable
    private void validateDeployScript() {
        File deployScript = new File(scriptsDir, "deploy.sh");

        if (!deployScript.exists()) {
            fail("deploy.sh not found in scriptsDir: " + scriptsDir);
        }

        if (!deployScript.canExecute()) {
            fail("deploy.sh is not executable: " + deployScript.getAbsolutePath());
        }

        log.info("deploy.sh found and executable");
    }

    // Ensures required binaries are available on PATH
    private void validateBinary(String binary) {
        try {
            // Use 'which' to resolve binary presence
            Process process = new ProcessBuilder("which", binary)
                    .redirectErrorStream(true)
                    .start();

            // Wait for process completion
            int exitCode = process.waitFor();

            // Non-zero exit code indicates binary missing
            if (exitCode != 0) {
                fail(binary + " not found in PATH");
            }

            log.info("{} binary found", binary);

        } catch (Exception e) {
            // Treat any unexpected failure as fatal
            fail("Failed to validate binary: " + binary + " (" + e.getMessage() + ")");
        }
    }

    // Ensures workspaceRoot exists and is writable
    private void validateWorkspace() {
        File workspace = new File(workspaceRoot);

        // Warn (do not fail) if running with relative paths — acceptable in dev
        if (!workspace.isAbsolute()) {
            log.warn("workspaceRoot is not absolute (dev mode?): {}", workspaceRoot);
        }

        // Attempt creation if workspace does not exist
        if (!workspace.exists()) {
            if (!workspace.mkdirs()) {
                fail("Failed to create workspaceRoot: " + workspaceRoot);
            }
        }

        // Ensure workspace is writable and usable
        if (!workspace.isDirectory() || !workspace.canWrite()) {
            fail("workspaceRoot is not writable: " + workspaceRoot);
        }

        log.info("workspaceRoot validated and writable: {}", workspaceRoot);
    }

    // Logs error and aborts application startup
    private void fail(String message) {
        log.error("Runner startup validation FAILED: {}", message);
        throw new IllegalStateException(message);
    }
}
