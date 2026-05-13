package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.service.DeploymentPersistenceService;
import com.ebb.wizardcd.runner.service.RunnerRecoveryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Phase 4 Stage 5 — DB-driven crash recovery on startup.
 *
 * <p>Replaces the earlier filesystem scan of {@code workspace/jobs/}. We now
 * query the {@code deployments} table for any rows in a non-terminal state
 * (CREATED / VALIDATING / PREPARING_WORKSPACE / RUNNING / ABORT_REQUESTED) and
 * transition them to FAILED with a "runner restarted" message.
 *
 * <p>Two reasons for this approach over the file scan:
 * <ol>
 *   <li><b>Correctness</b> — the file scan was filtering by execution
 *       sub-state (RECEIVED / WORKSPACE_READY / RUNNING) which Stage 5 no
 *       longer persists. Lifecycle status is the canonical source of "stuck
 *       or not" and that lives in the DB.</li>
 *   <li><b>Performance</b> — boot-time scan of N workspace dirs becomes a
 *       single indexed query on {@code idx_deployments_status}.</li>
 * </ol>
 *
 * <p>Unmigrated old jobs (pre-Stage-5 file-only) cannot be recovered through
 * this service because they have no DB row. That's acceptable for Phase 4:
 *   - If they were in a stuck file state when the runner stopped, restart
 *     doesn't make them "less stuck"; user-visible status remains whatever
 *     the old status.json said.
 *   - Stage 6's migration tool will back-fill DB rows from these workspace
 *     dirs, after which subsequent restarts can recover them normally.
 */
@Service
public class RunnerRecoveryServiceImpl implements RunnerRecoveryService {

    private static final Logger log = LoggerFactory.getLogger(RunnerRecoveryServiceImpl.class);

    private final DeploymentPersistenceService persistence;

    public RunnerRecoveryServiceImpl(DeploymentPersistenceService persistence) {
        this.persistence = persistence;
    }

    @Override
    public void reconcileOnStartup() {
        log.info("Runner recovery — scanning DB for deployments stuck in non-terminal states");

        List<DeploymentEntity> stuck;
        try {
            stuck = persistence.findStuckDeployments();
        } catch (Exception e) {
            // DB unavailable on startup is fatal in production but we don't want
            // to bring the runner down — log error and continue.
            log.error("Recovery DB query failed — skipping recovery. New jobs will still work. Reason: {}",
                    e.getMessage(), e);
            return;
        }

        if (stuck.isEmpty()) {
            log.info("Runner recovery — no stuck deployments found");
            return;
        }

        log.warn("Runner recovery — found {} stuck deployment(s); marking each as FAILED", stuck.size());

        int recovered = 0;
        for (DeploymentEntity d : stuck) {
            try {
                persistence.transitionStatus(d.getId(), JobStatus.FAILED,
                        "Runner restarted while job was in state " + d.getStatus());
                log.warn("Recovered stuck deployment {} (app={}/{} was {} → now FAILED)",
                        d.getId(), d.getAppName(), d.getEnvName(), d.getStatus());
                recovered++;
            } catch (Exception e) {
                log.error("Failed to recover stuck deployment {}: {}", d.getId(), e.getMessage(), e);
                // Continue with others — one row failing recovery shouldn't
                // block recovery of the rest.
            }
        }

        log.info("Runner recovery complete — recovered {}/{} stuck deployment(s)", recovered, stuck.size());
    }
}
