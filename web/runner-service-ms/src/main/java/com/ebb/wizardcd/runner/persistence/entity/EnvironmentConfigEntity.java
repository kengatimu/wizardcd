package com.ebb.wizardcd.runner.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

/**
 * JPA entity for the {@code environment_configs} table.
 *
 * <p>Saved per-app, per-environment deployment settings. Phase 5's "App
 * registry" feature is built on this — register an app + env once with all
 * the SSH/Java/runtime fields, then re-use them on every deploy without
 * re-typing.
 *
 * <p>Phase 4 doesn't yet WRITE into this table from the wizard (it still
 * writes a full {@code DeploymentRequest} snapshot into
 * {@code deployments.config_snapshot}). This entity exists now so the FK
 * column on {@code deployments} can be added at the same time without
 * needing an {@code ALTER TABLE} in Phase 5.
 *
 * <p>Unique on {@code (app_id, env_name)} — exactly one saved config per
 * app+env combination.
 *
 * @see com.ebb.wizardcd.runner.persistence.repository.EnvironmentConfigRepository
 */
@Entity
@Table(
    name = "environment_configs",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_environment_configs_app_env",
        columnNames = {"app_id", "env_name"}
    )
)
public class EnvironmentConfigEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    /** Parent application. ON DELETE CASCADE on the DB side. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "app_id", nullable = false)
    private ApplicationEntity application;

    @Column(name = "env_name", nullable = false, length = 20)
    private String envName;

    @Column(name = "ssh_user", nullable = false, length = 100)
    private String sshUser;

    @Column(name = "ssh_host", nullable = false, length = 255)
    private String sshHost;

    @Column(name = "ssh_port", nullable = false)
    private Integer sshPort = 22;

    @Column(name = "java_command", nullable = false, length = 500)
    private String javaCommand;

    @Column(name = "java_version", length = 10)
    private String javaVersion;

    @Column(name = "target_base_path", nullable = false, length = 500)
    private String targetBasePath;

    @Column(name = "run_as_user", nullable = false, length = 100)
    private String runAsUser;

    @Column(name = "server_port", nullable = false)
    private Integer serverPort;

    @Column(name = "main_class", length = 500)
    private String mainClass;

    @Column(name = "jar_name", length = 255)
    private String jarName;

    @Column(name = "lib_path", nullable = false, length = 255)
    private String libPath = "";

    @Column(name = "xms", length = 20)
    private String xms;

    @Column(name = "xmx", length = 20)
    private String xmx;

    /** Stored as JSON-array text (e.g. {@code ["-Dprofile=uat","-Xss512k"]}). */
    @Column(name = "extra_jvm_opts", columnDefinition = "TEXT")
    private String extraJvmOpts;

    @Column(name = "max_log_size", nullable = false, length = 20)
    private String maxLogSize = "10m";

    @Column(name = "max_log_files", nullable = false)
    private Integer maxLogFiles = 10;

    @Column(name = "perform_backup", nullable = false)
    private Boolean performBackup = Boolean.TRUE;

    @Column(name = "max_backups", nullable = false)
    private Integer maxBackups = 5;

    @Column(name = "stability_window", nullable = false)
    private Integer stabilityWindow = 20;

    @Column(name = "deployment_strategy", nullable = false, length = 30)
    private String deploymentStrategy = "in_place";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // ── JPA lifecycle callbacks ────────────────────────────────────────────

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }

    // ── Constructors ───────────────────────────────────────────────────────

    /** Required by Hibernate. */
    protected EnvironmentConfigEntity() {}

    public EnvironmentConfigEntity(UUID id, ApplicationEntity application, String envName) {
        this.id = id;
        this.application = application;
        this.envName = envName;
    }

    // ── Accessors ──────────────────────────────────────────────────────────

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public ApplicationEntity getApplication() { return application; }
    public void setApplication(ApplicationEntity application) { this.application = application; }

    public String getEnvName() { return envName; }
    public void setEnvName(String envName) { this.envName = envName; }

    public String getSshUser() { return sshUser; }
    public void setSshUser(String sshUser) { this.sshUser = sshUser; }

    public String getSshHost() { return sshHost; }
    public void setSshHost(String sshHost) { this.sshHost = sshHost; }

    public Integer getSshPort() { return sshPort; }
    public void setSshPort(Integer sshPort) { this.sshPort = sshPort; }

    public String getJavaCommand() { return javaCommand; }
    public void setJavaCommand(String javaCommand) { this.javaCommand = javaCommand; }

    public String getJavaVersion() { return javaVersion; }
    public void setJavaVersion(String javaVersion) { this.javaVersion = javaVersion; }

    public String getTargetBasePath() { return targetBasePath; }
    public void setTargetBasePath(String targetBasePath) { this.targetBasePath = targetBasePath; }

    public String getRunAsUser() { return runAsUser; }
    public void setRunAsUser(String runAsUser) { this.runAsUser = runAsUser; }

    public Integer getServerPort() { return serverPort; }
    public void setServerPort(Integer serverPort) { this.serverPort = serverPort; }

    public String getMainClass() { return mainClass; }
    public void setMainClass(String mainClass) { this.mainClass = mainClass; }

    public String getJarName() { return jarName; }
    public void setJarName(String jarName) { this.jarName = jarName; }

    public String getLibPath() { return libPath; }
    public void setLibPath(String libPath) { this.libPath = libPath; }

    public String getXms() { return xms; }
    public void setXms(String xms) { this.xms = xms; }

    public String getXmx() { return xmx; }
    public void setXmx(String xmx) { this.xmx = xmx; }

    public String getExtraJvmOpts() { return extraJvmOpts; }
    public void setExtraJvmOpts(String extraJvmOpts) { this.extraJvmOpts = extraJvmOpts; }

    public String getMaxLogSize() { return maxLogSize; }
    public void setMaxLogSize(String maxLogSize) { this.maxLogSize = maxLogSize; }

    public Integer getMaxLogFiles() { return maxLogFiles; }
    public void setMaxLogFiles(Integer maxLogFiles) { this.maxLogFiles = maxLogFiles; }

    public Boolean getPerformBackup() { return performBackup; }
    public void setPerformBackup(Boolean performBackup) { this.performBackup = performBackup; }

    public Integer getMaxBackups() { return maxBackups; }
    public void setMaxBackups(Integer maxBackups) { this.maxBackups = maxBackups; }

    public Integer getStabilityWindow() { return stabilityWindow; }
    public void setStabilityWindow(Integer stabilityWindow) { this.stabilityWindow = stabilityWindow; }

    public String getDeploymentStrategy() { return deploymentStrategy; }
    public void setDeploymentStrategy(String deploymentStrategy) { this.deploymentStrategy = deploymentStrategy; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    @Override
    public String toString() {
        return "EnvironmentConfigEntity{id=" + id + ", env='" + envName + "', host='" + sshHost + "'}";
    }
}
