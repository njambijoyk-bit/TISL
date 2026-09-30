-- =====================================================================
-- 38_ledger_payment_characteristics.sql
-- Cash, bank and mobile-money ledgers say how they are paid into and whether the
-- storefront offers them at checkout. All optional; nothing changes until you fill them in.
--
--   account_name, swift_code, branch_code   (bank_name, account_number, branch already exist)
--   accepts            comma list of: eft, transfer, cheque, card, mobile
--   mobile_kind        till | paybill | send        mobile_number   the till / paybill / phone number
--   cash_kind          till | petty | driver | undeposited   (driver = cash on delivery)
--   offer_at_checkout  1 = customers can choose this ledger as how they will pay
--   checkout_label, checkout_instructions, checkout_sort   what the customer sees
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Columns already present? (expect 0 rows on first run)
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'ledgers'
  AND column_name IN ('account_name', 'swift_code', 'branch_code', 'accepts', 'mobile_kind', 'mobile_number', 'cash_kind',
                      'offer_at_checkout', 'checkout_label', 'checkout_instructions', 'checkout_sort');

-- A2. The bank fields that already exist (expect 3 rows: bank_name, account_number, branch)
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'ledgers' AND column_name IN ('bank_name', 'account_number', 'branch');

-- A3. Your cash and bank ledgers today, so you know what you will be filling in
SELECT l.id, l.name, g.name AS `group` FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id
WHERE g.name IN ('Cash-in-hand', 'Bank Accounts') ORDER BY g.name, l.name;

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

CALL add_column_if_missing('ledgers', 'account_name',          'VARCHAR(120) NULL');
CALL add_column_if_missing('ledgers', 'swift_code',            'VARCHAR(20) NULL');
CALL add_column_if_missing('ledgers', 'branch_code',           'VARCHAR(20) NULL');
CALL add_column_if_missing('ledgers', 'accepts',               'VARCHAR(120) NULL');
CALL add_column_if_missing('ledgers', 'mobile_kind',           'VARCHAR(10) NULL');
CALL add_column_if_missing('ledgers', 'mobile_number',         'VARCHAR(30) NULL');
CALL add_column_if_missing('ledgers', 'cash_kind',             'VARCHAR(12) NULL');
CALL add_column_if_missing('ledgers', 'offer_at_checkout',     'TINYINT(1) NOT NULL DEFAULT 0');
CALL add_column_if_missing('ledgers', 'checkout_label',        'VARCHAR(80) NULL');
CALL add_column_if_missing('ledgers', 'checkout_instructions', 'TEXT NULL');
CALL add_column_if_missing('ledgers', 'checkout_sort',         'INT NOT NULL DEFAULT 0');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — RESULT CHECK. Expect 11 rows (the new columns) and every ledger still offered = 0 until you tick it.
SELECT column_name, column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'ledgers'
  AND column_name IN ('account_name', 'swift_code', 'branch_code', 'accepts', 'mobile_kind', 'mobile_number', 'cash_kind',
                      'offer_at_checkout', 'checkout_label', 'checkout_instructions', 'checkout_sort')
ORDER BY column_name;
SELECT COUNT(*) AS offered_now FROM ledgers WHERE offer_at_checkout = 1;
