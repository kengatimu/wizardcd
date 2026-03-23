package com.ebb.wizardcd.runner.dto;

/**
 * Pre-flight check results returned by POST /ssh/preflight.
 * Verifies target server readiness before deployment.
 */
public class PreflightResult {

    private boolean targetReachable;
    private boolean writable;
    private String diskAvailable;          // e.g. "12G" — available space on target path
    private String diskUsedPercent;        // e.g. "45%" — usage percentage

    // Last-successful backup (protected, never rotated — for safe rollback)
    private boolean lastSuccessfulExists;
    private String lastSuccessfulTimestamp; // ISO instant or epoch string
    private String lastSuccessfulPath;     // full path on target

    // Release backups (rotated by maxBackups setting)
    private int releaseBackupCount;        // number of release tarballs
    private String latestReleaseTimestamp; // timestamp of newest release backup
    private String releasesPath;           // path to releases/ dir

    private String message;                // human-readable summary or error detail

    public PreflightResult() {}

    /** Failed preflight — target unreachable */
    public static PreflightResult unreachable(String message) {
        PreflightResult r = new PreflightResult();
        r.targetReachable = false;
        r.writable = false;
        r.lastSuccessfulExists = false;
        r.releaseBackupCount = 0;
        r.message = message;
        return r;
    }

    /** Convenience: true if any backup exists (last-successful OR release tarballs) */
    public boolean hasAnyBackup() {
        return lastSuccessfulExists || releaseBackupCount > 0;
    }

    // ── Getters & Setters ──

    public boolean isTargetReachable() { return targetReachable; }
    public void setTargetReachable(boolean targetReachable) { this.targetReachable = targetReachable; }

    public boolean isWritable() { return writable; }
    public void setWritable(boolean writable) { this.writable = writable; }

    public String getDiskAvailable() { return diskAvailable; }
    public void setDiskAvailable(String diskAvailable) { this.diskAvailable = diskAvailable; }

    public String getDiskUsedPercent() { return diskUsedPercent; }
    public void setDiskUsedPercent(String diskUsedPercent) { this.diskUsedPercent = diskUsedPercent; }

    public boolean isLastSuccessfulExists() { return lastSuccessfulExists; }
    public void setLastSuccessfulExists(boolean lastSuccessfulExists) { this.lastSuccessfulExists = lastSuccessfulExists; }

    public String getLastSuccessfulTimestamp() { return lastSuccessfulTimestamp; }
    public void setLastSuccessfulTimestamp(String lastSuccessfulTimestamp) { this.lastSuccessfulTimestamp = lastSuccessfulTimestamp; }

    public String getLastSuccessfulPath() { return lastSuccessfulPath; }
    public void setLastSuccessfulPath(String lastSuccessfulPath) { this.lastSuccessfulPath = lastSuccessfulPath; }

    public int getReleaseBackupCount() { return releaseBackupCount; }
    public void setReleaseBackupCount(int releaseBackupCount) { this.releaseBackupCount = releaseBackupCount; }

    public String getLatestReleaseTimestamp() { return latestReleaseTimestamp; }
    public void setLatestReleaseTimestamp(String latestReleaseTimestamp) { this.latestReleaseTimestamp = latestReleaseTimestamp; }

    public String getReleasesPath() { return releasesPath; }
    public void setReleasesPath(String releasesPath) { this.releasesPath = releasesPath; }

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
