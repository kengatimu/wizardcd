package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.dto.DashboardSummary;
import com.ebb.wizardcd.runner.dto.DeploymentRequest;
import com.ebb.wizardcd.runner.dto.JobExecutionStatus;
import com.ebb.wizardcd.runner.dto.JobMetadata;
import com.ebb.wizardcd.runner.dto.JobResponse;
import com.ebb.wizardcd.runner.dto.JobSummary;
import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.service.DeploymentPersistenceService;
import com.ebb.wizardcd.runner.service.JobQueryService;
import com.ebb.wizardcd.runner.service.RunnerJobStateService;
import com.ebb.wizardcd.runner.service.RunnerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.commons.io.input.ReversedLinesFileReader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;

@RestController
@RequestMapping("/jobs")
public class RunnerController {

    private static final Logger log =
            LoggerFactory.getLogger(RunnerController.class);

    private final String workspaceRoot;
    private final RunnerService runnerService;
    private final RunnerJobStateService jobStateService;
    private final JobQueryService jobQueryService;
    private final ObjectMapper objectMapper;
    private final com.ebb.wizardcd.runner.service.SshKeyService sshKeyService;
    /** Phase 4 Stage 5 — DB-backed lookup for config_snapshot + appName/envName. */
    private final DeploymentPersistenceService persistence;

    public RunnerController(@Value("${runner.workspaceRoot}") String workspaceRoot,
                            RunnerService runnerService,
                            RunnerJobStateService jobStateService,
                            JobQueryService jobQueryService,
                            ObjectMapper objectMapper,
                            com.ebb.wizardcd.runner.service.SshKeyService sshKeyService,
                            DeploymentPersistenceService persistence) {
        this.workspaceRoot = workspaceRoot;
        this.runnerService = runnerService;
        this.jobStateService = jobStateService;
        this.jobQueryService = jobQueryService;
        this.objectMapper = objectMapper;
        this.sshKeyService = sshKeyService;
        this.persistence = persistence;
    }

    // Accept deployment request and return HTTP 202 because execution is asynchronous
    @PostMapping(consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<JobResponse> submit(
            @RequestPart("request") DeploymentRequest request,
            @RequestPart("jarArtifact") MultipartFile jarArtifact,
            @RequestPart(value = "libZip",    required = false) MultipartFile libZip,
            @RequestPart(value = "certZips",  required = false) List<MultipartFile> certZips,
            @RequestPart(value = "extraZips", required = false) List<MultipartFile> extraZips) throws IOException {

        // Generate secure unique jobId inside control plane (never trust client to provide it)
        String jobId = UUID.randomUUID().toString();
        log.info("New deployment request received for job {}", jobId);

        // ── Eagerly materialise all uploads into memory ──────────────────────────
        // Tomcat stores multipart files as temp files and deletes them when the HTTP
        // request completes (i.e. when we return the 202 below).  prepareWorkspace()
        // runs on the executor thread — after the response has been sent — so those
        // temp files are already gone by the time it tries to read them.
        // Copying the bytes here, on the request thread, guarantees stability.
        MultipartFile stableJar  = new EagerMultipartFile(jarArtifact);
        MultipartFile stableLib  = (libZip != null && !libZip.isEmpty()) ? new EagerMultipartFile(libZip) : null;
        List<MultipartFile> stableCerts  = eagerList(certZips);
        List<MultipartFile> stableExtras = eagerList(extraZips);

        // Delegate orchestration to RunnerService (non-blocking)
        runnerService.runDeploy(jobId, request, stableJar, stableLib, stableCerts, stableExtras, "deploy");

        // Build response snapshot immediately after scheduling execution
        JobResponse response = new JobResponse(jobId, jobStateService.getStatus(jobId), jobStateService.readCurrentState(jobId));

        // Return 202 Accepted because job execution continues in background
        return ResponseEntity.accepted().body(response);
    }

    // List all jobs or filter by lifecycle status
    @GetMapping
    public ResponseEntity<List<JobSummary>> listJobs(@RequestParam(required = false) JobStatus status) {

        if (status != null) {
            log.info("Listing jobs with status filter: {}", status);
        }
        // Omit log for unfiltered polls — these fire every 5s from dashboard/notifications

        List<JobSummary> jobs = (status == null)
                ? jobQueryService.findAll()
                : jobQueryService.findByStatus(status);

        return ResponseEntity.ok(jobs);
    }

    @GetMapping("/summary")
    public ResponseEntity<DashboardSummary> getDashboardSummary() {

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
            if (job == null || job.getLifecycleStatus() == null) continue;
            if (job.getLifecycleStatus() == JobStatus.RUNNING) running++;
            if (job.getLifecycleStatus() == JobStatus.SUCCESS) successful++;
            if (job.getLifecycleStatus() == JobStatus.FAILED) failed++;
            if (job.getLifecycleStatus() == JobStatus.ABORTED) aborted++;
        }

        DashboardSummary.Trends trends =
                new DashboardSummary.Trends(0, 0, 0, 0); // placeholder for now

        DashboardSummary summary =
                new DashboardSummary(total, running, successful, failed, aborted, trends);

        log.debug("Dashboard — total: {}, running: {}, success: {}, failed: {}, aborted: {}",
                total, running, successful, failed, aborted);

        return ResponseEntity.ok(summary);
    }

    // Return lifecycle + execution snapshot for a specific job
    @GetMapping("/{jobId}/status")
    public ResponseEntity<JobResponse> getStatus(@PathVariable String jobId) {
        log.debug("Getting job status for job id {}", jobId);

        // Read lifecycle state from persistent runner state
        JobStatus lifecycle = jobStateService.getStatus(jobId);

        // If lifecycle does not exist, job is unknown → return 404
        if (lifecycle == null) {
            return ResponseEntity.notFound().build();
        }

        // Read execution snapshot state from status.json
        JobExecutionStateStatus execution = jobStateService.readCurrentState(jobId);

        // Read full snapshot to include stateHistory in the response
        JobExecutionStatus snapshot = jobStateService.readSnapshot(jobId);
        java.util.List<JobExecutionStatus.StateTransition> history =
                (snapshot != null) ? snapshot.getStateHistory() : null;

        // Build base response
        JobResponse response = new JobResponse(jobId, lifecycle, execution, history);

        // Enrich with application / environment / createdAt — DB first, then file fallback
        boolean enrichedFromDb = false;
        Optional<UUID> uuid = parseJobUuid(jobId);
        if (uuid.isPresent()) {
            Optional<DeploymentEntity> entity = persistence.findById(uuid.get());
            if (entity.isPresent()) {
                DeploymentEntity d = entity.get();
                response.setApplication(d.getAppName());
                response.setEnvironment(d.getEnvName());
                response.setCreatedAt(d.getCreatedAt());
                enrichedFromDb = true;
            }
        }
        if (!enrichedFromDb) {
            // File fallback — for unmigrated old jobs (Stage 5/6 transition window)
            try {
                Path metadataPath = Path.of(workspaceRoot, jobId, "metadata.json");
                if (Files.exists(metadataPath)) {
                    JobMetadata meta = objectMapper.readValue(metadataPath.toFile(), JobMetadata.class);
                    response.setApplication(meta.getApplication());
                    response.setEnvironment(meta.getEnvironment());
                    response.setCreatedAt(meta.getCreatedAt());
                }
            } catch (Exception e) {
                log.warn("Could not read metadata for job {} (file fallback): {}", jobId, e.getMessage());
            }
        }

        return ResponseEntity.ok(response);
    }

    /** Parse a String jobId to UUID, returning empty for non-UUID inputs (test fixtures, malformed). */
    private static Optional<UUID> parseJobUuid(String jobId) {
        if (jobId == null || jobId.isBlank()) return Optional.empty();
        try { return Optional.of(UUID.fromString(jobId)); }
        catch (IllegalArgumentException e) { return Optional.empty(); }
    }

    /**
     * Re-deploy: loads the saved config from a previous job, accepts a new JAR,
     * creates a brand-new job and returns its ID.
     * Optional: libZip, certZips, extraZips — if omitted, the deployment proceeds
     * without them (most re-deploys only need a new JAR).
     */
    @PostMapping(value = "/{jobId}/redeploy", consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<JobResponse> redeploy(
            @PathVariable String jobId,
            @RequestPart("jarArtifact") MultipartFile jarArtifact,
            @RequestPart(value = "libZip",    required = false) MultipartFile libZip,
            @RequestPart(value = "certZips",  required = false) List<MultipartFile> certZips,
            @RequestPart(value = "extraZips", required = false) List<MultipartFile> extraZips) throws IOException {

        log.info("Re-deploy requested based on job {}", jobId);

        // Path traversal guard
        if (jobId == null || jobId.isBlank()
                || jobId.contains("..") || jobId.contains("/") || jobId.contains("\\")) {
            return ResponseEntity.badRequest().build();
        }

        // Load the original deployment config (with fallback to same app/env jobs)
        DeploymentRequest originalConfig = loadDeploymentConfig(jobId);
        if (originalConfig == null) {
            log.warn("No usable deployment config found for re-deploy of job {}", jobId);
            return ResponseEntity.notFound().build();
        }

        // Update the JAR name to match the new upload (user may have bumped version)
        String newJarName = jarArtifact.getOriginalFilename();
        if (newJarName != null && !newJarName.isBlank()) {
            originalConfig.setJarName(newJarName);
        }

        // Generate a new job ID for this re-deployment
        String newJobId = UUID.randomUUID().toString();
        log.info("Re-deploy: new job {} created from original job {}", newJobId, jobId);

        // Eagerly materialise uploads (same pattern as submit)
        MultipartFile stableJar  = new EagerMultipartFile(jarArtifact);
        MultipartFile stableLib  = (libZip != null && !libZip.isEmpty()) ? new EagerMultipartFile(libZip) : null;
        List<MultipartFile> stableCerts  = eagerList(certZips);
        List<MultipartFile> stableExtras = eagerList(extraZips);

        // Delegate to RunnerService (same as a normal deploy, but tagged as redeploy)
        runnerService.runDeploy(newJobId, originalConfig, stableJar, stableLib, stableCerts, stableExtras, "redeploy");

        JobResponse response = new JobResponse(newJobId, jobStateService.getStatus(newJobId), jobStateService.readCurrentState(newJobId));
        return ResponseEntity.accepted().body(response);
    }

    /**
     * Rollback preflight: checks if a last-successful backup exists on the target.
     * Returns backup size, date, and target info so the UI can show this in the confirmation modal.
     */
    @GetMapping("/{jobId}/rollback/preflight")
    public ResponseEntity<java.util.Map<String, Object>> rollbackPreflight(@PathVariable String jobId) {
        log.info("Rollback preflight check for job {}", jobId);

        if (jobId == null || jobId.isBlank()
                || jobId.contains("..") || jobId.contains("/") || jobId.contains("\\")) {
            return ResponseEntity.badRequest().build();
        }

        DeploymentRequest config = loadDeploymentConfig(jobId);
        if (config == null) {
            return ResponseEntity.notFound().build();
        }

        // SSH to check backup
        String sshKey = sshKeyService.getPrivateKeyPath(config.getEnvironment());
        String sshUser = config.getSshUser();
        String sshHost = config.getSshHost();
        int sshPort = config.getSshPort();
        String basePath = config.getTargetBasePath();
        String appName = config.getAppName();
        String backupPath = basePath + "/" + appName + "/backup/last-successful/latest.tar.gz";

        try {
            ProcessBuilder pb = new ProcessBuilder(
                "ssh", "-i", sshKey, "-p", String.valueOf(sshPort),
                "-o", "StrictHostKeyChecking=no",
                "-o", "ConnectTimeout=10",
                "-o", "BatchMode=yes",
                sshUser + "@" + sshHost,
                "if [ -f '" + backupPath + "' ]; then " +
                    "SIZE=$(du -h '" + backupPath + "' | cut -f1); " +
                    "DATE=$(stat -c '%y' '" + backupPath + "' 2>/dev/null | cut -d. -f1 || " +
                    "stat -f '%Sm' '" + backupPath + "' 2>/dev/null || echo 'unknown'); " +
                    "echo \"FOUND|${SIZE}|${DATE}\"; " +
                "else echo 'NOT_FOUND'; fi"
            );
            pb.redirectErrorStream(true);
            Process process = pb.start();
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
            int exitCode = process.waitFor();

            if (exitCode != 0) {
                log.warn("Preflight SSH failed (exit {}): {}", exitCode, output);
                return ResponseEntity.ok(java.util.Map.of(
                    "available", false,
                    "reason", "Unable to connect to target server"
                ));
            }

            if (output.startsWith("FOUND|")) {
                String[] parts = output.split("\\|", 3);
                return ResponseEntity.ok(java.util.Map.of(
                    "available", true,
                    "backupSize", parts.length > 1 ? parts[1] : "unknown",
                    "backupDate", parts.length > 2 ? parts[2] : "unknown",
                    "backupPath", backupPath,
                    "targetHost", sshHost
                ));
            } else {
                return ResponseEntity.ok(java.util.Map.of(
                    "available", false,
                    "reason", "No last-successful backup found on target"
                ));
            }
        } catch (Exception e) {
            log.error("Preflight check failed for job {}: {}", jobId, e.getMessage());
            return ResponseEntity.ok(java.util.Map.of(
                "available", false,
                "reason", "Preflight check failed: " + e.getMessage()
            ));
        }
    }

    /**
     * Loads deployment config for a job. Phase 4 Stage 5 — DB first, file fallback.
     *
     * <p>Three search strategies, applied in order:
     * <ol>
     *   <li>DB primary — {@code deployments.config_snapshot} JSONB for the given jobId</li>
     *   <li>File primary — {@code workspace/jobs/<id>/input/request.json}
     *       (covers unmigrated old jobs)</li>
     *   <li>Same-app/env scan — last resort for jobs that have no own config
     *       (e.g. rollback or migration-truncated rows). Pulls the most recent
     *       config_snapshot for the same (appName, envName) combination.</li>
     * </ol>
     */
    private DeploymentRequest loadDeploymentConfig(String jobId) {
        // 1. DB primary — read config_snapshot JSON straight off the deployments row
        Optional<UUID> uuid = parseJobUuid(jobId);
        if (uuid.isPresent()) {
            Optional<DeploymentEntity> entity = persistence.findById(uuid.get());
            if (entity.isPresent() && entity.get().getConfigSnapshot() != null) {
                try {
                    return objectMapper.readValue(entity.get().getConfigSnapshot(), DeploymentRequest.class);
                } catch (Exception e) {
                    log.warn("Failed to deserialise config_snapshot for job {}: {}", jobId, e.getMessage());
                    // fall through to file fallback
                }
            }
        }

        // 2. File primary — request.json on disk (unmigrated jobs)
        Path requestFile = Path.of(workspaceRoot, jobId, "input", "request.json");
        DeploymentRequest config = null;
        if (Files.exists(requestFile)) {
            try {
                config = objectMapper.readValue(requestFile.toFile(), DeploymentRequest.class);
            } catch (Exception e) {
                log.warn("Failed to read request.json for job {}: {}", jobId, e.getMessage());
            }
        }

        // 3. Same-app/env scan — last resort
        if (config == null) {
            log.info("No own config for job {} — searching for same app/env", jobId);

            String targetApp = null;
            String targetEnv = null;

            // Try DB first for app/env identity
            if (uuid.isPresent()) {
                Optional<DeploymentEntity> entity = persistence.findById(uuid.get());
                if (entity.isPresent()) {
                    targetApp = entity.get().getAppName();
                    targetEnv = entity.get().getEnvName();
                }
            }

            // Fallback to file metadata.json
            if (targetApp == null || targetEnv == null) {
                Path metadataFile = Path.of(workspaceRoot, jobId, "metadata.json");
                if (Files.exists(metadataFile)) {
                    try {
                        JobMetadata meta = objectMapper.readValue(metadataFile.toFile(), JobMetadata.class);
                        targetApp = meta.getApplication();
                        targetEnv = meta.getEnvironment();
                    } catch (Exception ignored) {}
                }
            }

            // Scan workspace for a sibling job with matching app/env that has a usable config
            if (targetApp != null && targetEnv != null) {
                java.io.File[] jobDirs = new java.io.File(workspaceRoot).listFiles(java.io.File::isDirectory);
                if (jobDirs != null) {
                    for (java.io.File jobDir : jobDirs) {
                        Path candidateRequest = jobDir.toPath().resolve("input/request.json");
                        Path candidateMetadata = jobDir.toPath().resolve("metadata.json");
                        if (Files.exists(candidateRequest) && Files.exists(candidateMetadata)) {
                            try {
                                JobMetadata candidateMeta = objectMapper.readValue(candidateMetadata.toFile(), JobMetadata.class);
                                if (targetApp.equals(candidateMeta.getApplication())
                                        && targetEnv.equals(candidateMeta.getEnvironment())) {
                                    config = objectMapper.readValue(candidateRequest.toFile(), DeploymentRequest.class);
                                    log.info("Using config from sibling job {} for {}/{}",
                                            jobDir.getName(), targetApp, targetEnv);
                                    break;
                                }
                            } catch (Exception ignored) {}
                        }
                    }
                }
            }
        }

        return config;
    }

    /**
     * Rollback: restores the last-successful backup on the target server.
     * Loads the deployment config from the original job to know where to SSH.
     */
    @PostMapping("/{jobId}/rollback")
    public ResponseEntity<JobResponse> rollback(@PathVariable String jobId) throws IOException {

        log.info("Rollback requested based on job {}", jobId);

        // Path traversal guard
        if (jobId == null || jobId.isBlank()
                || jobId.contains("..") || jobId.contains("/") || jobId.contains("\\")) {
            return ResponseEntity.badRequest().build();
        }

        DeploymentRequest originalConfig = loadDeploymentConfig(jobId);
        if (originalConfig == null) {
            log.warn("No usable deployment config found for rollback of job {}", jobId);
            return ResponseEntity.notFound().build();
        }

        // Generate a new job ID for the rollback
        String rollbackJobId = UUID.randomUUID().toString();
        log.info("Rollback: new job {} created from original job {}", rollbackJobId, jobId);

        // Delegate to RunnerService rollback method
        runnerService.runRollback(rollbackJobId, originalConfig);

        JobResponse response = new JobResponse(rollbackJobId, jobStateService.getStatus(rollbackJobId), jobStateService.readCurrentState(rollbackJobId));
        return ResponseEntity.accepted().body(response);
    }

    // Return the original DeploymentRequest config used for a specific job.
    // Phase 4 Stage 5: DB-first via loadDeploymentConfig(), with file fallback for old jobs.
    @GetMapping("/{jobId}/config")
    public ResponseEntity<DeploymentRequest> getConfig(@PathVariable String jobId) {
        log.debug("Getting deployment config for job {}", jobId);

        // Path traversal guard
        if (jobId == null || jobId.isBlank()
                || jobId.contains("..") || jobId.contains("/") || jobId.contains("\\")) {
            return ResponseEntity.badRequest().build();
        }

        DeploymentRequest config = loadDeploymentConfig(jobId);
        if (config == null) {
            log.warn("No config found for job {} (DB or file)", jobId);
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(config);
    }

    // Return last N lines of runner log without loading entire file into memory
    @GetMapping("/{jobId}/logs")
    public ResponseEntity<String> getLogs(@PathVariable String jobId, @RequestParam(defaultValue = "200") int tail) throws Exception {
        log.debug("Getting logs for job id {}", jobId);

        // Resolve log file path dynamically using configured workspace root
        Path basePath = Path.of(workspaceRoot).toAbsolutePath().normalize();
        Path logFile = basePath.resolve(jobId)
                .resolve("logs")
                .resolve("deploy.log")   // deploy.sh writes to deploy.log
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

    // ── Upload-staging helpers ─────────────────────────────────────────────────

    /** Copies a list of MultipartFiles into eager (byte-array-backed) wrappers. */
    private static List<MultipartFile> eagerList(List<MultipartFile> files) throws IOException {
        if (files == null || files.isEmpty()) return null;
        List<MultipartFile> result = new ArrayList<>(files.size());
        for (MultipartFile f : files) {
            result.add(f != null && !f.isEmpty() ? new EagerMultipartFile(f) : f);
        }
        return result;
    }

    /**
     * Temp-file-backed MultipartFile that streams the upload to a stable /tmp file
     * on the HTTP request thread so the data survives after Tomcat deletes its own
     * temp files when the request completes.  Uses streaming transferTo() rather than
     * getBytes() to avoid loading large files (lib ZIPs, JARs) into direct heap memory.
     */
    private static final class EagerMultipartFile implements MultipartFile {

        private final String name;
        private final String originalFilename;
        private final String contentType;
        private final long   size;
        private final Path   tempFile;

        EagerMultipartFile(MultipartFile source) throws IOException {
            this.name             = source.getName();
            this.originalFilename = source.getOriginalFilename();
            this.contentType      = source.getContentType();
            this.size             = source.getSize();
            // Stream directly to a stable temp file — no full load into memory
            this.tempFile = Files.createTempFile("wizardcd-upload-", null);
            source.transferTo(this.tempFile);
        }

        @Override public String  getName()             { return name; }
        @Override public String  getOriginalFilename() { return originalFilename; }
        @Override public String  getContentType()      { return contentType; }
        @Override public boolean isEmpty()             { return size == 0; }
        @Override public long    getSize()             { return size; }
        @Override public Resource getResource()        { return new FileSystemResource(tempFile); }

        @Override public byte[] getBytes() throws IOException {
            return Files.readAllBytes(tempFile);
        }
        @Override public InputStream getInputStream() throws IOException {
            return Files.newInputStream(tempFile);
        }
        @Override public void transferTo(java.io.File dest) throws IOException {
            Files.copy(tempFile, dest.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
        @Override public void transferTo(Path dest) throws IOException {
            Files.copy(tempFile, dest, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}