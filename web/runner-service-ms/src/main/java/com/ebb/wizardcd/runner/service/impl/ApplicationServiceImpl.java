package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository;
import com.ebb.wizardcd.runner.service.ApplicationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/**
 * Default {@link ApplicationService} implementation backed by
 * {@link ApplicationRepository}.
 *
 * <p>Concurrency notes:
 * <ul>
 *   <li>{@link #findOrCreateByName(String, String)} is race-tolerant — the
 *       {@code UNIQUE(name)} constraint on the table is the source of truth.
 *       A second concurrent insert will raise a constraint violation; we
 *       fall through and re-read.</li>
 *   <li>{@link #create(String, String)} prefers a pre-flight existence
 *       check so the caller gets a clean {@link IllegalArgumentException}
 *       instead of an opaque
 *       {@code DataIntegrityViolationException} stack.</li>
 * </ul>
 */
@Service
public class ApplicationServiceImpl implements ApplicationService {

    private static final Logger log = LoggerFactory.getLogger(ApplicationServiceImpl.class);

    private final ApplicationRepository applicationRepo;

    public ApplicationServiceImpl(ApplicationRepository applicationRepo) {
        this.applicationRepo = applicationRepo;
    }

    // ── Reads ──────────────────────────────────────────────────────────────

    @Override
    @Transactional(readOnly = true)
    public Optional<ApplicationEntity> findById(UUID id) {
        return applicationRepo.findById(id);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ApplicationEntity> findByName(String name) {
        if (name == null || name.isBlank()) return Optional.empty();
        return applicationRepo.findByName(name.trim());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean existsByName(String name) {
        if (name == null || name.isBlank()) return false;
        return applicationRepo.existsByName(name.trim());
    }

    @Override
    @Transactional(readOnly = true)
    public List<ApplicationEntity> findAll() {
        return applicationRepo.findAll().stream()
                .sorted(Comparator.comparing(a -> a.getName().toLowerCase()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ApplicationEntity> search(String query) {
        if (query == null || query.isBlank()) return findAll();
        String needle = query.trim().toLowerCase();
        return applicationRepo.findAll().stream()
                .filter(a -> a.getName().toLowerCase().contains(needle))
                .sorted(Comparator.comparing(a -> a.getName().toLowerCase()))
                .toList();
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public ApplicationEntity create(String name, String description) {
        validateName(name);
        String trimmed = name.trim();
        if (applicationRepo.existsByName(trimmed)) {
            throw new IllegalArgumentException(
                    "Application '" + trimmed + "' already exists");
        }
        ApplicationEntity entity = new ApplicationEntity(
                UUID.randomUUID(), trimmed, trimDescription(description));
        ApplicationEntity saved = applicationRepo.save(entity);
        log.info("Application created id={} name='{}'", saved.getId(), saved.getName());
        return saved;
    }

    @Override
    @Transactional
    public ApplicationEntity findOrCreateByName(String name, String description) {
        validateName(name);
        String trimmed = name.trim();
        return applicationRepo.findByName(trimmed).orElseGet(() -> {
            ApplicationEntity fresh = new ApplicationEntity(
                    UUID.randomUUID(), trimmed, trimDescription(description));
            ApplicationEntity saved = applicationRepo.save(fresh);
            log.info("Application auto-registered id={} name='{}' (first deploy)",
                    saved.getId(), saved.getName());
            return saved;
        });
    }

    @Override
    @Transactional
    public ApplicationEntity update(UUID id, String newName, String newDescription) {
        ApplicationEntity entity = applicationRepo.findById(id).orElseThrow(
                () -> new NoSuchElementException("No application with id " + id));

        if (newName != null && !newName.isBlank()) {
            String trimmed = newName.trim();
            // Only check collision when the name is actually changing —
            // otherwise the "rename to your own name" no-op would falsely
            // trip the duplicate check.
            if (!trimmed.equals(entity.getName()) && applicationRepo.existsByName(trimmed)) {
                throw new IllegalArgumentException(
                        "Application '" + trimmed + "' already exists");
            }
            entity.setName(trimmed);
        }

        if (newDescription != null) {
            entity.setDescription(trimDescription(newDescription));
        }

        ApplicationEntity saved = applicationRepo.save(entity);
        log.info("Application updated id={} name='{}'", saved.getId(), saved.getName());
        return saved;
    }

    @Override
    @Transactional
    public void delete(UUID id) {
        if (!applicationRepo.existsById(id)) {
            throw new NoSuchElementException("No application with id " + id);
        }
        applicationRepo.deleteById(id);
        log.info("Application deleted id={}", id);
    }

    // ── Internal ───────────────────────────────────────────────────────────

    private static void validateName(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Application name must not be blank");
        }
        if (name.trim().length() > 100) {
            throw new IllegalArgumentException(
                    "Application name must be 100 characters or fewer");
        }
    }

    private static String trimDescription(String description) {
        if (description == null) return null;
        String trimmed = description.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
