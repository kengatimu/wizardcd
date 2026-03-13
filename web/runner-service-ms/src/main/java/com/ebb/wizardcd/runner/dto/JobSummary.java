package com.ebb.wizardcd.runner.dto;

import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;

import java.time.Instant;

/**
 * Lightweight read-only projection of a deployment job.
 * Used for dashboard listing and job history views.
 */
public class JobSummary {

    // Unique job identifier
    private String jobId;

    // Application name from metadata
    private String appName;

    // Deployment environment (uat, prod, etc.)
    private String environment;

    // Timestamp when job was created
    private Instant createdAt;

    // Lifecycle state (CREATED, RUNNING, SUCCESS, FAILED, etc.)
    private JobStatus lifecycleStatus;

    // Execution snapshot state (RUNNING, SUCCEEDED, TIMEOUT, etc.)
    private JobExecutionStateStatus executionStatus;

    public JobSummary() {
    }

    public JobSummary(String jobId,
                      String appName,
                      String environment,
                      Instant createdAt,
                      JobStatus lifecycleStatus,
                      JobExecutionStateStatus executionStatus) {
        this.jobId = jobId;
        this.appName = appName;
        this.environment = environment;
        this.createdAt = createdAt;
        this.lifecycleStatus = lifecycleStatus;
        this.executionStatus = executionStatus;
    }

    public String getJobId() {
        return jobId;
    }

    public void setJobId(String jobId) {
        this.jobId = jobId;
    }

    public String getAppName() {
        return appName;
    }

    public void setAppName(String appName) {
        this.appName = appName;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public JobStatus getLifecycleStatus() {
        return lifecycleStatus;
    }

    public void setLifecycleStatus(JobStatus lifecycleStatus) {
        this.lifecycleStatus = lifecycleStatus;
    }

    public JobExecutionStateStatus getExecutionStatus() {
        return executionStatus;
    }

    public void setExecutionStatus(JobExecutionStateStatus executionStatus) {
        this.executionStatus = executionStatus;
    }
}