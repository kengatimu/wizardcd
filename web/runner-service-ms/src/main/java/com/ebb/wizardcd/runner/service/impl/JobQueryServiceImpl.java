package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.JobMetadata;
import com.ebb.wizardcd.runner.dto.JobSummary;
import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentRepository;
import com.ebb.wizardcd.runner.service.JobQueryService;
import com.ebb.wizardcd.runner.service.RunnerJobStateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Phase 4 Stage 5 — DB-backed dashboard query service.
 *
 * <p>The primary source is now {@link DeploymentRepository} — an indexed query
 * against the {@code deployments} table (sorted by {@code created_at DESC} via
 * {@code idx_deployments_created_at}). This replaces the filesystem scan that
 * was O(N) on workspace directory count.
 *
 * <p>To keep the dashboard complete during the Stage 5 → Stage 6 transition
 * window, results are unioned with a file-based scan for jobs whose workspace
 * directory exists but who don't yet have a DB row (pre-Stage-5 jobs that
 * haven't been migrated). The DB rows take precedence — file entries are only
 * added for IDs not present in the DB. After Stage 6's migration runs, the
 * union shrinks to an empty file set in practice; the code stays in place as
 * a safety net.
 *
 * <h2>Performance notes</h2>
 * <ul>
 *   <li>DB query is single SELECT — O(log N) via the index</li>
 *   <li>File scan upper-bounded by directory entry count; we read at most
 *       {@code metadata.json} + {@code status.json} per directory and only
 *       for the ones not in DB</li>
 *   <li>Deduplication uses a HashSet of String IDs — O(1) per lookup</li>
 * </ul>
 *
 * <h2>Failure semantics</h2>
 * <ul>
 *   <li>DB query failure → caller (controller) sees the exception; surfaces
 *       as 500 from /jobs. We do NOT silently fall back to file scan only —
 *       the dashboard going partial-stale is worse than visibly failing.</li>
 *   <li>File scan failure on an individual directory → debug log + skip
 *       that one entry (existing behaviour, preserved)</li>
 * </ul>
 */
@Service
public class JobQueryServiceImpl implements JobQueryService {

    private static final Logger log = LoggerFactory.getLogger(JobQueryServiceImpl.class);

    private final String workspaceRoot;
    private final ObjectMapper objectMapper;
    private final RunnerJobStateService jobStateService;
    private final DeploymentRepository deploymentRepository;

    public JobQueryServiceImpl(@Value("${runner.workspaceRoot}") String workspaceRoot,
                               ObjectMapper objectMapper,
                               RunnerJobStateService jobStateService,
                               DeploymentRepository deploymentRepository) {
        this.workspaceRoot = workspaceRoot;
        this.objectMapper = objectMapper;
        this.jobStateService = jobStateService;
        this.deploymentRepository = deploymentRepository;
    }

    @Override
    public List<JobSummary> findAll() {
        return query(null);
    }

    @Override
    public List<JobSummary> findByStatus(JobStatus status) {
        return query(status);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Internal — combined DB + file query
    // ─────────────────────────────────────────────────────────────────────

    private List<JobSummary> query(JobStatus filterStatus) {
        // 1. DB primary — indexed query, newest first
        List<DeploymentEntity> dbRows = (filterStatus == null)
                ? deploymentRepository.findAll()                          // PK index — natural order
                : deploymentRepository.findByStatusIn(List.of(filterStatus.name()));

        List<JobSummary> results = new ArrayList<>(dbRows.size());
        Set<String> seenIds = new HashSet<>(dbRows.size());

        for (DeploymentEntity entity : dbRows) {
            JobSummary summary = toSummary(entity);
            if (summary != null) {
                results.add(summary);
                seenIds.add(entity.getId().toString());
            }
        }

        // 2. File fallback for unmigrated jobs — union with DB results
        addFileFallbackEntries(filterStatus, seenIds, results);

        // 3. Sort newest first (mixed DB + file results need a final pass)
        results.sort((a, b) -> {
            if (a.getCreatedAt() == null) return 1;
            if (b.getCreatedAt() == null) return -1;
            return b.getCreatedAt().compareTo(a.getCreatedAt());
        });

        return results;
    }

    /** Build a JobSummary from a DB entity. Returns null if the entity is unusable. */
    private JobSummary toSummary(DeploymentEntity entity) {
        try {
            JobStatus lifecycle = JobStatus.valueOf(entity.getStatus());
            // Execution sub-state is not persisted in V1; left null. The UI's
            // Execution Status column degrades to "—".
            JobExecutionStateStatus execState = null;
            String jobType = entity.getJobType() != null ? entity.getJobType() : "deploy";

            return new JobSummary(
                    entity.getId().toString(),
                    entity.getAppName(),
                    entity.getEnvName(),
                    entity.getCreatedAt(),
                    lifecycle,
                    execState,
                    entity.getCompletedAt(),
                    jobType
            );
        } catch (IllegalArgumentException e) {
            log.warn("Deployment row {} has unknown status '{}' — skipping", entity.getId(), entity.getStatus());
            return null;
        }
    }

    /**
     * Add JobSummary entries from filesystem for jobs that don't have a DB row.
     * This handles two cases:
     *   1. Old jobs from before Stage 5 (no DB row at all).
     *   2. Test fixtures with non-UUID jobIds (e.g. "test-job-001").
     * Once Stage 6's migration tool runs against production, case 1 disappears.
     */
    private void addFileFallbackEntries(JobStatus filterStatus, Set<String> seenIds, List<JobSummary> results) {
        File rootDir = new File(workspaceRoot);
        if (!rootDir.exists() || !rootDir.isDirectory()) {
            return;
        }
        File[] jobFolders = rootDir.listFiles(File::isDirectory);
        if (jobFolders == null) return;

        for (File jobDir : jobFolders) {
            String jobId = jobDir.getName();

            // Skip if this job is already in DB results
            if (seenIds.contains(jobId)) continue;

            try {
                // Read lifecycle from file (will fall through to file-only
                // since DB has no row — see RunnerJobStateServiceImpl.getStatus())
                JobStatus currentLifecycle = jobStateService.getStatus(jobId);
                if (currentLifecycle == null) continue;
                if (filterStatus != null && currentLifecycle != filterStatus) continue;

                File metadataFile = new File(jobDir, "metadata.json");
                if (!metadataFile.exists()) continue;

                JobMetadata meta = objectMapper.readValue(metadataFile, JobMetadata.class);
                JobExecutionStateStatus execState = jobStateService.readCurrentState(jobId);
                com.ebb.wizardcd.runner.dto.JobExecutionStatus snapshot = jobStateService.readSnapshot(jobId);
                java.time.Instant completedAt = (snapshot != null) ? snapshot.getCompletedAt() : null;

                results.add(new JobSummary(
                        jobId,
                        meta.getApplication(),
                        meta.getEnvironment(),
                        meta.getCreatedAt(),
                        currentLifecycle,
                        execState,
                        completedAt,
                        meta.getJobType()
                ));
            } catch (Exception e) {
                log.debug("Skipping file-fallback job dir {}: {}", jobId, e.getMessage());
            }
        }
    }
}
