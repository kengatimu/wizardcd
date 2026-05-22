package com.ebb.wizardcd.runner.web.dto;

/**
 * Phase 5 §5.6 — POST/PUT body for team endpoints.
 *
 * <p>Both fields are optional on PUT (null-skip patch). {@code name}
 * is required on POST — the controller checks blanks.
 */
public record TeamRequest(
        String name,
        String description
) {}
