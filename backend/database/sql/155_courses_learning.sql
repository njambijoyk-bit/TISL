-- =====================================================================
-- 155_courses_learning.sql
-- Courses module, step 4 (docs/COURSES_PLAN.md): My learning.
--   course_progress          where each student is in each lesson: started or done, and the place in a video
--   course_offerings.in_order   lessons must be finished in order (empty = any order)
--   course_live.reminded_day_at / reminded_hour_at   so the reminder for a live session goes out once a day before and once an hour before
-- Run 132 to 154 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'course_progress';
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'course_offerings' AND column_name = 'in_order') OR (table_name = 'course_live' AND column_name IN ('reminded_day_at', 'reminded_hour_at')));

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS course_progress (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id          BIGINT UNSIGNED NOT NULL,
    offering_id      BIGINT UNSIGNED NOT NULL,
    lesson_id        BIGINT UNSIGNED NOT NULL,
    status           VARCHAR(8) NOT NULL DEFAULT 'started',       -- started | done
    position_seconds INT UNSIGNED NULL,                           -- where they stopped in a video
    started_at       DATETIME NULL,
    done_at          DATETIME NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_course_progress (user_id, lesson_id),
    KEY idx_course_progress_offering (user_id, offering_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_course_learning_columns;
DELIMITER $$
CREATE PROCEDURE add_course_learning_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'in_order') THEN
        ALTER TABLE course_offerings ADD COLUMN in_order TINYINT(1) NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_live' AND column_name = 'reminded_day_at') THEN
        ALTER TABLE course_live ADD COLUMN reminded_day_at DATETIME NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_live' AND column_name = 'reminded_hour_at') THEN
        ALTER TABLE course_live ADD COLUMN reminded_hour_at DATETIME NULL;
    END IF;
END$$
DELIMITER ;
CALL add_course_learning_columns();
DROP PROCEDURE IF EXISTS add_course_learning_columns;

-- PART C - CHECK. Expect one table and three columns.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'course_progress';
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'course_offerings' AND column_name = 'in_order') OR (table_name = 'course_live' AND column_name IN ('reminded_day_at', 'reminded_hour_at')));
