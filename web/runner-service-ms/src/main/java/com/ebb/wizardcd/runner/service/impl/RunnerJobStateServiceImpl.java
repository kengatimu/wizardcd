package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.JobExecutionStatus;
import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.service.RunnerJobStateService;
import java.util.ArrayList;
import java.util.List;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;

// File-backed implementation that persists job state into status.json
// This class does NOT enforce transitions — it only stores snapshots
@Service
public class RunnerJobStateServiceImpl implements RunnerJobStateService {

    private static final Logger log = LoggerFactory.getLogger(RunnerJobStateServiceImpl.class);

    // Log fsync warning only once — avoid flooding logs on every state write
    private volatile boolean fsyncWarningLogged = false;

    // Base directory where all job workspaces live
    private final String workspaceRoot;

    // JSON serializer used to write/read status.json deterministically
    private final ObjectMapper objectMapper;

    public RunnerJobStateServiceImpl(
            @Value("${runner.workspaceRoot}") String workspaceRoot,
            ObjectMapper objectMapper) {
        this.workspaceRoot = workspaceRoot;
        this.objectMapper = objectMapper;
    }

    // --------------------------------------------------
    // Execution Phase State (fine-grained runtime state)
    // --------------------------------------------------
    @Override
    public void updateState(String jobId,
                            JobExecutionStateStatus executionState,
                            String message) {

        try {

            // Resolve job workspace directory
            Path jobDir = Path.of(workspaceRoot, jobId);

            // Resolve status.json path
            Path statusPath = jobDir.resolve("status.json");

            // Load existing snapshot if present
            JobExecutionStatus existing = readSnapshotIfExists(statusPath);

            // Build updated snapshot preserving lifecycle state, stateHistory, and completedAt.
            // updateState() is always called AFTER updateStatus() in the execution flow.
            // Without forwarding completedAt + stateHistory here we silently erase the values
            // that updateStatus() just wrote — leaving completedAt null in the final snapshot.
            JobExecutionStatus updated = new JobExecutionStatus(
                    jobId,
                    existing != null ? existing.getJobStatus() : null,
                    executionState.name(),
                    Instant.now(),
                    message
            );
            updated.setCompletedAt(existing != null ? existing.getCompletedAt() : null);
            updated.setStateHistory(
                    existing != null && existing.getStateHistory() != null
                            ? existing.getStateHistory()
                            : new ArrayList<>()
            );

            // Persist snapshot atomically (no partial writes)
            writeAtomically(statusPath, updated);

            log.debug("Execution state [{}] persisted for job {}", executionState, jobId);

        } catch (Exception e) {

            // Execution state persistence failure is critical
            log.error("Failed to persist execution state for job {}: {}", jobId, e.getMessage());

            throw new IllegalStateException(
                    "Execution state persistence failed for jobId=" + jobId,
                    e
            );
        }
    }

    @Override
    public JobExecutionStateStatus readCurrentState(String jobId) {

        try {

            // Resolve job workspace directory
            Path jobDir = Path.of(workspaceRoot, jobId);

            // Resolve status.json path
            Path statusPath = jobDir.resolve("status.json");

            // No persisted execution state yet
            if (!Files.exists(statusPath)) {
                return null;
            }

            // Deserialize snapshot
            JobExecutionStatus snapshot =
                    objectMapper.readValue(statusPath.toFile(), JobExecutionStatus.class);

            // Execution state not yet set
            if (snapshot.getJobExecutionStateStatus() == null) {
                return null;
            }

            // Convert stored string back to enum
            return JobExecutionStateStatus.valueOf(
                    snapshot.getJobExecutionStateStatus()
            );

        } catch (Exception e) {

            // Read failures are logged but not fatal
            log.error("Failed to read execution state for job {}: {}", jobId, e.getMessage());

            return null;
        }
    }

    // --------------------------------------------------
    // Lifecycle State (control-plane state machine)
    // --------------------------------------------------
    @Override
    public void updateStatus(String jobId, JobStatus status) {

        try {

            // Resolve job workspace directory
            Path jobDir = Path.of(workspaceRoot, jobId);

            // Resolve status.json path
            Path statusPath = jobDir.resolve("status.json");

            // Load existing snapshot if present
            JobExecutionStatus existing = readSnapshotIfExists(statusPath);

            Instant now = Instant.now();

            // Carry forward existing stateHistory, then append the new transition
            List<JobExecutionStatus.StateTransition> history =
                    (existing != null && existing.getStateHistory() != null)
                            ? new ArrayList<>(existing.getStateHistory())
                            : new ArrayList<>();
            history.add(new JobExecutionStatus.StateTransition(status.name(), now));

            // Record completedAt when the job enters a terminal state
            Instant completedAt = (existing != null) ? existing.getCompletedAt() : null;
            if (status == JobStatus.SUCCESS || status == JobStatus.FAILED || status == JobStatus.ABORTED) {
                completedAt = now;
            }

            // Build updated snapshot preserving execution state
            JobExecutionStatus updated = new JobExecutionStatus(
                    jobId,
                    status.name(),
                    existing != null ? existing.getJobExecutionStateStatus() : null,
                    now,
                    existing != null ? existing.getMessage() : null
            );
            updated.setStateHistory(history);
            updated.setCompletedAt(completedAt);

            // Persist snapshot atomically
            writeAtomically(statusPath, updated);

            log.debug("Lifecycle state [{}] persisted for job {}", status, jobId);

        } catch (Exception e) {

            // Lifecycle state persistence failure is fatal
            log.error("Failed to persist lifecycle state for job {}: {}", jobId, e.getMessage());

            throw new IllegalStateException("Lifecycle state persistence failed for jobId=" + jobId, e);
        }
    }

    @Override
    public JobStatus getStatus(String jobId) {

        try {

            // Resolve job workspace directory
            Path jobDir = Path.of(workspaceRoot, jobId);

            // Resolve status.json path
            Path statusPath = jobDir.resolve("status.json");

            // No persisted lifecycle state yet
            if (!Files.exists(statusPath)) {
                return null;
            }

            // Deserialize snapshot
            JobExecutionStatus snapshot =
                    objectMapper.readValue(statusPath.toFile(), JobExecutionStatus.class);

            // Lifecycle state not yet set
            if (snapshot.getJobStatus() == null) {
                return null;
            }

            // Convert stored string back to enum
            return JobStatus.valueOf(snapshot.getJobStatus());

        } catch (Exception e) {

            // Read failures are logged but not fatal
            log.error("Failed to read lifecycle state for job {}: {}", jobId, e.getMessage());

            return null;
        }
    }

    // --------------------------------------------------
    // Full Snapshot Read (public — used by controller)
    // --------------------------------------------------
    @Override
    public JobExecutionStatus readSnapshot(String jobId) {
        try {
            Path statusPath = Path.of(workspaceRoot, jobId).resolve("status.json");
            if (!Files.exists(statusPath)) return null;
            return objectMapper.readValue(statusPath.toFile(), JobExecutionStatus.class);
        } catch (Exception e) {
            log.error("Failed to read snapshot for job {}: {}", jobId, e.getMessage());
            return null;
        }
    }

    // --------------------------------------------------
    // Internal Helper — Read Snapshot If Exists
    // --------------------------------------------------
    private JobExecutionStatus readSnapshotIfExists(Path statusPath) throws Exception {

        // Return null if no status.json yet
        if (!Files.exists(statusPath)) {
            return null;
        }

        return objectMapper.readValue(statusPath.toFile(), JobExecutionStatus.class);
    }

    // --------------------------------------------------
    // Internal Helper — Atomic Write
    // --------------------------------------------------
    private void writeAtomically(Path statusPath,
                                 JobExecutionStatus snapshot) throws Exception {

        // Guarantee the job workspace directory exists.
        // The CREATED/VALIDATING transitions fire in RunnerServiceImpl.runDeploy() *before*
        // RunnerWorkspaceServiceImpl.prepareWorkspace() has had a chance to create the
        // directory tree. createDirectories() is idempotent — safe to call even if the
        // directory already exists later in the lifecycle.
        Files.createDirectories(statusPath.getParent());

        // Temporary file used to prevent partial writes
        Path tempFile = statusPath.resolveSibling("status.json.tmp");

        // Write snapshot to temp file
        try (FileOutputStream fos = new FileOutputStream(tempFile.toFile())) {

            objectMapper.writerWithDefaultPrettyPrinter()
                    .writeValue(fos, snapshot);

            // Force flush to disk where supported (important for crash safety).
            // Some filesystems (e.g. certain EC2 EBS mount configs) do not support
            // fsync and throw SyncFailedException — we log a warning and continue,
            // because the subsequent ATOMIC_MOVE still guarantees a consistent file.
            try {
                fos.getFD().sync();
            } catch (java.io.SyncFailedException e) {
                if (!fsyncWarningLogged) {
                    fsyncWarningLogged = true;
                    log.warn("fsync not supported on this filesystem — skipping (atomic rename still guarantees consistency)");
                }
            }
        }

        // Atomically replace status.json
        Files.move(
                tempFile,
                statusPath,
                StandardCopyOption.REPLACE_EXISTING,
                StandardCopyOption.ATOMIC_MOVE
        );
    }
}
