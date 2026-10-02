-- =====================================================================
-- 63_attendance.sql
-- Attendance: a record per person per day (it never touches the books), verified before payroll uses it.
--   attendance_settings   working hours, grace period and working days (one row)
--   attendance_days       one row per person per day: status, sign in/out, who marked it, whether it is verified
--   attendance_markers    people assigned to mark and verify someone's attendance (besides their manager)
--   attendance_disputes   a colleague's report that a day was wrong ("did not attend", "left early", "no overtime");
--                         the reporter and the time are kept here for the super admin only
-- Run in Workbench. Safe to re-run. It only creates tables, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('attendance_settings', 'attendance_days', 'attendance_markers', 'attendance_disputes');

-- PART B — CREATE (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS attendance_settings (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    work_start      TIME NOT NULL DEFAULT '08:00:00',
    work_end        TIME NOT NULL DEFAULT '17:00:00',
    grace_minutes   INT NOT NULL DEFAULT 15,
    workdays        VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5',      -- 0 = Sunday
    updated_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_days (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NOT NULL,
    work_date       DATE NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'present',        -- present | late | half_day | left_early | absent | leave | off | holiday
    sign_in_at      DATETIME NULL,
    sign_out_at     DATETIME NULL,
    sign_source     VARCHAR(20) NULL,                              -- self | marker | inferred
    minutes_worked  INT NOT NULL DEFAULT 0,
    overtime_minutes INT NOT NULL DEFAULT 0,
    note            VARCHAR(255) NULL,
    marked_by       BIGINT UNSIGNED NULL,
    marked_at       DATETIME NULL,
    verify_status   VARCHAR(20) NOT NULL DEFAULT 'marked',         -- marked | verified
    verified_by     BIGINT UNSIGNED NULL,
    verified_at     DATETIME NULL,
    verify_note     VARCHAR(255) NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY attendance_person_day (user_id, work_date),
    KEY attendance_date (work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_markers (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    staff_user_id   BIGINT UNSIGNED NOT NULL,
    marker_user_id  BIGINT UNSIGNED NOT NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY attendance_marker_pair (staff_user_id, marker_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_disputes (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_user_id  BIGINT UNSIGNED NOT NULL,                     -- whose day is disputed
    work_date        DATE NOT NULL,
    kind             VARCHAR(20) NOT NULL,                         -- did_not_attend | left_early | no_overtime | other
    note             VARCHAR(255) NULL,
    reporter_user_id BIGINT UNSIGNED NOT NULL,                     -- KEPT PRIVATE: only the super admin may see it
    reported_at      DATETIME NOT NULL,                            -- KEPT PRIVATE with the reporter
    status           VARCHAR(20) NOT NULL DEFAULT 'open',          -- open | upheld | dismissed
    resolved_by      BIGINT UNSIGNED NULL,
    resolved_at      DATETIME NULL,
    resolution_note  VARCHAR(255) NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY attendance_dispute_once (subject_user_id, work_date, kind, reporter_user_id),
    KEY attendance_dispute_open (status, work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C — CHECK (expect four rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('attendance_settings', 'attendance_days', 'attendance_markers', 'attendance_disputes');
