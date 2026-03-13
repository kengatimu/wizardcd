package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.service.RunnerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/jobs")
public class AbortController {
    private static final Logger log = LoggerFactory.getLogger(AbortController.class);

    private final RunnerService runnerService;

    public AbortController(RunnerService runnerService) {
        this.runnerService = runnerService;
    }

    // Accept abort request from UI
    @PostMapping("/{jobId}/abort")
    public String abort(@PathVariable String jobId) {
        log.warn("Abort requested via API for job {}", jobId);

        // Delegate lifecycle + process termination to control plane
        runnerService.abort(jobId);

        return "Abort requested for job " + jobId;
    }
}
