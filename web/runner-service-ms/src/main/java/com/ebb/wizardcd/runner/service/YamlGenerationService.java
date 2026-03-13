package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.dto.DeploymentRequest;

import java.nio.file.Path;

public interface YamlGenerationService {

    Path generateYaml(String jobId, DeploymentRequest request, String artifactFileName, Path inputDir);
}