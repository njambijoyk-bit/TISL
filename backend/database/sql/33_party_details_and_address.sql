-- =====================================================================
-- 33_party_details_and_address.sql
-- 1) An address on every ledger (customers' ledgers under Sundry Debtors,
--    vendors under Sundry Creditors, any party).
-- 2) "Party details" on a voucher: who a cash purchase was from / a walk-in
--    sale was to, when they are not a ledger (name, phone, address, tax id).
--
--   ledgers.address                 free-text address
--   vouchers.party_name / party_phone / party_address / party_tax_id
--
-- A purchase paid at once (cash / bank / M-Pesa) needs no new column: the app
-- posts it to the cash or bank ledger instead of the supplier, so no debt.
-- Existing vendor addresses are copied to their ledgers, and vendors.user_id becomes optional (no vendor login).
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Columns already there? (expect 0 rows on first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'ledgers' AND column_name = 'address')
    OR (table_name = 'vouchers' AND column_name IN ('party_name', 'party_phone', 'party_address', 'party_tax_id')));

-- A2. Vendor addresses that will be copied to their ledgers (expect 0 if you have no vendors yet)
SELECT COUNT(*) AS vendor_addresses_to_copy
FROM vendors v JOIN ledgers l ON l.supplier_id = v.id
WHERE v.address IS NOT NULL AND v.address <> '' AND (l.address IS NULL OR l.address = '');

-- A3. Can a vendor exist without a login user? (vendors.user_id must be YES; if it says NO, part B changes it)
SELECT column_name, is_nullable, column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'user_id';

-- PART B — ADD THE COLUMNS (DDL, commits on its own; each skips itself if present)
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

CALL add_column_if_missing('ledgers',  'address',       'TEXT NULL');
CALL add_column_if_missing('vouchers', 'party_name',    'VARCHAR(150) NULL AFTER `supplier_invoice_no`');
CALL add_column_if_missing('vouchers', 'party_phone',   'VARCHAR(50) NULL AFTER `party_name`');
CALL add_column_if_missing('vouchers', 'party_address', 'VARCHAR(255) NULL AFTER `party_phone`');
CALL add_column_if_missing('vouchers', 'party_tax_id',  'VARCHAR(50) NULL AFTER `party_address`');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- Vendors no longer have a login, so their user link becomes optional (skips itself if already optional)
SET @needs := (SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'user_id' AND is_nullable = 'NO');
SET @s := IF(@needs > 0, 'ALTER TABLE vendors MODIFY user_id BIGINT UNSIGNED NULL', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- PART C — COPY EXISTING VENDOR ADDRESSES (transaction; only fills empty ones)
SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

UPDATE ledgers l JOIN vendors v ON v.id = l.supplier_id
SET l.address = v.address
WHERE v.address IS NOT NULL AND v.address <> '' AND (l.address IS NULL OR l.address = '');

COMMIT;

SET SQL_SAFE_UPDATES = @old_safe;

-- PART D — RESULT CHECK. Expect 5 rows (the five columns), then user_id nullable = YES.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'ledgers' AND column_name = 'address')
    OR (table_name = 'vouchers' AND column_name IN ('party_name', 'party_phone', 'party_address', 'party_tax_id')));

SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'user_id';
