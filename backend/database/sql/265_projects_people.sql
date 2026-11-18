-- =====================================================================
-- 265_projects_people.sql
-- Projects stage 8 (docs/PROJECTS_STAGE8_SPEC.md): people.
--   project_goals                 a person's goals: what, measure, due, progress, state
--   project_reviews               reviews for a period: written by the manager, read, commented on and acknowledged by the person
--   project_one_to_ones           one-to-one notes shared between a manager and a person
--   project_one_to_one_private    each writer's private note on a one-to-one, seen only by them
--   project_checklist_templates   joining and leaving checklist templates
--   project_checklist_steps       their steps: who does each, and when
--   project_checklists            a checklist run for a person
--   project_checklist_items       its to-dos
--   project_case_kinds            casebook kinds and where each is routed
--   project_cases                 casebook reports
--   project_case_subjects         who or what a report is about (people or a client)
--   project_case_messages         messages between handlers and the reporter, and handlers' notes
--   project_case_log              every view, change, note and reveal (add-only)
-- HR keeps the person (name, manager, skills, certificates); nothing here copies it.
-- Needs script 257. Safe to re-run: CREATE IF NOT EXISTS and INSERT IGNORE. No permission seed is needed.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (the foundation is there), then what exists now (nothing on a first run).
SELECT COUNT(*) AS foundation_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_goals', 'project_reviews', 'project_one_to_ones', 'project_one_to_one_private', 'project_checklist_templates', 'project_checklist_steps', 'project_checklists', 'project_checklist_items', 'project_case_kinds', 'project_cases', 'project_case_subjects', 'project_case_messages', 'project_case_log');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_people_guard;
DELIMITER $$
CREATE PROCEDURE projects_people_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Projects foundation is not here. Run script 257 first. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL projects_people_guard();
DROP PROCEDURE IF EXISTS projects_people_guard;

CREATE TABLE IF NOT EXISTS project_goals (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,                                -- whose goal
    title       VARCHAR(200) NOT NULL,
    measure     VARCHAR(300) NULL,                                       -- how it is measured
    due_on      DATE NULL,
    progress    TINYINT UNSIGNED NOT NULL DEFAULT 0,                     -- 0 to 100
    state       VARCHAR(10) NOT NULL DEFAULT 'on_track',                 -- on_track | at_risk | done | dropped
    set_by      BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_project_goals_user (user_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_reviews (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL,                            -- who is reviewed
    period          VARCHAR(60) NOT NULL,                                -- "2026, first half"
    body            TEXT NOT NULL,
    written_by      BIGINT UNSIGNED NULL,
    shared_at       TIMESTAMP NULL,                                      -- empty while it is a draft
    acknowledged_at TIMESTAMP NULL,
    comment         TEXT NULL,                                           -- the person's own words on it
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_project_reviews_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_one_to_ones (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,                                -- the person
    manager_id  BIGINT UNSIGNED NOT NULL,                                -- who met them
    held_on     DATE NOT NULL,
    notes       TEXT NULL,                                               -- shared between the two
    actions     TEXT NULL,                                               -- action points, as JSON [{text, who, task_id}]
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_project_one_to_ones_user (user_id, held_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_one_to_one_private (
    one_to_one_id BIGINT UNSIGNED NOT NULL,
    user_id       BIGINT UNSIGNED NOT NULL,                              -- the writer, the only one who sees it
    note          TEXT NOT NULL,
    updated_at    TIMESTAMP NULL,
    PRIMARY KEY (one_to_one_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_checklist_templates (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kind       VARCHAR(8) NOT NULL,                                      -- joining | leaving
    name       VARCHAR(120) NOT NULL,
    is_active  TINYINT(1) NOT NULL DEFAULT 1,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_checklist_steps (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    template_id BIGINT UNSIGNED NOT NULL,
    text        VARCHAR(200) NOT NULL,
    who         VARCHAR(12) NOT NULL DEFAULT 'manager',                  -- person | manager | named | permission
    who_user_id BIGINT UNSIGNED NULL,                                    -- for named
    who_permission VARCHAR(80) NULL,                                     -- for permission: anyone who holds it
    day_offset  INT NOT NULL DEFAULT 0,                                  -- days from the start (joining) or leaving date; negative = before
    action      VARCHAR(20) NULL,                                        -- handover | end_places: a step that opens or does something
    sort_order  INT NOT NULL DEFAULT 0,
    KEY idx_project_checklist_steps_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_checklists (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    template_id BIGINT UNSIGNED NULL,
    kind        VARCHAR(8) NOT NULL,                                     -- joining | leaving
    user_id     BIGINT UNSIGNED NOT NULL,                                -- whose
    on_date     DATE NOT NULL,                                           -- the start or leaving date
    state       VARCHAR(10) NOT NULL DEFAULT 'open',                     -- open | done | cancelled
    started_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_project_checklists_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_checklist_items (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    checklist_id  BIGINT UNSIGNED NOT NULL,
    text          VARCHAR(200) NOT NULL,
    who           VARCHAR(12) NOT NULL,
    who_user_id   BIGINT UNSIGNED NULL,                                  -- the one person who does it (person, manager, named), or empty for a permission
    who_permission VARCHAR(80) NULL,
    due_on        DATE NULL,
    action        VARCHAR(20) NULL,
    done_at       TIMESTAMP NULL,
    done_by       BIGINT UNSIGNED NULL,
    reminded_on   DATE NULL,
    sort_order    INT NOT NULL DEFAULT 0,
    KEY idx_project_checklist_items_list (checklist_id),
    KEY idx_project_checklist_items_who (who_user_id, done_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_case_kinds (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`         VARCHAR(30) NOT NULL,
    name          VARCHAR(80) NOT NULL,
    route         VARCHAR(12) NOT NULL DEFAULT 'handlers',               -- handlers | person | manager | department | owners | outside
    route_user_id BIGINT UNSIGNED NULL,                                  -- for person
    route_department_id BIGINT UNSIGNED NULL,                            -- for department: its head
    route_email   VARCHAR(190) NULL,                                     -- for outside
    route_name    VARCHAR(120) NULL,                                     -- for outside: who they are
    client_flag   TINYINT(1) NOT NULL DEFAULT 0,                         -- a case of this kind may raise a client flag
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NULL,
    UNIQUE KEY uq_project_case_kinds_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_cases (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number        VARCHAR(20) NOT NULL,
    kind_id       BIGINT UNSIGNED NOT NULL,
    reporter_id   BIGINT UNSIGNED NOT NULL,
    hide_name     TINYINT(1) NOT NULL DEFAULT 0,
    happened_on   DATE NULL,
    what          TEXT NOT NULL,
    project_id    BIGINT UNSIGNED NULL,                                  -- the piece of work it happened on, if any
    state         VARCHAR(10) NOT NULL DEFAULT 'new',                    -- new | looking | action | closed
    routed_to     VARCHAR(12) NULL,                                      -- how it was routed when reported
    handler_id    BIGINT UNSIGNED NULL,                                  -- who has taken it
    outcome       TEXT NULL,
    revealed_at   TIMESTAMP NULL,
    revealed_by   BIGINT UNSIGNED NULL,
    closed_at     TIMESTAMP NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_project_cases_number (number),
    KEY idx_project_cases_reporter (reporter_id),
    KEY idx_project_cases_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_case_subjects (
    case_id      BIGINT UNSIGNED NOT NULL,
    subject_type VARCHAR(10) NOT NULL,                                   -- person | client
    subject_id   BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (case_id, subject_type, subject_id),
    KEY idx_project_case_subjects_subject (subject_type, subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_case_messages (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    case_id     BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    from_reporter TINYINT(1) NOT NULL DEFAULT 0,
    internal    TINYINT(1) NOT NULL DEFAULT 0,                           -- a handlers' note, never shown to the reporter
    body        TEXT NOT NULL,
    created_at  TIMESTAMP NULL,
    KEY idx_project_case_messages_case (case_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_case_log (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    case_id     BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NULL,
    action      VARCHAR(30) NOT NULL,                                    -- reported | routed | viewed | state | note | message | revealed | flag
    detail      VARCHAR(300) NULL,
    created_at  TIMESTAMP NULL,
    KEY idx_project_case_log_case (case_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- casebook kinds to start with: every one goes to the people who handle cases until Configuration says otherwise
INSERT IGNORE INTO project_case_kinds (`key`, name, route, client_flag, sort_order, created_at) VALUES
    ('harassment', 'Harassment or bullying', 'handlers', 0, 1, NOW()), ('difficult_client', 'A difficult client', 'handlers', 1, 2, NOW()),
    ('safety', 'Safety', 'handlers', 0, 3, NOW()), ('pay', 'Pay', 'handlers', 0, 4, NOW()), ('other', 'Something else', 'handlers', 0, 5, NOW());

-- a joining and a leaving checklist to start with (changed or added to in Configuration)
INSERT INTO project_checklist_templates (kind, name, created_at) SELECT 'joining', 'Joining', NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM project_checklist_templates WHERE kind = 'joining');
INSERT INTO project_checklist_templates (kind, name, created_at) SELECT 'leaving', 'Leaving', NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM project_checklist_templates WHERE kind = 'leaving');
INSERT INTO project_checklist_steps (template_id, text, who, day_offset, action, sort_order)
    SELECT t.id, s.text, s.who, s.day_offset, s.action, s.sort_order FROM project_checklist_templates t
    JOIN (SELECT 'joining' AS kind, 'Add them to the work they will be on' AS text, 'manager' AS who, 0 AS day_offset, NULL AS action, 1 AS sort_order
          UNION ALL SELECT 'joining', 'Show them their My Work page and how to log time', 'manager', 1, NULL, 2
          UNION ALL SELECT 'joining', 'Set their first goals', 'manager', 14, NULL, 3
          UNION ALL SELECT 'leaving', 'Hand over their work', 'manager', -7, 'handover', 1
          UNION ALL SELECT 'leaving', 'Take them off their work on the leaving date', 'manager', 0, 'end_places', 2
          UNION ALL SELECT 'leaving', 'Submit their last timesheet', 'person', -1, NULL, 3) s ON s.kind = t.kind
    WHERE NOT EXISTS (SELECT 1 FROM project_checklist_steps x WHERE x.template_id = t.id);

-- PART C - CHECK (expect 13 tables)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_goals', 'project_reviews', 'project_one_to_ones', 'project_one_to_one_private', 'project_checklist_templates', 'project_checklist_steps', 'project_checklists', 'project_checklist_items', 'project_case_kinds', 'project_cases', 'project_case_subjects', 'project_case_messages', 'project_case_log');
