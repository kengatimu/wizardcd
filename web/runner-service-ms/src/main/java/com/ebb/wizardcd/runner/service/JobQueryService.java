package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.dto.JobSummary;
import com.ebb.wizardcd.runner.enums.JobStatus;

import java.util.List;

/**
 * Read-only service responsible for querying job history
 * from runner workspace.
 *
 * This service does NOT mutate state.
 * It only aggregates metadata + lifecycle + execution snapshot.
 */
public interface JobQueryService {

    /**
     * Returns all jobs discovered in workspace.
     */
    List<JobSummary> findAll();

    /**
     * Returns jobs filtered by lifecycle status.
     */
    List<JobSummary> findByStatus(JobStatus status);
}