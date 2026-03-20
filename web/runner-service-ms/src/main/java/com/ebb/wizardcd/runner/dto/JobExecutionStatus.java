package com.ebb.wizardcd.runner.dto;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

// Mutable snapshot of job execution state persisted by the runner.
// Uses no-arg constructor + setters so Jackson can deserialize old status.json
// files that lack the newer fields (stateHistory, completedAt).
public class JobExecutionStatus {

    private String jobId;
    private String jobStatus;
    private String jobExecutionStateStatus;
    private Instant timestamp;
    private String message;

    // Timestamp set when the job reaches a terminal state (SUCCESS / FAILED / ABORTED).
    private Instant completedAt;

    // Ordered list of lifecycle-state transitions with timestamps.
    // Used by the frontend to render an execution-steps timeline.
    private List<StateTransition> stateHistory;

    // No-arg constructor required for Jackson deserialization
    public JobExecutionStatus() {
        this.stateHistory = new ArrayList<>();
    }

    // Convenience constructor used by the state service
    public JobExecutionStatus(String jobId, String jobStatus,
                               String jobExecutionStateStatus,
                               Instant timestamp, String message) {
        this.jobId = jobId;
        this.jobStatus = jobStatus;
        this.jobExecutionStateStatus = jobExecutionStateStatus;
        this.timestamp = timestamp;
        this.message = message;
        this.stateHistory = new ArrayList<>();
    }

    public String getJobId() { return jobId; }
    public void setJobId(String jobId) { this.jobId = jobId; }

    public String getJobStatus() { return jobStatus; }
    public void setJobStatus(String jobStatus) { this.jobStatus = jobStatus; }

    public String getJobExecutionStateStatus() { return jobExecutionStateStatus; }
    public void setJobExecutionStateStatus(String s) { this.jobExecutionStateStatus = s; }

    public Instant getTimestamp() { return timestamp; }
    public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }

    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    public List<StateTransition> getStateHistory() { return stateHistory; }
    public void setStateHistory(List<StateTransition> h) {
        this.stateHistory = (h != null) ? h : new ArrayList<>();
    }

    // One entry per lifecycle-state transition
    public static class StateTransition {

        private String state;      // e.g. "CREATED", "RUNNING", "SUCCESS"
        private Instant timestamp; // when this state was entered

        public StateTransition() {}

        public StateTransition(String state, Instant timestamp) {
            this.state = state;
            this.timestamp = timestamp;
        }

        public String getState() { return state; }
        public void setState(String state) { this.state = state; }

        public Instant getTimestamp() { return timestamp; }
        public void setTimestamp(Instant timestamp) { this.timestamp = timestamp; }
    }
}
