package com.ebb.wizardcd.runner.dto;

public class JobRequest {

    // Absolute path to deployment YAML provided by UI
    private String configPath;

    public String getConfigPath() {
        return configPath;
    }

    public void setConfigPath(String configPath) {
        this.configPath = configPath;
    }
}