package com.ebb.wizardcd.runner.web.dto;

import com.ebb.wizardcd.runner.enums.LiveConfigCapability;
import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Phase 5 §5.1 — wire-format response for GET /applications,
 * GET /applications/:id, and POST/PUT writes.
 *
 * <p>Decoupled from {@link ApplicationEntity} on purpose:
 * <ul>
 *   <li>Adds derived fields the UI needs without leaking JPA-managed
 *       attributes ({@code environments}, {@code deploySummary}).</li>
 *   <li>Hides internals — auto-flush timing of {@code updatedAt},
 *       transactional consistency of relationships — from the wire.</li>
 *   <li>Lets the response shape evolve independently of the schema.</li>
 * </ul>
 *
 * <p>Built from an entity via {@link #from(ApplicationEntity)} for the
 * minimal case, or {@link #from(ApplicationEntity, List, DeploySummary)}
 * when the controller has loaded environments + deploy stats.
 */
public record ApplicationResponse(
        UUID                   id,
        String                 name,
        String                 description,
        LiveConfigCapability   liveConfigCapability,
        Instant                capabilityLastChecked,
        Instant                createdAt,
        Instant                updatedAt,
        Instant                deletedAt,          // null when live
        List<EnvironmentConfigResponse> environments,   // null when caller didn't ask
        DeploySummary          deploySummary       // null when caller didn't ask
) {

    /**
     * Compact per-env deployment summary the Applications List page renders
     * as the green / amber / red env badges.
     *
     * @param totalDeploys total count across all envs
     * @param lastDeployAt timestamp of the most recent deploy (any env), null if none
     * @param perEnv       one entry per env this app has deployed to
     */
    public record DeploySummary(
            long              totalDeploys,
            Instant           lastDeployAt,
            List<EnvSummary>  perEnv
    ) {}

    /** Per-env breakdown — last-deploy outcome + count. */
    public record EnvSummary(
            String   envName,
            long     count,
            String   lastStatus,        // SUCCESS / FAILED / ABORTED / RUNNING / null
            Instant  lastDeployAt
    ) {}

    // ── Adapters ──────────────────────────────────────────────────────────

    /** Minimal response — no environments, no deploy summary. */
    public static ApplicationResponse from(ApplicationEntity entity) {
        return from(entity, null, null);
    }

    /** Full response with relationships expanded. */
    public static ApplicationResponse from(ApplicationEntity entity,
                                           List<EnvironmentConfigResponse> envs,
                                           DeploySummary summary) {
        return new ApplicationResponse(
                entity.getId(),
                entity.getName(),
                entity.getDescription(),
                entity.getLiveConfigCapability(),
                entity.getCapabilityLastChecked(),
                entity.getCreatedAt(),
                entity.getUpdatedAt(),
                entity.getDeletedAt(),
                envs,
                summary
        );
    }
}
