package com.ebb.wizardcd.runner.dto;

import java.util.List;

public class SshTestResult {

    private boolean success;
    private String message;
    /** Java binary paths found on the target server (empty list if none or detection failed). */
    private List<String> javaInstallations;

    public SshTestResult(boolean success, String message) {
        this(success, message, List.of());
    }

    public SshTestResult(boolean success, String message, List<String> javaInstallations) {
        this.success = success;
        this.message = message;
        this.javaInstallations = javaInstallations != null ? javaInstallations : List.of();
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public List<String> getJavaInstallations() {
        return javaInstallations;
    }

    public void setJavaInstallations(List<String> javaInstallations) {
        this.javaInstallations = javaInstallations != null ? javaInstallations : List.of();
    }
}
