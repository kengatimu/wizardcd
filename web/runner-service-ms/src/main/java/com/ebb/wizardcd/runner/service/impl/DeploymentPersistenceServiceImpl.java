package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentStateEntity;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentRepository;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentStateRepository;
import com.ebb.wizardcd.runner.service.ApplicationService;
import com.ebb.wizardcd.runner.service.AuditService;
import com.ebb.wizardcd.runner.service.CreateDeploymentCommand;
import com.ebb.wizardcd.runner.service.DeploymentPersistenceService;
import com.ebb.wizardcd.runner.service.audit.AuditAction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
    private final ApplicationService applicationService;
    private final AuditService auditService;

    public DeploymentPersistenceServiceImpl(
            DeploymentRepository deploymentRepo,
            DeploymentStateRepository deploymentStateRepo,
            ApplicationService applicationService,
            AuditService auditService) {
        this.deploymentRepo = deploymentRepo;
        this.deploymentStateRepo = deploymentStateRepo;
        this.applicationService = applicationService;
        this.auditService = auditService;
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public DeploymentEntity createDeployment(CreateDeploymentCommand cmd) {
        log.debug("Creating deployment id={} app={} env={} jobType={}",
                cmd.id(), cmd.appName(), cmd.envName(), cmd.jobType());

        // Race-safe upsert of the parent application — the UNIQUE(name)
        // constraint backs the contract, the service centralises name
        // validation so a future Phase 5 / Phase 6 rule (e.g. owner scoping)
        // is enforced consistently with explicit CRUD endpoints.
        ApplicationEntity application =
                applicationService.findOrCreateByName(cmd.appName(), null);

        String jobType = cmd.jobType() != null ? cmd.jobType() : "deploy";

        DeploymentEntity deployment = new DeploymentEntity(
                cmd.id(), cmd.appName(), cmd.envName(), JobStatus.CREATED.name());
        deployment.setApplication(application);
        deployment.setJobType(jobType);
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

        // Audit row — emitted inside the same transaction so a successful
        // persist always has a matching audit trail (or both roll back).
        auditService.record(
                auditActionForJobType(jobType),
                resourceFor(saved),
                createDeploymentDetails(saved),
                saved.getCreatedBy()
        );

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

        // Audit row when the operator actively asks for the deploy to stop.
        // We record at the *request* edge (ABORT_REQUESTED) rather than the
        // final ABORTED state because that captures the user's intent, not
        // the runner's eventual reaction (which may race with completion).
        if (newStatus == JobStatus.ABORT_REQUESTED) {
            Map<String, Object> details = new HashMap<>();
            details.put("previousStatus", previousStatus);
            details.put("jobId", deploymentId.toString());
            if (message != null && !message.isBlank()) {
                details.put("message", message);
            }
            auditService.record(
                    AuditAction.ABORT,
                    resourceFor(deployment),
                    details,
                    deployment.getCreatedBy()
            );
        }

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

    // ── Audit helpers ──────────────────────────────────────────────────────

    /**
     * Map a {@code jobType} string (deploy / redeploy / rollback) to the
     * corresponding {@link AuditAction} constant. Unknown / null values
     * default to {@code DEPLOY} so the audit log always has an action.
     */
    private static String auditActionForJobType(String jobType) {
        if (jobType == null) return AuditAction.DEPLOY;
        return switch (jobType.toLowerCase()) {
            case "redeploy" -> AuditAction.REDEPLOY;
            case "rollback" -> AuditAction.ROLLBACK;
            default         -> AuditAction.DEPLOY;
        };
    }

    /**
     * Canonical resource identifier for audit rows targeting a deployment.
     * Format: {@code <appName>/<envName>} — matches the convention used in
     * the roadmap spec (§4.2) and is stable across redeploy/rollback.
     */
    private static String resourceFor(DeploymentEntity d) {
        return d.getAppName() + "/" + d.getEnvName();
    }

    /**
     * Structured details payload for DEPLOY / REDEPLOY / ROLLBACK audit
     * rows. Captures enough metadata that the audit log UI can render a
     * one-liner without joining back to {@code deployments}.
     */
    private static Map<String, Object> createDeploymentDetails(DeploymentEntity d) {
        Map<String, Object> details = new HashMap<>();
        details.put("jobId",   d.getId().toString());
        details.put("jobType", d.getJobType());
        details.put("appName", d.getAppName());
        details.put("envName", d.getEnvName());
        if (d.getJarName() != null)      details.put("jarName",     d.getJarName());
        if (d.getSourceJobId() != null)  details.put("sourceJobId", d.getSourceJobId().toString());
        return details;
    }
}
