package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.persistence.entity.AuditEventEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

/**
 * Spring Data JPA repository for {@link AuditEventEntity}.
 *
 * <p>Append-only at the service layer — Stage 7's {@code AuditService} writes
 * to this; the audit-log page reads from it. Phase 11 adds analytics on top,
 * Phase 11.5 adds hash-chain integrity checking.
 */
@Repository
public interface AuditEventRepository extends JpaRepository<AuditEventEntity, Long> {

    /**
     * Audit log feed — newest first. Backed by
     * {@code idx_audit_events_created_at}.
     */
    Page<AuditEventEntity> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /**
     * Filter by action type. Backed by {@code idx_audit_events_action}.
     * Used by the audit-log UI's filter dropdown.
     */
    List<AuditEventEntity> findByActionOrderByCreatedAtDesc(String action);

    /** Time-range query — events since a given instant. */
    List<AuditEventEntity> findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(Instant since);

    long countByAction(String action);
}
