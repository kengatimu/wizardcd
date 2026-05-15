package com.ebb.wizardcd.runner.dto;

import java.util.List;

/**
 * Response DTO for {@code POST /ssh/check-path}.
 *
 * <p>The UI's Step 2 panel switches its colour + content based on {@link #status}.
 * {@link #fixCommands} is non-empty for the two states that require manual
 * server-side action ({@code WRONG_OWNER}, {@code PARENT_NOT_WRITABLE}) and
 * is rendered as a copy-script block matching the SSH Keys panel pattern in
 * Step 1.
 */
public class PathCheckResult {

    /** Outcome of the path check. UI maps these to panel colour + messaging. */
    public enum Status {
        /** Path exists and is owned by the run-as user. Green ✓. Next button enabled. */
        OK,
        /** Path exists but is owned by a different user. Amber ⚠. Next disabled until re-check. */
        WRONG_OWNER,
        /** Path doesn't exist but parent is writable by run-as → runner will create. Blue ℹ. Next enabled. */
        MISSING,
        /** Path doesn't exist AND parent not writable by run-as → user must sudo mkdir. Amber ⚠. Next disabled. */
        PARENT_NOT_WRITABLE,
        /** Path failed client-side whitelist (system dir, illegal chars, root). Red ✗. Next disabled. */
        INVALID_PATH,
        /** SSH to the target failed — Step 1 connection is broken. Red ✗. Next disabled. */
        UNREACHABLE
    }

    private Status status;
    private String path;
    private Boolean exists;
    private String actualOwner;       // null if exists==false
    private String expectedOwner;
    private String parentPath;
    private Boolean parentExists;
    private Boolean parentWritableByRunAs;
    /** Shell commands the user should copy-paste to fix the issue. Empty for OK/MISSING. */
    private List<String> fixCommands;
    /** One-line human-readable summary the UI shows in the panel header. */
    private String humanReason;
    /** Last line of SSH stderr (sanitised) — populated only when status == UNREACHABLE. */
    private String sshErrorTail;

    public PathCheckResult() {
        this.fixCommands = List.of();
    }

    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }

    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }

    public Boolean getExists() { return exists; }
    public void setExists(Boolean exists) { this.exists = exists; }

    public String getActualOwner() { return actualOwner; }
    public void setActualOwner(String actualOwner) { this.actualOwner = actualOwner; }

    public String getExpectedOwner() { return expectedOwner; }
    public void setExpectedOwner(String expectedOwner) { this.expectedOwner = expectedOwner; }

    public String getParentPath() { return parentPath; }
    public void setParentPath(String parentPath) { this.parentPath = parentPath; }

    public Boolean getParentExists() { return parentExists; }
    public void setParentExists(Boolean parentExists) { this.parentExists = parentExists; }

    public Boolean getParentWritableByRunAs() { return parentWritableByRunAs; }
    public void setParentWritableByRunAs(Boolean parentWritableByRunAs) { this.parentWritableByRunAs = parentWritableByRunAs; }

    public List<String> getFixCommands() { return fixCommands; }
    public void setFixCommands(List<String> fixCommands) { this.fixCommands = fixCommands != null ? fixCommands : List.of(); }

    public String getHumanReason() { return humanReason; }
    public void setHumanReason(String humanReason) { this.humanReason = humanReason; }

    public String getSshErrorTail() { return sshErrorTail; }
    public void setSshErrorTail(String sshErrorTail) { this.sshErrorTail = sshErrorTail; }
}
