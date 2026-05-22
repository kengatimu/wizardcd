package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;
import com.ebb.wizardcd.runner.persistence.repository.AuditEventRepository;
import com.ebb.wizardcd.runner.persistence.repository.OrganizationRepository;
import com.ebb.wizardcd.runner.persistence.repository.TeamRepository;
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
 * Phase 5 §5.6 — MockMvc tests for {@link TeamController}.
 *
 * <p>Tests run against the seeded default org; each test creates its own
 * teams via the API and tears them down through the repository in
 * {@code @BeforeEach}.
 */
@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class TeamControllerIntegrationTest {

    @Autowired private MockMvc                mockMvc;
    @Autowired private ObjectMapper           objectMapper;
    @Autowired private OrganizationRepository organizationRepo;
    @Autowired private TeamRepository         teamRepo;
    @Autowired private AuditEventRepository   auditRepo;

    private final UUID orgId = OrganizationEntity.DEFAULT_ORG_ID;

    @BeforeEach
    void cleanTeamsAndAudit() {
        auditRepo.deleteAll();
        teamRepo.deleteAll();
    }

    // ── POST ──────────────────────────────────────────────────────────────

    @Test
    void createTeamReturns201AndAuditsTeamCreated() throws Exception {
        ObjectNode body = objectMapper.createObjectNode()
                .put("name", "Backend Team")
                .put("description", "owns server-side services");

        MvcResult result = mockMvc.perform(post("/organizations/{orgId}/teams", orgId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated())
                .andExpect(header().exists("Location"))
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.orgId").value(orgId.toString()))
                .andExpect(jsonPath("$.name").value("Backend Team"))
                .andExpect(jsonPath("$.description").value("owns server-side services"))
                .andReturn();

        UUID teamId = UUID.fromString(objectMapper.readTree(
                result.getResponse().getContentAsString()).get("id").asText());
        assertThat(teamRepo.findById(teamId)).isPresent();

        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.TEAM_CREATED))
                .anyMatch(a -> "default/Backend Team".equals(a.getResource()));
    }

    @Test
    void createRejectsBlankName() throws Exception {
        ObjectNode body = objectMapper.createObjectNode().put("name", "");
        mockMvc.perform(post("/organizations/{orgId}/teams", orgId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createRejectsDuplicateNameInSameOrg() throws Exception {
        ObjectNode body = objectMapper.createObjectNode().put("name", "Platform");
        mockMvc.perform(post("/organizations/{orgId}/teams", orgId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated());

        // Same name again → 400
        mockMvc.perform(post("/organizations/{orgId}/teams", orgId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createReturns404WhenParentOrgDoesntExist() throws Exception {
        ObjectNode body = objectMapper.createObjectNode().put("name", "Ghost Team");
        mockMvc.perform(post("/organizations/{orgId}/teams", UUID.randomUUID())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isNotFound());
    }

    // ── GET ───────────────────────────────────────────────────────────────

    @Test
    void listReturnsTeamsOrderedByName() throws Exception {
        createTeamViaApi("zeta");
        createTeamViaApi("alpha");
        createTeamViaApi("mu");

        mockMvc.perform(get("/organizations/{orgId}/teams", orgId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[0].name").value("alpha"))
                .andExpect(jsonPath("$[1].name").value("mu"))
                .andExpect(jsonPath("$[2].name").value("zeta"));
    }

    @Test
    void getByIdReturnsTeam() throws Exception {
        UUID teamId = createTeamViaApi("Detail Team");

        mockMvc.perform(get("/organizations/{orgId}/teams/{teamId}", orgId, teamId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(teamId.toString()))
                .andExpect(jsonPath("$.name").value("Detail Team"));
    }

    @Test
    void getByIdReturns404ForUnknownTeam() throws Exception {
        mockMvc.perform(get("/organizations/{orgId}/teams/{teamId}", orgId, UUID.randomUUID()))
                .andExpect(status().isNotFound());
    }

    // ── PUT ───────────────────────────────────────────────────────────────

    @Test
    void updateRenamesAndAuditsTeamUpdated() throws Exception {
        UUID teamId = createTeamViaApi("original");

        ObjectNode body = objectMapper.createObjectNode()
                .put("name", "renamed-team")
                .put("description", "new description");

        mockMvc.perform(put("/organizations/{orgId}/teams/{teamId}", orgId, teamId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("renamed-team"));

        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.TEAM_UPDATED))
                .anyMatch(a -> "default/renamed-team".equals(a.getResource()));
    }

    // ── DELETE ────────────────────────────────────────────────────────────

    @Test
    void deleteRemovesAndAuditsTeamDeleted() throws Exception {
        UUID teamId = createTeamViaApi("to-delete");

        mockMvc.perform(delete("/organizations/{orgId}/teams/{teamId}", orgId, teamId))
                .andExpect(status().isNoContent());

        assertThat(teamRepo.findById(teamId)).isEmpty();
        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.TEAM_DELETED))
                .anyMatch(a -> "default/to-delete".equals(a.getResource()));
    }

    @Test
    void deleteIsIdempotent() throws Exception {
        // Deleting a non-existent team is a no-op — no error, no audit row.
        mockMvc.perform(delete("/organizations/{orgId}/teams/{teamId}", orgId, UUID.randomUUID()))
                .andExpect(status().isNoContent());
        assertThat(auditRepo.countByAction(AuditAction.TEAM_DELETED)).isZero();
    }

    // ── helpers ───────────────────────────────────────────────────────────

    private UUID createTeamViaApi(String name) throws Exception {
        ObjectNode body = objectMapper.createObjectNode().put("name", name);
        MvcResult result = mockMvc.perform(post("/organizations/{orgId}/teams", orgId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(objectMapper.readTree(
                result.getResponse().getContentAsString()).get("id").asText());
    }
}
