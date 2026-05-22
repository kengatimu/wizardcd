package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;
import com.ebb.wizardcd.runner.service.EnvironmentConfigService;
import com.ebb.wizardcd.runner.web.dto.EnvironmentConfigRequest;
import com.ebb.wizardcd.runner.web.dto.EnvironmentConfigResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Phase 5 §5.1 — REST endpoints over {@link EnvironmentConfigService}.
 *
 * <p>All endpoints are nested under {@code /applications/:id/environments}
 * — the URL hierarchy mirrors the data hierarchy (an env config is always
 * scoped to a specific app).
 *
 * <table>
 *   <caption>Endpoint summary</caption>
 *   <tr><th>Method</th><th>Path</th><th>Purpose</th></tr>
 *   <tr><td>GET</td><td>/applications/:id/environments</td><td>List env configs</td></tr>
 *   <tr><td>POST</td><td>/applications/:id/environments</td><td>Create new env config</td></tr>
 *   <tr><td>GET</td><td>/applications/:id/environments/:envId</td><td>Get one env config</td></tr>
 *   <tr><td>PUT</td><td>/applications/:id/environments/:envId</td><td>Update env config (partial)</td></tr>
 *   <tr><td>DELETE</td><td>/applications/:id/environments/:envId</td><td>Delete env config</td></tr>
 * </table>
 *
 * <p>The service layer handles all auditing — the controller is a thin
 * mapping shell. Error mapping follows the same convention as
 * {@link ApplicationController}.
 */
@RestController
@RequestMapping("/applications/{appId}/environments")
public class EnvironmentConfigController {

    private static final Logger log = LoggerFactory.getLogger(EnvironmentConfigController.class);

    private final EnvironmentConfigService envConfigService;

    public EnvironmentConfigController(EnvironmentConfigService envConfigService) {
        this.envConfigService = envConfigService;
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<List<EnvironmentConfigResponse>> list(@PathVariable UUID appId) {
        List<EnvironmentConfigResponse> envs = envConfigService.findByApp(appId).stream()
                .map(EnvironmentConfigResponse::from)
                .toList();
        return ResponseEntity.ok(envs);
    }

    @GetMapping("/{envConfigId}")
    public ResponseEntity<EnvironmentConfigResponse> get(@PathVariable UUID appId,
                                                          @PathVariable UUID envConfigId) {
        EnvironmentConfigEntity env = envConfigService.findById(envConfigId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No env config with id " + envConfigId));

        if (env.getApplication() == null || !env.getApplication().getId().equals(appId)) {
            // Treat "env exists but not for this app" as 404 rather than 403 —
            // we don't want to leak existence of env configs across apps.
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "No env config with id " + envConfigId + " for app " + appId);
        }
        return ResponseEntity.ok(EnvironmentConfigResponse.from(env));
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<EnvironmentConfigResponse> create(@PathVariable UUID appId,
                                                             @RequestBody EnvironmentConfigRequest req) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body required");
        }
        try {
            EnvironmentConfigEntity saved = envConfigService.create(appId, req.toEntity());
            return ResponseEntity
                    .created(URI.create("/applications/" + appId
                            + "/environments/" + saved.getId()))
                    .body(EnvironmentConfigResponse.from(saved));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage(), e);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        }
    }

    @PutMapping("/{envConfigId}")
    public ResponseEntity<EnvironmentConfigResponse> update(@PathVariable UUID appId,
                                                             @PathVariable UUID envConfigId,
                                                             @RequestBody EnvironmentConfigRequest req) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body required");
        }
        try {
            EnvironmentConfigEntity saved = envConfigService.update(appId, envConfigId, req.toEntity());
            return ResponseEntity.ok(EnvironmentConfigResponse.from(saved));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage(), e);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        }
    }

    @DeleteMapping("/{envConfigId}")
    public ResponseEntity<Void> delete(@PathVariable UUID appId,
                                       @PathVariable UUID envConfigId) {
        try {
            envConfigService.delete(appId, envConfigId);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        }
    }
}
