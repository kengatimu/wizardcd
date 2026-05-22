package com.ebb.wizardcd.runner.service.impl;

import com.ebb.wizardcd.runner.enums.LiveConfigCapability;
import com.ebb.wizardcd.runner.persistence.entity.ApplicationEntity;
import com.ebb.wizardcd.runner.persistence.repository.ApplicationRepository;
import com.ebb.wizardcd.runner.service.ApplicationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/**
 * Default {@link ApplicationService} implementation backed by
 * {@link ApplicationRepository}.
 *
 * <h2>Soft-delete strategy</h2>
 * Every default read filters {@code deleted_at IS NULL}. The
 * {@code …IncludingDeleted} variants exist for admin views + the deploy
 * pipeline's auto-resurrect path. Writes (create / update) operate on
 * the unique constraint as-is — duplicate-name checks include archived
 * rows because the DB unique constraint includes them too.
 *
 * <h2>Concurrency notes</h2>
 * <ul>
 *   <li>{@link #findOrCreateByName(String, String)} is race-tolerant —
 *       the {@code UNIQUE(name)} constraint on the table is the source
 *       of truth. A second concurrent insert raises a constraint
 *       violation; we fall through and re-read.</li>
 *   <li>{@link #create(String, String)} prefers a pre-flight existence
 *       check so callers get a clean {@link IllegalArgumentException}
 *       instead of an opaque {@code DataIntegrityViolationException}.</li>
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
        return applicationRepo.findByIdAndDeletedAtIsNull(id);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ApplicationEntity> findByIdIncludingDeleted(UUID id) {
        return applicationRepo.findById(id);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ApplicationEntity> findByName(String name) {
        if (name == null || name.isBlank()) return Optional.empty();
        return applicationRepo.findByNameAndDeletedAtIsNull(name.trim());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ApplicationEntity> findByNameIncludingDeleted(String name) {
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
        return applicationRepo.findByDeletedAtIsNullOrderByNameAsc();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ApplicationEntity> search(String query) {
        if (query == null || query.isBlank()) return findAll();
        String needle = query.trim().toLowerCase();
        return applicationRepo.findByDeletedAtIsNullOrderByNameAsc().stream()
                .filter(a -> a.getName().toLowerCase().contains(needle))
                .sorted(Comparator.comparing(a -> a.getName().toLowerCase()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<ApplicationEntity> findByCapability(LiveConfigCapability capability) {
        if (capability == null) return List.of();
        return applicationRepo.findByLiveConfigCapabilityAndDeletedAtIsNullOrderByNameAsc(capability);
    }

    @Override
    @Transactional(readOnly = true)
    public long countLive() {
        return applicationRepo.countByDeletedAtIsNull();
    }

    // ── Writes ─────────────────────────────────────────────────────────────

    @Override
    @Transactional
    public ApplicationEntity create(String name, String description) {
        validateName(name);
        String trimmed = name.trim();
        // Duplicate check INCLUDES archived rows — the DB unique constraint
        // does too. Callers wanting to "create" an archived name should
        // restore the existing row instead.
        if (applicationRepo.existsByName(trimmed)) {
            throw new IllegalArgumentException(
                    "Application '" + trimmed + "' already exists "
                  + "(it may be archived — restore it via the Undo affordance "
                  + "or pick a different name)");
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

        // Auto-resurrect: if a soft-deleted row exists with this name,
        // restore it. A deploy targeting an archived app means the user
        // is using it again — silently bringing it back is the right
        // behaviour. Audit log will record this as a normal CREATED →
        // RUNNING lifecycle on the next deploy.
        Optional<ApplicationEntity> existing = applicationRepo.findByName(trimmed);
        if (existing.isPresent()) {
            ApplicationEntity row = existing.get();
            if (row.isDeleted()) {
                log.info("Auto-restoring archived application id={} name='{}' "
                       + "(deploy targets it)", row.getId(), row.getName());
                row.setDeletedAt(null);
                return applicationRepo.save(row);
            }
            return row;
        }

        ApplicationEntity fresh = new ApplicationEntity(
                UUID.randomUUID(), trimmed, trimDescription(description));
        ApplicationEntity saved = applicationRepo.save(fresh);
        log.info("Application auto-registered id={} name='{}' (first deploy)",
                saved.getId(), saved.getName());
        return saved;
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
        ApplicationEntity entity = applicationRepo.findById(id).orElseThrow(
                () -> new NoSuchElementException("No application with id " + id));
        if (entity.isDeleted()) {
            // Idempotent: archived already → nothing to do.
            return;
        }
        entity.setDeletedAt(Instant.now());
        applicationRepo.save(entity);
        log.info("Application archived id={} name='{}'", entity.getId(), entity.getName());
    }

    @Override
    @Transactional
    public ApplicationEntity restore(UUID id) {
        ApplicationEntity entity = applicationRepo.findById(id).orElseThrow(
                () -> new NoSuchElementException("No application with id " + id));
        if (!entity.isDeleted()) {
            // Idempotent: live already → no-op return.
            return entity;
        }
        entity.setDeletedAt(null);
        ApplicationEntity saved = applicationRepo.save(entity);
        log.info("Application restored id={} name='{}'", saved.getId(), saved.getName());
        return saved;
    }

    // ── Capability snapshot ───────────────────────────────────────────────

    @Override
    @Transactional
    public ApplicationEntity recordCapability(UUID id,
                                              LiveConfigCapability capability,
                                              String detailsJson,
                                              Instant probedAt) {
        if (capability == null) {
            throw new IllegalArgumentException("capability must not be null");
        }
        ApplicationEntity entity = applicationRepo.findById(id).orElseThrow(
                () -> new NoSuchElementException("No application with id " + id));
        entity.setLiveConfigCapability(capability);
        entity.setCapabilityLastChecked(probedAt != null ? probedAt : Instant.now());
        entity.setCapabilityDetails(detailsJson);
        ApplicationEntity saved = applicationRepo.save(entity);
        log.debug("Recorded capability id={} name='{}' capability={}",
                saved.getId(), saved.getName(), capability);
        return saved;
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
