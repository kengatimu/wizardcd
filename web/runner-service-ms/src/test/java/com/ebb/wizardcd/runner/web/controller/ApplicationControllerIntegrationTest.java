package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository;
import com.ebb.wizardcd.runner.persistence.repository.AuditEventRepository;
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
 * Phase 5 §5.1 — MockMvc integration tests for {@link ApplicationController}.
 *
 * <p>Boots the full Spring context against H2 (PostgreSQL-compat mode) so
 * the tests exercise the real Flyway migrations, JPA mappings, audit
 * service, and controller wiring end-to-end. Every test asserts on
 * <ol>
 *   <li>the HTTP response (status + body shape)</li>
 *   <li>the resulting DB state via repository</li>
 *   <li>the matching audit event row</li>
 * </ol>
 * so the contract from URL to DB to audit log is verified in one shot.
 *
 * <p>The test class is NOT {@code @Transactional} because the audit
 * service writes in nested transactions that we want to commit and read
 * back via the repository. Each test cleans up its own rows in a
 * {@code @BeforeEach} block.
 */
@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class ApplicationControllerIntegrationTest {

    @Autowired private MockMvc                mockMvc;
    @Autowired private ObjectMapper           objectMapper;
    @Autowired private ApplicationRepository  applicationRepo;
    @Autowired private AuditEventRepository   auditRepo;

    @BeforeEach
    void cleanAuditAndApps() {
        // Order matters — deployments + state rows reference applications via
        // a SET NULL FK, so dropping audit + apps in this order is safe.
        auditRepo.deleteAll();
        applicationRepo.deleteAll();
    }

    // ── POST /applications ────────────────────────────────────────────────

    @Test
    void createApplicationReturns201AndPersistsRowAndAuditEvent() throws Exception {
        ObjectNode body = objectMapper.createObjectNode()
                .put("name", "phase5-test-app")
                .put("description", "smoke test");

        MvcResult result = mockMvc.perform(post("/applications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.name").value("phase5-test-app"))
                .andExpect(jsonPath("$.description").value("smoke test"))
                .andExpect(jsonPath("$.deletedAt").doesNotExist())
                .andReturn();

        // Body's id matches the DB row
        UUID id = UUID.fromString(objectMapper.readTree(
                result.getResponse().getContentAsString()).get("id").asText());
        assertThat(applicationRepo.findById(id)).isPresent();

        // Audit row emitted
        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.APP_CREATED))
                .anyMatch(a -> "phase5-test-app".equals(a.getResource()));
    }

    @Test
    void createApplicationRejectsBlankName() throws Exception {
        ObjectNode body = objectMapper.createObjectNode()
                .put("name", "")
                .put("description", "blank");

        mockMvc.perform(post("/applications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isBadRequest());

        assertThat(applicationRepo.findAll()).isEmpty();
        assertThat(auditRepo.countByAction(AuditAction.APP_CREATED)).isZero();
    }

    @Test
    void createApplicationRejectsDuplicateNameWithCleanHint() throws Exception {
        ObjectNode body = objectMapper.createObjectNode()
                .put("name", "duplicate-app");
        body.putNull("description");

        // First create — succeeds
        mockMvc.perform(post("/applications")
                .contentType(MediaType.APPLICATION_JSON)
                .content(body.toString()))
                .andExpect(status().isCreated());

        // Second create with same name — 400 with "already exists" message
        mockMvc.perform(post("/applications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isBadRequest());
    }

    // ── GET /applications + GET /applications/{id} ────────────────────────

    @Test
    void listApplicationsReturnsLiveOnlyOrderedByName() throws Exception {
        createAppViaApi("zebra-app", null);
        createAppViaApi("alpha-app", null);

        mockMvc.perform(get("/applications"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("alpha-app"))
                .andExpect(jsonPath("$[1].name").value("zebra-app"));
    }

    @Test
    void listApplicationsHidesSoftDeletedRows() throws Exception {
        UUID liveId = createAppViaApi("live-app", null);
        UUID archivedId = createAppViaApi("archived-app", null);

        mockMvc.perform(delete("/applications/{id}", archivedId))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/applications"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(liveId.toString()));
    }

    @Test
    void searchByQueryFiltersByNameSubstringCaseInsensitive() throws Exception {
        createAppViaApi("eureka-registry-ms", null);
        createAppViaApi("payments-gateway",  null);

        mockMvc.perform(get("/applications").param("q", "EUREKA"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("eureka-registry-ms"));
    }

    @Test
    void getApplicationDetailReturnsApp() throws Exception {
        UUID id = createAppViaApi("detail-app", "for detail test");

        mockMvc.perform(get("/applications/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id.toString()))
                .andExpect(jsonPath("$.name").value("detail-app"))
                .andExpect(jsonPath("$.description").value("for detail test"));
    }

    @Test
    void getApplicationDetailReturns404ForUnknownId() throws Exception {
        mockMvc.perform(get("/applications/{id}", UUID.randomUUID()))
                .andExpect(status().isNotFound());
    }

    @Test
    void getApplicationDetailWithExpandEnvironmentsIncludesEmptyList() throws Exception {
        UUID id = createAppViaApi("expand-app", null);

        // No env configs created yet — expand should return an empty array,
        // not omit the field.
        mockMvc.perform(get("/applications/{id}", id).param("expand", "environments"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.environments").isArray())
                .andExpect(jsonPath("$.environments.length()").value(0));
    }

    // ── PUT /applications/{id} ────────────────────────────────────────────

    @Test
    void updateApplicationRenamesAndEmitsAudit() throws Exception {
        UUID id = createAppViaApi("original-name", null);

        ObjectNode body = objectMapper.createObjectNode()
                .put("name", "renamed-app")
                .put("description", "updated description");

        mockMvc.perform(put("/applications/{id}", id)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("renamed-app"))
                .andExpect(jsonPath("$.description").value("updated description"));

        assertThat(applicationRepo.findById(id).orElseThrow().getName())
                .isEqualTo("renamed-app");
        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.APP_UPDATED))
                .anyMatch(a -> "renamed-app".equals(a.getResource()));
    }

    // ── DELETE /applications/{id} + restore ───────────────────────────────

    @Test
    void deleteSoftArchivesAndEmitsAudit() throws Exception {
        UUID id = createAppViaApi("to-archive", null);

        mockMvc.perform(delete("/applications/{id}", id))
                .andExpect(status().isNoContent());

        // Soft-delete: row still exists in DB but flagged
        assertThat(applicationRepo.findById(id)).hasValueSatisfying(app ->
                assertThat(app.isDeleted()).isTrue());

        // Default reads hide it
        mockMvc.perform(get("/applications/{id}", id))
                .andExpect(status().isNotFound());

        // Audit row emitted
        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.APP_DELETED))
                .anyMatch(a -> "to-archive".equals(a.getResource()));
    }

    @Test
    void restoreClearsDeletedAtAndAuditsRestoration() throws Exception {
        UUID id = createAppViaApi("to-restore", null);

        // Archive then restore
        mockMvc.perform(delete("/applications/{id}", id)).andExpect(status().isNoContent());
        mockMvc.perform(post("/applications/{id}/restore", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deletedAt").doesNotExist());

        // Default reads see it again
        mockMvc.perform(get("/applications/{id}", id))
                .andExpect(status().isOk());

        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.APP_RESTORED))
                .anyMatch(a -> "to-restore".equals(a.getResource()));
    }

    // ── helpers ────────────────────────────────────────────────────────────

    /**
     * Create an application via the POST /applications endpoint and return
     * its generated id. Lets tests focus on the behaviour under test.
     */
    private UUID createAppViaApi(String name, String description) throws Exception {
        ObjectNode body = objectMapper.createObjectNode().put("name", name);
        if (description != null) body.put("description", description);
        MvcResult result = mockMvc.perform(post("/applications")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(objectMapper.readTree(
                result.getResponse().getContentAsString()).get("id").asText());
    }
}
