package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;
import com.ebb.wizardcd.runner.persistence.repository.OrganizationRepository;
import com.ebb.wizardcd.runner.service.AuditService;
import com.ebb.wizardcd.runner.service.OrganizationService;
import com.ebb.wizardcd.runner.service.audit.AuditAction;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Default {@link OrganizationService} implementation.
 *
 * <h2>Allowed plan values</h2>
 * Validated against {@link #VALID_PLANS}. Phase 15 will turn this into a
 * dynamic lookup against a billing service; for Phase 5 a static set is
 * the simplest source of truth.
 *
 * <h2>Slug normalisation</h2>
 * Slugs are lowercased and trimmed before persistence. The DB UNIQUE
 * constraint enforces case-sensitive uniqueness, so we lowercase here
 * to make the constraint behave intuitively.
 */
@Service
public class OrganizationServiceImpl implements OrganizationService {

    private static final Logger log = LoggerFactory.getLogger(OrganizationServiceImpl.class);

    /** Plans accepted by the API. Phase 15 wires real billing behind these. */
    private static final Set<String> VALID_PLANS =
            Set.of("FREE", "TEAM", "BUSINESS", "ENTERPRISE");

    private final OrganizationRepository organizationRepo;
    private final AuditService auditService;

    public OrganizationServiceImpl(OrganizationRepository organizationRepo,
                                   AuditService auditService) {
        this.organizationRepo = organizationRepo;
        this.auditService = auditService;
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public List<OrganizationEntity> findAll() {
        return organizationRepo.findAll().stream()
                .sorted(Comparator.comparing(o -> o.getName().toLowerCase()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OrganizationEntity> findById(UUID id) {
        if (id == null) return Optional.empty();
        return organizationRepo.findById(id);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<OrganizationEntity> findBySlug(String slug) {
        if (slug == null || slug.isBlank()) return Optional.empty();
        return organizationRepo.findBySlug(slug.trim().toLowerCase());
    }

    @Override
    @Transactional(readOnly = true)
    public OrganizationEntity findDefault() {
        return organizationRepo.findById(OrganizationEntity.DEFAULT_ORG_ID).orElseThrow(
                () -> new IllegalStateException(
                        "Default organization seed missing — V3 migration didn't run. "
                      + "Check Flyway schema_history."));
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public OrganizationEntity update(UUID id, String newName, String newSlug, String newPlan) {
        OrganizationEntity entity = organizationRepo.findById(id).orElseThrow(
                () -> new NoSuchElementException("No organization with id " + id));

        boolean changed = false;
        Map<String, Object> details = new HashMap<>();
        details.put("orgId", id.toString());

        if (newName != null) {
            String trimmed = newName.trim();
            if (trimmed.isEmpty()) {
                throw new IllegalArgumentException("Organization name must not be blank");
            }
            if (trimmed.length() > 100) {
                throw new IllegalArgumentException(
                        "Organization name must be 100 characters or fewer");
            }
            if (!trimmed.equals(entity.getName())) {
                details.put("nameBefore", entity.getName());
                details.put("nameAfter",  trimmed);
                entity.setName(trimmed);
                changed = true;
            }
        }

        if (newSlug != null) {
            String trimmed = newSlug.trim().toLowerCase();
            if (trimmed.isEmpty()) {
                throw new IllegalArgumentException("Organization slug must not be blank");
            }
            if (!trimmed.equals(entity.getSlug())) {
                if (organizationRepo.existsBySlug(trimmed)) {
                    throw new IllegalArgumentException(
                            "Slug '" + trimmed + "' is already taken");
                }
                details.put("slugBefore", entity.getSlug());
                details.put("slugAfter",  trimmed);
                entity.setSlug(trimmed);
                changed = true;
            }
        }

        if (newPlan != null) {
            String upper = newPlan.trim().toUpperCase();
            if (!VALID_PLANS.contains(upper)) {
                throw new IllegalArgumentException(
                        "Unknown plan '" + upper + "' — valid: " + VALID_PLANS);
            }
            if (!upper.equals(entity.getPlan())) {
                details.put("planBefore", entity.getPlan());
                details.put("planAfter",  upper);
                entity.setPlan(upper);
                changed = true;
            }
        }

        OrganizationEntity saved = organizationRepo.save(entity);
        if (changed) {
            auditService.record(AuditAction.ORG_UPDATED, saved.getSlug(), details, null);
            log.info("Organization updated id={} slug='{}' changes={}",
                    saved.getId(), saved.getSlug(), details.keySet());
        }
        return saved;
    }
}
