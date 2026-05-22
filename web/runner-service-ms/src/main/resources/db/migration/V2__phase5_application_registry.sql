-- =============================================================================
-- V2 — Phase 5 Stage 5.1: Application registry — soft delete + live-push capability
-- =============================================================================
-- Adds the small set of columns Phase 5's REST API + UI need on top of the
-- Phase 4 applications table. Strictly additive — no data migration, no
-- destructive operations. Existing rows get NULLs for the new columns,
-- which the Java side treats as "unknown" (matches the
-- LiveConfigCapability#UNKNOWN enum value introduced in §5.5).
--
-- Why these columns now (not in §5.5):
--   • deleted_at — Stage 5.1's REST API supports soft-delete; UI shows
--     archived apps with an Undo affordance (§5.0 principle 6).
--   • live_config_capability / capability_last_checked / capability_details
--     — populated by §5.5's runtime probe, but read by §5.2's UI cards
--     immediately. Defining the columns now lets the App Detail page
--     render the "Live push: ✓ Enabled" badge without a schema change
--     mid-phase.
--
-- See §5.1, §5.2, §5.5 in web/documents/wizardcd-platform-roadmap.md.
-- =============================================================================

-- Soft-delete marker. NULL → row is live. NOT NULL → row is archived;
-- the REST API hides it from list/get unless ?includeDeleted=true is set.
-- Deploy history continues to reference it (FK is SET NULL anyway), so an
-- archived app never breaks past job-detail pages.
ALTER TABLE applications
    ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE;

-- Last-known Live Config Push capability for this app. Populated by the
-- runtime probe that runs immediately after every deploy's stability
-- check passes. Values map 1:1 to LiveConfigCapability enum:
--   ENABLED   actuator + /refresh confirmed reachable from the runner
--   DEGRADED  actuator present but /refresh returns 404 / 401 / blocked
--   MISSING   actuator dependency not present in the JAR at all
--   UNKNOWN   probe failed for unrelated reasons (network, port closed)
--   PROBING   probe is currently in flight
-- NULL counts as UNKNOWN until the first probe completes.
ALTER TABLE applications
    ADD COLUMN live_config_capability VARCHAR(20);

-- Timestamp of the most recent capability probe. NULL when no probe has
-- run yet (fresh app, never deployed). UI shows this as "Last checked: …"
-- alongside the capability badge so users can see when the data was last
-- refreshed and trigger a manual re-probe if they need to.
ALTER TABLE applications
    ADD COLUMN capability_last_checked TIMESTAMP WITH TIME ZONE;

-- Structured probe details (actuator version, exposed endpoints, the
-- management base path + port, any error message from a failed probe).
-- JSONB so future probe-enrichment doesn't need another migration.
-- Schema is intentionally informal:
--   { "actuator_version": "3.2.2",
--     "endpoints_exposed": ["refresh","health","info"],
--     "management_port": 8081,
--     "management_context": "/actuator",
--     "probed_via": "ssh+curl",
--     "error": null }
ALTER TABLE applications
    ADD COLUMN capability_details JSONB;

-- Index supports the dashboard's "live-pushable apps only" filter from §5.2.a
-- (cards view). Used by ApplicationRepository.findByLiveConfigCapability(...).
-- Partial-style WHERE clause omitted intentionally — see V1__init_schema.sql
-- header note 6 + the H2-compat tests in Phase 4 Stage 6.
CREATE INDEX idx_applications_capability
    ON applications (live_config_capability);

-- Index supports the "list live apps only" path (hiding archived rows).
-- Hot path on every Applications List page render.
CREATE INDEX idx_applications_deleted_at
    ON applications (deleted_at);
