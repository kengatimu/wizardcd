package com.ebb.wizardcd.runner.persistence;

import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import com.ebb.wizardcd.runner.persistence.entity.AuditEventEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentEntity;
import com.ebb.wizardcd.runner.persistence.entity.DeploymentStateEntity;
import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;
import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;
import com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository;
import com.ebb.wizardcd.runner.persistence.repository.AuditEventRepository;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentRepository;
import com.ebb.wizardcd.runner.persistence.repository.DeploymentStateRepository;
import com.ebb.wizardcd.runner.persistence.repository.EnvironmentConfigRepository;
import com.ebb.wizardcd.runner.persistence.repository.OrganizationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Phase 4 — schema/JPA portability test.
 *
 * <p>This is the canary for any drift between the Flyway SQL (written in
 * PostgreSQL dialect) and how H2 in PostgreSQL-compatibility mode parses
 * it. If a future migration uses a PG-only feature (PL/pgSQL trigger,
 * partial index with predicate, advisory locks, …) this test will fail
 * before the change reaches the runner VM.
 *
 * <p>It also validates that every JPA entity's {@code @Column} mappings
 * line up with the actual columns Flyway created — Hibernate's
 * {@code ddl-auto: validate} (configured in {@code application-test.yaml})
 * runs at context load, so a mapping mismatch would prevent the test from
 * even starting.
 *
 * <p>Three assertions, in order of decreasing trust:
 * <ol>
 *   <li>All 5 Phase 4 tables exist + Flyway recorded the migrations.</li>
 *   <li>Every JPA repository can round-trip a tiny seed row through
 *       {@code save} → {@code findById}.</li>
 *   <li>Repository-specific finder methods compile & return sensible
 *       results — this proves the derived-query method names actually
 *       map to real columns (a common Spring Data trap).</li>
 * </ol>
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class FlywayMigrationIntegrationTest {

    @Autowired private JdbcTemplate                jdbc;
    @Autowired private ApplicationRepository       applicationRepo;
    @Autowired private EnvironmentConfigRepository envConfigRepo;
    @Autowired private DeploymentRepository        deploymentRepo;
    @Autowired private DeploymentStateRepository   deploymentStateRepo;
    @Autowired private AuditEventRepository        auditRepo;
    @Autowired private OrganizationRepository      organizationRepo;

    // ── Test 1 — schema bootstrap ─────────────────────────────────────────

    @Test
    void allPhase4TablesExistAndFlywayRecordedMigrations() {
        // Pull table names from the DB metadata (H2 is case-insensitive in
        // our config — we lowercase the result set defensively).
        var tableNames = jdbc.queryForList(
                "SELECT lower(table_name) FROM information_schema.tables " +
                "WHERE table_schema = 'PUBLIC' OR table_schema = 'public'",
                String.class
        );

        assertThat(tableNames).as("Phase 4 table set")
                .containsAll(Set.of(
                        "applications",
                        "environment_configs",
                        "deployments",
                        "deployment_states",
                        "audit_events"
                ));

        // Flyway should have recorded V0 + V1 successfully — anything else
        // means a migration failed silently or was skipped.
        Long appliedCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success = TRUE",
                Long.class
        );
        assertThat(appliedCount)
                .as("Flyway should have applied at least V0 and V1")
                .isGreaterThanOrEqualTo(2L);
    }

    // ── Test 2 — every entity round-trips through its repository ─────────

    @Test
    void everyJpaEntityRoundTripsThroughItsRepository() {
        // applications — V3 made org_id NOT NULL, so attach the seeded
        // default org before saving. In the service layer this happens
        // implicitly (single-org mode); here we wire it up by hand.
        OrganizationEntity defaultOrg = organizationRepo
                .findById(OrganizationEntity.DEFAULT_ORG_ID).orElseThrow();
        ApplicationEntity newApp = new ApplicationEntity(
                UUID.randomUUID(), "flyway-test-app", "smoke");
        newApp.setOrganization(defaultOrg);
        ApplicationEntity app = applicationRepo.save(newApp);
        assertThat(applicationRepo.findById(app.getId())).hasValueSatisfying(found ->
                assertThat(found.getName()).isEqualTo("flyway-test-app"));

        // deployments (FK → applications)
        DeploymentEntity deploy = new DeploymentEntity(
                UUID.randomUUID(), "flyway-test-app", "DEV", "CREATED");
        deploy.setApplication(app);
        deploy.setJobType("deploy");
        DeploymentEntity savedDeploy = deploymentRepo.save(deploy);
        assertThat(deploymentRepo.findById(savedDeploy.getId())).isPresent();

        // deployment_states (FK → deployments)
        DeploymentStateEntity state = new DeploymentStateEntity(
                savedDeploy, "CREATED", Instant.now());
        DeploymentStateEntity savedState = deploymentStateRepo.save(state);
        assertThat(savedState.getId()).isNotNull();

        // audit_events (no FKs — append-only log)
        AuditEventEntity audit = auditRepo.save(new AuditEventEntity(
                "DEPLOY", "flyway-test-app/DEV", "{\"jobId\":\"abc\"}", null));
        assertThat(audit.getId()).isNotNull();
        assertThat(audit.getCreatedAt()).isNotNull();  // @PrePersist sets it

        // environment_configs — exercise the entity even though it's
        // unused in Phase 4 (Phase 5 will start writing to it). This
        // verifies the JPA mapping doesn't have latent column drift.
        EnvironmentConfigEntity env = new EnvironmentConfigEntity(
                UUID.randomUUID(), app, "DEV");
        env.setSshUser("deploy");
        env.setSshHost("127.0.0.1");
        env.setSshPort(22);
        env.setJavaCommand("/usr/bin/java");
        env.setTargetBasePath("/opt/wizardcd");
        env.setRunAsUser("deploy");
        env.setServerPort(8080);
        EnvironmentConfigEntity savedEnv = envConfigRepo.save(env);
        assertThat(envConfigRepo.findById(savedEnv.getId())).isPresent();
    }

    // ── Test 3 — derived-query method names map to real columns ──────────

    @Test
    void derivedQueryFindersWork() {
        OrganizationEntity defaultOrg = organizationRepo
                .findById(OrganizationEntity.DEFAULT_ORG_ID).orElseThrow();
        ApplicationEntity newApp = new ApplicationEntity(
                UUID.randomUUID(), "finder-test-app", null);
        newApp.setOrganization(defaultOrg);
        ApplicationEntity app = applicationRepo.save(newApp);

        // ApplicationRepository custom finders
        assertThat(applicationRepo.findByName("finder-test-app")).isPresent();
        assertThat(applicationRepo.existsByName("finder-test-app")).isTrue();
        assertThat(applicationRepo.existsByName("not-there")).isFalse();

        // DeploymentRepository.findByStatusIn — used by crash recovery
        DeploymentEntity d = new DeploymentEntity(
                UUID.randomUUID(), "finder-test-app", "SIT", "RUNNING");
        d.setApplication(app);
        d.setJobType("deploy");
        deploymentRepo.save(d);

        var stuck = deploymentRepo.findByStatusIn(java.util.List.of("RUNNING"));
        assertThat(stuck).anyMatch(x -> x.getId().equals(d.getId()));

        // AuditEventRepository finders
        auditRepo.save(new AuditEventEntity("DEPLOY", "finder/SIT", null, null));
        assertThat(auditRepo.findByActionOrderByCreatedAtDesc("DEPLOY")).isNotEmpty();
        assertThat(auditRepo.countByAction("DEPLOY")).isGreaterThanOrEqualTo(1);
    }
}
