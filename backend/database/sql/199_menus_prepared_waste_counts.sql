-- =====================================================================
-- 199_menus_prepared_waste_counts.sql
-- Menus dishes and recipes, build steps 1.8 and 1.9 (docs/MENUS_DISHES_PLAN.md): servings cut from a batch, and waste and counts for prepared food.
--   menus_prep_runs.servings_cut   what a batch was cut into, as a small list: [{serving_id, name, count}] (2 Jumbo, 2 Medium, 1 Kids). Empty when it was not noted.
--   menus_waste.recipe_id          the waste log can now hold prepared food thrown away (a recipe of its own), next to an ingredient or a dish
--   menus_prep_counts / menus_prep_count_lines   a count of the prepared food on the shelf: what the system said was there, what was counted, the difference and what it is worth.
--                                                A shortage comes off the oldest batches; a surplus is put on the shelf as a batch of its own. One journal books the net:
--                                                Dr Food Waste Expense, Cr Prepared Food Inventory for a loss, the other way round for a gain.
-- Run 185, 193 and 198 first. Nothing in the shop changes. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. which of the columns and tables are there already? (0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'menus_prep_runs' AND column_name = 'servings_cut') OR (table_name = 'menus_waste' AND column_name = 'recipe_id'));
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_prep_counts', 'menus_prep_count_lines');

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_prepared_waste_counts;
DELIMITER $$
CREATE PROCEDURE add_prepared_waste_counts()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_prep_runs' AND column_name = 'servings_cut') THEN
        ALTER TABLE menus_prep_runs ADD COLUMN servings_cut JSON NULL AFTER note;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_waste' AND column_name = 'recipe_id') THEN
        ALTER TABLE menus_waste ADD COLUMN recipe_id BIGINT UNSIGNED NULL AFTER dish_id;
    END IF;
END$$
DELIMITER ;
CALL add_prepared_waste_counts();
DROP PROCEDURE IF EXISTS add_prepared_waste_counts;

CREATE TABLE IF NOT EXISTS menus_prep_counts (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number        VARCHAR(20) NOT NULL,
    location_id   BIGINT UNSIGNED NOT NULL,
    counted_on    DATE NOT NULL,
    note          VARCHAR(255) NULL,
    value_change  DECIMAL(18,2) NOT NULL DEFAULT 0,                  -- worth of the difference, in the base currency: negative is food lost, positive is food found
    journal_id    BIGINT UNSIGNED NULL,
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_menus_prep_count_no (number),
    KEY idx_menus_prep_count_loc (location_id, counted_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_prep_count_lines (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    count_id      BIGINT UNSIGNED NOT NULL,
    recipe_id     BIGINT UNSIGNED NOT NULL,
    expected      DECIMAL(18,4) NOT NULL,                            -- in the recipe's unit (or portions): what the system said was there
    counted       DECIMAL(18,4) NOT NULL,
    variance      DECIMAL(18,4) NOT NULL,                            -- counted less expected
    value_change  DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_menus_prep_count_line (count_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the two columns (2 rows)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'menus_prep_runs' AND column_name = 'servings_cut') OR (table_name = 'menus_waste' AND column_name = 'recipe_id'));
-- C2. the two tables (2 rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_prep_counts', 'menus_prep_count_lines');
