-- =====================================================================
-- 247_asset_floor_defaults.sql
-- Fixed assets: each asset type (an Assets category) can say the least its assets may be worth after depreciation, as an amount or a percent of the cost. A new asset of that type
-- starts with that floor; each asset can still have its own (the asset form's "floor"). Depreciation already stops at an asset's floor (script 71). Run script 71 first.
--   inventory_categories.default_floor_type   'amount' or 'percent' (empty = no default: the floor is 0 unless the asset says otherwise)
--   inventory_categories.default_floor_value  the amount, or the percent of cost
-- Nothing else changes. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Already there? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_categories' AND column_name IN ('default_floor_type', 'default_floor_value');

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_column_if_missing('inventory_categories', 'default_floor_type', 'VARCHAR(10) NULL');
CALL add_column_if_missing('inventory_categories', 'default_floor_value', 'DECIMAL(18,4) NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C - CHECK. Expect 2 rows.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_categories' AND column_name IN ('default_floor_type', 'default_floor_value');
