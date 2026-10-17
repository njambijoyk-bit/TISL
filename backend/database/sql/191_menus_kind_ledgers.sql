-- =====================================================================
-- 191_menus_kind_ledgers.sql
-- Menus: each kind of ingredient names the account its cost is CHARGED TO when it is used, and a new kind for things the kitchen uses up that are not food.
--   menus_ingredient_kinds.used_up            a fifth use: "used up by the kitchen" (gloves, cleaning, foil, napkins)
--   menus_ingredient_kinds.expense_ledger_id  the account the cost is charged to when stock of this kind is used (a real foreign key to ledgers)
--   a new account "Kitchen Supplies Used" under Direct Expenses (only if there is none)
--   a new kind "Supplies" (used up, charged to Kitchen Supplies Used)
--   the other kinds are filled in: Cooking ingredient, Ready to serve, Condiment or extra -> Food Cost of Sales; Packaging -> Kitchen Supplies Used
-- Waste is a different thing and still goes to Food Waste Expense: a dropped box of gloves is waste, using a glove is not.
-- Run 190 first. Safe to re-run (nothing is added twice). Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. the kinds now, and whether the new columns are there (0 rows on the first run)
SELECT id, code, name FROM menus_ingredient_kinds ORDER BY sort_order;
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_ingredient_kinds' AND column_name IN ('used_up', 'expense_ledger_id');
-- A2. the accounts this fills in from (Food Cost of Sales, and Kitchen Supplies Used once B has run)
SELECT id, name, group_id FROM ledgers WHERE name IN ('Food Cost of Sales', 'Kitchen Supplies Used');

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

CALL add_column_if_missing('menus_ingredient_kinds', 'used_up', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL add_column_if_missing('menus_ingredient_kinds', 'expense_ledger_id', 'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- the account for what the kitchen uses up
SET @grp_direct := (SELECT id FROM ledger_groups WHERE name = 'Direct Expenses' ORDER BY id LIMIT 1);
INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_direct, 'Kitchen Supplies Used', 0, 0, 1, NOW(), NOW()
WHERE @grp_direct IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Kitchen Supplies Used');

-- the new kind
INSERT INTO menus_ingredient_kinds (code, name, in_recipes, sold_as_is, free_extra, packaging, used_up, sort_order, created_at, updated_at)
SELECT v.code, v.name, v.in_recipes, v.sold_as_is, v.free_extra, v.packaging, v.used_up, v.sort_order, NOW(), NOW() FROM (
SELECT 'supplies' AS code, 'Supplies' AS name, 0 AS in_recipes, 0 AS sold_as_is, 0 AS free_extra, 0 AS packaging, 1 AS used_up, 5 AS sort_order
) v WHERE NOT EXISTS (SELECT 1 FROM menus_ingredient_kinds k WHERE k.code = v.code);

-- the account each kind is charged to (only kinds that have none yet; the id test is for Workbench's safe-update mode)
UPDATE menus_ingredient_kinds SET expense_ledger_id = (SELECT id FROM ledgers WHERE name = 'Food Cost of Sales' ORDER BY id LIMIT 1)
 WHERE expense_ledger_id IS NULL AND id > 0 AND code IN ('cooking', 'ready_to_serve', 'condiment');
UPDATE menus_ingredient_kinds SET expense_ledger_id = (SELECT id FROM ledgers WHERE name = 'Kitchen Supplies Used' ORDER BY id LIMIT 1)
 WHERE expense_ledger_id IS NULL AND id > 0 AND code IN ('packaging', 'supplies');

-- the foreign key: an account a kind is charged to cannot be deleted
DROP PROCEDURE IF EXISTS add_kind_ledger_fk_if_missing;
DELIMITER $$
CREATE PROCEDURE add_kind_ledger_fk_if_missing()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'menus_ingredient_kinds' AND constraint_name = 'fk_menus_ingredient_kinds_ledger') THEN
        ALTER TABLE menus_ingredient_kinds ADD CONSTRAINT fk_menus_ingredient_kinds_ledger FOREIGN KEY (expense_ledger_id) REFERENCES ledgers (id) ON DELETE RESTRICT;
    END IF;
END$$
DELIMITER ;

CALL add_kind_ledger_fk_if_missing();
DROP PROCEDURE IF EXISTS add_kind_ledger_fk_if_missing;

-- PART C - CHECK AFTER
-- C1. the five kinds with the account each is charged to (none empty)
SELECT k.code, k.name, k.used_up, l.name AS charged_to FROM menus_ingredient_kinds k LEFT JOIN ledgers l ON l.id = k.expense_ledger_id ORDER BY k.sort_order;
-- C2. the new account is under Direct Expenses (1 row)
SELECT l.id, l.name, g.name AS under FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE l.name = 'Kitchen Supplies Used';
-- C3. the foreign key is there (1 row)
SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'menus_ingredient_kinds' AND constraint_name = 'fk_menus_ingredient_kinds_ledger';
