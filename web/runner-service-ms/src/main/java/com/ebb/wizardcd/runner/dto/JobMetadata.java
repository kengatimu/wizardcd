package com.ebb.wizardcd.runner.dto;

import java.time.Instant;

// Immutable job identity snapshot
public class JobMetadata {

    // Unique job identifier
    private final String jobId;

    // Who triggered the job (user / system)
    private final String requestedBy;

    // Target application name
    private final String application;

    // Target environment (uat / prod etc.)
    private final String environment;

    // Creation timestamp
    private final Instant createdAt;

    public JobMetadata(String jobId, String requestedBy, String application, String environment, Instant createdAt) {
        this.jobId = jobId;
        this.requestedBy = requestedBy;
        this.application = application;
        this.environment = environment;
        this.createdAt = createdAt;
    }

    public String getJobId() {
        return jobId;
    }

    public String getRequestedBy() {
        return requestedBy;
    }

    public String getApplication() {
        return application;
    }

    public String getEnvironment() {
        return environment;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
