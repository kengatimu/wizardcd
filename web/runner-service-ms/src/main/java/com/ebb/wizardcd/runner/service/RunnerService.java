package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.dto.DeploymentRequest;
import com.ebb.wizardcd.runner.enums.JobStatus;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface RunnerService {

    // Executes a deployment using deploy.sh and returns the final job status
    JobStatus runDeploy(String jobId, DeploymentRequest request,
                        MultipartFile jarArtifact, MultipartFile libZip,
                        List<MultipartFile> certZips, List<MultipartFile> extraZips);

    // Requests termination of a currently running deployment job
    void abort(String jobId);
}