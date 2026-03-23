package com.ebb.wizardcd.runner.dto;

import java.util.List;

public class DeploymentRequest {

    // ── Nested DTO — certificate / keystore path mapping ─────────────
    /**
     * Maps a source directory (relative to the job input dir, e.g. "certs")
     * to an absolute path on the target server (e.g. "/opt/certs").
     * deploy.sh scps the source directory to the specified server path,
     * independently of the main application tarball.
     */
    public static class CertPath {
        private String source;      // directory name within INPUT_DIR
        private String targetPath;  // absolute path on the target server

        public String getSource() { return source; }
        public void setSource(String source) { this.source = source; }

        public String getTargetPath() { return targetPath; }
        public void setTargetPath(String targetPath) { this.targetPath = targetPath; }
    }

    // ── Nested DTO — extra directory mapping ─────────────────────────
    /**
     * Maps a directory name (relative to INPUT_DIR) to an absolute path
     * on the target server.  deploy.sh scps the directory independently
     * of the main application tarball, identical in mechanism to CertPath
     * but intended for general-purpose deploy-time directories (e.g. "deploy",
     * "scripts", "config") that must land at a specific server location.
     */
    public static class ExtraDir {
        private String dirName;    // directory name within INPUT_DIR
        private String targetPath; // absolute path on the target server

        public String getDirName() { return dirName; }
        public void setDirName(String dirName) { this.dirName = dirName; }

        public String getTargetPath() { return targetPath; }
        public void setTargetPath(String targetPath) { this.targetPath = targetPath; }
    }

    // Application identity
    private String appName;
    private String environment;
    private String mainClass;
    private String jarName;

    // Java runtime
    private String javaCommand;
    private Integer javaVersion;

    // JVM configuration
    private String xms;
    private String xmx;
    private String newRatio;
    private List<String> extraOpts;

    // Runtime configuration
    private String runAsUser;
    private Integer serverPort;

    // Logging
    private String maxLogSize;
    private Integer maxLogFiles;

    // Build configuration
    private String libPath;
    /**
     * Extra directories to transfer to custom absolute paths on the target server,
     * independently of the main application tarball (same mechanism as certPaths).
     * Each entry maps a directory name (relative to INPUT_DIR) to its target path.
     */
    private List<ExtraDir> extraDirs;
    /**
     * Certificate / keystore directories to transfer to custom absolute paths
     * on the target server, independently of the main application tarball.
     */
    private List<CertPath> certPaths;

    // SSH target
    private String sshUser;
    private String sshHost;
    private Integer sshPort;
    private String targetBasePath;

    // Backup
    private Boolean performBackup;
    private Integer maxBackups;

    // Deployment options
    private Integer stabilityWindow;

    // getters & setters

    public String getAppName() {
        return appName;
    }

    public void setAppName(String appName) {
        this.appName = appName;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }

    public String getMainClass() {
        return mainClass;
    }

    public void setMainClass(String mainClass) {
        this.mainClass = mainClass;
    }

    public String getJarName() {
        return jarName;
    }

    public void setJarName(String jarName) {
        this.jarName = jarName;
    }

    public String getJavaCommand() {
        return javaCommand;
    }

    public void setJavaCommand(String javaCommand) {
        this.javaCommand = javaCommand;
    }

    public Integer getJavaVersion() {
        return javaVersion;
    }

    public void setJavaVersion(Integer javaVersion) {
        this.javaVersion = javaVersion;
    }

    public String getXms() {
        return xms;
    }

    public void setXms(String xms) {
        this.xms = xms;
    }

    public String getXmx() {
        return xmx;
    }

    public void setXmx(String xmx) {
        this.xmx = xmx;
    }

    public String getNewRatio() {
        return newRatio;
    }

    public void setNewRatio(String newRatio) {
        this.newRatio = newRatio;
    }

    public List<String> getExtraOpts() {
        return extraOpts;
    }

    public void setExtraOpts(List<String> extraOpts) {
        this.extraOpts = extraOpts;
    }

    public String getRunAsUser() {
        return runAsUser;
    }

    public void setRunAsUser(String runAsUser) {
        this.runAsUser = runAsUser;
    }

    public Integer getServerPort() {
        return serverPort;
    }

    public void setServerPort(Integer serverPort) {
        this.serverPort = serverPort;
    }

    public String getMaxLogSize() {
        return maxLogSize;
    }

    public void setMaxLogSize(String maxLogSize) {
        this.maxLogSize = maxLogSize;
    }

    public Integer getMaxLogFiles() {
        return maxLogFiles;
    }

    public void setMaxLogFiles(Integer maxLogFiles) {
        this.maxLogFiles = maxLogFiles;
    }

    public String getLibPath() {
        return libPath;
    }

    public void setLibPath(String libPath) {
        this.libPath = libPath;
    }

    public List<ExtraDir> getExtraDirs() {
        return extraDirs;
    }

    public void setExtraDirs(List<ExtraDir> extraDirs) {
        this.extraDirs = extraDirs;
    }

    public String getSshUser() {
        return sshUser;
    }

    public void setSshUser(String sshUser) {
        this.sshUser = sshUser;
    }

    public String getSshHost() {
        return sshHost;
    }

    public void setSshHost(String sshHost) {
        this.sshHost = sshHost;
    }

    public Integer getSshPort() {
        return sshPort;
    }

    public void setSshPort(Integer sshPort) {
        this.sshPort = sshPort;
    }

    public String getTargetBasePath() {
        return targetBasePath;
    }

    public void setTargetBasePath(String targetBasePath) {
        this.targetBasePath = targetBasePath;
    }

    public Boolean getPerformBackup() {
        return performBackup;
    }

    public void setPerformBackup(Boolean performBackup) {
        this.performBackup = performBackup;
    }

    public Integer getMaxBackups() {
        return maxBackups;
    }

    public void setMaxBackups(Integer maxBackups) {
        this.maxBackups = maxBackups;
    }

    public Integer getStabilityWindow() {
        return stabilityWindow;
    }

    public void setStabilityWindow(Integer stabilityWindow) {
        this.stabilityWindow = stabilityWindow;
    }

    public List<CertPath> getCertPaths() {
        return certPaths;
    }

    public void setCertPaths(List<CertPath> certPaths) {
        this.certPaths = certPaths;
    }
}