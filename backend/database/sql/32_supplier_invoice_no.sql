-- =====================================================================
-- 32_supplier_invoice_no.sql
-- The supplier's own invoice number on purchase vouchers, separate from the
-- free "Ref" field (LPO number, delivery note number ...).
--
--   vouchers.supplier_invoice_no   the number printed on the supplier's invoice
--   index (party_ledger_id, supplier_invoice_no)   so a repeat is found fast
--
-- Not unique: the app only WARNS when the same supplier is billed twice under
-- one number. Existing purchase vouchers had the supplier's invoice number in
-- "Ref", so those are copied across (purchase and debit note types only; a goods-received Ref is a delivery note number, so it stays put).
-- Also checks the supplier tables the vendor list uses.
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Column already there? (expect 0 rows on first run)
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'supplier_invoice_no';

-- A2. The tables the vendor list needs (expect 3 rows: vendors, ledgers, users).
--     If 'vendors' is missing, tell me before going further.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('vendors', 'ledgers', 'users');

-- A3. The ledger's supplier link exists (expect 1 row)
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'ledgers' AND column_name = 'supplier_id';

-- A4. How many purchase-type vouchers have a Ref that will be copied (before the copy)
SELECT COUNT(*) AS purchase_vouchers_with_ref
FROM vouchers v JOIN voucher_types t ON t.id = v.voucher_type_id
WHERE t.base_type IN ('purchase', 'debit_note') AND v.reference_no IS NOT NULL AND v.reference_no <> '';

-- PART B — ADD THE COLUMN AND INDEX (DDL, commits on its own)
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

CALL add_column_if_missing('vouchers', 'supplier_invoice_no', 'VARCHAR(100) NULL AFTER `reference_no`');

DROP PROCEDURE IF EXISTS add_column_if_missing;

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND index_name = 'idx_voucher_supplier_invoice');
SET @s := IF(@has_idx = 0, 'CREATE INDEX idx_voucher_supplier_invoice ON vouchers (party_ledger_id, supplier_invoice_no)', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- PART C — COPY EXISTING Refs (transaction; only fills empty ones, so re-running changes nothing)
SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

UPDATE vouchers v JOIN voucher_types t ON t.id = v.voucher_type_id
SET v.supplier_invoice_no = v.reference_no
WHERE t.base_type IN ('purchase', 'debit_note')
  AND (v.supplier_invoice_no IS NULL OR v.supplier_invoice_no = '')
  AND v.reference_no IS NOT NULL AND v.reference_no <> '';

COMMIT;

SET SQL_SAFE_UPDATES = @old_safe;

-- PART D — RESULT CHECK. Expect 1 row for the column, and the count of vouchers now carrying a supplier invoice no.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'supplier_invoice_no';
SELECT COUNT(*) AS vouchers_with_supplier_invoice_no FROM vouchers WHERE supplier_invoice_no IS NOT NULL AND supplier_invoice_no <> '';
