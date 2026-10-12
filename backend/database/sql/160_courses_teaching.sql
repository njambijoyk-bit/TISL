-- =====================================================================
-- 160_courses_teaching.sql
-- Courses module, step 9 (docs/COURSES_PLAN.md): the teaching side.
--   course_intakes          a dated run of an offering (e.g. "January 2027") with its own places and enrolment window
--   course_waitlist         people waiting for a place; when one frees up the first in line is offered it and holds it for a while
--   course_enrolments.intake_id   the run a student enrolled in
-- Run 132 to 159 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_intakes', 'course_waitlist');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS course_intakes (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id  BIGINT UNSIGNED NOT NULL,
    name         VARCHAR(120) NOT NULL,
    starts_on    DATE NULL,
    ends_on      DATE NULL,
    enrol_until  DATE NULL,                                       -- last day to enrol (empty = until the run is closed)
    capacity     SMALLINT UNSIGNED NULL,                          -- places in this run (empty = only the offering's limit applies)
    status       VARCHAR(8) NOT NULL DEFAULT 'open',              -- open | closed
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_course_intakes_offering (offering_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_waitlist (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id       BIGINT UNSIGNED NOT NULL,
    intake_id         BIGINT UNSIGNED NULL,
    user_id           BIGINT UNSIGNED NOT NULL,
    status            VARCHAR(10) NOT NULL DEFAULT 'waiting',     -- waiting | offered | enrolled | expired | removed
    offered_at        DATETIME NULL,
    offer_expires_at  DATETIME NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_course_waitlist_offering (offering_id, status),
    KEY idx_course_waitlist_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_course_teaching_columns;
DELIMITER $$
CREATE PROCEDURE add_course_teaching_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_enrolments' AND column_name = 'intake_id') THEN
        ALTER TABLE course_enrolments ADD COLUMN intake_id BIGINT UNSIGNED NULL;
    END IF;
END$$
DELIMITER ;
CALL add_course_teaching_columns();
DROP PROCEDURE IF EXISTS add_course_teaching_columns;

-- PART C - VERIFY
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_intakes', 'course_waitlist');
