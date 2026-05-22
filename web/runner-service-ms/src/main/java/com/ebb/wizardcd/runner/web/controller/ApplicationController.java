package com.ebb.wizardcd.runner.web.controller;

import com.ebb.wizardcd.runner.enums.LiveConfigCapability;
import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import com.ebb.wizardcd.runner.service.ApplicationService;
import com.ebb.wizardcd.runner.service.AuditService;
import com.ebb.wizardcd.runner.service.EnvironmentConfigService;
import com.ebb.wizardcd.runner.service.audit.AuditAction;
import com.ebb.wizardcd.runner.web.dto.ApplicationRequest;
import com.ebb.wizardcd.runner.web.dto.ApplicationResponse;
import com.ebb.wizardcd.runner.web.dto.EnvironmentConfigResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Phase 5 §5.1 — REST endpoints over {@link ApplicationService}.
 *
 * <p>The Phase 5 UI hangs the Applications List, Application Detail, and
 * Application Setup Wizard pages off these endpoints. All paths are
 * unprefixed (matches existing {@code /jobs}, {@code /ssh/test}, etc.).
 *
 * <table>
 *   <caption>Endpoint summary</caption>
 *   <tr><th>Method</th><th>Path</th><th>Purpose</th></tr>
 *   <tr><td>POST</td><td>/applications</td><td>Create new app</td></tr>
 *   <tr><td>GET</td><td>/applications</td><td>List live apps (with optional capability filter + search)</td></tr>
 *   <tr><td>GET</td><td>/applications/:id</td><td>App detail + envs</td></tr>
 *   <tr><td>PUT</td><td>/applications/:id</td><td>Update name / description</td></tr>
 *   <tr><td>DELETE</td><td>/applications/:id</td><td>Soft-delete (Undo via POST .../restore)</td></tr>
 *   <tr><td>POST</td><td>/applications/:id/restore</td><td>Clear deleted_at</td></tr>
 * </table>
 *
 * <p>Every write emits a structured audit event (action types from
 * {@link AuditAction}).
 *
 * <h2>Error mapping</h2>
 * <ul>
 *   <li>{@link NoSuchElementException} → 404 Not Found</li>
 *   <li>{@link IllegalArgumentException} → 400 Bad Request</li>
 *   <li>Anything else → 500 (Spring's default)</li>
 * </ul>
 */
@RestController
@RequestMapping("/applications")
public class ApplicationController {

    private static final Logger log = LoggerFactory.getLogger(ApplicationController.class);

    private final ApplicationService applicationService;
    private final EnvironmentConfigService envConfigService;
    private final AuditService auditService;

    public ApplicationController(ApplicationService applicationService,
                                 EnvironmentConfigService envConfigService,
                                 AuditService auditService) {
        this.applicationService = applicationService;
        this.envConfigService = envConfigService;
        this.auditService = auditService;
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    /**
     * List live applications. Supports two optional query parameters:
     * <ul>
     *   <li>{@code ?q=<search>} — case-insensitive substring match on name</li>
     *   <li>{@code ?capability=ENABLED|DEGRADED|MISSING|UNKNOWN|PROBING}
     *       — filter to apps with that live-push capability</li>
     * </ul>
     */
    @GetMapping
    public ResponseEntity<List<ApplicationResponse>> list(
            @RequestParam(name = "q",         required = false) String query,
            @RequestParam(name = "capability", required = false) LiveConfigCapability capability) {

        List<ApplicationEntity> apps;
        if (capability != null) {
            apps = applicationService.findByCapability(capability);
            if (query != null && !query.isBlank()) {
                String needle = query.trim().toLowerCase();
                apps = apps.stream()
                        .filter(a -> a.getName().toLowerCase().contains(needle))
                        .toList();
            }
        } else if (query != null && !query.isBlank()) {
            apps = applicationService.search(query);
        } else {
            apps = applicationService.findAll();
        }
        return ResponseEntity.ok(apps.stream().map(ApplicationResponse::from).toList());
    }

    /**
     * Get one app. {@code ?expand=environments} pulls the env configs in
     * the same response so the App Detail page only needs one request.
     */
    @GetMapping("/{id}")
    public ResponseEntity<ApplicationResponse> get(
            @PathVariable UUID id,
            @RequestParam(name = "expand", required = false) String expand) {

        ApplicationEntity app = applicationService.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "No application with id " + id));

        if (expand != null && expand.toLowerCase().contains("environments")) {
            List<EnvironmentConfigResponse> envs =
                    envConfigService.findByApp(id).stream()
                            .map(EnvironmentConfigResponse::from)
                            .toList();
            return ResponseEntity.ok(ApplicationResponse.from(app, envs, null));
        }
        return ResponseEntity.ok(ApplicationResponse.from(app));
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @PostMapping
    public ResponseEntity<ApplicationResponse> create(@RequestBody ApplicationRequest req) {
        if (req == null || req.name() == null || req.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Application name is required");
        }
        try {
            ApplicationEntity saved = applicationService.create(req.name(), req.description());

            auditService.record(
                    AuditAction.APP_CREATED,
                    saved.getName(),
                    detailsMap("appId", saved.getId().toString(),
                               "name",  saved.getName()),
                    null   // created_by — Phase 6
            );

            return ResponseEntity
                    .created(URI.create("/applications/" + saved.getId()))
                    .body(ApplicationResponse.from(saved));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        }
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApplicationResponse> update(@PathVariable UUID id,
                                                       @RequestBody ApplicationRequest req) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body required");
        }
        try {
            ApplicationEntity saved = applicationService.update(id, req.name(), req.description());

            Map<String, Object> details = new HashMap<>();
            details.put("appId", saved.getId().toString());
            details.put("name",  saved.getName());
            if (req.name() != null)        details.put("nameChanged", true);
            if (req.description() != null) details.put("descriptionChanged", true);
            auditService.record(AuditAction.APP_UPDATED, saved.getName(), details, null);

            return ResponseEntity.ok(ApplicationResponse.from(saved));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage(), e);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage(), e);
        }
    }

    /**
     * Soft-delete. The UI surfaces this as Archive + a 5-second Undo toast
     * (§5.0 principle 6). To actually restore, hit POST /applications/:id/restore.
     */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        try {
            // Resolve the app first so the audit row has the name before
            // the row is archived.
            ApplicationEntity app = applicationService.findById(id).orElseThrow(
                    () -> new NoSuchElementException("No application with id " + id));

            applicationService.delete(id);

            auditService.record(
                    AuditAction.APP_DELETED,
                    app.getName(),
                    detailsMap("appId", id.toString(), "name", app.getName()),
                    null
            );

            return ResponseEntity.noContent().build();
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage(), e);
        }
    }

    /** Undo a soft-delete. Backs the toast Undo button. */
    @PostMapping("/{id}/restore")
    public ResponseEntity<ApplicationResponse> restore(@PathVariable UUID id) {
        try {
            ApplicationEntity restored = applicationService.restore(id);
            auditService.record(
                    AuditAction.APP_RESTORED,
                    restored.getName(),
                    detailsMap("appId", id.toString(), "name", restored.getName()),
                    null
            );
            return ResponseEntity.ok(ApplicationResponse.from(restored));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage(), e);
        }
    }

    // ── Internal ───────────────────────────────────────────────────────────

    /** Small helper — replaces an inline Map.of() that won't accept null values. */
    private static Map<String, Object> detailsMap(Object... kv) {
        Map<String, Object> m = new HashMap<>(kv.length / 2);
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return m;
    }
}
