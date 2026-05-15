package com.ebb.wizardcd.runner.dto;

/**
 * Request DTO for {@code POST /ssh/check-path}.
 *
 * <p>Fires when the user enters or changes the DEPLOY PATH field in Step 2 of
 * the New Deploy wizard. The runner SSHes into the target server and checks
 * whether the path exists, what user owns it, and whether the run-as user can
 * write to it (directly or via its parent dir).
 *
 * <p>The five outcomes that the runner returns via {@link PathCheckResult}:
 * <ul>
 *   <li>{@code OK} — path exists, owned by run-as user</li>
 *   <li>{@code WRONG_OWNER} — path exists, owned by someone else</li>
 *   <li>{@code MISSING} — path doesn't exist but parent dir is writable
 *       (runner can {@code mkdir -p} during deploy)</li>
 *   <li>{@code PARENT_NOT_WRITABLE} — path doesn't exist AND parent dir is
 *       not writable by run-as user (manual {@code sudo mkdir} required)</li>
 *   <li>{@code INVALID_PATH} / {@code UNREACHABLE} — short-circuits before SSH</li>
 * </ul>
 */
public class PathCheckRequest {

    private String environment;
    private String sshUser;
    private String sshHost;
    private Integer sshPort;
    /** Linux user the deployed process will run as (typically same as sshUser). */
    private String runAsUser;
    /** The deploy path to check, e.g. {@code "/u01/gag/registry"}. */
    private String targetBasePath;

    public String getEnvironment() { return environment; }
    public void setEnvironment(String environment) { this.environment = environment; }

    public String getSshUser() { return sshUser; }
    public void setSshUser(String sshUser) { this.sshUser = sshUser; }

    public String getSshHost() { return sshHost; }
    public void setSshHost(String sshHost) { this.sshHost = sshHost; }

    public Integer getSshPort() { return sshPort; }
    public void setSshPort(Integer sshPort) { this.sshPort = sshPort; }

    public String getRunAsUser() { return runAsUser; }
    public void setRunAsUser(String runAsUser) { this.runAsUser = runAsUser; }

    public String getTargetBasePath() { return targetBasePath; }
    public void setTargetBasePath(String targetBasePath) { this.targetBasePath = targetBasePath; }
}
