package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;
import com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository;
import com.ebb.wizardcd.runner.persistence.repository.AuditEventRepository;
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
 * Phase 5 §5.1 — MockMvc integration tests for
 * {@link EnvironmentConfigController}.
 *
 * <p>Same end-to-end discipline as
 * {@link ApplicationControllerIntegrationTest}: each test exercises
 * URL → service → DB → audit event in one shot.
 */
@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class EnvironmentConfigControllerIntegrationTest {

    @Autowired private MockMvc                       mockMvc;
    @Autowired private ObjectMapper                  objectMapper;
    @Autowired private ApplicationRepository         applicationRepo;
    @Autowired private EnvironmentConfigRepository   envRepo;
    @Autowired private AuditEventRepository          auditRepo;
    @Autowired private OrganizationRepository        organizationRepo;

    private UUID appId;

    @BeforeEach
    void seedApp() {
        // Clean slate per test.
        auditRepo.deleteAll();
        envRepo.deleteAll();
        applicationRepo.deleteAll();

        // Every test in this class needs a parent app; seed one directly via
        // the repository rather than the API for speed. V3 made org_id NOT
        // NULL — attach the default org seed.
        OrganizationEntity defaultOrg = organizationRepo
                .findById(OrganizationEntity.DEFAULT_ORG_ID).orElseThrow();
        ApplicationEntity newApp = new ApplicationEntity(
                UUID.randomUUID(), "env-test-app", null);
        newApp.setOrganization(defaultOrg);
        ApplicationEntity app = applicationRepo.save(newApp);
        this.appId = app.getId();
    }

    // ── POST /applications/{appId}/environments ───────────────────────────

    @Test
    void createEnvironmentConfigReturns201AndPersistsAndAudits() throws Exception {
        ObjectNode body = validEnvRequest("UAT", "10.0.5.3", 22, 8765);

        MvcResult result = mockMvc.perform(post("/applications/{appId}/environments", appId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.appId").value(appId.toString()))
                .andExpect(jsonPath("$.envName").value("UAT"))
                .andExpect(jsonPath("$.sshHost").value("10.0.5.3"))
                .andReturn();

        UUID envId = UUID.fromString(objectMapper.readTree(
                result.getResponse().getContentAsString()).get("id").asText());
        assertThat(envRepo.findById(envId)).isPresent();

        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.ENV_CONFIG_CREATED))
                .anyMatch(a -> ("env-test-app/UAT").equals(a.getResource()));
    }

    @Test
    void createNormalizesEnvNameToUppercase() throws Exception {
        // Lowercase / mixed case input — service should uppercase before save.
        ObjectNode body = validEnvRequest("uat", "10.0.5.3", 22, 8765);
        mockMvc.perform(post("/applications/{appId}/environments", appId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.envName").value("UAT"));
    }

    @Test
    void createRejectsDuplicateAppEnvPair() throws Exception {
        ObjectNode body = validEnvRequest("UAT", "10.0.5.3", 22, 8765);

        mockMvc.perform(post("/applications/{appId}/environments", appId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated());

        // Second create for the same (app, env) → 400 with "use PUT" hint
        mockMvc.perform(post("/applications/{appId}/environments", appId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createReturns404WhenParentAppDoesntExist() throws Exception {
        ObjectNode body = validEnvRequest("UAT", "10.0.5.3", 22, 8765);
        mockMvc.perform(post("/applications/{appId}/environments", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isNotFound());
    }

    @Test
    void createRejectsMissingRequiredFields() throws Exception {
        // No sshHost / sshUser → service-layer validation catches it.
        ObjectNode body = objectMapper.createObjectNode()
                .put("envName", "UAT")
                .put("javaCommand", "/usr/bin/java");
        mockMvc.perform(post("/applications/{appId}/environments", appId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isBadRequest());
    }

    // ── GET /applications/{appId}/environments + /{envId} ────────────────

    @Test
    void listReturnsAllEnvConfigsForAppOrderedByEnvName() throws Exception {
        createEnvViaApi("UAT");
        createEnvViaApi("DEV");
        createEnvViaApi("SIT");

        mockMvc.perform(get("/applications/{appId}/environments", appId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].envName").value("DEV"))
                .andExpect(jsonPath("$[1].envName").value("SIT"))
                .andExpect(jsonPath("$[2].envName").value("UAT"));
    }

    @Test
    void getByIdReturnsEnvConfig() throws Exception {
        UUID envId = createEnvViaApi("UAT");

        mockMvc.perform(get("/applications/{appId}/environments/{envId}", appId, envId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(envId.toString()))
                .andExpect(jsonPath("$.envName").value("UAT"));
    }

    @Test
    void getByIdReturns404ForCrossAppLookup() throws Exception {
        // Env config belongs to one app; try to fetch it via a different
        // app's path. We treat this as 404 (not 403) so we don't leak
        // existence of env configs across apps.
        UUID envId = createEnvViaApi("UAT");
        OrganizationEntity defaultOrg = organizationRepo
                .findById(OrganizationEntity.DEFAULT_ORG_ID).orElseThrow();
        ApplicationEntity otherAppDraft = new ApplicationEntity(
                UUID.randomUUID(), "other-app", null);
        otherAppDraft.setOrganization(defaultOrg);
        ApplicationEntity otherApp = applicationRepo.save(otherAppDraft);

        mockMvc.perform(get("/applications/{appId}/environments/{envId}",
                        otherApp.getId(), envId))
                .andExpect(status().isNotFound());
    }

    // ── PUT /applications/{appId}/environments/{envId} ───────────────────

    @Test
    void updatePartiallyAppliesNonNullFieldsAndAudits() throws Exception {
        UUID envId = createEnvViaApi("UAT");

        // Patch only sshHost + xmx — everything else should remain unchanged.
        ObjectNode patch = objectMapper.createObjectNode()
                .put("sshHost", "10.0.99.99")
                .put("xmx", "2048m");

        mockMvc.perform(put("/applications/{appId}/environments/{envId}", appId, envId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(patch.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sshHost").value("10.0.99.99"))
                .andExpect(jsonPath("$.xmx").value("2048m"))
                .andExpect(jsonPath("$.envName").value("UAT"))   // unchanged
                .andExpect(jsonPath("$.sshUser").value("deploy")); // unchanged

        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.ENV_CONFIG_UPDATED))
                .anyMatch(a -> ("env-test-app/UAT").equals(a.getResource()));
    }

    // ── DELETE /applications/{appId}/environments/{envId} ────────────────

    @Test
    void deleteRemovesRowAndAudits() throws Exception {
        UUID envId = createEnvViaApi("UAT");

        mockMvc.perform(delete("/applications/{appId}/environments/{envId}", appId, envId))
                .andExpect(status().isNoContent());

        assertThat(envRepo.findById(envId)).isEmpty();
        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.ENV_CONFIG_DELETED))
                .anyMatch(a -> ("env-test-app/UAT").equals(a.getResource()));
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private ObjectNode validEnvRequest(String envName, String sshHost,
                                       int sshPort, int serverPort) {
        return objectMapper.createObjectNode()
                .put("envName",        envName)
                .put("sshUser",        "deploy")
                .put("sshHost",        sshHost)
                .put("sshPort",        sshPort)
                .put("javaCommand",    "/usr/lib/jvm/temurin-17-jdk/bin/java")
                .put("javaVersion",    "17")
                .put("targetBasePath", "/app/home/deploy/deployments")
                .put("runAsUser",      "deploy")
                .put("serverPort",     serverPort);
    }

    private UUID createEnvViaApi(String envName) throws Exception {
        ObjectNode body = validEnvRequest(envName, "10.0.5.3", 22, 8765);
        MvcResult result = mockMvc.perform(post("/applications/{appId}/environments", appId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(objectMapper.readTree(
                result.getResponse().getContentAsString()).get("id").asText());
    }
}
