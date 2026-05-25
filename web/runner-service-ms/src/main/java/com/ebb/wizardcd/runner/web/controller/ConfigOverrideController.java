package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.persistence.entity.ConfigOverrideEntity;
import com.ebb.wizardcd.runner.persistence.entity.EnvironmentConfigEntity;
import com.ebb.wizardcd.runner.service.ConfigOverrideService;
import com.ebb.wizardcd.runner.service.EnvironmentConfigService;
import com.ebb.wizardcd.runner.web.dto.ConfigOverrideRequest;
import com.ebb.wizardcd.runner.web.dto.ConfigOverrideResponse;
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
 * Phase 5 §5.5 — REST endpoints over {@link ConfigOverrideService}.
 *
 * <p>Nested under {@code /applications/:appId/environments/:envConfigId/overrides}
 * so the URL shape matches the data hierarchy: an override is always
 * scoped to a specific env config, which is always scoped to a specific app.
 *
 * <table>
 *   <caption>Endpoint summary</caption>
 *   <tr><th>Method</th><th>Path</th><th>Purpose</th></tr>
 *   <tr><td>GET</td><td>…/overrides</td><td>List overrides for one env</td></tr>
 *   <tr><td>GET</td><td>…/overrides?pending=true</td><td>Pending-only filter</td></tr>
 *   <tr><td>POST</td><td>…/overrides</td><td>Create a new override</td></tr>
 *   <tr><td>GET</td><td>…/overrides/:overrideId</td><td>Get one override</td></tr>
 *   <tr><td>PUT</td><td>…/overrides/:overrideId</td><td>Update (partial)</td></tr>
 *   <tr><td>DELETE</td><td>…/overrides/:overrideId</td><td>Delete</td></tr>
 * </table>
 *
 * <p>The Push-Live endpoint lives in a separate controller (§5.5.2) so
 * the CRUD vs. push concerns stay split — same pattern as
 * {@link RunnerController} vs {@link AbortController}.
 */
@RestController
@RequestMapping("/applications/{appId}/environments/{envConfigId}/overrides")
public class ConfigOverrideController {

    private static final Logger log = LoggerFactory.getLogger(ConfigOverrideController.class);

    private final ConfigOverrideService    overrideService;
    private final EnvironmentConfigService envConfigService;

    public ConfigOverrideController(ConfigOverrideService overrideService,
                                     EnvironmentConfigService envConfigService) {
        this.overrideService = overrideService;
        this.envConfigService = envConfigService;
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    @GetMapping
    public ResponseEntity<List<ConfigOverrideResponse>> list(
            @PathVariable UUID appId,
            @PathVariable UUID envConfigId,
            @RequestParam(value = "pending", required = false) Boolean pendingOnly) {

        requireEnvOfApp(appId, envConfigId);

        List<ConfigOverrideEntity> rows = Boolean.TRUE.equals(pendingOnly)
                ? overrideService.findPendingByEnv(envConfigId)
                : overrideService.findByEnv(envConfigId);

        // No per-row filtering needed: the query is scoped by envConfigId and
        // we've already verified envConfigId belongs to appId above.
        List<ConfigOverrideResponse> body = rows.stream()
                .map(ConfigOverrideResponse::from)
                .toList();
        return ResponseEntity.ok(body);
    }

    @GetMapping("/{overrideId}")
    public ResponseEntity<ConfigOverrideResponse> get(@PathVariable UUID appId,
                                                       @PathVariable UUID envConfigId,
                                                       @PathVariable UUID overrideId) {
        requireEnvOfApp(appId, envConfigId);

        ConfigOverrideEntity row = overrideService.findById(overrideId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No config override with id " + overrideId));

        // The env-of-override comparison is safe — .getId() on a lazy proxy
        // doesn't require an open session (Hibernate exposes the id without
        // initialising the proxy).
        if (row.getEnvConfig() == null
                || !row.getEnvConfig().getId().equals(envConfigId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "No config override with id " + overrideId + " for env " + envConfigId);
        }
        return ResponseEntity.ok(ConfigOverrideResponse.from(row));
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<ConfigOverrideResponse> create(@PathVariable UUID appId,
                                                          @PathVariable UUID envConfigId,
                                                          @RequestBody ConfigOverrideRequest req) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body required");
        }
        requireEnvOfApp(appId, envConfigId);
        try {
            ConfigOverrideEntity saved = overrideService.create(envConfigId, req.toEntity());
            return ResponseEntity
                    .created(URI.create("/applications/" + appId
                            + "/environments/" + envConfigId
                            + "/overrides/" + saved.getId()))
                    .body(ConfigOverrideResponse.from(saved));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage(), e);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        }
    }

    @PutMapping("/{overrideId}")
    public ResponseEntity<ConfigOverrideResponse> update(@PathVariable UUID appId,
                                                          @PathVariable UUID envConfigId,
                                                          @PathVariable UUID overrideId,
                                                          @RequestBody ConfigOverrideRequest req) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body required");
        }
        requireEnvOfApp(appId, envConfigId);

        // Confirm the override is in this env (same defence as GET single)
        ConfigOverrideEntity existing = overrideService.findById(overrideId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No config override with id " + overrideId));
        if (existing.getEnvConfig() == null
                || !existing.getEnvConfig().getId().equals(envConfigId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "No config override with id " + overrideId + " for env " + envConfigId);
        }
        try {
            ConfigOverrideEntity saved = overrideService.update(overrideId, req.toEntity());
            return ResponseEntity.ok(ConfigOverrideResponse.from(saved));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage(), e);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        }
    }

    @DeleteMapping("/{overrideId}")
    public ResponseEntity<Void> delete(@PathVariable UUID appId,
                                        @PathVariable UUID envConfigId,
                                        @PathVariable UUID overrideId) {
        requireEnvOfApp(appId, envConfigId);

        // Refuse to delete an override that belongs to a different env even
        // if the row exists (404 — don't leak cross-env existence).
        overrideService.findById(overrideId).ifPresent(existing -> {
            if (existing.getEnvConfig() == null
                    || !existing.getEnvConfig().getId().equals(envConfigId)) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No config override with id " + overrideId + " for env " + envConfigId);
            }
        });
        overrideService.delete(overrideId);
        return ResponseEntity.noContent().build();
    }

    // ── Internal ──────────────────────────────────────────────────────────

    /**
     * Verifies that {@code envConfigId} belongs to {@code appId}. Throws
     * 404 if the env doesn't exist or its parent application doesn't match
     * the path-supplied {@code appId}.
     *
     * <p>Why this lives at the controller layer instead of being navigated
     * from the override row: navigating
     * {@code override.getEnvConfig().getApplication().getId()} crosses two
     * lazy proxies, which fails when the JPA session has closed (the runner
     * runs with {@code open-in-view: false}). Loading the env once via
     * {@link EnvironmentConfigService#findById} gives us a non-proxy entity
     * whose ManyToOne application access works via Hibernate's proxy-id
     * optimisation.
     */
    private void requireEnvOfApp(UUID appId, UUID envConfigId) {
        EnvironmentConfigEntity env = envConfigService.findById(envConfigId).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No env config with id " + envConfigId));
        // .getId() on a lazy proxy works without an open session — Hibernate
        // exposes the FK column value without needing to materialise the row.
        if (env.getApplication() == null
                || !env.getApplication().getId().equals(appId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Env config " + envConfigId + " does not belong to app " + appId);
        }
    }
}
