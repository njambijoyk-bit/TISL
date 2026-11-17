-- =====================================================================
-- 261_projects_work.sql
-- Projects stage 5 (docs/PROJECTS_STAGE5_SPEC.md): work and time.
--   project_work_tasks                  tasks on a piece of work: phase, scope line, parent, status, dates, estimate, billable
--   project_task_people            who is on a task
--   project_task_waits             "starts when that task is done"
--   project_task_checks            a task's checklist
--   project_scope_lines            what is agreed: code, description, unit, quantity, progress, the Books sales order line that prices it
--   project_key_dates              hearings, deadlines, inspections: when, who, warnings, done, missed or moved
--   project_changes                change control: what and why, state, who decided, the Books sales order for its value
--   project_change_effects         what a change does: a scope line added or altered, a date moved
--   project_time                   time entries: person, work, task, day, minutes, billable, approval, write-off, the invoice it went on
--   project_timers                 the running timer, one per person
--   project_rates                  the rate card: who, where, the Books service package their time is billed at
--   project_disbursements          Books cost lines marked to bill back to the client, and the invoice they went on
-- No table here holds an amount of money: minutes, quantities and shares only. Prices are Books service packages.
-- Safe to re-run: every table is CREATE IF NOT EXISTS and every row INSERT IGNORE.
-- No permission seed is needed: the permissions came with script 257.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (the foundation is there), then what exists now (nothing on a first run).
SELECT COUNT(*) AS foundation_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_work_tasks', 'project_task_people', 'project_task_waits', 'project_task_checks', 'project_scope_lines', 'project_key_dates', 'project_changes', 'project_change_effects', 'project_time', 'project_timers', 'project_rates', 'project_disbursements');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_work_guard;
DELIMITER $$
CREATE PROCEDURE projects_work_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Projects foundation is not here. Run script 257 first. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL projects_work_guard();
DROP PROCEDURE IF EXISTS projects_work_guard;

CREATE TABLE IF NOT EXISTS project_work_tasks (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id       BIGINT UNSIGNED NOT NULL,
    number           INT NOT NULL,                                       -- per piece of work: M-0413-T12
    phase_id         BIGINT UNSIGNED NULL,
    scope_line_id    BIGINT UNSIGNED NULL,
    parent_id        BIGINT UNSIGNED NULL,                               -- a subtask, to any depth
    title            VARCHAR(200) NOT NULL,
    description      TEXT NULL,
    status           VARCHAR(10) NOT NULL DEFAULT 'todo',                -- todo | doing | waiting | done | cancelled
    priority         VARCHAR(8) NOT NULL DEFAULT 'medium',               -- low | medium | high | urgent
    start_date       DATE NULL,
    due_date         DATE NULL,
    estimate_minutes INT NULL,
    billable         TINYINT(1) NULL,                                    -- empty = as the work's setting
    sort_order       INT NOT NULL DEFAULT 0,
    completed_at     TIMESTAMP NULL,
    completed_by     BIGINT UNSIGNED NULL,
    created_by       BIGINT UNSIGNED NULL,
    deleted_at       TIMESTAMP NULL,
    deleted_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_project_work_tasks_number (project_id, number),
    KEY idx_project_work_tasks_parent (parent_id),
    KEY idx_project_work_tasks_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_task_people (
    task_id  BIGINT UNSIGNED NOT NULL,
    user_id  BIGINT UNSIGNED NOT NULL,
    added_by BIGINT UNSIGNED NULL,
    added_at TIMESTAMP NULL,
    PRIMARY KEY (task_id, user_id),
    KEY idx_project_task_people_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_task_waits (
    task_id      BIGINT UNSIGNED NOT NULL,                               -- this task starts when
    waits_for_id BIGINT UNSIGNED NOT NULL,                               -- this one is done
    PRIMARY KEY (task_id, waits_for_id),
    KEY idx_project_task_waits_for (waits_for_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_task_checks (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    task_id    BIGINT UNSIGNED NOT NULL,
    text       VARCHAR(200) NOT NULL,
    done       TINYINT(1) NOT NULL DEFAULT 0,
    done_by    BIGINT UNSIGNED NULL,
    done_at    TIMESTAMP NULL,
    sort_order INT NOT NULL DEFAULT 0,
    KEY idx_project_task_checks_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_scope_lines (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id      BIGINT UNSIGNED NOT NULL,
    phase_id        BIGINT UNSIGNED NULL,
    code            VARCHAR(30) NULL,
    description     VARCHAR(300) NOT NULL,
    unit            VARCHAR(20) NULL,                                    -- m3, hours, items; empty = progress is a percentage
    quantity        DECIMAL(16,4) NULL,
    done_quantity   DECIMAL(16,4) NOT NULL DEFAULT 0,
    done_percent    DECIMAL(6,2) NULL,                                   -- for a line with no unit
    voucher_item_id BIGINT UNSIGNED NULL,                                -- the Books sales order line that prices it (Projects keeps only the link)
    change_id       BIGINT UNSIGNED NULL,                                -- the change that added it
    sort_order      INT NOT NULL DEFAULT 0,
    created_by      BIGINT UNSIGNED NULL,
    deleted_at      TIMESTAMP NULL,
    deleted_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_project_scope_lines_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_key_dates (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id     BIGINT UNSIGNED NOT NULL,
    phase_id       BIGINT UNSIGNED NULL,
    task_id        BIGINT UNSIGNED NULL,
    kind           VARCHAR(40) NULL,                                     -- from the key date kinds list (stage 3 lists)
    title          VARCHAR(200) NOT NULL,
    starts_at      DATETIME NOT NULL,
    all_day        TINYINT(1) NOT NULL DEFAULT 1,
    responsible_id BIGINT UNSIGNED NULL,
    warn_days      VARCHAR(40) NULL,                                     -- "14,7,1": notices so many days before
    warned         VARCHAR(60) NULL,                                     -- which of those notices have gone
    state          VARCHAR(8) NOT NULL DEFAULT 'open',                   -- open | done | missed
    done_at        TIMESTAMP NULL,
    done_by        BIGINT UNSIGNED NULL,
    moved_from     DATETIME NULL,
    move_reason    VARCHAR(200) NULL,
    moved_by       BIGINT UNSIGNED NULL,
    created_by     BIGINT UNSIGNED NULL,
    deleted_at     TIMESTAMP NULL,
    deleted_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_project_key_dates_project (project_id),
    KEY idx_project_key_dates_when (starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_changes (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id    BIGINT UNSIGNED NOT NULL,
    number        INT NOT NULL,                                          -- per piece of work: C-03
    title         VARCHAR(200) NOT NULL,
    reason        TEXT NULL,
    state         VARCHAR(10) NOT NULL DEFAULT 'draft',                  -- draft | submitted | approved | rejected | withdrawn
    changes_price TINYINT(1) NOT NULL DEFAULT 0,
    raised_by     BIGINT UNSIGNED NULL,
    submitted_at  TIMESTAMP NULL,
    decided_by    BIGINT UNSIGNED NULL,
    decided_at    TIMESTAMP NULL,
    decision_note VARCHAR(300) NULL,
    voucher_id    BIGINT UNSIGNED NULL,                                  -- the Books sales order for its value
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_project_changes_number (project_id, number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_change_effects (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    change_id  BIGINT UNSIGNED NOT NULL,
    kind       VARCHAR(20) NOT NULL,                                     -- scope_add | scope_alter | date_move | task_move
    target_id  BIGINT UNSIGNED NULL,
    data       TEXT NULL,                                                -- what it becomes, as JSON
    applied_at TIMESTAMP NULL,
    KEY idx_project_change_effects_change (change_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_time (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,
    project_id          BIGINT UNSIGNED NOT NULL,
    phase_id            BIGINT UNSIGNED NULL,
    task_id             BIGINT UNSIGNED NULL,
    work_date           DATE NOT NULL,
    minutes             INT NOT NULL,
    billable            TINYINT(1) NOT NULL DEFAULT 1,
    note                VARCHAR(300) NULL,
    state               VARCHAR(10) NOT NULL DEFAULT 'draft',            -- draft | submitted | approved | returned
    source              VARCHAR(8) NOT NULL DEFAULT 'manual',            -- manual | timer
    submitted_at        TIMESTAMP NULL,
    decided_by          BIGINT UNSIGNED NULL,
    decided_at          TIMESTAMP NULL,
    return_note         VARCHAR(300) NULL,
    rate_package_id     BIGINT UNSIGNED NULL,                            -- the Books service package it was billed at
    written_off_minutes INT NOT NULL DEFAULT 0,
    write_off_reason    VARCHAR(300) NULL,
    billed_voucher_id   BIGINT UNSIGNED NULL,                            -- the Books invoice it went on
    entered_by          BIGINT UNSIGNED NULL,                            -- someone else, with projects.time.others
    deleted_at          TIMESTAMP NULL,
    created_at          TIMESTAMP NULL,
    updated_at          TIMESTAMP NULL,
    KEY idx_project_time_person (user_id, work_date),
    KEY idx_project_time_project (project_id, state),
    KEY idx_project_time_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_timers (
    user_id    BIGINT UNSIGNED NOT NULL PRIMARY KEY,                     -- one running timer per person
    project_id BIGINT UNSIGNED NOT NULL,
    task_id    BIGINT UNSIGNED NULL,
    started_at DATETIME NOT NULL,
    note       VARCHAR(300) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_rates (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id         BIGINT UNSIGNED NULL,                             -- empty = the company's card
    user_id            BIGINT UNSIGNED NULL,                             -- a person, or
    project_role_id    BIGINT UNSIGNED NULL,                             -- a project role, or neither = everyone
    service_variant_id BIGINT UNSIGNED NOT NULL,                         -- the Books service package (its price is Books')
    valid_from         DATE NULL,
    valid_to           DATE NULL,
    created_by         BIGINT UNSIGNED NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    KEY idx_project_rates_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_disbursements (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id        BIGINT UNSIGNED NOT NULL,
    voucher_entry_id  BIGINT UNSIGNED NOT NULL,                          -- the Books cost line (its amount is Books')
    voucher_id        BIGINT UNSIGNED NOT NULL,
    billed_voucher_id BIGINT UNSIGNED NULL,
    written_off       TINYINT(1) NOT NULL DEFAULT 0,
    write_off_reason  VARCHAR(300) NULL,
    marked_by         BIGINT UNSIGNED NULL,
    created_at        TIMESTAMP NULL,
    UNIQUE KEY uq_project_disbursements_line (voucher_entry_id),
    KEY idx_project_disbursements_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- project roles: the Lead works on tasks, logs time and approves time on the work; a Member works on tasks and logs time
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, a.ability FROM project_roles JOIN (SELECT 'tasks' AS ability UNION ALL SELECT 'time' AS ability UNION ALL SELECT 'approve_time' AS ability) a WHERE `key` = 'lead';
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, a.ability FROM project_roles JOIN (SELECT 'tasks' AS ability UNION ALL SELECT 'time' AS ability) a WHERE `key` = 'member';

-- the five task statuses are words in the names table, so each industry (and each company) can call them what it does
INSERT IGNORE INTO project_terms (`key`, description, sort_order) VALUES
    ('task_todo', 'A task nobody has started', 111),
    ('task_doing', 'A task being worked on', 112),
    ('task_waiting', 'A task waiting on someone else', 113),
    ('task_done', 'A finished task', 114),
    ('task_cancelled', 'A task that will not be done', 115);
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('legal', 'task_waiting', 'Awaiting client', 'Awaiting client');
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) SELECT `key`, 'task_todo', 'To do', 'To do' FROM project_industries;
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) SELECT `key`, 'task_doing', 'Doing', 'Doing' FROM project_industries;
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) SELECT `key`, 'task_waiting', 'Waiting', 'Waiting' FROM project_industries;
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) SELECT `key`, 'task_done', 'Done', 'Done' FROM project_industries;
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) SELECT `key`, 'task_cancelled', 'Cancelled', 'Cancelled' FROM project_industries;

-- PART C - CHECK (expect 12 tables)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_work_tasks', 'project_task_people', 'project_task_waits', 'project_task_checks', 'project_scope_lines', 'project_key_dates', 'project_changes', 'project_change_effects', 'project_time', 'project_timers', 'project_rates', 'project_disbursements');
