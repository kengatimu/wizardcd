package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentStateEntity;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Phase 4 — the single API for "create + transition deployments in the
 * database". This service replaces the file-based writes done today by
 * {@code RunnerJobStateServiceImpl} and {@code RunnerWorkspaceServiceImpl}
 * (which still write workspace artefacts to disk — only the metadata moves
 * to PostgreSQL).
 *
 * <p>All write methods are transactional: a state transition atomically
 * updates {@code deployments.status} and inserts a new {@code deployment_states}
 * row, so a reader will never see them out-of-sync.
 *
 * <p>Stage 4 introduces this service but leaves the existing file-based path
 * intact. Stage 5 refactors the consumers to call this service instead.
 */
public interface DeploymentPersistenceService {

    // ── Writes ─────────────────────────────────────────────────────────────

    /**
     * Persist a brand-new deployment. Inserts the {@code deployments} row,
     * upserts the parent {@code applications} row by name (so the dashboard
     * "filter by app" and Application page work without manual registration),
     * and inserts the initial {@code deployment_states} row with status
     * {@link JobStatus#CREATED}.
     *
     * @return the persisted {@link DeploymentEntity} (managed by the persistence
     *         context — caller may freely read its associations)
     */
    DeploymentEntity createDeployment(CreateDeploymentCommand cmd);

    /**
     * Atomically transition a deployment to a new lifecycle state.
     * Updates {@code deployments.status} and inserts a new
     * {@code deployment_states} row with the same status + a {@code now()}
     * timestamp. If the new status is terminal
     * ({@link JobStatus#SUCCESS} / {@link JobStatus#FAILED} /
     * {@link JobStatus#ABORTED}), also sets {@code deployments.completed_at}.
     *
     * @throws java.util.NoSuchElementException if no deployment exists with the given id
     */
    void transitionStatus(UUID deploymentId, JobStatus newStatus, String message);

    // ── Reads ──────────────────────────────────────────────────────────────

    /**
     * Find a deployment by id. Returns {@link Optional#empty()} if the id
     * doesn't match any row — never throws.
     */
    Optional<DeploymentEntity> findById(UUID deploymentId);

    /**
     * Lifecycle history for a deployment in chronological order. Empty list
     * if no history rows exist (which would be a data integrity issue —
     * {@link #createDeployment} always inserts one).
     */
    List<DeploymentStateEntity> findStatesForDeployment(UUID deploymentId);

    /**
     * Deployments still in a non-terminal state — used by the boot-time
     * crash recovery sweep. Matches what
     * {@code RunnerRecoveryServiceImpl} does today by scanning the workspace
     * directory.
     *
     * <p>Returns rows where {@code status} ∈ {CREATED, VALIDATING,
     * PREPARING_WORKSPACE, RUNNING, ABORT_REQUESTED}.
     */
    List<DeploymentEntity> findStuckDeployments();
}
