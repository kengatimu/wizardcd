package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.persistence.entity.TeamEntity;
import com.ebb.wizardcd.runner.service.TeamService;
import com.ebb.wizardcd.runner.web.dto.TeamRequest;
import com.ebb.wizardcd.runner.web.dto.TeamResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Phase 5 §5.6 — REST endpoints over {@link TeamService}.
 *
 * <p>Nested under {@code /organizations/{orgId}/teams} — the URL hierarchy
 * mirrors the data hierarchy (a team is always scoped to a specific org).
 *
 * <table>
 *   <caption>Endpoint summary</caption>
 *   <tr><th>Method</th><th>Path</th><th>Purpose</th></tr>
 *   <tr><td>GET</td><td>.../teams</td><td>List teams in org (name-ASC)</td></tr>
 *   <tr><td>POST</td><td>.../teams</td><td>Create new team</td></tr>
 *   <tr><td>GET</td><td>.../teams/:id</td><td>Get one (404 on cross-org)</td></tr>
 *   <tr><td>PUT</td><td>.../teams/:id</td><td>Update name / description</td></tr>
 *   <tr><td>DELETE</td><td>.../teams/:id</td><td>Delete team</td></tr>
 * </table>
 */
@RestController
@RequestMapping("/organizations/{orgId}/teams")
public class TeamController {

    private final TeamService teamService;

    public TeamController(TeamService teamService) {
        this.teamService = teamService;
    }

    @GetMapping
    public ResponseEntity<List<TeamResponse>> list(@PathVariable UUID orgId) {
        List<TeamResponse> teams = teamService.findByOrg(orgId).stream()
                .map(TeamResponse::from)
                .toList();
        return ResponseEntity.ok(teams);
    }

    @GetMapping("/{teamId}")
    public ResponseEntity<TeamResponse> get(@PathVariable UUID orgId,
                                             @PathVariable UUID teamId) {
        TeamEntity team = teamService.findById(teamId).orElseThrow(
                () -> new NoSuchElementException("No team with id " + teamId));
        if (team.getOrganization() == null || !team.getOrganization().getId().equals(orgId)) {
            // Treat cross-org lookups as 404 — same existence-leak guard
            // pattern as EnvironmentConfigController.
            throw new NoSuchElementException(
                    "No team with id " + teamId + " in organization " + orgId);
        }
        return ResponseEntity.ok(TeamResponse.from(team));
    }

    @PostMapping
    public ResponseEntity<TeamResponse> create(@PathVariable UUID orgId,
                                                @RequestBody TeamRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("Request body required");
        }
        TeamEntity saved = teamService.create(orgId, req.name(), req.description());
        return ResponseEntity
                .created(URI.create("/organizations/" + orgId + "/teams/" + saved.getId()))
                .body(TeamResponse.from(saved));
    }

    @PutMapping("/{teamId}")
    public ResponseEntity<TeamResponse> update(@PathVariable UUID orgId,
                                                @PathVariable UUID teamId,
                                                @RequestBody TeamRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("Request body required");
        }
        TeamEntity saved = teamService.update(orgId, teamId, req.name(), req.description());
        return ResponseEntity.ok(TeamResponse.from(saved));
    }

    @DeleteMapping("/{teamId}")
    public ResponseEntity<Void> delete(@PathVariable UUID orgId,
                                        @PathVariable UUID teamId) {
        teamService.delete(orgId, teamId);
        return ResponseEntity.noContent().build();
    }
}
