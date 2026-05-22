package com.ebb.wizardcd.runner.enums;

/**
 * Phase 5 §5.5 — Live Config Push capability for a registered application.
 *
 * <p>Populated by the runtime probe that runs immediately after every
 * deploy's stability check passes. The UI reads this on the Applications
 * List + Application Detail pages to decide which capability badge to
 * render (green / amber / red) and which path to surface in the
 * Push-Live dialog.
 *
 * <h2>Values</h2>
 * <ul>
 *   <li>{@link #ENABLED}  — actuator dependency present in the JAR AND
 *       {@code /actuator/refresh} confirmed reachable from the runner
 *       over SSH. Push-Live can hot-refresh.</li>
 *   <li>{@link #DEGRADED} — actuator present but {@code /refresh} returns
 *       404 (endpoint not exposed) or 401/403 (locked down). Push-Live
 *       requires a JVM restart fallback.</li>
 *   <li>{@link #MISSING}  — {@code spring-boot-actuator-*.jar} not found
 *       in {@code BOOT-INF/lib/}. Push-Live always needs the restart
 *       fallback. UI offers the "Show me how to add it" walkthrough.</li>
 *   <li>{@link #UNKNOWN}  — probe failed for unrelated reasons (network,
 *       port closed, target unreachable). UI shows "?" badge and a
 *       "Re-probe" button.</li>
 *   <li>{@link #PROBING}  — probe is in flight. UI shows a spinner.</li>
 * </ul>
 *
 * <p>Persisted as a {@code VARCHAR(20)} on
 * {@code applications.live_config_capability} (see V2 migration).
 *
 * @see com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity
 */
public enum LiveConfigCapability {
    ENABLED,
    DEGRADED,
    MISSING,
    UNKNOWN,
    PROBING
}
