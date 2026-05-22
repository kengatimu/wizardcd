-- =============================================================================
-- V3 — Phase 5 Stage 5.6: Multi-tenancy foundation
-- =============================================================================
-- Adds organizations + teams + team_members + ownership columns on the
-- existing applications table. Single-org mode is the default: a seed row
-- "Default Organization" is inserted, and all existing applications are
-- back-filled with its id so the FK constraint can be NOT NULL.
--
-- Multi-org behaviour (org switcher in header, org-scoped settings, etc.)
-- lights up in Phase 15. For Phase 5 the UI shows no org picker; the
-- Settings page exposes a single "Organization" panel where the admin
-- can rename the default org.
--
-- See §5.6 in web/documents/wizardcd-platform-roadmap.md.
--
-- Why now (Stage 5.6, before §5.5):
--   The build order in §5.9 of the roadmap deliberately places this stage
--   BEFORE 5.5 — it's cheaper to add the org_id column to applications now
--   than to back-fill the column once the live app registry has grown.
--   The roadmap doc names this migration V4 because §5.5's V3 was planned
--   first in writing; in the actual chronological build order this is V3.
-- =============================================================================

-- ── Tables ────────────────────────────────────────────────────────────────

-- Top-level tenant boundary. Every app belongs to exactly one organization.
-- The slug is URL-friendly; in multi-org mode (Phase 15) it forms the org
-- path segment for org-scoped pages.
CREATE TABLE organizations (
    id              UUID         PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(100) NOT NULL UNIQUE,
    owner_user_id   UUID,                                   -- set after Phase 6 auth lands
    plan            VARCHAR(30)  NOT NULL DEFAULT 'FREE',   -- FREE / TEAM / BUSINESS / ENTERPRISE (Phase 15)
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Sub-grouping within an organization. An org has 0..N teams; a team
-- has 0..N member users (populated in Phase 6 when users exist).
CREATE TABLE teams (
    id              UUID         PRIMARY KEY,
    org_id          UUID         NOT NULL,
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Team names unique within their org; two orgs can both have a team
    -- called "Backend" without collision.
    CONSTRAINT uq_teams_org_name UNIQUE (org_id, name),

    -- Org deletion cascades — a team has no meaning without its org.
    CONSTRAINT fk_teams_org FOREIGN KEY (org_id)
        REFERENCES organizations(id) ON DELETE CASCADE
);

-- Composite-key join table. user_id has no FK yet because the users table
-- arrives in Phase 6. Once it does, a follow-up migration adds the FK.
-- For now the column accepts any UUID; the Phase 6 migration will validate
-- existing rows before flipping the constraint on.
CREATE TABLE team_members (
    team_id         UUID         NOT NULL,
    user_id         UUID         NOT NULL,
    role            VARCHAR(30)  NOT NULL DEFAULT 'MEMBER',  -- MEMBER / LEAD
    joined_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    PRIMARY KEY (team_id, user_id),

    CONSTRAINT fk_team_members_team FOREIGN KEY (team_id)
        REFERENCES teams(id) ON DELETE CASCADE
);

-- ── Application ownership ─────────────────────────────────────────────────
--
-- Two-step add so existing rows get the default org_id before the NOT NULL
-- constraint kicks in:
--   1. Add the column nullable + add FK
--   2. Insert default org row
--   3. Back-fill existing applications
--   4. Set NOT NULL on org_id
--
-- team_id stays nullable — an app can belong to an org without a team
-- (single-org mode never asks for a team).

ALTER TABLE applications ADD COLUMN org_id  UUID;
ALTER TABLE applications ADD COLUMN team_id UUID;

ALTER TABLE applications
    ADD CONSTRAINT fk_applications_org FOREIGN KEY (org_id)
        REFERENCES organizations(id);

ALTER TABLE applications
    ADD CONSTRAINT fk_applications_team FOREIGN KEY (team_id)
        REFERENCES teams(id) ON DELETE SET NULL;

-- Hot path on the Applications List + Dashboard widgets (Phase 15 multi-org
-- will filter by org_id on every read).
CREATE INDEX idx_applications_org_id  ON applications (org_id);
CREATE INDEX idx_applications_team_id ON applications (team_id);

-- ── Default organization seed ─────────────────────────────────────────────
--
-- A fixed UUID lets every environment (local, CI, the runner VM) share the
-- same default-org id, so test fixtures and back-fills are deterministic.
-- The Phase 5.7 onboarding wizard renames this row on first launch.

INSERT INTO organizations (id, name, slug, plan)
VALUES (
    '00000000-0000-0000-0000-00000000d0c1',   -- d0c1 ≈ "default org seed 1"
    'Default Organization',
    'default',
    'FREE'
);

-- Back-fill every existing application with the default org.
UPDATE applications
SET org_id = '00000000-0000-0000-0000-00000000d0c1'
WHERE org_id IS NULL;

-- Now that every row has an org, lock the constraint.
ALTER TABLE applications ALTER COLUMN org_id SET NOT NULL;
