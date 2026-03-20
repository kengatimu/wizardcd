package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.DeploymentRequest;
import com.ebb.wizardcd.runner.dto.JobMetadata;
import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.service.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

@Service
public class RunnerServiceImpl implements RunnerService {

    private static final Logger log = LoggerFactory.getLogger(RunnerServiceImpl.class);

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
                             ProcessExecutorService processExecutorService) {
        this.scriptsDir = scriptsDir;
        this.executionTimeoutMinutes = executionTimeoutMinutes;
        this.maxConcurrentJobs = maxConcurrentJobs;
        this.deploymentValidatorService = deploymentValidatorService;
        this.workspaceService = workspaceService;
        this.jobStateService = jobStateService;
        this.processExecutorService = processExecutorService;
    }

    // Accepts deployment request and delegates execution asynchronously
    @Override
    public JobStatus runDeploy(String jobId, DeploymentRequest request,
                               MultipartFile jarArtifact, MultipartFile libZip,
                               List<MultipartFile> certZips, List<MultipartFile> extraZips) {

        // Validate mandatory inputs before any lifecycle mutation
        validateInputs(jobId, request, jarArtifact);

        // Validate the request details
        deploymentValidatorService.validate(request);

        // Initialize lifecycle state machine
        transitionState(jobId, JobStatus.CREATED);
        transitionState(jobId, JobStatus.VALIDATING);

        // Persist initial execution snapshot for observability
        jobStateService.updateState(jobId, JobExecutionStateStatus.RECEIVED, "Job accepted by runner");

        // Enforce capacity guard before scheduling execution
        if (runningJobs.size() >= maxConcurrentJobs) {
            transitionState(jobId, JobStatus.FAILED);
            return JobStatus.FAILED;
        }

        // Submit job into single-thread executor (non-blocking)
        executor.submit(() -> executeJob(jobId, request, jarArtifact, libZip, certZips, extraZips));

        // Immediately return RUNNING since execution is asynchronous
        return JobStatus.RUNNING;
    }

    // Performs full deployment lifecycle inside executor thread
    private void executeJob(String jobId, DeploymentRequest request,
                            MultipartFile jarArtifact, MultipartFile libZip,
                            List<MultipartFile> certZips, List<MultipartFile> extraZips) {
        try {

            // Move lifecycle into workspace preparation phase
            transitionState(jobId, JobStatus.PREPARING_WORKSPACE);

            // Create immutable job identity snapshot
            JobMetadata metadata = new JobMetadata(jobId, "system", request.getAppName(), request.getEnvironment(), Instant.now());

            // Prepare isolated job workspace
            Path workspaceConfig = workspaceService.prepareWorkspace(jobId, request, jarArtifact, libZip, certZips, extraZips, metadata);

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

        // -2: runner-enforced abort
        if (exitCode == -2) {
            transitionState(jobId, JobStatus.ABORTED);
            jobStateService.updateState(jobId, JobExecutionStateStatus.ABORTED, "Execution aborted by control plane");
            return;
        }

        // Any positive exit code → shell-level failure
        transitionState(jobId, JobStatus.FAILED);
        jobStateService.updateState(jobId, JobExecutionStateStatus.FAILED, "deploy.sh exited with code " + exitCode);
    }

    // Handles abort request coming from web/controller layer
    @Override
    public void abort(String jobId) {
        JobStatus current = jobStateService.getStatus(jobId);
        if (current == null) {
            throw new IllegalStateException("Job not found: " + jobId);
        }

        if (current == JobStatus.RUNNING) {
            // Active process — signal abort, process executor will kill it
            transitionState(jobId, JobStatus.ABORT_REQUESTED);
            processExecutorService.abort(jobId);
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

    // Streams deploy.sh output line-by-line into runner logs
    private void streamProcessLogs(Process process) throws Exception {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            while ((line = reader.readLine()) != null) {
                log.info("[deploy.sh] {}", line);
            }
        }
    }
}