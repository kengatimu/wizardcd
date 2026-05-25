-- =============================================================================
-- V4 — Phase 5 Stage 5.5: Live Config Push — config_overrides table
-- =============================================================================
-- The headline data structure for Live Config Push. Each row is a single
-- key-value override on a saved environment config:
--
--    env_config_id  → which env (UAT for eureka-registry-ms, say)
--    key            → property key      (e.g. "logging.level.root")
--    value          → property value    (e.g. "DEBUG")
--    injection_method → how it reaches the running app
--
-- An override is independent of the JAR. It can be created, edited, deleted,
-- and pushed to the running target *without ever rebuilding the JAR* and —
-- when the change is hot-refreshable — without restarting the JVM either.
--
-- The five injection methods (see ConfigInjectionMethod enum on the Java side)
-- cover every shape of "external override" Spring Boot supports:
--
--    YAML_OVERRIDE  — written into the WizardCD-managed application-<env>.yml
--                     loaded via --spring.config.additional-location.
--                     Default. The most surgical option — single file,
--                     atomic rename, hot-refreshes when keys are
--                     @RefreshScope / @ConfigurationProperties.
--    JVM_PROPERTY   — passed as -Dkey=value through the Tanuki wrapper
--                     additional-args. Survives restarts; cannot be
--                     hot-refreshed without restart.
--    ENV_VAR        — set via wrapper.env.[i] in the Tanuki conf. Same
--                     restart semantics as JVM_PROPERTY.
--    SPRING_CONFIG  — for keys that live in a separate spring.config.location
--                     file (e.g. a fully-separate properties file). Used by
--                     §5.5.2 (config_files), included here for completeness.
--    LOGBACK        — for logging.level.* keys only. Written to the WizardCD-
--                     managed logback-<env>.xml; logback's own scan loop
--                     picks it up (no actuator required).
--
-- See §5.5.7 (Five injection methods) in web/documents/wizardcd-platform-roadmap.md.
-- =============================================================================

CREATE TABLE config_overrides (
    id                UUID                     PRIMARY KEY,

    -- Owning env config. ON DELETE CASCADE — when an env is removed, its
    -- overrides go with it. This matches the env_config → application chain.
    env_config_id     UUID                     NOT NULL
        REFERENCES environment_configs (id) ON DELETE CASCADE,

    -- Property key. Spring Boot dot-notation (e.g. "logging.level.root",
    -- "server.port", "spring.datasource.url"). Validated client-side as
    -- "non-empty, ≤ 255 chars, no whitespace". The DB does not enforce
    -- shape — different injection methods accept different key syntaxes.
    --
    -- Column name is `override_key` (not `key`) because `key` is a reserved
    -- identifier in several SQL dialects (H2, Oracle, MySQL strict mode).
    -- Prefixing the column avoids dialect-specific quoting at every query.
    override_key      VARCHAR(255)             NOT NULL,

    -- Property value. TEXT (not VARCHAR) — values can legitimately be
    -- multi-line (e.g. a base64-encoded keystore reference, a JSON blob
    -- for spring.application.json). Empty string is valid; NULL is not.
    -- Same `override_` prefix for symmetry with override_key.
    override_value    TEXT                     NOT NULL,

    -- How this override reaches the running app. See header comment above.
    -- Default YAML_OVERRIDE — the most general-purpose, supports hot refresh.
    injection_method  VARCHAR(30)              NOT NULL DEFAULT 'YAML_OVERRIDE',

    -- Optional human note ("Bumped to DEBUG for incident 4287", etc.).
    -- Surfaces in the UI's override list as a sublabel.
    description       TEXT,

    -- Mask value in the UI (•••••). Honest stop-gap — Phase 7 will solve
    -- secret management properly (encryption at rest, provider integration).
    -- For now this is a presentation flag only; the value is still stored
    -- plaintext. The roadmap (§5.5.12) flags this explicitly.
    is_sensitive      BOOLEAN                  NOT NULL DEFAULT FALSE,

    -- Push lifecycle. TRUE means the override exists in the DB but has not
    -- yet been pushed to the live target — appears as a "pending" badge in
    -- the UI. The next Push Live action OR the next full deploy clears it.
    pending           BOOLEAN                  NOT NULL DEFAULT TRUE,

    -- Last successful push timestamp. NULL until first push. NULL ↔ pending
    -- aren't synonymous: an override can be re-pending after edit but still
    -- carry a non-null pushed_at from the last cycle.
    pushed_at         TIMESTAMP WITH TIME ZONE,

    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- One key per env. If a user wants to change a value they UPDATE the
    -- existing row; "the override for logging.level.root in UAT" is a
    -- single, durable entity.
    CONSTRAINT uq_config_overrides_env_key UNIQUE (env_config_id, override_key)
);

-- ── Indexes ─────────────────────────────────────────────────────────────

-- The "list overrides for this env" query is hit on every render of the
-- App Detail page's Overrides tab.
CREATE INDEX idx_config_overrides_env_config
    ON config_overrides (env_config_id);

-- The "show pending overrides" query (for the "N pending" badge on the
-- env card + the "X pending changes will apply on next deploy" banner).
CREATE INDEX idx_config_overrides_pending
    ON config_overrides (env_config_id, pending);
