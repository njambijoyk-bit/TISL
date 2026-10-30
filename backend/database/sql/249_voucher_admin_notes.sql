-- =====================================================================
-- 249_voucher_admin_notes.sql
-- Vouchers get a system-made record of their own metadata (the customer's tax treatment, the invoice mode, the taxes charged, who made and last changed it).
--   vouchers.admin_notes  JSON, made by the system on every save, never typed by hand and never shown on a customer's copy
-- Nothing else changes. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 0 rows on the first run.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'admin_notes';

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
CALL add_column_if_missing('vouchers', 'admin_notes', 'JSON NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C - CHECK. Expect 1 row.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'admin_notes';
