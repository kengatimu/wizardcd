package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentStateEntity;
import com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentRepository;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentStateRepository;
import com.ebb.wizardcd.runner.service.CreateDeploymentCommand;
import com.ebb.wizardcd.runner.service.DeploymentPersistenceService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * JPA-backed implementation of {@link DeploymentPersistenceService}.
 *
 * <p>All write methods are transactional. The state transition method
 * intentionally does TWO writes inside the same transaction (UPDATE
 * deployments + INSERT deployment_states) so a concurrent reader can never
 * see the row in an inconsistent state.
 */
@Service
public class DeploymentPersistenceServiceImpl implements DeploymentPersistenceService {

    private static final Logger log = LoggerFactory.getLogger(DeploymentPersistenceServiceImpl.class);

    /** Terminal states — setting any of these on a deployment also stamps {@code completed_at}. */
    private static final Set<JobStatus> TERMINAL_STATES =
            EnumSet.of(JobStatus.SUCCESS, JobStatus.FAILED, JobStatus.ABORTED);

    /** Non-terminal states — used by {@link #findStuckDeployments()} for crash recovery. */
    private static final List<String> NON_TERMINAL_STATE_NAMES = List.of(
            JobStatus.CREATED.name(),
            JobStatus.VALIDATING.name(),
            JobStatus.PREPARING_WORKSPACE.name(),
            JobStatus.RUNNING.name(),
            JobStatus.ABORT_REQUESTED.name()
    );

    private final DeploymentRepository deploymentRepo;
    private final DeploymentStateRepository deploymentStateRepo;
    private final ApplicationRepository applicationRepo;

    public DeploymentPersistenceServiceImpl(
            DeploymentRepository deploymentRepo,
            DeploymentStateRepository deploymentStateRepo,
            ApplicationRepository applicationRepo) {
        this.deploymentRepo = deploymentRepo;
        this.deploymentStateRepo = deploymentStateRepo;
        this.applicationRepo = applicationRepo;
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public DeploymentEntity createDeployment(CreateDeploymentCommand cmd) {
        log.debug("Creating deployment id={} app={} env={} jobType={}",
                cmd.id(), cmd.appName(), cmd.envName(), cmd.jobType());

        // Upsert the parent application by name. The unique constraint
        // makes "find-or-create" race-safe even under concurrent inserts
        // (the second writer will see the row from the first writer).
        ApplicationEntity application = applicationRepo.findByName(cmd.appName())
                .orElseGet(() -> {
                    ApplicationEntity fresh = new ApplicationEntity(
                            UUID.randomUUID(), cmd.appName(), null);
                    return applicationRepo.save(fresh);
                });

        DeploymentEntity deployment = new DeploymentEntity(
                cmd.id(), cmd.appName(), cmd.envName(), JobStatus.CREATED.name());
        deployment.setApplication(application);
        deployment.setJobType(cmd.jobType() != null ? cmd.jobType() : "deploy");
        deployment.setJarName(cmd.jarName());
        deployment.setConfigSnapshot(cmd.configSnapshot());
        deployment.setSourceJobId(cmd.sourceJobId());
        deployment.setWorkspacePath(cmd.workspacePath());
        deployment.setCreatedBy(cmd.createdBy());

        DeploymentEntity saved = deploymentRepo.save(deployment);

        // Initial state row — caller sees a complete lifecycle from the first state.
        DeploymentStateEntity initialState = new DeploymentStateEntity(
                saved, JobStatus.CREATED.name(), Instant.now());
        deploymentStateRepo.save(initialState);

        log.info("Persisted new deployment id={} app={}/{} status=CREATED",
                saved.getId(), saved.getAppName(), saved.getEnvName());

        return saved;
    }

    @Override
    @Transactional
    public void transitionStatus(UUID deploymentId, JobStatus newStatus, String message) {
        DeploymentEntity deployment = deploymentRepo.findById(deploymentId)
                .orElseThrow(() -> new NoSuchElementException(
                        "No deployment with id " + deploymentId));

        String previousStatus = deployment.getStatus();

        Instant now = Instant.now();
        deployment.setStatus(newStatus.name());
        if (TERMINAL_STATES.contains(newStatus)) {
            deployment.setCompletedAt(now);
        }
        // JPA dirty-checking will flush the UPDATE on transaction commit;
        // explicit save() is not required but is clearer in intent.
        deploymentRepo.save(deployment);

        DeploymentStateEntity stateRow = new DeploymentStateEntity(
                deployment, newStatus.name(), now);
        deploymentStateRepo.save(stateRow);

        log.info("Deployment {} transition: {} → {} (message='{}')",
                deploymentId, previousStatus, newStatus, message);
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public Optional<DeploymentEntity> findById(UUID deploymentId) {
        return deploymentRepo.findById(deploymentId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DeploymentStateEntity> findStatesForDeployment(UUID deploymentId) {
        return deploymentStateRepo.findByDeployment_IdOrderByTimestampAsc(deploymentId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DeploymentEntity> findStuckDeployments() {
        return deploymentRepo.findByStatusIn(NON_TERMINAL_STATE_NAMES);
    }
}
