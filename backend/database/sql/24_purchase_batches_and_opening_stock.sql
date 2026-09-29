-- =====================================================================
-- 24_purchase_batches_and_opening_stock.sql   (PLATFORM_PLAN §17–18, step 3)
-- Batch number / manufacture date / expiry date on voucher lines, and the
-- Opening Stock voucher.
--
--   voucher_items.batch_no, mfg_date, expiry_date
--                     what a purchase / receipt line says about the batch it
--                     brings in (asked only for products that track expiry)
--   accounting_settings.opening_balance_ledger_id
--                     the ledger opening stock is balanced against
--                     ("Opening Stock Balance", under Capital)
--   voucher_types     + "Opening Stock" (base type opening_stock): Dr Stock,
--                     Cr the opening balance ledger; moves stock in
--   voucher_series    + WNKJ-OS- numbering for it
--
-- Run after 22 and 23. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Columns already present? (expect 0 rows on first run)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'voucher_items' AND column_name IN ('batch_no', 'mfg_date', 'expiry_date'))
    OR (table_name = 'accounting_settings' AND column_name = 'opening_balance_ledger_id'));

-- A2. Voucher types this script copies its settings from (expect 2 rows: journal + receipt_note)
SELECT id, code, base_type, stock_effect, has_items, party_kind, posts_accounts
FROM voucher_types WHERE base_type IN ('journal', 'receipt_note', 'opening_stock');

-- A3. The Capital group the opening ledger goes under (expect 1 row; if none the
--     ledger is skipped and you choose one under Books → Settings → Default ledgers)
SELECT id, name, nature FROM ledger_groups WHERE name = 'Capital';


-- ---------------------------------------------------------------------
-- PART B — ADD COLUMNS (DDL, commits on its own; each skips itself if present)
-- ---------------------------------------------------------------------

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

CALL add_column_if_missing('voucher_items', 'batch_no',    'VARCHAR(60) NULL');
CALL add_column_if_missing('voucher_items', 'mfg_date',    'DATE NULL');
CALL add_column_if_missing('voucher_items', 'expiry_date', 'DATE NULL');
CALL add_column_if_missing('accounting_settings', 'opening_balance_ledger_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;


-- ---------------------------------------------------------------------
-- PART C — OPENING STOCK VOUCHER TYPE, ITS NUMBERING AND ITS LEDGER
-- (transaction; re-running adds nothing that already exists)
-- ---------------------------------------------------------------------

SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

-- The ledger opening stock is balanced against.
SET @grp_capital := (SELECT id FROM ledger_groups WHERE name = 'Capital' ORDER BY id LIMIT 1);

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_capital, 'Opening Stock Balance', 0, 1, 1, NOW(), NOW()
WHERE @grp_capital IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Opening Stock Balance');

UPDATE accounting_settings
SET opening_balance_ledger_id = (SELECT id FROM ledgers WHERE name = 'Opening Stock Balance' ORDER BY id LIMIT 1)
WHERE id = 1 AND opening_balance_ledger_id IS NULL;

-- The voucher type. stock_effect comes from the Receipt Note row and party_kind from the Journal
-- row, so the values are always ones this database already uses.
INSERT INTO voucher_types (code, name, base_type, posts_accounts, stock_effect, has_items, party_kind, default_ledger_id, is_system, is_active, created_at, updated_at)
SELECT 'opening_stock', 'Opening Stock', 'opening_stock', 1, rn.stock_effect, 1, jr.party_kind, NULL, 1, 1, NOW(), NOW()
FROM voucher_types rn
JOIN voucher_types jr ON jr.base_type = 'journal'
WHERE rn.base_type = 'receipt_note'
  AND NOT EXISTS (SELECT 1 FROM voucher_types WHERE base_type = 'opening_stock')
ORDER BY rn.id, jr.id
LIMIT 1;

-- Its numbering: WNKJ-OS-0001, one series for every branch. Other columns follow the Journal's series.
INSERT INTO voucher_series (voucher_type_id, name, prefix, suffix, number_width, start_number, next_number, reset_period, last_reset_key, location_id, allow_manual, is_default, is_active, created_at, updated_at)
SELECT t.id, 'Opening Stock', 'WNKJ-OS-', js.suffix, js.number_width, 1, 1, 'never', NULL, NULL, js.allow_manual, 1, 1, NOW(), NOW()
FROM voucher_types t
JOIN voucher_types jt ON jt.base_type = 'journal'
JOIN voucher_series js ON js.voucher_type_id = jt.id
WHERE t.base_type = 'opening_stock'
  AND NOT EXISTS (SELECT 1 FROM voucher_series WHERE voucher_type_id = t.id)
ORDER BY js.is_default DESC, js.id
LIMIT 1;

COMMIT;

SET SQL_SAFE_UPDATES = @old_safe;


-- ---------------------------------------------------------------------
-- PART D — RESULT CHECK. Expect: the type and its series exist, the setting is filled in.
-- ---------------------------------------------------------------------

SELECT t.id, t.code, t.name, t.base_type, t.stock_effect, t.has_items, t.posts_accounts, s.prefix, s.next_number
FROM voucher_types t LEFT JOIN voucher_series s ON s.voucher_type_id = t.id
WHERE t.base_type = 'opening_stock';

SELECT s.stock_ledger_id, s.opening_balance_ledger_id, l.name AS opening_ledger
FROM accounting_settings s LEFT JOIN ledgers l ON l.id = s.opening_balance_ledger_id
WHERE s.id = 1;
