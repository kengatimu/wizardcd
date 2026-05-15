package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link ApplicationEntity}.
 *
 * <p>CRUD inherited from {@link JpaRepository}: {@code save}, {@code findById},
 * {@code findAll}, {@code deleteById}, {@code count}, plus {@code Page<T>
 * findAll(Pageable)}.
 */
@Repository
public interface ApplicationRepository extends JpaRepository<ApplicationEntity, UUID> {

    /**
     * Lookup an app by its unique name (column has a UNIQUE constraint).
     *
     * <p>Used during deploy to upsert: if an app with this name doesn't exist
     * yet, the service creates one with a fresh UUID.
     */
    Optional<ApplicationEntity> findByName(String name);

    /** Existence check without loading the row — used by validation. */
    boolean existsByName(String name);
}
