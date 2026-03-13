package com.ebb.wizardcd.runner.config;

import com.ebb.wizardcd.runner.service.RunnerRecoveryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class RunnerStartupListener {

    private static final Logger log = LoggerFactory.getLogger(RunnerStartupListener.class);

    // Service responsible for reconciling job lifecycle after crash or restart
    private final RunnerRecoveryService recoveryService;

    public RunnerStartupListener(RunnerRecoveryService recoveryService) {
        this.recoveryService = recoveryService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {

        // Application is fully initialized and ready to serve traffic
        log.info("Runner application ready — initiating crash recovery phase");

        // Perform deterministic reconciliation of all job workspaces
        recoveryService.reconcileOnStartup();

        // Recovery phase complete — runner can now safely accept new jobs
        log.info("Runner crash recovery phase completed");
    }
}
