package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link EnvironmentConfigEntity}.
 *
 * <p>Phase 5 will use this heavily — the registry feature reads + writes env
 * configs here. Phase 4 keeps usage minimal (FK lookups during deploy).
 */
@Repository
public interface EnvironmentConfigRepository extends JpaRepository<EnvironmentConfigEntity, UUID> {

    /**
     * Find the saved config for one (app, env) combination.
     *
     * <p>Returns {@link Optional#empty()} if the user hasn't saved a config
     * for this combination yet — caller falls back to deploy-time config.
     */
    Optional<EnvironmentConfigEntity> findByApplication_IdAndEnvName(UUID applicationId, String envName);

    /** All env configs for one application — used by the App detail page. */
    List<EnvironmentConfigEntity> findByApplication_IdOrderByEnvName(UUID applicationId);

    /** Pre-flight check used by the upsert path before insert. */
    boolean existsByApplication_IdAndEnvName(UUID applicationId, String envName);
}
