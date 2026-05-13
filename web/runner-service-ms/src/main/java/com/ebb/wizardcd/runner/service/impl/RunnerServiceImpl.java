package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.DeploymentRequest;
import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.service.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.regex.Pattern;

@Service
public class RunnerServiceImpl implements RunnerService {

    private static final Logger log = LoggerFactory.getLogger(RunnerServiceImpl.class);

    // Dedicated logger for deploy.sh output — uses a clean format without class names
    private static final Logger deployLog = LoggerFactory.getLogger("wizardcd.deploy");

    // Strip bash helpers.sh prefix: "2026-03-21 13:35:37.415 [INFO ] [job=UUID] "
    private static final Pattern BASH_PREFIX = Pattern.compile(
            "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\.\\d{3} \\[(?:INFO |WARN |ERROR)\\] \\[job=[a-f0-9-]+\\]\\s*");

    // Strip remote script prefix: "[INFO]  2026-03-21 13:35:41  " (from application-deployment.sh / rollback.sh)
    private static final Pattern REMOTE_PREFIX = Pattern.compile(
            "^\\[(?:INFO|WARN|ERROR)\\]\\s+\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}\\s+");

    // Directory where deploy.sh resides
    private final String scriptsDir;

    // Maximum execution duration before runner enforces timeout
    private final long executionTimeoutMinutes;

    // Maximum concurrently running jobs allowed
    private final int maxConcurrentJobs;

    private final DeploymentValidatorService deploymentValidatorService;

    private final RunnerWorkspaceService workspaceService;
    private final RunnerJobStateService jobStateService;
    private final ProcessExecutorService processExecutorService;
    private final ObjectMapper objectMapper;
    /** Phase 4 Stage 5 — DB-backed deployment persistence (insert row before any lifecycle write). */
    private final DeploymentPersistenceService persistence;

    // Single-thread executor guarantees serialized deployments (V1 model)
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    // Tracks currently running OS processes
    private final Map<String, Process> runningJobs = new ConcurrentHashMap<>();

    public RunnerServiceImpl(@Value("${runner.scriptsDir}") String scriptsDir,
                             @Value("${runner.executionTimeoutMinutes:30}") long executionTimeoutMinutes,
                             @Value("${runner.maxConcurrentJobs:1}") int maxConcurrentJobs,
                             DeploymentValidatorService deploymentValidatorService,
                             RunnerWorkspaceService workspaceService,
                             RunnerJobStateService jobStateService,
                             ProcessExecutorService processExecutorService,
                             ObjectMapper objectMapper,
                             DeploymentPersistenceService persistence) {
        this.scriptsDir = scriptsDir;
        this.executionTimeoutMinutes = executionTimeoutMinutes;
        this.maxConcurrentJobs = maxConcurrentJobs;
        this.deploymentValidatorService = deploymentValidatorService;
        this.workspaceService = workspaceService;
        this.jobStateService = jobStateService;
        this.processExecutorService = processExecutorService;
        this.objectMapper = objectMapper;
        this.persistence = persistence;
    }

    // Accepts deployment request and delegates execution asynchronously
    // jobType: "deploy" or "redeploy"
    @Override
    public JobStatus runDeploy(String jobId, DeploymentRequest request,
                               MultipartFile jarArtifact, MultipartFile libZip,
                               List<MultipartFile> certZips, List<MultipartFile> extraZips,
                               String jobType) {

        // Validate mandatory inputs before any lifecycle mutation
        validateInputs(jobId, request, jarArtifact);

        // Validate the request details
        deploymentValidatorService.validate(request);

        // Phase 4 Stage 5 — create the deployment ROW in the DB up-front, before
        // any lifecycle transition can fire. This is the canonical "I'm tracking
        // this job now" moment. The row starts in CREATED state (the persistence
        // service inserts the initial deployment_states row too).
        String effectiveType = (jobType != null) ? jobType : "deploy";
        createDeploymentRow(jobId, request, effectiveType, /* sourceJobId */ null);

        // Initialize lifecycle state machine. CREATED was just inserted by
        // createDeployment; transitionState() will transition to VALIDATING.
        transitionState(jobId, JobStatus.VALIDATING);

        // Persist initial execution snapshot for observability
        jobStateService.updateState(jobId, JobExecutionStateStatus.RECEIVED, "Job accepted by runner");

        // Enforce capacity guard before scheduling execution
        if (runningJobs.size() >= maxConcurrentJobs) {
            transitionState(jobId, JobStatus.FAILED);
            return JobStatus.FAILED;
        }

        // Submit job into single-thread executor (non-blocking)
        executor.submit(() -> executeJob(jobId, request, jarArtifact, libZip, certZips, extraZips, effectiveType));

        // Immediately return RUNNING since execution is asynchronous
        return JobStatus.RUNNING;
    }

    /**
     * Phase 4 Stage 5 helper — inserts the {@code deployments} row + initial
     * {@code deployment_states} row before any lifecycle transition fires.
     *
     * <p>The DeploymentRequest is serialised to JSON and stored in
     * {@code config_snapshot} (JSONB) so a future redeploy / rollback can replay
     * the exact deploy config without rebuilding it from the wizard.
     *
     * <p>If JSON serialisation fails (shouldn't — DeploymentRequest is a plain
     * POJO), we still create the row with a null snapshot so the deployment is
     * trackable; the redeploy flow falls back to the file-based request.json
     * on the workspace dir during the transition window.
     */
    private void createDeploymentRow(String jobId, DeploymentRequest request,
                                     String jobType, UUID sourceJobId) {
        String configJson = null;
        try {
            configJson = objectMapper.writeValueAsString(request);
        } catch (JsonProcessingException jpe) {
            // Defensive only — serialisation failure here is exceptional.
            log.warn("Failed to serialise DeploymentRequest for job {} — config_snapshot will be null", jobId, jpe);
        }

        Path workspacePath = Path.of(workspaceService.getWorkspaceRoot(), jobId);

        CreateDeploymentCommand cmd = new CreateDeploymentCommand(
                UUID.fromString(jobId),
                request.getAppName(),
                request.getEnvironment(),
                jobType,
                request.getJarName(),
                configJson,
                sourceJobId,
                workspacePath.toString(),
                /* createdBy */ null);

        persistence.createDeployment(cmd);
        log.info("Deployment row inserted for job {} (app={}, env={}, type={})",
                jobId, request.getAppName(), request.getEnvironment(), jobType);
    }

    // Performs full deployment lifecycle inside executor thread
    private void executeJob(String jobId, DeploymentRequest request,
                            MultipartFile jarArtifact, MultipartFile libZip,
                            List<MultipartFile> certZips, List<MultipartFile> extraZips,
                            String jobType) {
        try {

            // Move lifecycle into workspace preparation phase
            transitionState(jobId, JobStatus.PREPARING_WORKSPACE);

            // Prepare isolated job workspace (filesystem artefacts only;
            // metadata is in the deployments table managed by Stage 4 service)
            Path workspaceConfig = workspaceService.prepareWorkspace(
                    jobId, request, jarArtifact, libZip, certZips, extraZips);

            // Persist workspace readiness execution state
            jobStateService.updateState(jobId, JobExecutionStateStatus.WORKSPACE_READY, "Workspace prepared");

            // Transition lifecycle into RUNNING phase
            transitionState(jobId, JobStatus.RUNNING);

            // Build shell command for deploy.sh execution
            ProcessBuilder pb = new ProcessBuilder(
                    "./deploy.sh",
                    "--job-id", jobId,
                    "--config", workspaceConfig.toString());

            // Ensure process runs inside scripts directory
            pb.directory(new File(scriptsDir));

            // Merge stderr into stdout for linear log streaming
            pb.redirectErrorStream(true);

            // Start OS-level process
            Process process = pb.start();

            // Register process for timeout and abort control
            runningJobs.put(jobId, process);

            // Persist execution start snapshot
            jobStateService.updateState(jobId, JobExecutionStateStatus.RUNNING, "deploy.sh execution started");

            // Stream shell output into runner logs
            streamProcessLogs(process);

            // Execute process with enforced timeout
            int exitCode = processExecutorService.execute(jobId, process, executionTimeoutMinutes);

            // Interpret exit code deterministically according to control-plane contract
            interpretExitCode(jobId, exitCode);

        } catch (Exception e) {
            // Any unexpected exception transitions lifecycle into FAILED — unless abort
            // is already in progress (ABORT_REQUESTED / ABORTED), in which case we must
            // not override the abort with FAILED.
            JobStatus currentStatus = jobStateService.getStatus(jobId);
            if (currentStatus != JobStatus.ABORT_REQUESTED && currentStatus != JobStatus.ABORTED) {
                try {
                    transitionState(jobId, JobStatus.FAILED);
                    jobStateService.updateState(jobId, JobExecutionStateStatus.FAILED,
                            "Execution exception: " + e.getMessage());
                } catch (Exception inner) {
                    log.error("Failed to transition job {} to FAILED after exception (current state: {})",
                            jobId, currentStatus, inner);
                }
            }
            log.error("Job {} execution failed with exception", jobId, e);

        } finally {
            // Always remove job from active tracking map
            runningJobs.remove(jobId);
        }
    }

    // Interprets exit codes based on formal execution contract
    private void interpretExitCode(String jobId, int exitCode) {

        // If abort was requested, any exit code means ABORTED — the process was killed
        // (SIGTERM → exit 143) or finished naturally (exit 0) after the abort signal.
        JobStatus current = jobStateService.getStatus(jobId);
        if (current == JobStatus.ABORT_REQUESTED) {
            transitionState(jobId, JobStatus.ABORTED);
            jobStateService.updateState(jobId, JobExecutionStateStatus.ABORTED,
                    "Deployment aborted by user");
            return;
        }

        // 0: successful completion of deploy.sh
        if (exitCode == 0) {
            transitionState(jobId, JobStatus.SUCCESS);
            jobStateService.updateState(jobId, JobExecutionStateStatus.SUCCEEDED, "Deployment completed successfully");
            return;
        }

        // -1: runner-enforced timeout
        if (exitCode == -1) {
            transitionState(jobId, JobStatus.FAILED);
            jobStateService.updateState(jobId, JobExecutionStateStatus.TIMEOUT, "Execution timed out by runner");
            return;
        }

        // -2: runner-enforced abort (legacy path — kept for completeness)
        if (exitCode == -2) {
            transitionState(jobId, JobStatus.ABORTED);
            jobStateService.updateState(jobId, JobExecutionStateStatus.ABORTED, "Execution aborted by control plane");
            return;
        }

        // Any positive exit code → shell-level failure
        transitionState(jobId, JobStatus.FAILED);
        jobStateService.updateState(jobId, JobExecutionStateStatus.FAILED, "deploy.sh exited with code " + exitCode);
    }

    // Executes a rollback: restores the last-successful backup on the target VM
    @Override
    public JobStatus runRollback(String jobId, DeploymentRequest request) {

        if (jobId == null || jobId.isBlank()) {
            throw new IllegalArgumentException("jobId must not be empty");
        }
        if (request == null) {
            throw new IllegalArgumentException("Deployment request must not be null");
        }

        // Phase 4 Stage 5 — create the deployment row up front (rollback type)
        // The roadmap calls for source_job_id to be set on rollback jobs to
        // point at the original deployment they're reverting; we don't have
        // that info here (caller is RunnerController.rollback which has the
        // original jobId) — leave null for now and revisit when refactoring
        // the controller to thread it through.
        createDeploymentRow(jobId, request, "rollback", /* sourceJobId */ null);

        // Initialize lifecycle (CREATED was just inserted by createDeploymentRow)
        transitionState(jobId, JobStatus.VALIDATING);
        jobStateService.updateState(jobId, JobExecutionStateStatus.RECEIVED, "Rollback job accepted by runner");

        // Capacity guard
        if (runningJobs.size() >= maxConcurrentJobs) {
            transitionState(jobId, JobStatus.FAILED);
            return JobStatus.FAILED;
        }

        // Submit rollback execution
        executor.submit(() -> executeRollback(jobId, request));
        return JobStatus.RUNNING;
    }

    // Performs rollback lifecycle inside executor thread
    private void executeRollback(String jobId, DeploymentRequest request) {
        try {
            transitionState(jobId, JobStatus.PREPARING_WORKSPACE);

            // Create minimal workspace: just config YAML + logs dir.
            // metadata.json is no longer written — deployment metadata is in
            // the `deployments` DB table (inserted by createDeploymentRow in
            // runRollback).
            Path jobRoot = Path.of(workspaceService.getWorkspaceRoot(), jobId);
            Path inputDir = jobRoot.resolve("input");
            Path logDir = jobRoot.resolve("logs");
            java.nio.file.Files.createDirectories(inputDir);
            java.nio.file.Files.createDirectories(logDir);

            // Generate YAML config (reuse existing service)
            String effectiveJarName = request.getJarName() != null ? request.getJarName() : "rollback.jar";
            Path configPath = workspaceService.generateYamlOnly(jobId, request, effectiveJarName, inputDir);

            jobStateService.updateState(jobId, JobExecutionStateStatus.WORKSPACE_READY, "Rollback workspace prepared");
            transitionState(jobId, JobStatus.RUNNING);

            // Execute rollback-deploy.sh
            ProcessBuilder pb = new ProcessBuilder(
                    "./rollback-deploy.sh",
                    "--job-id", jobId,
                    "--config", configPath.toString());
            pb.directory(new File(scriptsDir));
            pb.redirectErrorStream(true);

            Process process = pb.start();
            runningJobs.put(jobId, process);
            jobStateService.updateState(jobId, JobExecutionStateStatus.RUNNING, "rollback-deploy.sh execution started");

            streamProcessLogs(process);

            int exitCode = processExecutorService.execute(jobId, process, executionTimeoutMinutes);
            interpretExitCode(jobId, exitCode);

        } catch (Exception e) {
            JobStatus currentStatus = jobStateService.getStatus(jobId);
            if (currentStatus == JobStatus.ABORT_REQUESTED) {
                // Abort was requested — transition to ABORTED
                try {
                    transitionState(jobId, JobStatus.ABORTED);
                    jobStateService.updateState(jobId, JobExecutionStateStatus.ABORTED,
                            "Rollback aborted by user");
                } catch (Exception inner) {
                    log.error("Failed to transition rollback job {} to ABORTED", jobId, inner);
                }
                log.warn("Rollback job {} aborted by user", jobId);
            } else if (currentStatus != JobStatus.ABORTED) {
                try {
                    transitionState(jobId, JobStatus.FAILED);
                    jobStateService.updateState(jobId, JobExecutionStateStatus.FAILED,
                            "Rollback exception: " + e.getMessage());
                } catch (Exception inner) {
                    log.error("Failed to transition rollback job {} to FAILED", jobId, inner);
                }
                log.error("Rollback job {} failed with exception", jobId, e);
            }
        } finally {
            runningJobs.remove(jobId);
        }
    }

    // Handles abort request coming from web/controller layer
    @Override
    public void abort(String jobId) {
        JobStatus current = jobStateService.getStatus(jobId);
        if (current == null) {
            throw new IllegalStateException("Job not found: " + jobId);
        }

        if (current == JobStatus.RUNNING) {
            // Active process — signal abort and kill it
            transitionState(jobId, JobStatus.ABORT_REQUESTED);

            // Kill the process directly from runningJobs — processExecutorService.abort()
            // can miss it because the process is registered there only after streamProcessLogs
            // finishes (which blocks until process ends).
            Process process = runningJobs.get(jobId);
            if (process != null && process.isAlive()) {
                log.warn("Destroying process for job {}", jobId);
                process.destroy();
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
                if (process.isAlive()) {
                    log.warn("Force-killing process for job {}", jobId);
                    process.destroyForcibly();
                }
            } else {
                // Fallback — try processExecutorService in case timing differs
                processExecutorService.abort(jobId);
            }
            return;
        }

        if (current == JobStatus.CREATED
                || current == JobStatus.VALIDATING
                || current == JobStatus.PREPARING_WORKSPACE) {
            // No process is running yet — transition directly to ABORTED
            transitionState(jobId, JobStatus.ABORT_REQUESTED);
            transitionState(jobId, JobStatus.ABORTED);
            jobStateService.updateState(jobId, JobExecutionStateStatus.ABORTED,
                    "Aborted by user before script execution started");
            return;
        }

        // Already in a terminal or abort state — nothing to do
        throw new IllegalStateException("Cannot abort job in current state: " + current);
    }

    // Enforces strict lifecycle transitions
    private void transitionState(String jobId, JobStatus newState) {
        JobStatus current = jobStateService.getStatus(jobId);

        if (current != null && !isValidTransition(current, newState)) {
            throw new IllegalStateException("Invalid state transition: " + current + " → " + newState);
        }
        jobStateService.updateStatus(jobId, newState);
    }

    // Defines legal lifecycle transitions
    private boolean isValidTransition(JobStatus current, JobStatus next) {

        return switch (current) {
            // Pre-execution: allow FAILED for early error paths (validation, capacity)
            case CREATED -> next == JobStatus.VALIDATING
                    || next == JobStatus.FAILED;
            // Pre-execution: allow FAILED (validation error) or ABORT_REQUESTED (user cancelled)
            case VALIDATING -> next == JobStatus.PREPARING_WORKSPACE
                    || next == JobStatus.FAILED
                    || next == JobStatus.ABORT_REQUESTED;
            // Workspace phase: allow FAILED (prep error) or ABORT_REQUESTED (user cancelled)
            case PREPARING_WORKSPACE -> next == JobStatus.RUNNING
                    || next == JobStatus.FAILED
                    || next == JobStatus.ABORT_REQUESTED;
            // Active execution: normal terminal paths + abort signal
            case RUNNING -> next == JobStatus.SUCCESS
                    || next == JobStatus.FAILED
                    || next == JobStatus.ABORT_REQUESTED;
            // Abort path: allow FAILED as well (process may die with non-zero exit after abort)
            case ABORT_REQUESTED -> next == JobStatus.ABORTED
                    || next == JobStatus.FAILED;
            default -> false;
        };
    }

    // Validates mandatory external input parameters
    private void validateInputs(String jobId, DeploymentRequest request, MultipartFile jarArtifact) {

        if (jobId == null || jobId.isBlank()) {
            throw new IllegalArgumentException("jobId must not be empty");
        }

        if (request == null) {
            throw new IllegalArgumentException("Deployment request must not be null");
        }

        if (jarArtifact == null || jarArtifact.isEmpty()) {
            throw new IllegalArgumentException("JAR artifact must not be empty");
        }
    }

    // Streams deploy.sh output line-by-line into runner logs.
    // Strips redundant bash timestamp/level/job-tag prefixes so the runner log
    // reads cleanly — e.g. "[INFO] Monitoring: 0s/20s (10%) — all checks passed"
    private void streamProcessLogs(Process process) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                String clean = BASH_PREFIX.matcher(line).replaceFirst("");
                clean = REMOTE_PREFIX.matcher(clean).replaceFirst("");
                deployLog.info("{}", clean);
            }
        }
    }
}