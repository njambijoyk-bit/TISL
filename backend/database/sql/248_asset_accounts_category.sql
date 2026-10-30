-- =====================================================================
-- 248_asset_accounts_category.sql
-- Assets made from a Fixed Assets ledger in Books sit in the category "Fixed Assets", but still post to their own ledger's accounts (asset, accumulated depreciation, depreciation).
-- inventory_items.accounts_category_id points at the asset type that holds those accounts; empty = the item's own category does (as before). Run script 71 first.
-- Nothing else changes. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 0 rows on the first run.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_items' AND column_name = 'accounts_category_id';

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
CALL add_column_if_missing('inventory_items', 'accounts_category_id', 'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- Assets already made from a ledger (their item sits in the ledger's own type, which has a parent called "Fixed Assets"): move them up and keep the pointer.
UPDATE inventory_items i
JOIN inventory_categories c ON c.id = i.category_id AND c.parent_id IS NOT NULL
JOIN inventory_categories p ON p.id = c.parent_id AND p.name = 'Fixed Assets' AND p.parent_id IS NULL
SET i.accounts_category_id = c.id, i.category_id = p.id
WHERE i.id > 0 AND i.accounts_category_id IS NULL AND c.asset_ledger_id IS NOT NULL AND i.name = c.name;

-- PART C - CHECK. Expect 1 row.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_items' AND column_name = 'accounts_category_id';
