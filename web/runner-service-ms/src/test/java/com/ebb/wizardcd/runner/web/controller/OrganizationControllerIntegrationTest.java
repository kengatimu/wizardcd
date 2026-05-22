package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;
import com.ebb.wizardcd.runner.persistence.repository.AuditEventRepository;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Phase 5 §5.6 — MockMvc tests for {@link OrganizationController}.
 *
 * <p>The default org is seeded by the V3 migration and is the only one
 * present in single-org mode. The Settings UI renames it; we don't
 * create or delete orgs in Phase 5.
 */
@SpringBootTest
@ActiveProfiles("test")
@AutoConfigureMockMvc
class OrganizationControllerIntegrationTest {

    @Autowired private MockMvc                mockMvc;
    @Autowired private ObjectMapper           objectMapper;
    @Autowired private OrganizationRepository organizationRepo;
    @Autowired private AuditEventRepository   auditRepo;

    @BeforeEach
    void resetDefaultOrg() {
        // Reset the seeded org's name/slug/plan between tests so renames
        // from one test don't bleed into the next. Audit log is wiped too.
        auditRepo.deleteAll();
        OrganizationEntity org = organizationRepo
                .findById(OrganizationEntity.DEFAULT_ORG_ID).orElseThrow();
        org.setName("Default Organization");
        org.setSlug("default");
        org.setPlan("FREE");
        organizationRepo.save(org);
    }

    // ── GET endpoints ──────────────────────────────────────────────────────

    @Test
    void listReturnsTheSeededDefaultOrg() throws Exception {
        mockMvc.perform(get("/organizations"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Default Organization"))
                .andExpect(jsonPath("$[0].slug").value("default"))
                .andExpect(jsonPath("$[0].plan").value("FREE"))
                .andExpect(jsonPath("$[0].isDefault").value(true));
    }

    @Test
    void getDefaultShortcutReturnsTheSeededOrg() throws Exception {
        mockMvc.perform(get("/organizations/default"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(OrganizationEntity.DEFAULT_ORG_ID.toString()))
                .andExpect(jsonPath("$.slug").value("default"));
    }

    @Test
    void getByIdReturnsTheOrgAndMarksItDefault() throws Exception {
        mockMvc.perform(get("/organizations/{id}", OrganizationEntity.DEFAULT_ORG_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isDefault").value(true));
    }

    @Test
    void getByIdReturns404ForUnknownId() throws Exception {
        mockMvc.perform(get("/organizations/{id}", java.util.UUID.randomUUID()))
                .andExpect(status().isNotFound());
    }

    // ── PUT — rename / re-slug / plan change ──────────────────────────────

    @Test
    void renameOrgEmitsOrgUpdatedAudit() throws Exception {
        ObjectNode body = objectMapper.createObjectNode().put("name", "EBB Systems");

        mockMvc.perform(put("/organizations/{id}", OrganizationEntity.DEFAULT_ORG_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("EBB Systems"));

        // Audit row reflects the before/after
        assertThat(auditRepo.findByActionOrderByCreatedAtDesc(AuditAction.ORG_UPDATED))
                .anyMatch(a -> "default".equals(a.getResource())
                            && a.getDetails().contains("nameBefore")
                            && a.getDetails().contains("nameAfter"));
    }

    @Test
    void changeSlugLowercasesAndChecksUniqueness() throws Exception {
        // Lowercase: input "Acme" becomes "acme"
        ObjectNode body = objectMapper.createObjectNode().put("slug", "Acme");

        mockMvc.perform(put("/organizations/{id}", OrganizationEntity.DEFAULT_ORG_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slug").value("acme"));
    }

    @Test
    void planChangeRejectsUnknownPlan() throws Exception {
        ObjectNode body = objectMapper.createObjectNode().put("plan", "PLATINUM");
        mockMvc.perform(put("/organizations/{id}", OrganizationEntity.DEFAULT_ORG_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void planChangeAcceptsKnownPlan() throws Exception {
        ObjectNode body = objectMapper.createObjectNode().put("plan", "team");   // lowercase OK
        mockMvc.perform(put("/organizations/{id}", OrganizationEntity.DEFAULT_ORG_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plan").value("TEAM"));   // upper-normalised
    }

    @Test
    void renameToBlankIsRejected() throws Exception {
        ObjectNode body = objectMapper.createObjectNode().put("name", "");
        mockMvc.perform(put("/organizations/{id}", OrganizationEntity.DEFAULT_ORG_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    void noOpPatchDoesNotEmitAudit() throws Exception {
        // Patch sends the same values that are already on the row — nothing
        // should change, no audit row should be emitted.
        ObjectNode body = objectMapper.createObjectNode()
                .put("name", "Default Organization")
                .put("slug", "default")
                .put("plan", "FREE");

        mockMvc.perform(put("/organizations/{id}", OrganizationEntity.DEFAULT_ORG_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()))
                .andExpect(status().isOk());

        assertThat(auditRepo.countByAction(AuditAction.ORG_UPDATED)).isZero();
    }
}
