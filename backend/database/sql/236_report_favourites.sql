-- =====================================================================
-- 236_report_favourites.sql
-- Each person's favourite reports (Books -> Reports): up to nine, in the order they chose, so key 1 opens the first and key 9 the ninth.
-- Personal to the user; nothing else reads it. Until this is run the favourites are kept in the person's own browser instead.
-- Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Is the table there? (0 rows before, 1 after)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'report_favourites';

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS report_favourites (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    report_key  VARCHAR(60) NOT NULL,        -- the engine's key: 'profit-loss', 'day-book' ...
    position    TINYINT UNSIGNED NOT NULL,   -- 1 to 9
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_report_favourites_key (user_id, report_key),
    UNIQUE KEY uq_report_favourites_pos (user_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK. Expect 1 row.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'report_favourites';
