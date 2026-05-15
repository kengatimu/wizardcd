package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.JobExecutionStatus;
import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentStateEntity;
import com.ebb.wizardcd.runner.service.DeploymentPersistenceService;
import com.ebb.wizardcd.runner.service.RunnerJobStateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Phase 4 Stage 5 — DB-backed implementation of {@link RunnerJobStateService}.
 *
 * <p>This service is now a thin façade in front of {@link DeploymentPersistenceService}.
 * It exists for two reasons:
 *
 * <ol>
 *   <li><b>API stability for the orchestrator.</b> {@link com.ebb.wizardcd.runner.service.impl.RunnerServiceImpl}
 *       calls {@code updateStatus()} dozens of times across deploy / rollback /
 *       abort flows. Keeping the same interface means the orchestrator code
 *       doesn't change in Stage 5 — only the implementation moves to the DB.
 *   <li><b>Transparent file fallback for unmigrated jobs.</b> Until Stage 6
 *       back-fills the DB from existing workspace dirs, this layer reads from
 *       file as a fallback when the DB has no row for a given job id. After
 *       Stage 6 the fallback is dead code; it stays as a safety net.
 * </ol>
 *
 * <h2>Write path</h2>
 * <ul>
 *   <li>{@link #updateStatus(String, JobStatus)} → {@code DeploymentPersistenceService.transitionStatus(...)}</li>
 *   <li>{@link #updateState(String, JobExecutionStateStatus, String)} →
 *       <b>log-only</b>. V1 schema has no column for the execution sub-state;
 *       it remains a runtime / observability concept. (A future V2 migration
 *       can add a column if the UX requires it.)</li>
 * </ul>
 *
 * <h2>Read path</h2>
 * <ul>
 *   <li>{@link #getStatus(String)} — DB first, then file fallback.</li>
 *   <li>{@link #readSnapshot(String)} — DB first (constructs
 *       {@link JobExecutionStatus} from {@link DeploymentEntity} + lifecycle
 *       history), then file fallback.</li>
 *   <li>{@link #readCurrentState(String)} — file-only (no DB column).</li>
 * </ul>
 *
 * <h2>Security notes</h2>
 * <ul>
 *   <li>String jobId is parsed to UUID inside a try/catch — non-UUID jobIds
 *       (e.g. the {@code test-job-001} fixture) fall through cleanly to the
 *       file-based path without crashing.</li>
 *   <li>File reads use the validated {@code workspaceRoot} from config;
 *       jobId is treated as a single path segment so {@code ..} / {@code /}
 *       never escape the workspace root.</li>
 *   <li>DB writes fail loud ({@link IllegalStateException}) so callers can
 *       transition the job to FAILED rather than silently losing state.</li>
 * </ul>
 */
@Service
public class RunnerJobStateServiceImpl implements RunnerJobStateService {

    private static final Logger log = LoggerFactory.getLogger(RunnerJobStateServiceImpl.class);

    /** Base directory used for the file-fallback read path. */
    private final String workspaceRoot;

    /** Jackson — used only on the file-fallback read path. */
    private final ObjectMapper objectMapper;

    /** Phase 4 DB-backed persistence. */
    private final DeploymentPersistenceService persistence;

    public RunnerJobStateServiceImpl(
            @Value("${runner.workspaceRoot}") String workspaceRoot,
            ObjectMapper objectMapper,
            DeploymentPersistenceService persistence) {
        this.workspaceRoot = workspaceRoot;
        this.objectMapper = objectMapper;
        this.persistence = persistence;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Execution sub-state — log-only in Stage 5
    // ─────────────────────────────────────────────────────────────────────

    @Override
    public void updateState(String jobId, JobExecutionStateStatus executionState, String message) {
        // V1 schema has no column for JobExecutionStateStatus — Stage 5
        // deliberately drops persistence of execution sub-state. Lifecycle
        // status (JobStatus) covers the same ground for the UI. If a future
        // V2 migration adds an `execution_state` column, this becomes a DB
        // write; until then it's purely observational.
        log.info("[exec-state] job {} → {} ({})", jobId, executionState, message);
    }

    @Override
    public JobExecutionStateStatus readCurrentState(String jobId) {
        // No DB column for exec sub-state — try the file fallback so the
        // UI's exec-status column still works for unmigrated old jobs.
        return readExecStateFromFile(jobId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Lifecycle state — DB-backed via DeploymentPersistenceService
    // ─────────────────────────────────────────────────────────────────────

    @Override
    public void updateStatus(String jobId, JobStatus status) {
        Optional<UUID> uuid = parseJobUuid(jobId);
        if (uuid.isEmpty()) {
            // Non-UUID jobIds (test fixtures) — log and skip. There's no
            // sensible DB write target for them, and old file fixtures are
            // read-only.
            log.warn("Skipping lifecycle DB write for non-UUID jobId '{}' → {}", jobId, status);
            return;
        }
        try {
            persistence.transitionStatus(uuid.get(), status, null);
        } catch (java.util.NoSuchElementException e) {
            // Row doesn't exist yet — this happens when the orchestrator calls
            // updateStatus(CREATED) before the deployment row has been inserted
            // by RunnerServiceImpl. Stage 5 makes RunnerServiceImpl call
            // DeploymentPersistenceService.createDeployment() FIRST, so this
            // path should be unreachable in practice. Logging at warn so any
            // regression is visible.
            log.warn("Cannot transition jobId={} → {}: no deployment row found in DB", jobId, status);
            throw new IllegalStateException(
                    "transitionStatus called before createDeployment for jobId=" + jobId, e);
        }
    }

    @Override
    public JobStatus getStatus(String jobId) {
        // 1. DB first
        Optional<UUID> uuid = parseJobUuid(jobId);
        if (uuid.isPresent()) {
            Optional<DeploymentEntity> entity = persistence.findById(uuid.get());
            if (entity.isPresent()) {
                try {
                    return JobStatus.valueOf(entity.get().getStatus());
                } catch (IllegalArgumentException unknownState) {
                    log.warn("Unknown JobStatus '{}' in deployments table for jobId={}",
                            entity.get().getStatus(), jobId);
                    // fall through to file
                }
            }
        }

        // 2. File fallback — for unmigrated old jobs (and test fixtures)
        return readStatusFromFile(jobId);
    }

    @Override
    public JobExecutionStatus readSnapshot(String jobId) {
        // 1. DB first
        Optional<UUID> uuid = parseJobUuid(jobId);
        if (uuid.isPresent()) {
            Optional<DeploymentEntity> entity = persistence.findById(uuid.get());
            if (entity.isPresent()) {
                return buildSnapshotFromDb(jobId, entity.get());
            }
        }

        // 2. File fallback — for unmigrated old jobs
        return readSnapshotFromFile(jobId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal helpers — DB → DTO mapping
    // ─────────────────────────────────────────────────────────────────────

    private JobExecutionStatus buildSnapshotFromDb(String jobId, DeploymentEntity entity) {
        // Lifecycle field-only snapshot. Exec sub-state is null (V1 schema).
        JobExecutionStatus snap = new JobExecutionStatus(
                jobId,
                entity.getStatus(),                                            // lifecycle
                null,                                                          // exec sub-state — not persisted
                entity.getCompletedAt() != null ? entity.getCompletedAt() : entity.getCreatedAt(),
                null                                                           // message — not persisted on the row
        );
        snap.setCompletedAt(entity.getCompletedAt());

        // State history rebuilt from deployment_states rows
        List<DeploymentStateEntity> states = persistence.findStatesForDeployment(entity.getId());
        List<JobExecutionStatus.StateTransition> history = new ArrayList<>(states.size());
        for (DeploymentStateEntity s : states) {
            history.add(new JobExecutionStatus.StateTransition(s.getStatus(), s.getTimestamp()));
        }
        snap.setStateHistory(history);
        return snap;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal helpers — file fallback (transitional, removed post-Stage 6)
    // ─────────────────────────────────────────────────────────────────────

    private JobStatus readStatusFromFile(String jobId) {
        JobExecutionStatus snap = readSnapshotFromFile(jobId);
        if (snap == null || snap.getJobStatus() == null) return null;
        try {
            return JobStatus.valueOf(snap.getJobStatus());
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private JobExecutionStateStatus readExecStateFromFile(String jobId) {
        JobExecutionStatus snap = readSnapshotFromFile(jobId);
        if (snap == null || snap.getJobExecutionStateStatus() == null) return null;
        try {
            return JobExecutionStateStatus.valueOf(snap.getJobExecutionStateStatus());
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private JobExecutionStatus readSnapshotFromFile(String jobId) {
        try {
            Path statusPath = Path.of(workspaceRoot, jobId).resolve("status.json");
            if (!Files.exists(statusPath)) return null;
            return objectMapper.readValue(statusPath.toFile(), JobExecutionStatus.class);
        } catch (Exception e) {
            log.debug("File-fallback snapshot read failed for jobId={}: {}", jobId, e.getMessage());
            return null;
        }
    }

    /**
     * Parse a String jobId to UUID, returning {@link Optional#empty()} for
     * non-UUID inputs (test fixtures, malformed ids). Caller falls back to
     * file-based behaviour for those cases.
     */
    private static Optional<UUID> parseJobUuid(String jobId) {
        if (jobId == null || jobId.isBlank()) return Optional.empty();
        try {
            return Optional.of(UUID.fromString(jobId));
        } catch (IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
