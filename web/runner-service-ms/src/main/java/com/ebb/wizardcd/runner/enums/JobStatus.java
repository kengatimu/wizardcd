package com.ebb.wizardcd.runner.enums;

public enum JobStatus {

    // Job accepted but not yet validated
    CREATED,

    // Input YAML / parameters validation phase
    VALIDATING,

    // Workspace directories and input files being prepared
    PREPARING_WORKSPACE,

    // deploy.sh currently running
    RUNNING,

    // Deployment completed successfully (exit code 0)
    SUCCESS,

    // Deployment failed (non-zero exit code)
    FAILED,

    // Abort requested while RUNNING
    ABORT_REQUESTED,

    // Process terminated after abort
    ABORTED
}


