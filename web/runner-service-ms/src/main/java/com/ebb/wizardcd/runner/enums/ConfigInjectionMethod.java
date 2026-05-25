package com.ebb.wizardcd.runner.enums;

/**
 * Phase 5 §5.5.7 — How a config override reaches the running app.
 *
 * <p>Five mechanisms, each appropriate for a different kind of property.
 * The UI exposes these as a chip-picker (§5.0 #1: select don't type) and
 * auto-suggests one based on the key shape:
 * <ul>
 *   <li>{@code logging.level.*}     → {@link #LOGBACK} (auto-reloads, no restart)</li>
 *   <li>{@code server.port}         → {@link #JVM_PROPERTY} (needs restart anyway)</li>
 *   <li>{@code spring.*}            → {@link #YAML_OVERRIDE} (most general)</li>
 *   <li>password / token / key      → {@link #ENV_VAR} (process env vars are
 *                                    less likely to leak in dumps)</li>
 *   <li>large multi-line YAML       → {@link #SPRING_CONFIG} (use a file)</li>
 * </ul>
 *
 * <p>Restart semantics:
 * <ul>
 *   <li>{@link #YAML_OVERRIDE} and {@link #LOGBACK} can hot-refresh when the
 *       app exposes {@code /actuator/refresh}; otherwise they require a JVM
 *       restart.</li>
 *   <li>{@link #JVM_PROPERTY} and {@link #ENV_VAR} <em>always</em> require a
 *       JVM restart — they're baked into the launch line.</li>
 *   <li>{@link #SPRING_CONFIG} — same hot-refresh capability as YAML_OVERRIDE
 *       since it's still Spring config files; the difference is the file
 *       lives at a user-chosen path rather than the WizardCD-managed
 *       application-{@code <env>}.yml.</li>
 * </ul>
 */
public enum ConfigInjectionMethod {

    /**
     * Default. Property written into the WizardCD-managed
     * {@code application-<env>.yml} loaded via
     * {@code --spring.config.additional-location}. Supports hot-refresh
     * via {@code /actuator/refresh} when the app is actuator-enabled.
     */
    YAML_OVERRIDE,

    /**
     * Passed as {@code -Dkey=value} through the Tanuki wrapper's
     * {@code wrapper.java.additional.[i]} parameters. Always requires
     * a JVM restart to take effect.
     */
    JVM_PROPERTY,

    /**
     * Set as a process-level environment variable via the Tanuki wrapper's
     * {@code wrapper.env.[i]} parameters. Always requires a JVM restart.
     * Prefer this for credentials — env vars are less likely to leak in
     * stack traces, thread dumps, and JMX exposures than -D system props.
     */
    ENV_VAR,

    /**
     * Property written into a separately-located config file pointed to by
     * {@code spring.config.additional-location}. Used when a user wants to
     * manage a large multi-line YAML block as a single editable file rather
     * than per-key entries. Hot-refresh follows the same rules as YAML_OVERRIDE.
     */
    SPRING_CONFIG,

    /**
     * Property written into the WizardCD-managed {@code logback-<env>.xml}.
     * Logback's own scan loop picks the change up within 30 s without
     * requiring actuator. Only valid for keys matching {@code logging.level.*}.
     */
    LOGBACK
}
