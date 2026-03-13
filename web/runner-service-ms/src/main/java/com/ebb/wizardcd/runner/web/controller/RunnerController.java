package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.dto.DashboardSummary;
import com.ebb.wizardcd.runner.dto.DeploymentRequest;
import com.ebb.wizardcd.runner.dto.JobResponse;
import com.ebb.wizardcd.runner.dto.JobSummary;
import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.service.JobQueryService;
import com.ebb.wizardcd.runner.service.RunnerJobStateService;
import com.ebb.wizardcd.runner.service.RunnerService;
import org.apache.commons.io.input.ReversedLinesFileReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/jobs")
public class RunnerController {

    private static final Logger log =
            LoggerFactory.getLogger(RunnerController.class);

    private final String workspaceRoot;
    private final RunnerService runnerService;
    private final RunnerJobStateService jobStateService;
    private final JobQueryService jobQueryService;

    public RunnerController(@Value("${runner.workspaceRoot}") String workspaceRoot,
                            RunnerService runnerService,
                            RunnerJobStateService jobStateService,
                            JobQueryService jobQueryService) {
        this.workspaceRoot = workspaceRoot;
        this.runnerService = runnerService;
        this.jobStateService = jobStateService;
        this.jobQueryService = jobQueryService;
    }

    // Accept deployment request and return HTTP 202 because execution is asynchronous
    @PostMapping(consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<JobResponse> submit(
            @RequestPart("request") DeploymentRequest request,
            @RequestPart("jarArtifact") MultipartFile jarArtifact,
            @RequestPart(value = "libZip",    required = false) MultipartFile libZip,
            @RequestPart(value = "certZips",  required = false) List<MultipartFile> certZips,
            @RequestPart(value = "extraZips", required = false) List<MultipartFile> extraZips) {

        // Generate secure unique jobId inside control plane (never trust client to provide it)
        String jobId = UUID.randomUUID().toString();
        log.info("New deployment request received for job {}", jobId);

        // Delegate orchestration to RunnerService (non-blocking)
        runnerService.runDeploy(jobId, request, jarArtifact, libZip, certZips, extraZips);

        // Build response snapshot immediately after scheduling execution
        JobResponse response = new JobResponse(jobId, jobStateService.getStatus(jobId), jobStateService.readCurrentState(jobId));

        // Return 202 Accepted because job execution continues in background
        return ResponseEntity.accepted().body(response);
    }

    // List all jobs or filter by lifecycle status
    @GetMapping
    public ResponseEntity<List<JobSummary>> listJobs(@RequestParam(required = false) JobStatus status) {

        log.info("Listing jobs with status filter: {}", status);

        List<JobSummary> jobs = (status == null)
                ? jobQueryService.findAll()
                : jobQueryService.findByStatus(status);

        return ResponseEntity.ok(jobs);
    }

    @GetMapping("/summary")
    public ResponseEntity<DashboardSummary> getDashboardSummary() {

        log.info("Dashboard summary requested");

        List<JobSummary> jobs = jobQueryService.findAll();

        if (jobs == null) {
            log.warn("JobQueryService returned null job list — returning empty summary");
            jobs = Collections.emptyList();
        }

        int total = jobs.size();
        int running = 0;
        int successful = 0;
        int failed = 0;
        int aborted = 0;

        for (JobSummary job : jobs) {

            if (job == null || job.getLifecycleStatus() == null) {
                continue;
            }

            if (job.getLifecycleStatus() == JobStatus.RUNNING) running++;
            if (job.getLifecycleStatus() == JobStatus.SUCCESS) successful++;
            if (job.getLifecycleStatus() == JobStatus.FAILED) failed++;
            if (job.getLifecycleStatus() == JobStatus.ABORTED) aborted++;
        }

        log.info("Dashboard metrics calculated — total: {}, running: {}, success: {}, failed: {}, aborted: {}",
                total, running, successful, failed, aborted);

        DashboardSummary.Trends trends =
                new DashboardSummary.Trends(0, 0, 0, 0); // placeholder for now

        DashboardSummary summary =
                new DashboardSummary(total, running, successful, failed, aborted, trends);

        log.info("Returning dashboard summary response");

        return ResponseEntity.ok(summary);
    }

    // Return lifecycle + execution snapshot for a specific job
    @GetMapping("/{jobId}/status")
    public ResponseEntity<JobResponse> getStatus(@PathVariable String jobId) {
        log.info("Getting job status for job id {}", jobId);

        // Read lifecycle state from persistent runner state
        JobStatus lifecycle = jobStateService.getStatus(jobId);

        // If lifecycle does not exist, job is unknown → return 404
        if (lifecycle == null) {
            return ResponseEntity.notFound().build();
        }

        // Read execution snapshot state from status.json
        JobExecutionStateStatus execution = jobStateService.readCurrentState(jobId);

        // Return current job state
        return ResponseEntity.ok(new JobResponse(jobId, lifecycle, execution));
    }

    // Return last N lines of runner log without loading entire file into memory
    @GetMapping("/{jobId}/logs")
    public ResponseEntity<String> getLogs(@PathVariable String jobId, @RequestParam(defaultValue = "200") int tail) throws Exception {
        log.info("Getting logs for job id {}", jobId);

        // Resolve log file path dynamically using configured workspace root
//        Path logFile = Path.of(workspaceRoot, jobId, "logs", "runner.log");
        Path basePath = Path.of(workspaceRoot).toAbsolutePath().normalize();
        Path logFile = basePath.resolve(jobId)
                .resolve("logs")
                .resolve("runner.log")
                .normalize();

        if (!logFile.startsWith(basePath)) {
            throw new IllegalArgumentException("Invalid jobId path");
        }

        // If log file does not exist yet, return safe response
        if (Files.notExists(logFile)) {
            return ResponseEntity.ok("No logs available yet.");
        }

        // Sanitize tail parameter to prevent excessive memory or abuse
        int limit = Math.min(Math.max(tail, 1), 1000);

        // Use reversed reader which reads from end of file in O(1) time
        try (ReversedLinesFileReader reader = ReversedLinesFileReader.builder()
                .setFile(logFile.toFile())
                .setCharset(StandardCharsets.UTF_8)
                .get()) {

            // Store only requested number of lines
            List<String> lines = new ArrayList<>();

            String line;

            // Read lines starting from bottom of file
            while ((line = reader.readLine()) != null && lines.size() < limit) {
                lines.add(line);
            }

            // Reverse list to restore chronological order
            Collections.reverse(lines);

            // Return joined result as response body
            return ResponseEntity.ok(String.join(System.lineSeparator(), lines));
        }
    }
}