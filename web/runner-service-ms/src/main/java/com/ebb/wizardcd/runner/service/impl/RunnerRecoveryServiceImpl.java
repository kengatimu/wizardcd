package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.service.RunnerJobStateService;
import com.ebb.wizardcd.runner.service.RunnerRecoveryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Service
public class RunnerRecoveryServiceImpl implements RunnerRecoveryService {

    private static final Logger log = LoggerFactory.getLogger(RunnerRecoveryServiceImpl.class);

    // Runner-owned service for reading and updating execution state
    private final RunnerJobStateService jobStateService;

    public RunnerRecoveryServiceImpl(RunnerJobStateService jobStateService) {
        this.jobStateService = jobStateService;
    }

    @Override
    public void reconcileOnStartup() {

        // Recovery entry point invoked once at application startup
        log.info("Runner recovery started — scanning workspace for incomplete jobs");

        // Root directory containing all job workspaces
        Path jobsRoot = Paths.get("workspace/jobs");

        // If workspace directory does not exist, nothing to reconcile
        if (!Files.isDirectory(jobsRoot)) {
            log.info("workspace/jobs directory not found — recovery skipped");
            return;
        }

        try (DirectoryStream<Path> jobDirectories = Files.newDirectoryStream(jobsRoot)) {

            // Iterate through every job directory
            for (Path jobDir : jobDirectories) {

                // Ignore non-directory entries
                if (!Files.isDirectory(jobDir)) {
                    continue;
                }

                // Reconcile a single job based on its last persisted execution state
                reconcileSingleJob(jobDir);
            }

        } catch (Exception e) {

            // Any failure during scan is logged but does not crash runner startup
            log.error("Runner recovery failed during workspace scan: {}", e.getMessage());
        }

        // Recovery phase completed — runner now consistent
        log.info("Runner recovery completed");
    }

    private void reconcileSingleJob(Path jobDir) {

        // Extract jobId from directory name
        String jobId = jobDir.getFileName().toString();

        // Read last persisted execution state from status.json
        JobExecutionStateStatus lastState = jobStateService.readCurrentState(jobId);

        // If no execution state exists, nothing to reconcile
        if (lastState == null) {
            return;
        }

        // Recovery rules:
        // RECEIVED          : safe (never executed)
        // WORKSPACE_READY   : runner crashed before execution
        // RUNNING           : runner crashed during execution
        // SUCCEEDED         : terminal, do nothing
        // FAILED            : terminal, do nothing
        // TIMEOUT           : terminal, do nothing

        switch (lastState) {

            case RECEIVED:
                // Job was accepted but never executed — safe to leave unchanged
                return;

            case SUCCEEDED:
                // Terminal successful state — no mutation required
                return;

            case FAILED:
                // Terminal failure state — no mutation required
                return;

            case TIMEOUT:
                // Terminal timeout state — no mutation required
                return;

            case WORKSPACE_READY:
                // Runner prepared workspace but crashed before execution
                log.warn("Job {} was WORKSPACE_READY during crash — marking FAILED", jobId);

                jobStateService.updateState(jobId, JobExecutionStateStatus.FAILED, "Runner restarted before execution began");
                return;

            case RUNNING:
                // Runner crashed while deploy.sh was running
                log.warn("Job {} was RUNNING during crash — marking FAILED", jobId);

                jobStateService.updateState(jobId, JobExecutionStateStatus.FAILED, "Runner restarted during execution");
        }
    }
}
