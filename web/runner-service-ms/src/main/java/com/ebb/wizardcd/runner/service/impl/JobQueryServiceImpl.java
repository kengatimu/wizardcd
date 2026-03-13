package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.JobMetadata;
import com.ebb.wizardcd.runner.dto.JobSummary;
import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.service.JobQueryService;
import com.ebb.wizardcd.runner.service.RunnerJobStateService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

@Service
public class JobQueryServiceImpl implements JobQueryService {

    private static final Logger log = LoggerFactory.getLogger(JobQueryServiceImpl.class);
    private final String workspaceRoot;
    private final ObjectMapper objectMapper;
    private final RunnerJobStateService jobStateService;

    public JobQueryServiceImpl(@Value("${runner.workspaceRoot}") String workspaceRoot,
                               ObjectMapper objectMapper,
                               RunnerJobStateService jobStateService) {
        this.workspaceRoot = workspaceRoot;
        this.objectMapper = objectMapper;
        this.jobStateService = jobStateService;
    }

    @Override
    public List<JobSummary> findAll() {
        return discoverJobs(null);
    }

    @Override
    public List<JobSummary> findByStatus(JobStatus status) {
        return discoverJobs(status);
    }

    private List<JobSummary> discoverJobs(JobStatus filterStatus) {
        List<JobSummary> summaries = new ArrayList<>();
        File rootDir = new File(workspaceRoot);

        // 1. Validate root directory exists and is actually a directory
        if (!rootDir.exists() || !rootDir.isDirectory()) {
            log.warn("Workspace root does not exist or is invalid: {}", workspaceRoot);
            return summaries;
        }

        // 2. List all sub-directories (each representing a Job)
        File[] jobFolders = rootDir.listFiles(File::isDirectory);
        if (jobFolders == null) return summaries;

        for (File jobDir : jobFolders) {
            try {
                String jobId = jobDir.getName();

                // 3. Filter by lifecycle status before doing heavy JSON parsing
                JobStatus currentLifecycle = jobStateService.getStatus(jobId);
                if (currentLifecycle == null) {
                    log.debug("Skipping job {}: lifecycle state missing", jobId);
                    continue;
                }

                if (filterStatus != null && currentLifecycle != filterStatus) {
                    continue;
                }

                // 4. Ensure metadata.json exists inside the job folder
                File metadataFile = new File(jobDir, "metadata.json");
                if (!metadataFile.exists()) {
                    log.debug("Skipping job {}: metadata.json missing", jobId);
                    continue;
                }

                // 5. Deserialize metadata and fetch execution state
                JobMetadata meta = objectMapper.readValue(metadataFile, JobMetadata.class);
                JobExecutionStateStatus execState = jobStateService.readCurrentState(jobId);

                // 6. Map to DTO and add to results
                summaries.add(new JobSummary(
                        jobId,
                        meta.getApplication(),
                        meta.getEnvironment(),
                        meta.getCreatedAt(),
                        currentLifecycle,
                        execState
                ));

            } catch (Exception e) {
                log.warn("Failed to process job directory: {}", jobDir.getName(), e);
            }
        }

        return summaries;
    }
}