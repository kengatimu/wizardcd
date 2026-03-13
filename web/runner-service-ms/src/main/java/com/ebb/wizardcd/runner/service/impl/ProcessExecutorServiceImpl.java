package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.service.ProcessExecutorService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Service
public class ProcessExecutorServiceImpl implements ProcessExecutorService {

    private static final Logger log =
            LoggerFactory.getLogger(ProcessExecutorServiceImpl.class);

    // Track active OS processes mapped by jobId for abort support
    private final Map<String, Process> activeProcesses =
            new ConcurrentHashMap<>();

    @Override
    public int execute(String jobId,
                       Process process,
                       long timeoutMinutes)
            throws InterruptedException {

        // register process for external abort requests
        activeProcesses.put(jobId, process);

        try {

            // wait for process completion within configured timeout window
            boolean finished =
                    process.waitFor(timeoutMinutes, TimeUnit.MINUTES);

            // if process did not finish within timeout, enforce timeout
            if (!finished) {

                log.error("Timeout reached for job {}", jobId);

                // attempt graceful shutdown first
                process.destroy();

                Thread.sleep(3000);

                // force kill if still alive
                if (process.isAlive()) {
                    process.destroyForcibly();
                }

                // -1 → runner-enforced timeout
                return -1;
            }

            // process completed normally
            // 0  → success
            // >0 → shell-level failure
            return process.exitValue();

        } finally {
            // always remove from active tracking
            activeProcesses.remove(jobId);
        }
    }

    @Override
    public void abort(String jobId) {

        // lookup currently running process
        Process process = activeProcesses.get(jobId);

        // nothing to abort if not found
        if (process == null) {
            log.warn("Abort requested but no active process found for job {}", jobId);
            return;
        }

        log.warn("Abort requested for job {}", jobId);

        // attempt graceful termination first
        process.destroy();

        try {
            Thread.sleep(3000);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }

        // force kill if still running
        if (process.isAlive()) {
            process.destroyForcibly();
        }
    }
}
