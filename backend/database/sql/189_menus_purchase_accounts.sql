-- =====================================================================
-- 189_menus_purchase_accounts.sql
-- Ingredients are bought under a PURCHASE ACCOUNT, as products are: the account's tax setting decides the VAT on the purchase (the stock itself is still carried on Food Ingredients Inventory).
--   menus_ingredients.purchase_ledger_id   the purchase account an ingredient is bought under (empty: the one in Menus, Configuration, else the Books default purchase account)
--   two purchase accounts beside "Purchases" (VAT-able), copying the tax of the matching sales accounts:
--     Purchases - exempt        copies the tax of  Sales - exempt
--     Purchases - zero rated    copies the tax of  Sales - zero rated
-- Run 181 to 188 first. Safe to re-run (nothing is added twice). Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. the group and the ledgers this builds on (expect the group, and Purchases, Sales - exempt, Sales - zero rated)
SELECT id, name, behaviour FROM ledger_groups WHERE name = 'Purchase Accounts';
SELECT id, name, group_id, tax_nature, tax_rate_ledger_id, side, is_active FROM ledgers WHERE name IN ('Purchases', 'Purchases - exempt', 'Purchases - zero rated', 'Sales - exempt', 'Sales - zero rated');
-- A2. is the column there already? (0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_ingredients' AND column_name = 'purchase_ledger_id';

-- PART B - ADD THE COLUMN
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

CALL add_column_if_missing('menus_ingredients', 'purchase_ledger_id', 'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART B2 - THE TWO PURCHASE ACCOUNTS
INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, tax_nature, tax_rate_ledger_id, side, created_at, updated_at)
SELECT p.group_id, m.new_name, 0, 0, 1, src.tax_nature, src.tax_rate_ledger_id, p.side, NOW(), NOW()
  FROM (SELECT 'Sales - exempt' AS old_name, 'Purchases - exempt' AS new_name UNION ALL SELECT 'Sales - zero rated', 'Purchases - zero rated') m
  JOIN ledgers src ON src.name = m.old_name
  JOIN ledgers p ON p.name = 'Purchases'
 WHERE NOT EXISTS (SELECT 1 FROM ledgers l WHERE l.name = m.new_name);

-- PART C - CHECK AFTER
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_ingredients' AND column_name = 'purchase_ledger_id';
SELECT id, name, group_id, tax_nature, tax_rate_ledger_id FROM ledgers WHERE name IN ('Purchases', 'Purchases - exempt', 'Purchases - zero rated');
