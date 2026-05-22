package com.ebb.wizardcd.runner.web.dto;

/**
 * Phase 5 §5.1 — request body for POST /applications and PUT /applications/:id.
 *
 * <p>{@code name} is required on POST and optional on PUT (the controller
 * checks blanks against the URL/method context). {@code description} is
 * always optional.
 *
 * <p>We use a record (not a Lombok class) to keep DTOs immutable and
 * trivially Jackson-serialisable. Validation lives in the service layer
 * to avoid duplicating it between the DTO layer and the JPA layer.
 *
 * @param name        application name (max 100 chars, unique)
 * @param description free-form description (nullable)
 */
public record ApplicationRequest(
        String name,
        String description
) {}
