package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentRepository;
import com.ebb.wizardcd.runner.service.CreateDeploymentCommand;
import com.ebb.wizardcd.runner.service.DeploymentPersistenceService;
import com.ebb.wizardcd.runner.service.RunnerRecoveryService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Phase 4 Stage 5 — DB-driven crash-recovery test.
 *
 * <p>Boots the full Spring context (so the real {@link RunnerRecoveryService}
 * bean is used, not a hand-rolled stub), seeds deployments in every
 * non-terminal state, then invokes {@link RunnerRecoveryService#reconcileOnStartup()}
 * and asserts that:
 *
 * <ol>
 *   <li>Every non-terminal deployment is flipped to {@code FAILED}.</li>
 *   <li>Each flipped deployment gets {@code completed_at} stamped.</li>
 *   <li>Already-terminal deployments (SUCCESS / FAILED / ABORTED) are
 *       left untouched — recovery is idempotent and never mutates rows
 *       it shouldn't.</li>
 *   <li>Calling recovery a second time is a no-op (the first pass already
 *       moved everything to terminal states).</li>
 * </ol>
 *
 * <p>Important transactional caveat: this test class is NOT
 * {@code @Transactional}, because the recovery service runs its writes in
 * its OWN transactions via {@code DeploymentPersistenceService}. A test-
 * level transaction would isolate the test thread from the service writes
 * and the assertions would see stale data. We therefore clean up after
 * each test explicitly.
 */
@SpringBootTest
@ActiveProfiles("test")
class RunnerRecoveryServiceIntegrationTest {

    @Autowired private RunnerRecoveryService       recovery;
    @Autowired private DeploymentPersistenceService persistence;
    @Autowired private DeploymentRepository        deploymentRepo;

    @Test
    void reconcileOnStartupFlipsAllNonTerminalDeploymentsToFailed() {
        // Seed one deployment per non-terminal lifecycle state.
        UUID createdId = createDeploymentInState("recovery-app", "DEV", null);
        UUID validatingId = createDeploymentInState("recovery-app", "DEV", JobStatus.VALIDATING);
        UUID preparingId  = createDeploymentInState("recovery-app", "DEV", JobStatus.PREPARING_WORKSPACE);
        UUID runningId    = createDeploymentInState("recovery-app", "DEV", JobStatus.RUNNING);
        UUID abortReqId   = createDeploymentInState("recovery-app", "DEV", JobStatus.ABORT_REQUESTED);

        // And one already-terminal that recovery MUST NOT touch.
        UUID successId    = createDeploymentInState("recovery-app", "DEV", JobStatus.SUCCESS);

        List<UUID> seeded = List.of(createdId, validatingId, preparingId, runningId, abortReqId, successId);

        try {
            recovery.reconcileOnStartup();

            // Non-terminal seeds should all be FAILED now with completed_at set.
            for (UUID nonTerminalId :
                    List.of(createdId, validatingId, preparingId, runningId, abortReqId)) {
                DeploymentEntity recovered = deploymentRepo.findById(nonTerminalId).orElseThrow();
                assertThat(recovered.getStatus())
                        .as("stuck deployment %s should be FAILED", nonTerminalId)
                        .isEqualTo(JobStatus.FAILED.name());
                assertThat(recovered.getCompletedAt())
                        .as("recovered deployment %s should have completed_at", nonTerminalId)
                        .isNotNull();
            }

            // The SUCCESS row must be left exactly as it was.
            DeploymentEntity untouched = deploymentRepo.findById(successId).orElseThrow();
            assertThat(untouched.getStatus()).isEqualTo(JobStatus.SUCCESS.name());

            // Second pass — idempotent: nothing left to recover.
            recovery.reconcileOnStartup();
            for (UUID nonTerminalId :
                    List.of(createdId, validatingId, preparingId, runningId, abortReqId)) {
                assertThat(deploymentRepo.findById(nonTerminalId).orElseThrow().getStatus())
                        .as("second recovery pass should not change %s", nonTerminalId)
                        .isEqualTo(JobStatus.FAILED.name());
            }
        } finally {
            // Per-test cleanup — the class is NOT @Transactional so we have
            // to undo our seeds manually to keep tests independent.
            deploymentRepo.deleteAllById(seeded);
        }
    }

    // ── helpers ────────────────────────────────────────────────────────────

    /**
     * Create a deployment then (optionally) transition it to the target
     * state. Pass {@code null} to leave it in the freshly-created
     * {@code CREATED} state.
     */
    private UUID createDeploymentInState(String app, String env, JobStatus target) {
        UUID id = UUID.randomUUID();
        persistence.createDeployment(CreateDeploymentCommand.deploy(
                id, app, env, "recovery.jar", null, "/tmp/" + id));
        if (target != null && target != JobStatus.CREATED) {
            persistence.transitionStatus(id, target, "test seed");
        }
        return id;
    }
}
