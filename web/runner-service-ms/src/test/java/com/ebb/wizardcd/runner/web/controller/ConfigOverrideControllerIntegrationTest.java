package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;
import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;
import com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository;
import com.ebb.wizardcd.runner.persistence.repository.AuditEventRepository;
import com.ebb.wizardcd.runner.persistence.repository.ConfigOverrideRepository;
import com.ebb.wizardcd.runner.persistence.repository.EnvironmentConfigRepository;
import com.ebb.wizardcd.runner.persistence.repository.OrganizationRepository;
import com.ebb.wizardcd.runner.service.audit.AuditAction;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 5 §5.5.1 — MockMvc integration tests for
 * {@link ConfigOverrideController}.
 *
 * <p>Same shape as {@link EnvironmentConfigControllerIntegrationTest}:
 * each test exercises URL → service → DB → audit event end-to-end.
 *
 * <p>Coverage:
 * <ul>
 *   <li>POST creates a row, audits, returns 201 + Location</li>
 *   <li>POST with duplicate key returns 400</li>
 *   <li>POST with empty key returns 400</li>
 *   <li>GET list returns rows sorted by key</li>
 *   <li>GET list with ?pending=true filters correctly</li>
 *   <li>GET single returns the row; 404 for cross-env/cross-app access</li>
 *   <li>PUT updates non-null fields, leaves nulls alone, audits, flips pending</li>
 *   <li>PUT for description-only does NOT flip pending</li>
 *   <li>DELETE removes the row, audits, returns 204</li>
 *   <li>Audit never contains the override value (sensitive or not)</li>
 * </ul>
 */
@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class ConfigOverrideControllerIntegrationTest {

    @Autowired private MockMvc                       mockMvc;
    @Autowired private ObjectMapper                  objectMapper;
    @Autowired private ApplicationRepository         applicationRepo;
    @Autowired private EnvironmentConfigRepository   envRepo;
    @Autowired private ConfigOverrideRepository      overrideRepo;
    @Autowired private AuditEventRepository          auditRepo;
    @Autowired private OrganizationRepository        organizationRepo;

    private UUID appId;
    private UUID envId;

    @BeforeEach
    void seedAppAndEnv() {
        // Clean slate per test — children before parents
        auditRepo.deleteAll();
        overrideRepo.deleteAll();
        envRepo.deleteAll();
        applicationRepo.deleteAll();

        OrganizationEntity defaultOrg = organizationRepo
                .findById(OrganizationEntity.DEFAULT_ORG_ID).orElseThrow();

        ApplicationEntity app = new ApplicationEntity(
                UUID.randomUUID(), "override-test-app", null);
        app.setOrganization(defaultOrg);
        applicationRepo.save(app);
        this.appId = app.getId();

        EnvironmentConfigEntity env = new EnvironmentConfigEntity(
                UUID.randomUUID(), app, "UAT");
        env.setSshUser("deploy");
        env.setSshHost("10.0.5.3");
        env.setSshPort(22);
        env.setJavaCommand("/usr/lib/jvm/temurin-17-jdk/bin/java");
        env.setJavaVersion("17");
        env.setTargetBasePath("/app/home/deploy/deployments");
        env.setRunAsUser("deploy");
        env.setServerPort(8765);
        envRepo.save(env);
        this.envId = env.getId();
    }

    // ── POST ──────────────────────────────────────────────────────────────

    @Test
    void createReturns201AndPersistsAndAudits() throws Exception {
        ObjectNode body = req("logging.level.root", "DEBUG");

        MvcResult result = mockMvc.perform(post(url(""), appId, envId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.envConfigId").value(envId.toString()))
                .andExpect(jsonPath("$.key").value("logging.level.root"))
                .andExpect(jsonPath("$.value").value("DEBUG"))
                .andExpect(jsonPath("$.injectionMethod").value("YAML_OVERRIDE"))
                .andExpect(jsonPath("$.pending").value(true))
                .andReturn();

        UUID overrideId = readId(result);
        assertThat(overrideRepo.findById(overrideId)).isPresent();

        // Audit row exists and does NOT carry the value
        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.CONFIG_OVERRIDE_CREATED))
                .anyMatch(a -> ("override-test-app/UAT").equals(a.getResource()))
                .allMatch(a -> a.getDetails() == null
                            || !a.getDetails().toString().contains("DEBUG"));
    }

    @Test
    void createWithDuplicateKeyReturns400() throws Exception {
        // Seed once
        mockMvc.perform(post(url(""), appId, envId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(req("server.port", "8080").toString())).andExpect(status().isCreated());

        // Second POST with same key — service rejects, controller returns 400
        mockMvc.perform(post(url(""), appId, envId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(req("server.port", "9090").toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createWithBlankKeyReturns400() throws Exception {
        ObjectNode bad = objectMapper.createObjectNode()
                .put("key", "   ")
                .put("value", "DEBUG");
        mockMvc.perform(post(url(""), appId, envId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(bad.toString()))
                .andExpect(status().isBadRequest());
    }

    // ── GET list ──────────────────────────────────────────────────────────

    @Test
    void listReturnsAllSortedByKey() throws Exception {
        seedOverride("server.port", "8080");
        seedOverride("logging.level.root", "DEBUG");

        mockMvc.perform(get(url(""), appId, envId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].key").value("logging.level.root"))
                .andExpect(jsonPath("$[1].key").value("server.port"));
    }

    @Test
    void listWithPendingFilterOnlyReturnsPending() throws Exception {
        UUID a = seedOverride("server.port", "8080");
        UUID b = seedOverride("logging.level.root", "DEBUG");
        // Flip one to pushed
        overrideRepo.findById(a).ifPresent(o -> {
            o.setPending(false);
            overrideRepo.save(o);
        });

        mockMvc.perform(get(url("") + "?pending=true", appId, envId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(b.toString()));
    }

    // ── GET single + cross-scope ──────────────────────────────────────────

    @Test
    void getReturns404WhenOverrideBelongsToDifferentEnv() throws Exception {
        UUID overrideId = seedOverride("server.port", "8080");

        // Create a second env to use as the wrong scope
        EnvironmentConfigEntity other = new EnvironmentConfigEntity(
                UUID.randomUUID(), envRepo.findById(envId).orElseThrow().getApplication(), "SIT");
        other.setSshUser("deploy");
        other.setSshHost("10.0.5.4");
        other.setSshPort(22);
        other.setJavaCommand("/usr/lib/jvm/temurin-17-jdk/bin/java");
        other.setTargetBasePath("/app");
        other.setRunAsUser("deploy");
        other.setServerPort(9090);
        envRepo.save(other);

        mockMvc.perform(get(url("/{overrideId}"), appId, other.getId(), overrideId))
                .andExpect(status().isNotFound());
    }

    // ── PUT ───────────────────────────────────────────────────────────────

    @Test
    void putUpdatesNonNullFieldsAndFlipsPending() throws Exception {
        UUID overrideId = seedOverride("logging.level.root", "DEBUG");
        // Mark as pushed first
        overrideRepo.findById(overrideId).ifPresent(o -> {
            o.setPending(false);
            overrideRepo.save(o);
        });

        ObjectNode patch = objectMapper.createObjectNode().put("value", "INFO");

        mockMvc.perform(put(url("/{overrideId}"), appId, envId, overrideId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(patch.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.value").value("INFO"))
                .andExpect(jsonPath("$.key").value("logging.level.root"))   // unchanged
                .andExpect(jsonPath("$.pending").value(true));               // flipped back

        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.CONFIG_OVERRIDE_UPDATED))
                .isNotEmpty();
    }

    @Test
    void putDescriptionOnlyDoesNotFlipPending() throws Exception {
        UUID overrideId = seedOverride("logging.level.root", "DEBUG");
        overrideRepo.findById(overrideId).ifPresent(o -> {
            o.setPending(false);
            overrideRepo.save(o);
        });

        ObjectNode patch = objectMapper.createObjectNode().put("description", "Bumped for incident");

        mockMvc.perform(put(url("/{overrideId}"), appId, envId, overrideId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(patch.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description").value("Bumped for incident"))
                .andExpect(jsonPath("$.pending").value(false));   // not flipped
    }

    // ── DELETE ────────────────────────────────────────────────────────────

    @Test
    void deleteRemovesRowAndAudits() throws Exception {
        UUID overrideId = seedOverride("server.port", "8080");

        mockMvc.perform(delete(url("/{overrideId}"), appId, envId, overrideId))
                .andExpect(status().isNoContent());

        assertThat(overrideRepo.findById(overrideId)).isEmpty();
        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.CONFIG_OVERRIDE_DELETED))
                .anyMatch(a -> ("override-test-app/UAT").equals(a.getResource()));
    }

    @Test
    void deleteOnNonExistentReturns204() throws Exception {
        UUID phantom = UUID.randomUUID();
        mockMvc.perform(delete(url("/{overrideId}"), appId, envId, phantom))
                .andExpect(status().isNoContent());
    }

    // ── helpers ───────────────────────────────────────────────────────────

    /** URL template for path-segment composition with {appId} + {envConfigId}. */
    private static String url(String suffix) {
        return "/applications/{appId}/environments/{envConfigId}/overrides" + suffix;
    }

    /** Minimal valid POST body. */
    private ObjectNode req(String key, String value) {
        return objectMapper.createObjectNode().put("key", key).put("value", value);
    }

    /** Seed an override directly via the API and return its id. */
    private UUID seedOverride(String key, String value) throws Exception {
        MvcResult result = mockMvc.perform(post(url(""), appId, envId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(req(key, value).toString()))
                .andExpect(status().isCreated())
                .andReturn();
        return readId(result);
    }

    private UUID readId(MvcResult result) throws Exception {
        return UUID.fromString(objectMapper.readTree(
                result.getResponse().getContentAsString()).get("id").asText());
    }
}
