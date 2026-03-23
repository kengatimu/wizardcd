package com.ebb.wizardcd.runner.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

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

    // Job type: "deploy", "redeploy", or "rollback" (null defaults to "deploy" for backward compat)
    private final String jobType;

    @JsonCreator
    public JobMetadata(
            @JsonProperty("jobId") String jobId,
            @JsonProperty("requestedBy") String requestedBy,
            @JsonProperty("application") String application,
            @JsonProperty("environment") String environment,
            @JsonProperty("createdAt") Instant createdAt,
            @JsonProperty("jobType") String jobType) {
        this.jobId = jobId;
        this.requestedBy = requestedBy;
        this.application = application;
        this.environment = environment;
        this.createdAt = createdAt;
        this.jobType = jobType;
    }

    // Convenience constructor for backward compat (defaults to "deploy")
    public JobMetadata(String jobId, String requestedBy, String application, String environment, Instant createdAt) {
        this(jobId, requestedBy, application, environment, createdAt, "deploy");
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

    // Returns "deploy", "redeploy", or "rollback"; defaults to "deploy" for old metadata without this field
    public String getJobType() {
        return jobType != null ? jobType : "deploy";
    }
}
