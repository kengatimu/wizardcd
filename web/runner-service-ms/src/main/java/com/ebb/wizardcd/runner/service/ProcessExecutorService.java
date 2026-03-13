package com.ebb.wizardcd.runner.service;

import java.util.concurrent.TimeoutException;

public interface ProcessExecutorService {

    // Executes an external OS process with timeout enforcement.
    // 
    // Exit semantics:
    //   0   → successful completion
    //   >0  → shell-level failure (deploy.sh or remote script failure)
    //   -1  → runner-enforced timeout
    //   -2  → runner-enforced abort
    int execute(String jobId, Process process, long timeoutMinutes) throws InterruptedException, TimeoutException;

    // Requests termination of a running process.
    void abort(String jobId);
}
