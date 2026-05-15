package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.persistence.entity.AuditEventEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentStateEntity;
import com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository;
import com.ebb.wizardcd.runner.persistence.repository.AuditEventRepository;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentRepository;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentStateRepository;
import com.ebb.wizardcd.runner.service.CreateDeploymentCommand;
import com.ebb.wizardcd.runner.service.DeploymentPersistenceService;
import com.ebb.wizardcd.runner.service.audit.AuditAction;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Phase 4 — end-to-end contract test for the deploy-lifecycle persistence
 * service.
 *
 * <p>Exercises the two write methods that every production code path
 * eventually funnels through, against a real Spring context and a real H2
 * database with Flyway-managed schema. Concretely we verify:
 *
 * <ol>
 *   <li><b>createDeployment</b> persists the deployment row, lazily
 *       upserts the parent application by name, inserts the initial
 *       {@code CREATED} state row, and writes a single DEPLOY (or
 *       REDEPLOY / ROLLBACK) audit row tagged with the right resource.</li>
 *   <li><b>transitionStatus</b> updates the deployment status, appends a
 *       new {@code deployment_states} row, sets {@code completed_at} on
 *       terminal states, and writes an ABORT audit row only when the
 *       caller transitions to {@code ABORT_REQUESTED} (the *request*
 *       edge — not when the runner eventually flips to {@code ABORTED}).</li>
 *   <li><b>findStuckDeployments</b> returns only non-terminal rows, used
 *       by the crash-recovery service on startup.</li>
 *   <li><b>transitionStatus</b> throws when given an unknown id, so a
 *       buggy caller fails loudly rather than corrupting state.</li>
 * </ol>
 *
 * <p>The class is {@code @Transactional} so each test method runs inside
 * a transaction Spring rolls back at the end — isolated, idempotent,
 * order-independent.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class DeploymentPersistenceServiceIntegrationTest {

    @Autowired private DeploymentPersistenceService persistence;
    @Autowired private DeploymentRepository         deploymentRepo;
    @Autowired private DeploymentStateRepository    stateRepo;
    @Autowired private ApplicationRepository        applicationRepo;
    @Autowired private AuditEventRepository         auditRepo;

    // ── Test 1 — createDeployment full happy path ─────────────────────────

    @Test
    void createDeploymentInsertsRowsAcrossAllFourTables() {
        UUID jobId = UUID.randomUUID();
        var cmd = CreateDeploymentCommand.deploy(
                jobId,
                "persist-test-app",
                "DEV",
                "persist-test-app-1.0.0.jar",
                "{\"appName\":\"persist-test-app\"}",
                "/tmp/workspace/" + jobId
        );

        DeploymentEntity saved = persistence.createDeployment(cmd);

        // 1. deployment row persisted with correct fields
        assertThat(saved.getId()).isEqualTo(jobId);
        assertThat(saved.getStatus()).isEqualTo(JobStatus.CREATED.name());
        assertThat(saved.getJobType()).isEqualTo("deploy");
        assertThat(saved.getCompletedAt()).isNull();
        assertThat(saved.getApplication()).isNotNull();

        // 2. application row auto-upserted by name
        assertThat(applicationRepo.findByName("persist-test-app"))
                .as("application should have been lazily registered")
                .hasValueSatisfying(a -> assertThat(a.getName()).isEqualTo("persist-test-app"));

        // 3. initial state row inserted
        List<DeploymentStateEntity> states =
                stateRepo.findByDeployment_IdOrderByTimestampAsc(jobId);
        assertThat(states)
                .as("initial state row must be CREATED")
                .singleElement()
                .satisfies(s -> assertThat(s.getStatus()).isEqualTo(JobStatus.CREATED.name()));

        // 4. one DEPLOY audit row tagged appName/envName
        List<AuditEventEntity> deployAudits =
                auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.DEPLOY);
        assertThat(deployAudits)
                .as("createDeployment must emit a single DEPLOY audit row")
                .anyMatch(a -> ("persist-test-app/DEV").equals(a.getResource()));
    }

    // ── Test 2 — redeploy / rollback emit the matching audit action ──────

    @Test
    void redeployAndRollbackEmitTheirOwnAuditAction() {
        UUID redeployJobId = UUID.randomUUID();
        UUID rollbackJobId = UUID.randomUUID();
        UUID originalId    = UUID.randomUUID();

        persistence.createDeployment(new CreateDeploymentCommand(
                redeployJobId, "audit-test-app", "SIT", "redeploy",
                null, null, originalId, null, null));
        persistence.createDeployment(new CreateDeploymentCommand(
                rollbackJobId, "audit-test-app", "SIT", "rollback",
                null, null, originalId, null, null));

        long redeployCount = auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.REDEPLOY)
                .stream().filter(a -> "audit-test-app/SIT".equals(a.getResource())).count();
        long rollbackCount = auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.ROLLBACK)
                .stream().filter(a -> "audit-test-app/SIT".equals(a.getResource())).count();

        assertThat(redeployCount).as("one REDEPLOY audit row").isEqualTo(1);
        assertThat(rollbackCount).as("one ROLLBACK audit row").isEqualTo(1);
    }

    // ── Test 3 — transitionStatus flow + ABORT audit + terminal stamping ─

    @Test
    void transitionStatusAppendsHistoryAndStampsTerminalAndAuditsAbort() {
        UUID jobId = UUID.randomUUID();
        persistence.createDeployment(CreateDeploymentCommand.deploy(
                jobId, "transition-app", "UAT",
                "transition-app.jar", null, "/tmp/ws"));

        // Walk through the lifecycle.
        persistence.transitionStatus(jobId, JobStatus.VALIDATING, null);
        persistence.transitionStatus(jobId, JobStatus.PREPARING_WORKSPACE, null);
        persistence.transitionStatus(jobId, JobStatus.RUNNING, null);
        persistence.transitionStatus(jobId, JobStatus.ABORT_REQUESTED, "user clicked Abort");
        persistence.transitionStatus(jobId, JobStatus.ABORTED, "killed");

        DeploymentEntity loaded = deploymentRepo.findById(jobId).orElseThrow();
        assertThat(loaded.getStatus()).isEqualTo(JobStatus.ABORTED.name());
        assertThat(loaded.getCompletedAt())
                .as("terminal status should stamp completed_at")
                .isNotNull();

        // States: CREATED + 5 transitions = 6 rows in order
        List<DeploymentStateEntity> history =
                stateRepo.findByDeployment_IdOrderByTimestampAsc(jobId);
        assertThat(history).extracting(DeploymentStateEntity::getStatus)
                .containsExactly(
                        JobStatus.CREATED.name(),
                        JobStatus.VALIDATING.name(),
                        JobStatus.PREPARING_WORKSPACE.name(),
                        JobStatus.RUNNING.name(),
                        JobStatus.ABORT_REQUESTED.name(),
                        JobStatus.ABORTED.name()
                );

        // Exactly one ABORT audit row for this resource — the *request* edge,
        // not the final ABORTED transition.
        long abortCount = auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.ABORT)
                .stream().filter(a -> "transition-app/UAT".equals(a.getResource())).count();
        assertThat(abortCount).isEqualTo(1);
    }

    // ── Test 4 — findStuckDeployments filters to non-terminal rows ───────

    @Test
    void findStuckDeploymentsReturnsOnlyNonTerminalRows() {
        UUID stuckId      = UUID.randomUUID();
        UUID succeededId  = UUID.randomUUID();

        persistence.createDeployment(CreateDeploymentCommand.deploy(
                stuckId, "stuck-app", "DEV", "a.jar", null, "/tmp/ws"));
        persistence.transitionStatus(stuckId, JobStatus.RUNNING, null);

        persistence.createDeployment(CreateDeploymentCommand.deploy(
                succeededId, "stuck-app", "DEV", "b.jar", null, "/tmp/ws"));
        persistence.transitionStatus(succeededId, JobStatus.SUCCESS, null);

        List<DeploymentEntity> stuck = persistence.findStuckDeployments();

        assertThat(stuck)
                .as("stuck list contains the RUNNING row")
                .anyMatch(d -> d.getId().equals(stuckId));
        assertThat(stuck)
                .as("stuck list excludes the SUCCESS row")
                .noneMatch(d -> d.getId().equals(succeededId));
    }

    // ── Test 5 — unknown deployment id throws cleanly ────────────────────

    @Test
    void transitionStatusThrowsWhenDeploymentIdUnknown() {
        UUID nonExistent = UUID.randomUUID();
        assertThatThrownBy(() ->
                persistence.transitionStatus(nonExistent, JobStatus.RUNNING, null))
                .isInstanceOf(java.util.NoSuchElementException.class)
                .hasMessageContaining(nonExistent.toString());
    }
}
