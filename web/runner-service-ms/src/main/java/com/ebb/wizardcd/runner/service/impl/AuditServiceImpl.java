package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.persistence.entity.AuditEventEntity;
import com.ebb.wizardcd.runner.persistence.repository.AuditEventRepository;
import com.ebb.wizardcd.runner.service.AuditService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Default {@link AuditService} implementation backed by
 * {@link AuditEventRepository}.
 *
 * <h2>Transaction strategy</h2>
 * Writes use {@link Propagation#REQUIRED} (the default) so audit rows
 * commit and roll back atomically with the action they describe. We do
 * NOT use {@code REQUIRES_NEW} — an isolated audit transaction would mean
 * "successful deploy with no audit row" or "audit row with no deploy",
 * both of which corrupt the audit log's meaning.
 *
 * <h2>Serialisation</h2>
 * {@code details} payloads serialise through the application-wide
 * {@link ObjectMapper} so they pick up the same Java-time / JSR-310 module
 * config the rest of the API uses. The serialised JSON is stored in the
 * {@code details JSONB} column.
 */
@Service
public class AuditServiceImpl implements AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditServiceImpl.class);

    private final AuditEventRepository auditRepo;
    private final ObjectMapper objectMapper;

    public AuditServiceImpl(AuditEventRepository auditRepo, ObjectMapper objectMapper) {
        this.auditRepo = auditRepo;
        this.objectMapper = objectMapper;
    }

    // ── Writes ────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public AuditEventEntity record(String action,
                                   String resource,
                                   Map<String, Object> details,
                                   String actor) {
        if (action == null || action.isBlank()) {
            throw new IllegalArgumentException("audit action must not be blank");
        }

        String detailsJson = serialise(details);
        AuditEventEntity event = new AuditEventEntity(action, resource, detailsJson, actor);
        AuditEventEntity saved = auditRepo.save(event);

        log.debug("Audit event recorded id={} action={} resource={} actor={}",
                saved.getId(), saved.getAction(), saved.getResource(), saved.getCreatedBy());
        return saved;
    }

    @Override
    @Transactional
    public AuditEventEntity record(String action, String resource, String actor) {
        return record(action, resource, null, actor);
    }

    // ── Reads ─────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public List<AuditEventEntity> recent(int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 500));
        return auditRepo.findAll(
                PageRequest.of(0, safeLimit,
                        Sort.by(Sort.Direction.DESC, "createdAt"))
        ).getContent();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AuditEventEntity> findByAction(String action) {
        if (action == null || action.isBlank()) return List.of();
        return auditRepo.findByActionOrderByCreatedAtDesc(action);
    }

    @Override
    @Transactional(readOnly = true)
    public List<AuditEventEntity> findSince(Instant since) {
        if (since == null) return List.of();
        return auditRepo.findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(since);
    }

    @Override
    @Transactional(readOnly = true)
    public long countByAction(String action) {
        if (action == null || action.isBlank()) return 0;
        return auditRepo.countByAction(action);
    }

    // ── Internal ──────────────────────────────────────────────────────────

    /**
     * Convert the structured details payload to a JSON string for the
     * JSONB column. Null / empty map → null in the column.
     *
     * <p>A serialisation failure aborts the audit write (and therefore the
     * surrounding transaction) on purpose — silently dropping the payload
     * to "best-effort" would defeat the audit log's reliability contract.
     */
    private String serialise(Map<String, Object> details) {
        if (details == null || details.isEmpty()) return null;
        try {
            return objectMapper.writeValueAsString(details);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(
                    "Failed to serialise audit-event details payload: " + e.getMessage(), e);
        }
    }
}
