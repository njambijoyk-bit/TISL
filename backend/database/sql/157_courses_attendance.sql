-- =====================================================================
-- 157_courses_attendance.sql
-- Courses module, step 6 (docs/COURSES_PLAN.md): attendance.
--   course_sessions           a dated class of an offering (in person or online), optionally linked to a live lesson; a make-up session stands in for one that was missed
--   course_register           who was there: present, late, absent, excused, or an excuse asked for
--   course_attendance_flags   the warnings already sent, so a student is told once when they are at risk or can no longer reach the share needed
-- The share needed is course_offerings.min_attendance_pct (added in script 152).
-- Run 132 to 156 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_sessions', 'course_register', 'course_attendance_flags');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS course_sessions (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id          BIGINT UNSIGNED NOT NULL,
    live_id              BIGINT UNSIGNED NULL,                      -- the live lesson's session this follows
    title                VARCHAR(160) NOT NULL,
    starts_at            DATETIME NOT NULL,
    ends_at              DATETIME NOT NULL,
    mode                 VARCHAR(10) NOT NULL DEFAULT 'in_person',  -- in_person | online
    location_id          BIGINT UNSIGNED NULL,
    status               VARCHAR(10) NOT NULL DEFAULT 'scheduled',  -- scheduled | cancelled
    makeup_for_id        BIGINT UNSIGNED NULL,                      -- this session makes up for that one (and is not counted itself)
    self_checkin         TINYINT(1) NOT NULL DEFAULT 0,             -- students may check themselves in with the code
    checkin_code         VARCHAR(8) NULL,
    notes                VARCHAR(300) NULL,
    created_by           BIGINT UNSIGNED NULL,
    created_at           TIMESTAMP NULL,
    updated_at           TIMESTAMP NULL,
    KEY idx_course_sessions_offering (offering_id, starts_at),
    KEY idx_course_sessions_live (live_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_register (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id     BIGINT UNSIGNED NOT NULL,
    offering_id    BIGINT UNSIGNED NOT NULL,
    user_id        BIGINT UNSIGNED NOT NULL,
    status         VARCHAR(8) NOT NULL,                             -- present | late | absent | excused | asked (an excuse waiting for the teacher)
    method         VARCHAR(8) NOT NULL DEFAULT 'teacher',           -- teacher | self
    note           VARCHAR(300) NULL,
    marked_by      BIGINT UNSIGNED NULL,
    marked_at      DATETIME NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_course_register (session_id, user_id),
    KEY idx_course_register_user (offering_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_attendance_flags (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id    BIGINT UNSIGNED NOT NULL,
    user_id        BIGINT UNSIGNED NOT NULL,
    state          VARCHAR(10) NOT NULL,                            -- at_risk | failed
    notified_at    DATETIME NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_course_attendance_flags (offering_id, user_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK. Expect three tables.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_sessions', 'course_register', 'course_attendance_flags');
