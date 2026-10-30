-- =====================================================================
-- 244_voucher_initiatives.sql
-- Budgeting, step 8 of docs/BOOKS_BUDGETING_PLAN.md: a voucher can say which initiative it belongs to, so a budget row for an initiative has real actuals.
--   vouchers.initiative_id          what the whole voucher belongs to (the entry form's Initiative)
--   voucher_entries.initiative_id   what this line belongs to (the voucher's, unless "A line may take a different cost centre" is on)
-- Both are optional and stay empty for everything already posted: an initiative only counts what is posted to it from now on. Run scripts 100 to 102 and 239 first.
-- Nothing is changed in existing rows. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Already there? (0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'initiative_id' AND table_name IN ('vouchers', 'voucher_entries');
-- A2. How many entries will have the new empty column
SELECT (SELECT COUNT(*) FROM vouchers) AS vouchers, (SELECT COUNT(*) FROM voucher_entries) AS entries;

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
CALL add_column_if_missing('vouchers', 'initiative_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('voucher_entries', 'initiative_id', 'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_index_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(200))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_index_if_missing('voucher_entries', 'voucher_entries_initiative_idx', 'initiative_id');
DROP PROCEDURE IF EXISTS add_index_if_missing;

-- PART C - CHECK. Expect 2 rows (one per table), then 0 entries with an initiative.
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'initiative_id' AND table_name IN ('vouchers', 'voucher_entries');
SELECT COUNT(*) AS entries_with_an_initiative FROM voucher_entries WHERE initiative_id IS NOT NULL;
