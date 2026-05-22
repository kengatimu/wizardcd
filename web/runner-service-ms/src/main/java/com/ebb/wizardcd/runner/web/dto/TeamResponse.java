package com.ebb.wizardcd.runner.web.dto;

import com.ebb.wizardcd.runner.persistence.entity.TeamEntity;

import java.time.Instant;
import java.util.UUID;

public record TeamResponse(
        UUID    id,
        UUID    orgId,
        String  name,
        String  description,
        Instant createdAt,
        Instant updatedAt
) {

    public static TeamResponse from(TeamEntity team) {
        return new TeamResponse(
                team.getId(),
                team.getOrganization() != null ? team.getOrganization().getId() : null,
                team.getName(),
                team.getDescription(),
                team.getCreatedAt(),
                team.getUpdatedAt()
        );
    }
}
