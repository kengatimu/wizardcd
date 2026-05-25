package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.persistence.entity.ConfigOverrideEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link ConfigOverrideEntity} — Phase 5 §5.5.
 *
 * <p>Hot path: every render of the App Detail page's Overrides tab calls
 * {@link #findByEnvConfig_IdOrderByKey(UUID)}. The {@code env_config_id}
 * index in V4 keeps that under a millisecond for any realistic env.
 */
@Repository
public interface ConfigOverrideRepository extends JpaRepository<ConfigOverrideEntity, UUID> {

    /** All overrides for one env, alpha-sorted by key — drives the UI list. */
    List<ConfigOverrideEntity> findByEnvConfig_IdOrderByKey(UUID envConfigId);

    /** Pending overrides for one env — drives the "N pending" badge + the push-live preview. */
    List<ConfigOverrideEntity> findByEnvConfig_IdAndPendingTrue(UUID envConfigId);

    /** Lookup an override by env + key — used by the upsert path. */
    Optional<ConfigOverrideEntity> findByEnvConfig_IdAndKey(UUID envConfigId, String key);

    /** Pre-flight existence check before insert. */
    boolean existsByEnvConfig_IdAndKey(UUID envConfigId, String key);

    /** Count of pending overrides — feeds the env-card badge. */
    long countByEnvConfig_IdAndPendingTrue(UUID envConfigId);
}
