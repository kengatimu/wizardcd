package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.dto.DeploymentRequest;
import com.ebb.wizardcd.runner.dto.JobMetadata;
import org.springframework.web.multipart.MultipartFile;

import java.nio.file.Path;
import java.util.List;

public interface RunnerWorkspaceService {

    // Prepares an isolated workspace for a deployment job.
    // Copies the JAR artifact and extracts optional lib/, cert, and extra-directory ZIPs
    // into the job's INPUT_DIR so deploy.sh finds the expected directory layout.
    // Also materializes immutable metadata.json for identity tracking.
    Path prepareWorkspace(String jobId, DeploymentRequest request,
                          MultipartFile jarArtifact, MultipartFile libZip,
                          List<MultipartFile> certZips, List<MultipartFile> extraZips,
                          JobMetadata metadata);

    // Returns the workspace root directory path
    String getWorkspaceRoot();

    // Generates only the deployment-config.yml without full workspace preparation.
    // Used by rollback jobs that don't need JAR artifacts.
    Path generateYamlOnly(String jobId, DeploymentRequest request, String artifactFileName, Path inputDir);
}