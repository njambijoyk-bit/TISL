-- =====================================================================
-- 192_menus_kind_stock_ledgers.sql
-- Menus: each kind of ingredient also names the account its STOCK is carried on while it is on the shelf, so gloves and soap are not counted as food.
--   menus_ingredient_kinds.stock_ledger_id   the account the stock is carried on (a real foreign key to ledgers)
--   a new account "Kitchen Supplies Inventory" under Stock-in-hand (only if there is none)
--   Cooking ingredient, Ready to serve, Condiment or extra -> Food Ingredients Inventory; Packaging and Supplies -> Kitchen Supplies Inventory
-- Purchases, opening stock, goods received, debit notes, counts, transfers, waste and use all follow the kind's accounts from now on. Stock already on the books stays where it was
-- posted: if you entered test stock of gloves, soap, boxes or bags before this, cancel those vouchers and enter them again.
-- Run 190 and 191 first. Safe to re-run (nothing is added twice). Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. the kinds, and whether the new column is there (0 rows the first time)
SELECT id, code, name FROM menus_ingredient_kinds ORDER BY sort_order;
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_ingredient_kinds' AND column_name = 'stock_ledger_id';
-- A2. the accounts this fills in from
SELECT id, name, group_id FROM ledgers WHERE name IN ('Food Ingredients Inventory', 'Kitchen Supplies Inventory');
-- A3. supplies or packaging stock already on the books under Food Ingredients Inventory (cancel and re-enter these after B)
SELECT i.name AS ingredient, k.name AS kind, COALESCE(SUM(b.qty_left * b.unit_cost), 0) AS value_on_shelf
  FROM menus_ingredients i JOIN menus_ingredient_kinds k ON k.id = i.kind_id AND k.code IN ('packaging', 'supplies')
  JOIN menus_ingredient_items it ON it.ingredient_id = i.id LEFT JOIN menus_stock_batches b ON b.item_id = it.id
 GROUP BY i.id, i.name, k.name HAVING value_on_shelf > 0;

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

CALL add_column_if_missing('menus_ingredient_kinds', 'stock_ledger_id', 'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- the account for supplies on the shelf
SET @grp_stock := (SELECT id FROM ledger_groups WHERE name = 'Stock-in-hand' ORDER BY id LIMIT 1);
INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_stock, 'Kitchen Supplies Inventory', 0, 0, 1, NOW(), NOW()
WHERE @grp_stock IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Kitchen Supplies Inventory');

-- the account each kind is carried on (only kinds that have none yet; the id test is for Workbench's safe-update mode)
UPDATE menus_ingredient_kinds SET stock_ledger_id = (SELECT id FROM ledgers WHERE name = 'Food Ingredients Inventory' ORDER BY id LIMIT 1)
 WHERE stock_ledger_id IS NULL AND id > 0 AND code IN ('cooking', 'ready_to_serve', 'condiment');
UPDATE menus_ingredient_kinds SET stock_ledger_id = (SELECT id FROM ledgers WHERE name = 'Kitchen Supplies Inventory' ORDER BY id LIMIT 1)
 WHERE stock_ledger_id IS NULL AND id > 0 AND code IN ('packaging', 'supplies');

-- the foreign key
DROP PROCEDURE IF EXISTS add_kind_stock_fk_if_missing;
DELIMITER $$
CREATE PROCEDURE add_kind_stock_fk_if_missing()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'menus_ingredient_kinds' AND constraint_name = 'fk_menus_ingredient_kinds_stock_ledger') THEN
        ALTER TABLE menus_ingredient_kinds ADD CONSTRAINT fk_menus_ingredient_kinds_stock_ledger FOREIGN KEY (stock_ledger_id) REFERENCES ledgers (id) ON DELETE RESTRICT;
    END IF;
END$$
DELIMITER ;

CALL add_kind_stock_fk_if_missing();
DROP PROCEDURE IF EXISTS add_kind_stock_fk_if_missing;

-- PART C - CHECK AFTER
-- C1. the kinds with the account the stock is carried on and the account the cost is charged to (none empty)
SELECT k.code, k.name, s.name AS stock_carried_on, e.name AS charged_to_when_used FROM menus_ingredient_kinds k LEFT JOIN ledgers s ON s.id = k.stock_ledger_id LEFT JOIN ledgers e ON e.id = k.expense_ledger_id ORDER BY k.sort_order;
-- C2. the new account is under Stock-in-hand (1 row)
SELECT l.id, l.name, g.name AS under FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE l.name = 'Kitchen Supplies Inventory';
-- C3. the foreign key is there (1 row)
SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'menus_ingredient_kinds' AND constraint_name = 'fk_menus_ingredient_kinds_stock_ledger';
