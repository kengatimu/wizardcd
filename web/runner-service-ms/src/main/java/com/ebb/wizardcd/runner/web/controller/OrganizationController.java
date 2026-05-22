package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.persistence.entity.OrganizationEntity;
import com.ebb.wizardcd.runner.service.OrganizationService;
import com.ebb.wizardcd.runner.web.dto.OrganizationRequest;
import com.ebb.wizardcd.runner.web.dto.OrganizationResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Phase 5 §5.6 — minimal organization endpoints.
 *
 * <table>
 *   <caption>Endpoint summary</caption>
 *   <tr><th>Method</th><th>Path</th><th>Purpose</th></tr>
 *   <tr><td>GET</td><td>/organizations</td><td>List orgs (single-org → 1 row)</td></tr>
 *   <tr><td>GET</td><td>/organizations/default</td><td>Resolve the seeded default org</td></tr>
 *   <tr><td>GET</td><td>/organizations/:id</td><td>Get one</td></tr>
 *   <tr><td>PUT</td><td>/organizations/:id</td><td>Rename / re-slug / change plan</td></tr>
 * </table>
 *
 * <p>No POST or DELETE: single-org mode means the seeded org is the only
 * one, and it stays. Phase 15 multi-org provisioning adds those.
 */
@RestController
@RequestMapping("/organizations")
public class OrganizationController {

    private final OrganizationService organizationService;

    public OrganizationController(OrganizationService organizationService) {
        this.organizationService = organizationService;
    }

    @GetMapping
    public ResponseEntity<List<OrganizationResponse>> list() {
        List<OrganizationResponse> orgs = organizationService.findAll().stream()
                .map(OrganizationResponse::from)
                .toList();
        return ResponseEntity.ok(orgs);
    }

    /**
     * Convenience shortcut to the seeded default org. The Settings page
     * uses this to render the single "Organization" panel without needing
     * the id up-front.
     */
    @GetMapping("/default")
    public ResponseEntity<OrganizationResponse> getDefault() {
        OrganizationEntity org = organizationService.findDefault();
        return ResponseEntity.ok(OrganizationResponse.from(org));
    }

    @GetMapping("/{id}")
    public ResponseEntity<OrganizationResponse> get(@PathVariable UUID id) {
        OrganizationEntity org = organizationService.findById(id).orElseThrow(
                () -> new NoSuchElementException("No organization with id " + id));
        return ResponseEntity.ok(OrganizationResponse.from(org));
    }

    @PutMapping("/{id}")
    public ResponseEntity<OrganizationResponse> update(@PathVariable UUID id,
                                                       @RequestBody OrganizationRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("Request body required");
        }
        OrganizationEntity saved = organizationService.update(
                id, req.name(), req.slug(), req.plan());
        return ResponseEntity.ok(OrganizationResponse.from(saved));
    }
}
