-- =====================================================================
-- 35_promo_usage_and_rounding.sql
-- Promo usage follows the voucher, and totals can be rounded.
--
--   referral_code_usage.voucher_id   the voucher a promo code was used on (one row per
--                                    voucher; reversed when the voucher is cancelled).
--                                    order_id becomes optional (the old orders are gone).
--   ledgers: a "Rounding" ledger (Indirect Expenses) for the difference when a
--            total is rounded, and accounting_settings.rounding_ledger_id pointing at it
--   accounting_settings.sales_rounding / cash_sale_rounding
--            none | whole | half  — the default for new Sales / Cash Sale vouchers (none)
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Columns already present? (expect 0 rows on first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'referral_code_usage' AND column_name = 'voucher_id')
    OR (table_name = 'accounting_settings' AND column_name IN ('rounding_ledger_id', 'sales_rounding', 'cash_sale_rounding')));

-- A2. The usage table: which columns MUST be filled and have no default (the app fills the ones it knows;
--     tell me if anything else shows here)
SELECT column_name, column_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'referral_code_usage' AND is_nullable = 'NO' AND column_default IS NULL AND extra NOT LIKE '%auto_increment%';

-- A3. The group the Rounding ledger goes under (expect 1 row)
SELECT id, name, nature FROM ledger_groups WHERE name = 'Indirect Expenses';

-- A4. A ledger called Rounding already? (expect 0 rows on first run)
SELECT id, name, group_id FROM ledgers WHERE name = 'Rounding';

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

CALL add_column_if_missing('referral_code_usage', 'voucher_id',         'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'rounding_ledger_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'sales_rounding',     'VARCHAR(8) NOT NULL DEFAULT ''none''');
CALL add_column_if_missing('accounting_settings', 'cash_sale_rounding', 'VARCHAR(8) NOT NULL DEFAULT ''none''');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- the old order link is optional now
SET @needs := (SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'referral_code_usage' AND column_name = 'order_id' AND is_nullable = 'NO');
SET @s := IF(@needs > 0, 'ALTER TABLE referral_code_usage MODIFY order_id BIGINT UNSIGNED NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'referral_code_usage' AND index_name = 'idx_usage_voucher');
SET @s := IF(@has_idx = 0, 'CREATE INDEX idx_usage_voucher ON referral_code_usage (voucher_id)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- PART C — THE ROUNDING LEDGER AND ITS SETTING (transaction; re-runnable)
SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

SET @grp_ind := (SELECT id FROM ledger_groups WHERE name = 'Indirect Expenses' ORDER BY id LIMIT 1);

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_ind, 'Rounding', 0, 1, 1, NOW(), NOW()
WHERE @grp_ind IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Rounding');

INSERT INTO accounting_settings (id, edit_window_days)
SELECT 1, 30 WHERE NOT EXISTS (SELECT 1 FROM accounting_settings WHERE id = 1);

UPDATE accounting_settings
SET rounding_ledger_id = (SELECT id FROM ledgers WHERE name = 'Rounding' ORDER BY id LIMIT 1)
WHERE id = 1 AND rounding_ledger_id IS NULL;

COMMIT;

SET SQL_SAFE_UPDATES = @old_safe;

-- PART D — RESULT CHECK. Expect 4 rows (the columns), one Rounding ledger, and the setting filled in.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'referral_code_usage' AND column_name = 'voucher_id')
    OR (table_name = 'accounting_settings' AND column_name IN ('rounding_ledger_id', 'sales_rounding', 'cash_sale_rounding')));
SELECT l.id, l.name, g.name AS `group` FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE l.name = 'Rounding';
SELECT rounding_ledger_id, sales_rounding, cash_sale_rounding FROM accounting_settings WHERE id = 1;
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'referral_code_usage' AND column_name = 'order_id';
