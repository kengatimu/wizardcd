package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.dto.DeploymentRequest;

public interface DeploymentValidatorService {

    void validate(DeploymentRequest request);

}