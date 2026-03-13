package com.ebb.wizardcd.runner.service.impl;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

/**
 * Resolves the runner's public IP address at startup.
 *
 * <p>Resolution order:
 * <ol>
 *   <li>If {@code runner.public-ip} is set in config, that value is used as-is.
 *       This allows a manual override for edge cases (runner behind NAT,
 *       split-horizon DNS, offline testing, etc.).</li>
 *   <li>Otherwise the IP is auto-detected by calling
 *       {@code https://checkip.amazonaws.com}, which returns the caller's
 *       public IP as plain text.  This works from any cloud provider or
 *       on-premise server — it is not specific to AWS.</li>
 *   <li>If detection fails (no internet, firewall, etc.) an empty string is
 *       returned and a WARN is logged.  The UI handles this gracefully.</li>
 * </ol>
 *
 * <p>The resolved IP is cached for the lifetime of the process.  If the
 * runner's IP changes (e.g. new EC2 instance), restart the service.
 */
@Service
public class RunnerPublicIpResolver {

    private static final Logger log = LoggerFactory.getLogger(RunnerPublicIpResolver.class);

    private static final String CHECKIP_URL = "https://checkip.amazonaws.com";

    @Value("${runner.public-ip:}")
    private String configuredIp;

    private String resolvedIp = "";

    @PostConstruct
    public void resolve() {
        if (configuredIp != null && !configuredIp.isBlank()) {
            resolvedIp = configuredIp.trim();
            log.info("Runner public IP: {} (from config)", resolvedIp);
            return;
        }

        try {
            RestClient client = RestClient.create();
            String raw = client.get()
                    .uri(CHECKIP_URL)
                    .retrieve()
                    .body(String.class);
            if (raw != null) {
                resolvedIp = raw.trim();
                log.info("Runner public IP: {} (auto-detected via {})", resolvedIp, CHECKIP_URL);
            } else {
                log.warn("Could not auto-detect runner public IP: response was empty");
            }
        } catch (Exception e) {
            log.warn("Could not auto-detect runner public IP: {}", e.getMessage());
        }
    }

    /**
     * Returns the resolved public IP, or an empty string if resolution failed.
     */
    public String getPublicIp() {
        return resolvedIp;
    }
}
