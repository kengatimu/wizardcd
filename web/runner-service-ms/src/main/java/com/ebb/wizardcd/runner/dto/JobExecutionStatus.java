package com.ebb.wizardcd.runner.dto;

import java.time.Instant;

// Immutable snapshot of job execution state persisted by the runner
public class JobExecutionStatus {

    private String jobId;
    private String jobStatus;
    private String jobExecutionStateStatus;
    private Instant timestamp;
    private String message;

    public JobExecutionStatus(String jobId, String jobStatus, String jobExecutionStateStatus, Instant timestamp, String message) {
        this.jobId = jobId;
        this.jobStatus = jobStatus;
        this.jobExecutionStateStatus = jobExecutionStateStatus;
        this.timestamp = timestamp;
        this.message = message;
    }

    public String getJobId() {
        return jobId;
    }

    public String getJobStatus() {
        return jobStatus;
    }

    public String getJobExecutionStateStatus() {
        return jobExecutionStateStatus;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public String getMessage() {
        return message;
    }
}
