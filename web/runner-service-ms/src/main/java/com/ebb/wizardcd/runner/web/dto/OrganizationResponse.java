package com.ebb.wizardcd.runner.web.dto;

import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;

import java.time.Instant;
import java.util.UUID;

/**
 * Phase 5 §5.6 — wire-format for organization endpoints.
 *
 * <p>{@code ownerUserId} stays present in the response shape because
 * Phase 6 will start populating it; clients written today should already
 * be able to handle that field appearing.
 */
public record OrganizationResponse(
        UUID    id,
        String  name,
        String  slug,
        UUID    ownerUserId,
        String  plan,
        boolean isDefault,
        Instant createdAt,
        Instant updatedAt
) {

    public static OrganizationResponse from(OrganizationEntity org) {
        return new OrganizationResponse(
                org.getId(),
                org.getName(),
                org.getSlug(),
                org.getOwnerUserId(),
                org.getPlan(),
                OrganizationEntity.DEFAULT_ORG_ID.equals(org.getId()),
                org.getCreatedAt(),
                org.getUpdatedAt()
        );
    }
}
