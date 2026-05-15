package com.ebb.wizardcd.runner.persistence.repository;

import com.ebb.wizardcd.runner.persistence.entity.DeploymentStateEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

/**
 * Spring Data JPA repository for {@link DeploymentStateEntity}.
 *
 * <p>This table is append-only at the service layer (Stage 4 won't expose any
 * delete / update operations). Queries are time-ordered reconstructions of a
 * deployment's lifecycle.
 */
@Repository
public interface DeploymentStateRepository extends JpaRepository<DeploymentStateEntity, Long> {

    /**
     * Reconstruct the lifecycle of a deployment in chronological order.
     * Backed by {@code idx_deployment_states_deployment_id} (composite
     * {@code (deployment_id, timestamp)}).
     */
    List<DeploymentStateEntity> findByDeployment_IdOrderByTimestampAsc(UUID deploymentId);

    /** Count transitions for a deployment — useful for sanity checks. */
    long countByDeployment_Id(UUID deploymentId);
}
