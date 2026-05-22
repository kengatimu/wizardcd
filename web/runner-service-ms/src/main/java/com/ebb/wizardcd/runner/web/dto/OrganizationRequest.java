package com.ebb.wizardcd.runner.web.dto;

/**
 * Phase 5 §5.6 — PUT /organizations/{id} body. Each field is independently
 * optional; {@code null} = leave the column unchanged. The service layer
 * validates and enforces uniqueness.
 */
public record OrganizationRequest(
        String name,
        String slug,
        String plan
) {}
