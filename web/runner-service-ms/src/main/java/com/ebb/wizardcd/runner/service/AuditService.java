package com.ebb.wizardcd.runner.service;

import com.ebb.wizardcd.runner.persistence.entity.AuditEventEntity;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Phase 4 — single entry point for writing rows to the {@code audit_events}
 * table and the read primitives the audit-log UI (Phase 11) will hang off.
 *
 * <p>Action names should come from the {@link com.ebb.wizardcd.runner.service.audit.AuditAction}
 * constants rather than free-form strings — that's how the writer and the
 * future filter dropdown stay in sync.
 *
 * <p>Writes always run inside the caller's transaction (see
 * {@link com.ebb.wizardcd.runner.service.impl.AuditServiceImpl#record}).
 * That's deliberate: an audit row should atomically commit with the change
 * it describes (a successful deploy AND its audit row, or neither). It
 * also means an audit write failure aborts the surrounding action — which
 * is what we want; silent audit-log gaps are worse than a deploy that
 * refuses to start.
 *
 * @see com.ebb.wizardcd.runner.service.audit.AuditAction
 * @see com.ebb.wizardcd.runner.persistence.entity.AuditEventEntity
 */
public interface AuditService {

    /**
     * Record an audit event. {@code details} is serialised to the
     * {@code details} JSONB column; pass {@code null} or an empty map for
     * actions that don't need a payload.
     *
     * @param action   action type — prefer the constants in {@link com.ebb.wizardcd.runner.service.audit.AuditAction}
     * @param resource a stable identifier the action targets, e.g.
     *                 {@code "<appName>/<env>"} or a job UUID
     * @param details  structured payload (serialised to JSONB). {@code null}
     *                 → no payload.
     * @param actor    user who triggered the action. {@code null} OK until
     *                 Phase 6 auth lands.
     * @return the persisted entity (id populated)
     */
    AuditEventEntity record(String action, String resource, Map<String, Object> details, String actor);

    /** Convenience overload — no structured payload. */
    AuditEventEntity record(String action, String resource, String actor);

    // ── Reads (consumed by the audit log UI, future analytics) ────────────

    /**
     * Most recent {@code limit} events, newest first. Backed by
     * {@code idx_audit_events_created_at}.
     */
    List<AuditEventEntity> recent(int limit);

    /** All events matching a given action type, newest first. */
    List<AuditEventEntity> findByAction(String action);

    /** All events on or after {@code since}, newest first. */
    List<AuditEventEntity> findSince(Instant since);

    /** Tally for a given action type — used by metrics / dashboard widgets. */
    long countByAction(String action);
}
