-- =====================================================================
-- 251_voucher_templates_trash.sql
-- A deleted voucher template is kept in a trash so it can be restored (Configuration, Voucher templates), instead of being lost. Run script 250 first.
--   voucher_templates.deleted_at  when it was deleted (empty = in use)
--   voucher_templates.deleted_by  who deleted it
-- Nothing else changes. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 0 rows on the first run.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voucher_templates' AND column_name IN ('deleted_at', 'deleted_by');

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
CALL add_column_if_missing('voucher_templates', 'deleted_at', 'TIMESTAMP NULL');
CALL add_column_if_missing('voucher_templates', 'deleted_by', 'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C - CHECK. Expect 2 rows.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voucher_templates' AND column_name IN ('deleted_at', 'deleted_by');
