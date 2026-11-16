-- =====================================================================
-- 258_projects_control_room.sql
-- Projects, stage 2: the control room (docs/PROJECTS_STAGE2_SPEC.md). Run script 257 first.
-- It only ADDS. Nothing is changed or deleted, and no table here holds an amount of money.
--   project_access            per project: whether reading is allowed outside its hours
--   project_hours             the days and times a project can be opened; member_id 0 = everyone, otherwise one person's place on it
--   project_passes            a short pass to get in outside hours: who asked, who answered, until when
--   project_locks             a locked area of a project and its password (hashed, never readable)
--   project_unlocks           who has a locked area open and until when; wrong tries
--   project_approvals         something waiting for a supervisor (a serious action, a lock password reset), exactly as asked, and the answer
--   project_security_events   a signal that fired (many refusals, wrong lock passwords...), the response taken, and the review
-- It also gives the Lead project role the new ability "access" (set hours, end dates and locked areas on a project).
-- Safe to re-run: every table is CREATE IF NOT EXISTS and the starter row is INSERT IGNORE.
-- No permission seed is needed: the permissions were added with script 257 (catalogue version 26).
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (the foundation is there), then the new tables that exist now (none on a first run).
SELECT COUNT(*) AS foundation_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_access', 'project_hours', 'project_passes', 'project_locks', 'project_unlocks', 'project_approvals', 'project_security_events');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_control_room_guard;
DELIMITER $$
CREATE PROCEDURE projects_control_room_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Projects foundation is not here. Run script 257 first. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL projects_control_room_guard();
DROP PROCEDURE IF EXISTS projects_control_room_guard;

CREATE TABLE IF NOT EXISTS project_access (
    project_id         BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    read_outside_hours TINYINT(1) NOT NULL DEFAULT 0,                    -- 1 = outside the hours people can still read, not change
    updated_by         BIGINT UNSIGNED NULL,
    updated_at         TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_hours (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    member_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,                       -- 0 = the whole project; otherwise project_members.id
    day        TINYINT UNSIGNED NOT NULL,                                -- 1 = Monday ... 7 = Sunday; a day with no row is closed
    opens      CHAR(5) NOT NULL,                                         -- 07:00, in the company's time zone
    closes     CHAR(5) NOT NULL,                                         -- 19:00
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_hours (project_id, member_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_passes (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id  BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NOT NULL,
    status      VARCHAR(10) NOT NULL DEFAULT 'asked',                    -- asked | approved | declined
    reason      VARCHAR(200) NULL,
    asked_at    DATETIME NOT NULL,
    answered_by BIGINT UNSIGNED NULL,
    answered_at DATETIME NULL,
    ends_at     DATETIME NULL,                                           -- set when approved; the pass stops by itself
    KEY idx_project_passes (project_id, user_id, status),
    KEY idx_project_passes_user (user_id, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_locks (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id    BIGINT UNSIGNED NOT NULL,
    area          VARCHAR(40) NOT NULL,                                  -- people | links | activity | phases | sensitive_fields (more arrive with later stages)
    password_hash VARCHAR(255) NOT NULL,
    set_by        BIGINT UNSIGNED NULL,
    set_at        DATETIME NOT NULL,
    created_at    TIMESTAMP NULL,
    UNIQUE KEY uq_project_locks (project_id, area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_unlocks (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    lock_id        BIGINT UNSIGNED NOT NULL,
    user_id        BIGINT UNSIGNED NOT NULL,
    unlocked_until DATETIME NULL,                                        -- open for this person until then
    wrong_tries    INT NOT NULL DEFAULT 0,                               -- in a row; a right password sets it back to 0
    blocked_until  DATETIME NULL,                                        -- too many wrong tries: no more tries until then
    last_try_at    DATETIME NULL,
    UNIQUE KEY uq_project_unlocks (lock_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_approvals (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kind         VARCHAR(12) NOT NULL DEFAULT 'action',                  -- action | lock_reset
    action       VARCHAR(60) NOT NULL,                                   -- project.purge, project.unfreeze, lock.reset...
    project_id   BIGINT UNSIGNED NULL,
    subject_type VARCHAR(40) NULL,
    subject_id   BIGINT UNSIGNED NULL,
    summary      VARCHAR(300) NOT NULL,                                  -- what is being asked, in words, as the supervisor reads it
    payload      JSON NULL,                                              -- exactly what was asked (never a password)
    payload_hash CHAR(64) NOT NULL,                                      -- so the action carried out is the action that was approved
    reason       VARCHAR(300) NULL,
    asked_by     BIGINT UNSIGNED NOT NULL,
    asked_at     DATETIME NOT NULL,
    expires_at   DATETIME NOT NULL,
    status       VARCHAR(10) NOT NULL DEFAULT 'waiting',                 -- waiting | approved | declined | withdrawn | used
    answered_by  BIGINT UNSIGNED NULL,
    answered_at  DATETIME NULL,
    answer_note  VARCHAR(300) NULL,
    used_at      DATETIME NULL,
    KEY idx_project_approvals_status (status, expires_at),
    KEY idx_project_approvals_asker (asked_by, status),
    KEY idx_project_approvals_project (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_security_events (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `signal`     VARCHAR(30) NOT NULL,                                   -- refusals | lock_tries | outside_hours | opening_spree | exports
    user_id      BIGINT UNSIGNED NOT NULL,
    project_id   BIGINT UNSIGNED NULL,
    detail       VARCHAR(300) NOT NULL,                                  -- what happened, in words
    response     VARCHAR(8) NOT NULL DEFAULT 'alert',                    -- alert | slow | pause
    hold_until   DATETIME NULL,                                          -- slow: until then; pause: null (until released)
    released_by  BIGINT UNSIGNED NULL,
    released_at  DATETIME NULL,
    reviewed_by  BIGINT UNSIGNED NULL,
    reviewed_at  DATETIME NULL,
    review_note  VARCHAR(300) NULL,
    created_at   TIMESTAMP NULL,
    KEY idx_project_security_user (user_id, response, released_at),
    KEY idx_project_security_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- the Lead can set hours, end dates and locked areas on their own projects
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, 'access' FROM project_roles WHERE `key` = 'lead';

-- PART C - CHECK (expect 7 tables, then 1: the Lead has the new ability)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_access', 'project_hours', 'project_passes', 'project_locks', 'project_unlocks', 'project_approvals', 'project_security_events');
SELECT COUNT(*) AS lead_can_set_access FROM project_role_permissions p JOIN project_roles r ON r.id = p.project_role_id WHERE r.`key` = 'lead' AND p.ability = 'access';
