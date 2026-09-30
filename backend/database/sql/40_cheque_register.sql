-- =====================================================================
-- 40_cheque_register.sql
-- What the cheque register needs to remember on each cheque (table from script 39):
--   deposited_on     the day we banked a cheque we received
--   cleared_on       the day the bank cleared it
--   bounce_voucher_id  the journal that recorded the bounce (cancel that journal to undo the bounce)
--   bounce_reason    why the bank returned it
-- Run in Workbench. Safe to re-run. Needs script 39 first.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. The table from script 39 must exist (expect 1 row)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'voucher_instruments';

-- A2. Columns already present? (expect 0 rows on first run)
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'voucher_instruments'
  AND column_name IN ('deposited_on', 'cleared_on', 'bounce_voucher_id', 'bounce_reason');

-- PART B — ADD COLUMNS (DDL, commits on its own)
DROP PROCEDURE IF EXISTS add_column_if_missing;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('voucher_instruments', 'deposited_on',      'DATE NULL');
CALL add_column_if_missing('voucher_instruments', 'cleared_on',        'DATE NULL');
CALL add_column_if_missing('voucher_instruments', 'bounce_voucher_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('voucher_instruments', 'bounce_reason',     'VARCHAR(160) NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — RESULT CHECK. Expect 4 rows.
SELECT column_name, column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'voucher_instruments'
  AND column_name IN ('deposited_on', 'cleared_on', 'bounce_voucher_id', 'bounce_reason')
ORDER BY column_name;
