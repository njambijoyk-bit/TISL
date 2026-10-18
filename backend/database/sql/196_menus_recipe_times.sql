-- =====================================================================
-- 196_menus_recipe_times.sql
-- Menus dishes and recipes, build step 1.3 (docs/MENUS_DISHES_PLAN.md): how long a batch takes depends on how big it is.
--   menus_recipe_times   rows of "a batch up to this much takes this many minutes" for a recipe: up to 1 kg takes 15 minutes, up to 2 kg takes 20.
--                        The amount is in the unit the recipe counts a batch in (script 195), or portions. A batch is timed by the smallest row that is big enough.
-- Nothing else changes: the prep and cook minutes on a recipe stay as they are. Run 183 and 194 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the table there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_times';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_recipe_times (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipe_id   BIGINT UNSIGNED NOT NULL,
    up_to_qty   DECIMAL(18,4) NOT NULL,                            -- a batch of at most this much (in the recipe's yield unit, or portions)
    minutes     SMALLINT UNSIGNED NOT NULL,                        -- takes this long
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_recipe_time (recipe_id, up_to_qty)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the table is there (1 row)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_times';
-- C2. nothing in it yet (0 rows until you add times to a recipe)
SELECT COUNT(*) AS time_rows FROM menus_recipe_times;
