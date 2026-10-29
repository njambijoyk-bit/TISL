-- =====================================================================
-- 238_visual_favourites.sql
-- Each person's favourite Visual report charts (Books -> Visual reports): up to nine, in the order they chose, so key 1 opens the first and key 9 the ninth.
-- Personal to the user; nothing else reads it. Until this is run the favourites are kept in the person's own browser instead.
-- Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Is the table there? (0 rows before, 1 after)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'visual_favourites';

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS visual_favourites (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    chart_key   VARCHAR(60) NOT NULL,        -- the chart's key: 'cash-forecast', 'expense-donut' ...
    position    TINYINT UNSIGNED NOT NULL,   -- 1 to 9
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_visual_favourites_key (user_id, chart_key),
    UNIQUE KEY uq_visual_favourites_pos (user_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK. Expect 1 row.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'visual_favourites';
