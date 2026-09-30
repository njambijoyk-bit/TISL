-- =====================================================================
-- 37_system_ledgers.sql
-- The ledgers that write-offs, bounced cheques, bank charges and cash counts post to.
-- Nothing is hardcoded by name in the app: each one is pointed at from Settings
-- (accounting_settings), so you can rename or swap any of them.
--
--   Bad Debts Written Off        Indirect Expenses   accounting_settings.bad_debt_ledger_id
--   Discount Allowed             Indirect Expenses   accounting_settings.discount_allowed_ledger_id
--   Bank Charges                 Indirect Expenses   accounting_settings.bank_charges_ledger_id
--   Bounced Cheque Charges       Indirect Income     accounting_settings.bounce_fee_ledger_id
--   Cash Over / Short            Indirect Expenses   accounting_settings.cash_over_short_ledger_id
--   Driver Cash                  Cash-in-hand        (an ordinary cash ledger, used for cash on delivery)
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Setting columns already present? (expect 0 rows on first run)
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'accounting_settings'
  AND column_name IN ('bad_debt_ledger_id', 'discount_allowed_ledger_id', 'bank_charges_ledger_id', 'bounce_fee_ledger_id', 'cash_over_short_ledger_id');

-- A2. The groups the ledgers go under (expect 3 rows: Cash-in-hand, Indirect Expenses, Indirect Income)
SELECT id, name, nature FROM ledger_groups WHERE name IN ('Indirect Expenses', 'Indirect Income', 'Cash-in-hand') ORDER BY name;

-- A3. Ledgers with these names already? (expect 0 rows on first run)
SELECT id, name, group_id FROM ledgers
WHERE name IN ('Bad Debts Written Off', 'Discount Allowed', 'Bank Charges', 'Bounced Cheque Charges', 'Cash Over / Short', 'Driver Cash');

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

CALL add_column_if_missing('accounting_settings', 'bad_debt_ledger_id',        'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'discount_allowed_ledger_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'bank_charges_ledger_id',    'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'bounce_fee_ledger_id',      'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'cash_over_short_ledger_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — THE LEDGERS AND THEIR SETTINGS (transaction; re-runnable)
SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

SET @grp_exp  := (SELECT id FROM ledger_groups WHERE name = 'Indirect Expenses' ORDER BY id LIMIT 1);
SET @grp_inc  := (SELECT id FROM ledger_groups WHERE name = 'Indirect Income'   ORDER BY id LIMIT 1);
SET @grp_cash := (SELECT id FROM ledger_groups WHERE name = 'Cash-in-hand'      ORDER BY id LIMIT 1);

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_exp, 'Bad Debts Written Off', 0, 1, 1, NOW(), NOW()
WHERE @grp_exp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Bad Debts Written Off');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_exp, 'Discount Allowed', 0, 1, 1, NOW(), NOW()
WHERE @grp_exp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Discount Allowed');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_exp, 'Bank Charges', 0, 1, 1, NOW(), NOW()
WHERE @grp_exp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Bank Charges');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_exp, 'Cash Over / Short', 0, 1, 1, NOW(), NOW()
WHERE @grp_exp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Cash Over / Short');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_inc, 'Bounced Cheque Charges', 0, 1, 1, NOW(), NOW()
WHERE @grp_inc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Bounced Cheque Charges');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_cash, 'Driver Cash', 0, 1, 1, NOW(), NOW()
WHERE @grp_cash IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Driver Cash');

INSERT INTO accounting_settings (id, edit_window_days)
SELECT 1, 30 WHERE NOT EXISTS (SELECT 1 FROM accounting_settings WHERE id = 1);

UPDATE accounting_settings SET bad_debt_ledger_id        = (SELECT id FROM ledgers WHERE name = 'Bad Debts Written Off' ORDER BY id LIMIT 1) WHERE id = 1 AND bad_debt_ledger_id IS NULL;
UPDATE accounting_settings SET discount_allowed_ledger_id = (SELECT id FROM ledgers WHERE name = 'Discount Allowed'       ORDER BY id LIMIT 1) WHERE id = 1 AND discount_allowed_ledger_id IS NULL;
UPDATE accounting_settings SET bank_charges_ledger_id    = (SELECT id FROM ledgers WHERE name = 'Bank Charges'            ORDER BY id LIMIT 1) WHERE id = 1 AND bank_charges_ledger_id IS NULL;
UPDATE accounting_settings SET bounce_fee_ledger_id      = (SELECT id FROM ledgers WHERE name = 'Bounced Cheque Charges'  ORDER BY id LIMIT 1) WHERE id = 1 AND bounce_fee_ledger_id IS NULL;
UPDATE accounting_settings SET cash_over_short_ledger_id = (SELECT id FROM ledgers WHERE name = 'Cash Over / Short'       ORDER BY id LIMIT 1) WHERE id = 1 AND cash_over_short_ledger_id IS NULL;

COMMIT;

SET SQL_SAFE_UPDATES = @old_safe;

-- PART D — RESULT CHECK. Expect 6 ledgers (each under the right group) and all five settings filled in.
SELECT l.id, l.name, g.name AS `group` FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id
WHERE l.name IN ('Bad Debts Written Off', 'Discount Allowed', 'Bank Charges', 'Bounced Cheque Charges', 'Cash Over / Short', 'Driver Cash') ORDER BY l.name;
SELECT bad_debt_ledger_id, discount_allowed_ledger_id, bank_charges_ledger_id, bounce_fee_ledger_id, cash_over_short_ledger_id FROM accounting_settings WHERE id = 1;
