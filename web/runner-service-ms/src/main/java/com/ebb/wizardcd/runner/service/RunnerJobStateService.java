package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.dto.JobExecutionStatus;
import com.ebb.wizardcd.runner.enums.JobExecutionStateStatus;
import com.ebb.wizardcd.runner.enums.JobStatus;

// Persists runner-owned job state to the job workspace.
// This service now persists BOTH:
//   1) High-level lifecycle state (JobStatus)
//   2) Low-level execution state (JobExecutionStateStatus)
public interface RunnerJobStateService {

    // --------------------------------------------------
    // Execution-State Persistence (Detailed Phase Tracking)
    // --------------------------------------------------

    // Writes or updates the current execution state for a job
    void updateState(String jobId, JobExecutionStateStatus state, String message);

    // Reads the last persisted execution state for a job (null if none exists)
    JobExecutionStateStatus readCurrentState(String jobId);


    // --------------------------------------------------
    // Lifecycle-State Persistence (Control-Plane State Machine)
    // --------------------------------------------------

    // Writes or updates the high-level lifecycle state for a job
    void updateStatus(String jobId, JobStatus status);

    // Reads the current lifecycle state for a job (null if none exists)
    JobStatus getStatus(String jobId);

    // Returns the full persisted snapshot for a job (null if status.json does not exist)
    JobExecutionStatus readSnapshot(String jobId);
}
