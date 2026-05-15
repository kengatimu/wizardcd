package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link DeploymentEntity}.
 *
 * <p>The most-queried repository in Phase 4 — every dashboard load, every job
 * detail page, and every crash-recovery sweep hits this.
 *
 * <p>All derived queries below are backed by indexes added in
 * {@code V1__init_schema.sql} — no full table scans on the hot path.
 */
@Repository
public interface DeploymentRepository extends JpaRepository<DeploymentEntity, UUID> {

    // ── Dashboard / Application page queries ───────────────────────────────

    /**
     * Dashboard sorted by newest first. Backed by {@code idx_deployments_created_at}.
     * Use {@code findAll(Pageable)} from {@link JpaRepository} when no filter
     * is required.
     */
    Page<DeploymentEntity> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /**
     * "Application page" — all deployments for one app, newest first.
     * Backed by {@code idx_deployments_app_env}.
     */
    List<DeploymentEntity> findByAppNameOrderByCreatedAtDesc(String appName);

    /**
     * "Application page → env card" — deployments for one (app, env), newest first.
     * Backed by {@code idx_deployments_app_env}.
     */
    List<DeploymentEntity> findByAppNameAndEnvNameOrderByCreatedAtDesc(String appName, String envName);

    // ── Filter / status queries ────────────────────────────────────────────

    /**
     * Crash recovery on startup — find any job stuck in a non-terminal state.
     * Backed by {@code idx_deployments_status}.
     */
    List<DeploymentEntity> findByStatusIn(Collection<String> statuses);

    /** Used by re-deploy + rollback flows — find the parent job. */
    List<DeploymentEntity> findBySourceJobIdOrderByCreatedAtDesc(UUID sourceJobId);

    /** Time-range query for the 7-day activity chart. */
    List<DeploymentEntity> findByCreatedAtGreaterThanEqualOrderByCreatedAtDesc(Instant since);

    // ── Aggregates ─────────────────────────────────────────────────────────

    long countByStatus(String status);

    long countByAppName(String appName);

    long countByAppNameAndEnvName(String appName, String envName);

    /** Most recent job for an (app, env) — used by the dashboard "last deploy" column. */
    Optional<DeploymentEntity> findFirstByAppNameAndEnvNameOrderByCreatedAtDesc(String appName, String envName);
}
