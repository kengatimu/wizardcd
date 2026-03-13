package com.ebb.wizardcd.runner.service;

public interface RunnerRecoveryService {

    // Reconcile job execution states after runner restart
    void reconcileOnStartup();
}
