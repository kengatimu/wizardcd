package com.ebb.wizardcd.runner.service.audit;

/**
 * Canonical action type strings written to {@code audit_events.action}.
 *
 * <p>Centralised here so action names never drift between writer and reader.
 * The audit log UI (Phase 11) filters / groups on these exact strings.
 *
 * <p>Conventions:
 * <ul>
 *   <li>Action names are SCREAMING_SNAKE_CASE so they sort/filter cleanly.</li>
 *   <li>Past-tense for state changes ({@code APP_CREATED}), imperative for
 *       lifecycle operations ({@code DEPLOY} / {@code ROLLBACK} / {@code ABORT}).
 *       Mirrors the rest of the deployment domain language.</li>
 *   <li>New action types should be added here BEFORE first use so the
 *       compiler catches typos at call sites.</li>
 * </ul>
 */
public final class AuditAction {

    // ── Deployment lifecycle ──────────────────────────────────────────────
    public static final String DEPLOY   = "DEPLOY";
    public static final String REDEPLOY = "REDEPLOY";
    public static final String ROLLBACK = "ROLLBACK";
    public static final String ABORT    = "ABORT";

    // ── Application registry (Phase 5) ────────────────────────────────────
    public static final String APP_CREATED  = "APP_CREATED";
    public static final String APP_UPDATED  = "APP_UPDATED";
    public static final String APP_DELETED  = "APP_DELETED";     // soft-delete (sets deleted_at)
    public static final String APP_RESTORED = "APP_RESTORED";    // clears deleted_at

    // ── Environment configs (Phase 5) ─────────────────────────────────────
    public static final String ENV_CONFIG_CREATED = "ENV_CONFIG_CREATED";
    public static final String ENV_CONFIG_UPDATED = "ENV_CONFIG_UPDATED";
    public static final String ENV_CONFIG_DELETED = "ENV_CONFIG_DELETED";

    // ── Configuration (Phase 5+) ──────────────────────────────────────────
    public static final String CONFIG_CHANGE = "CONFIG_CHANGE";

    private AuditAction() {}
}
