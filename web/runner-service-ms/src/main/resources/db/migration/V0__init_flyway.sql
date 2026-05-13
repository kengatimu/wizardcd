-- =============================================================================
-- V0 — Flyway bootstrap placeholder
-- =============================================================================
-- Purpose : Give Flyway a migration to find on first boot so it creates the
--           `flyway_schema_history` tracking table and records baseline state.
-- =============================================================================
--
-- This file is intentionally a no-op. The real schema lands in
-- V1__init_schema.sql during Stage 2 of Phase 4 (applications,
-- environment_configs, deployments, deployment_states, audit_events).
--
-- After V0 runs successfully:
--   psql -U wizardcd wizardcd -c "SELECT version, description, success
--                                   FROM flyway_schema_history;"
--   →  0 | init flyway | t
-- =============================================================================

SELECT 1;
