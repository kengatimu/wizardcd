package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.dto.DeploymentRequest;
import com.ebb.wizardcd.runner.dto.JobMetadata;
import com.ebb.wizardcd.runner.service.RunnerWorkspaceService;
import com.ebb.wizardcd.runner.service.YamlGenerationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Service
public class RunnerWorkspaceServiceImpl implements RunnerWorkspaceService {

    private static final Logger log = LoggerFactory.getLogger(RunnerWorkspaceServiceImpl.class);

    // Root directory where all job workspaces live
    private final String workspaceRoot;

    // JSON serializer for metadata.json
    private final ObjectMapper objectMapper;

    // YAML serializer for deployment-config.yml
    private final YamlGenerationService yamlGenerationService;

    public RunnerWorkspaceServiceImpl(@Value("${runner.workspaceRoot}") String workspaceRoot,
                                      ObjectMapper objectMapper,
                                      YamlGenerationService yamlGenerationService) {
        this.workspaceRoot = workspaceRoot;
        this.objectMapper = objectMapper;
        this.yamlGenerationService = yamlGenerationService;
    }

    @Override
    public Path prepareWorkspace(String jobId, DeploymentRequest request,
                                 MultipartFile jarArtifact, MultipartFile libZip,
                                 List<MultipartFile> certZips, List<MultipartFile> extraZips,
                                 JobMetadata metadata) {
        try {

            // --------------------------------------------------
            // Defensive JobId Validation (Path Traversal Guard)
            // --------------------------------------------------
            if (jobId == null || jobId.isBlank()
                    || jobId.contains("..")
                    || jobId.contains("/")
                    || jobId.contains("\\")) {
                throw new IllegalArgumentException("Invalid jobId format");
            }

            // Resolve job workspace root
            Path jobRoot = Path.of(workspaceRoot, jobId);

            // Prevent accidental workspace reuse.
            // We check for the 'input/' subdirectory, NOT the job root directory.
            // The job root is created as a side-effect of writeAtomically() persisting
            // the initial CREATED/VALIDATING lifecycle states via Files.createDirectories().
            // A true collision only exists when a previous prepareWorkspace() run completed
            // and the 'input/' subdirectory was fully initialised.
            if (Files.exists(jobRoot.resolve("input"))) {
                throw new IllegalStateException("Workspace already exists for jobId=" + jobId);
            }

            // Define standard workspace layout
            Path inputDir    = jobRoot.resolve("input");
            Path buildDir    = jobRoot.resolve("build");
            Path logsDir     = jobRoot.resolve("logs");
            Path wrappersDir = jobRoot.resolve("wrappers");

            // --------------------------------------------------
            // Create isolated directory structure
            // --------------------------------------------------
            log.info("Creating isolated workspace for job {}", jobId);

            Files.createDirectories(inputDir);
            Files.createDirectories(buildDir);
            Files.createDirectories(logsDir);
            Files.createDirectories(wrappersDir);

            log.info("Workspace initialized at {}", jobRoot);

            // --------------------------------------------------
            // 1. Copy JAR artifact → INPUT_DIR/<effectiveJarName>
            // --------------------------------------------------
            String jarOriginalName = jarArtifact.getOriginalFilename();
            if (jarOriginalName == null || jarOriginalName.isBlank()) {
                throw new IllegalArgumentException("JAR artifact filename must not be empty");
            }
            String effectiveJarName = (request.getJarName() != null && !request.getJarName().isBlank())
                    ? request.getJarName()
                    : jarOriginalName;
            Path jarTarget = inputDir.resolve(effectiveJarName);
            Files.copy(jarArtifact.getInputStream(), jarTarget);
            log.info("JAR artifact stored at {}", jarTarget);

            // --------------------------------------------------
            // 2. Extract lib ZIP → INPUT_DIR/lib/  (thin JAR mode)
            // --------------------------------------------------
            if (libZip != null && !libZip.isEmpty()) {
                Path libDir = inputDir.resolve("lib");
                Files.createDirectories(libDir);
                extractZipToDir(libZip, libDir);
                log.info("lib/ dependencies extracted to {}", libDir);
            }

            // --------------------------------------------------
            // 3. Extract cert ZIPs → INPUT_DIR/<certPaths[i].source>/
            // --------------------------------------------------
            List<DeploymentRequest.CertPath> certPaths = request.getCertPaths();
            if (certZips != null && certPaths != null) {
                int count = Math.min(certZips.size(), certPaths.size());
                for (int i = 0; i < count; i++) {
                    MultipartFile certZip = certZips.get(i);
                    if (certZip == null || certZip.isEmpty()) continue;
                    String sourceName = certPaths.get(i).getSource();
                    if (sourceName == null || sourceName.isBlank()) continue;
                    Path certDir = inputDir.resolve(sourceName);
                    Files.createDirectories(certDir);
                    extractZipToDir(certZip, certDir);
                    log.info("Cert path extracted: {} → {}", sourceName, certDir);
                }
            }

            // --------------------------------------------------
            // 4. Extract extra ZIPs → INPUT_DIR/<extraDirs[i].dirName>/
            // --------------------------------------------------
            List<DeploymentRequest.ExtraDir> extraDirList = request.getExtraDirs();
            if (extraZips != null && extraDirList != null) {
                int count = Math.min(extraZips.size(), extraDirList.size());
                for (int i = 0; i < count; i++) {
                    MultipartFile extraZip = extraZips.get(i);
                    if (extraZip == null || extraZip.isEmpty()) continue;
                    String dirName = extraDirList.get(i).getDirName();
                    if (dirName == null || dirName.isBlank()) continue;
                    Path extraDir = inputDir.resolve(dirName);
                    Files.createDirectories(extraDir);
                    extractZipToDir(extraZip, extraDir);
                    log.info("Extra directory extracted: {} → {}", dirName, extraDir);
                }
            }

            // --------------------------------------------------
            // Generate structured deployment-config.yml
            // --------------------------------------------------
            Path yamlPath = yamlGenerationService.generateYaml(jobId, request, effectiveJarName, inputDir);
            log.info("Deployment config generated at {}", yamlPath);

            // --------------------------------------------------
            // Write immutable metadata.json (identity snapshot)
            // --------------------------------------------------
            Path metadataFile = jobRoot.resolve("metadata.json");
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(metadataFile.toFile(), metadata);
            log.info("Metadata snapshot written for job {}", jobId);

            // Return absolute config path for controlled execution
            return yamlPath;

        } catch (Exception e) {
            log.error("Workspace preparation failed for job {}", jobId, e);
            throw new IllegalStateException("Workspace preparation failed for jobId=" + jobId, e);
        }
    }

    // ------------------------------------------------------------------
    // ZIP extraction helper (MultipartFile → target directory)
    //
    // Two-pass extraction:
    //   Pass 1 — scan entry names to detect a common top-level directory
    //            prefix (e.g. all entries start with "certs/").  This handles
    //            the common user mistake of zipping the folder itself rather
    //            than its contents (`zip -r certs.zip certs/` instead of
    //            `cd certs && zip ../certs.zip *`).
    //   Pass 2 — extract, stripping the detected prefix so files land
    //            directly in targetDir rather than targetDir/<name>/.
    //
    // Both passes also skip macOS metadata entries (__MACOSX/ and ._* files).
    // ZIP-slip protection is applied on the resolved entry path.
    // ------------------------------------------------------------------
    private void extractZipToDir(MultipartFile zip, Path targetDir) throws IOException {
        log.info("Extracting ZIP: {} → {}", zip.getOriginalFilename(), targetDir);

        // ── Pass 1: detect common top-level prefix ──────────────────────
        String stripPrefix = detectCommonPrefix(zip);
        if (stripPrefix != null) {
            log.info("ZIP has common top-level dir '{}' — stripping it during extraction", stripPrefix);
        }

        // ── Pass 2: extract ─────────────────────────────────────────────
        int fileCount = 0;
        int dirCount  = 0;

        try (ZipInputStream zis = new ZipInputStream(zip.getInputStream())) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName();

                // Skip macOS resource-fork metadata added by Mac zip utilities
                if (isMacOSJunk(name)) {
                    zis.closeEntry();
                    continue;
                }

                // Strip the common top-level directory prefix when detected
                if (stripPrefix != null && name.startsWith(stripPrefix)) {
                    name = name.substring(stripPrefix.length());
                    if (name.isEmpty()) {           // the root dir entry itself
                        zis.closeEntry();
                        continue;
                    }
                }

                Path entryPath = targetDir.resolve(name).normalize();

                // ZIP-slip prevention — reject paths that escape targetDir
                if (!entryPath.startsWith(targetDir)) {
                    log.error("ZIP slip attack detected — rejected entry '{}' in {}", entry.getName(), zip.getOriginalFilename());
                    throw new IOException("ZIP slip attack detected — rejected entry: " + entry.getName());
                }

                if (entry.isDirectory()) {
                    Files.createDirectories(entryPath);
                    dirCount++;
                    log.debug("ZIP extract — dir:  {}", name);
                } else {
                    Files.createDirectories(entryPath.getParent());
                    Files.copy(zis, entryPath, StandardCopyOption.REPLACE_EXISTING);
                    fileCount++;
                    log.debug("ZIP extract — file: {}", name);
                }
                zis.closeEntry();
            }
        } catch (IOException e) {
            log.error("Failed to extract ZIP {}: {}", zip.getOriginalFilename(), e.getMessage(), e);
            throw e;
        }

        log.info("ZIP extraction complete — {} file(s), {} dir(s) extracted to {}", fileCount, dirCount, targetDir);
    }

    // ------------------------------------------------------------------
    // Scan the ZIP (without extracting) to detect whether ALL non-junk
    // entries share a single common top-level directory.  If they do,
    // return that prefix (e.g. "certs/") so it can be stripped during
    // extraction.  Returns null when no stripping is needed.
    // ------------------------------------------------------------------
    private String detectCommonPrefix(MultipartFile zip) throws IOException {
        String commonPrefix = null;
        try (ZipInputStream zis = new ZipInputStream(zip.getInputStream())) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName();
                zis.closeEntry();

                if (isMacOSJunk(name)) continue;

                int slash = name.indexOf('/');
                if (slash <= 0) {
                    // A top-level file — no common directory prefix possible
                    return null;
                }
                String prefix = name.substring(0, slash + 1); // e.g. "certs/"
                if (commonPrefix == null) {
                    commonPrefix = prefix;
                } else if (!commonPrefix.equals(prefix)) {
                    // Multiple different top-level directories — nothing to strip
                    return null;
                }
            }
        }
        return commonPrefix;
    }

    /** Returns true for macOS ZIP metadata entries that should always be skipped. */
    private static boolean isMacOSJunk(String entryName) {
        return entryName.startsWith("__MACOSX/")
            || entryName.contains("/__MACOSX/")
            || entryName.startsWith("._")
            || entryName.contains("/._");
    }
}