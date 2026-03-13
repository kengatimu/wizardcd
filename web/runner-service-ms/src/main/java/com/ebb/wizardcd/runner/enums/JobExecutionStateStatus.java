package com.ebb.wizardcd.runner.enums;

// Runner-owned execution states persisted to disk
public enum JobExecutionStateStatus {

    // Job accepted by runner
    RECEIVED,

    // Workspace successfully created
    WORKSPACE_READY,

    // Shell execution currently active
    RUNNING,

    // Shell completed successfully (exit code 0)
    SUCCEEDED,

    // Shell returned non-zero exit code
    FAILED,

    // Runner enforced timeout
    TIMEOUT,

    // Runner enforced abort
    ABORTED
}

