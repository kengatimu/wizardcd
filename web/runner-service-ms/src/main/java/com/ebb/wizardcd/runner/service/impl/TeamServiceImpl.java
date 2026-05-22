package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;
import com.ebb.wizardcd.runner.persistence.entity.TeamEntity;
import com.ebb.wizardcd.runner.persistence.repository.OrganizationRepository;
import com.ebb.wizardcd.runner.persistence.repository.TeamRepository;
import com.ebb.wizardcd.runner.service.AuditService;
import com.ebb.wizardcd.runner.service.TeamService;
import com.ebb.wizardcd.runner.service.audit.AuditAction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/** Default {@link TeamService} implementation. */
@Service
public class TeamServiceImpl implements TeamService {

    private static final Logger log = LoggerFactory.getLogger(TeamServiceImpl.class);

    private final TeamRepository teamRepo;
    private final OrganizationRepository organizationRepo;
    private final AuditService auditService;

    public TeamServiceImpl(TeamRepository teamRepo,
                           OrganizationRepository organizationRepo,
                           AuditService auditService) {
        this.teamRepo = teamRepo;
        this.organizationRepo = organizationRepo;
        this.auditService = auditService;
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public List<TeamEntity> findByOrg(UUID orgId) {
        if (orgId == null) return List.of();
        return teamRepo.findByOrganization_IdOrderByNameAsc(orgId);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TeamEntity> findById(UUID teamId) {
        if (teamId == null) return Optional.empty();
        return teamRepo.findById(teamId);
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public TeamEntity create(UUID orgId, String name, String description) {
        validateName(name);
        String trimmed = name.trim();

        OrganizationEntity org = loadOrg(orgId);

        if (teamRepo.existsByOrganization_IdAndName(orgId, trimmed)) {
            throw new IllegalArgumentException(
                    "Team '" + trimmed + "' already exists in organization '"
                  + org.getSlug() + "'");
        }

        TeamEntity team = new TeamEntity(
                UUID.randomUUID(), org, trimmed, trimDescription(description));
        TeamEntity saved = teamRepo.save(team);

        Map<String, Object> details = new HashMap<>();
        details.put("teamId",  saved.getId().toString());
        details.put("orgSlug", org.getSlug());
        details.put("name",    saved.getName());
        auditService.record(AuditAction.TEAM_CREATED,
                org.getSlug() + "/" + saved.getName(), details, null);

        log.info("Team created id={} org={} name='{}'",
                saved.getId(), org.getSlug(), saved.getName());
        return saved;
    }

    @Override
    @Transactional
    public TeamEntity update(UUID orgId, UUID teamId, String newName, String newDescription) {
        TeamEntity team = teamRepo.findById(teamId).orElseThrow(
                () -> new NoSuchElementException("No team with id " + teamId));
        if (!team.getOrganization().getId().equals(orgId)) {
            throw new IllegalArgumentException(
                    "Team " + teamId + " does not belong to organization " + orgId);
        }

        Map<String, Object> details = new HashMap<>();
        details.put("teamId", teamId.toString());

        if (newName != null) {
            validateName(newName);
            String trimmed = newName.trim();
            if (!trimmed.equals(team.getName())) {
                if (teamRepo.existsByOrganization_IdAndName(orgId, trimmed)) {
                    throw new IllegalArgumentException(
                            "Team '" + trimmed + "' already exists in this organization");
                }
                details.put("nameBefore", team.getName());
                details.put("nameAfter",  trimmed);
                team.setName(trimmed);
            }
        }

        if (newDescription != null) {
            team.setDescription(trimDescription(newDescription));
            details.put("descriptionChanged", true);
        }

        TeamEntity saved = teamRepo.save(team);
        auditService.record(AuditAction.TEAM_UPDATED,
                team.getOrganization().getSlug() + "/" + saved.getName(), details, null);

        log.info("Team updated id={} org={} name='{}'",
                saved.getId(), team.getOrganization().getSlug(), saved.getName());
        return saved;
    }

    @Override
    @Transactional
    public void delete(UUID orgId, UUID teamId) {
        Optional<TeamEntity> maybe = teamRepo.findById(teamId);
        if (maybe.isEmpty()) return;   // idempotent
        TeamEntity team = maybe.get();
        if (!team.getOrganization().getId().equals(orgId)) {
            throw new IllegalArgumentException(
                    "Team " + teamId + " does not belong to organization " + orgId);
        }

        String orgSlug = team.getOrganization().getSlug();
        String teamName = team.getName();

        teamRepo.delete(team);

        Map<String, Object> details = new HashMap<>();
        details.put("teamId",  teamId.toString());
        details.put("orgSlug", orgSlug);
        details.put("name",    teamName);
        auditService.record(AuditAction.TEAM_DELETED,
                orgSlug + "/" + teamName, details, null);

        log.info("Team deleted id={} org={} name='{}'", teamId, orgSlug, teamName);
    }

    // ── Internal ───────────────────────────────────────────────────────────

    private OrganizationEntity loadOrg(UUID orgId) {
        return organizationRepo.findById(orgId).orElseThrow(
                () -> new NoSuchElementException("No organization with id " + orgId));
    }

    private static void validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Team name must not be blank");
        }
        if (name.trim().length() > 100) {
            throw new IllegalArgumentException(
                    "Team name must be 100 characters or fewer");
        }
    }

    private static String trimDescription(String description) {
        if (description == null) return null;
        String trimmed = description.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
