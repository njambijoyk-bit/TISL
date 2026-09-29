-- =====================================================================
-- 22_stock_fields_and_ledgers.sql        (PLATFORM_PLAN §17–18, step 1)
-- Two switches on every product + the ledgers valued stock posts to.
--
--   products.is_for_sale   1 = sold to customers (default). 0 = a material /
--                          ingredient / consumable: counted and valued but
--                          hidden from the storefront and the till.
--   products.track_expiry  0 = no batch number / expiry asked (default).
--                          1 = batch number + expiry date asked on receipt.
--
--   accounting_settings gains five ledger pointers, seeded below:
--     stock_ledger_id            Stock                (Current Assets > Stock-in-hand)
--     cogs_ledger_id             Cost of Goods Sold   (Direct Expenses)
--     cost_of_services_ledger_id Cost of Services     (Direct Expenses)
--     job_materials_ledger_id    Job Materials Cost   (Direct Expenses)
--     stock_loss_ledger_id       Stock Loss           (Direct Expenses)
--
-- Number note: numbered 22 to follow script 21. Rename if your own numbering
-- differs; nothing else refers to the number.
-- Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Columns already present? (expect 0 rows on first run)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'products' AND column_name IN ('is_for_sale', 'track_expiry'))
    OR (table_name = 'accounting_settings' AND column_name IN
        ('stock_ledger_id', 'cogs_ledger_id', 'cost_of_services_ledger_id',
         'job_materials_ledger_id', 'stock_loss_ledger_id')));

-- A2. The groups the new ledgers go under (expect 2 rows: both must exist)
SELECT id, name, nature FROM ledger_groups
WHERE name IN ('Stock-in-hand', 'Direct Expenses');

-- A3. Ledgers with the new names already there? (expect 0 rows on first run)
SELECT id, name, group_id FROM ledgers
WHERE name IN ('Stock', 'Cost of Goods Sold', 'Cost of Services', 'Job Materials Cost', 'Stock Loss');


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

CALL add_column_if_missing('products', 'is_for_sale',   'TINYINT(1) NOT NULL DEFAULT 1 AFTER `in_stock`');
CALL add_column_if_missing('products', 'track_expiry',  'TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_for_sale`');

CALL add_column_if_missing('accounting_settings', 'stock_ledger_id',            'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'cogs_ledger_id',             'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'cost_of_services_ledger_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'job_materials_ledger_id',    'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'stock_loss_ledger_id',       'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;


-- ---------------------------------------------------------------------
-- PART C — SEED THE LEDGERS AND POINT THE SETTINGS AT THEM
-- (transaction; re-running adds nothing that already exists)
-- ---------------------------------------------------------------------

SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

SET @grp_stock  := (SELECT id FROM ledger_groups WHERE name = 'Stock-in-hand'  ORDER BY id LIMIT 1);
SET @grp_direct := (SELECT id FROM ledger_groups WHERE name = 'Direct Expenses' ORDER BY id LIMIT 1);

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_stock, 'Stock', 0, 1, 1, NOW(), NOW()
WHERE @grp_stock IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Stock');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_direct, 'Cost of Goods Sold', 0, 1, 1, NOW(), NOW()
WHERE @grp_direct IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Cost of Goods Sold');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_direct, 'Cost of Services', 0, 1, 1, NOW(), NOW()
WHERE @grp_direct IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Cost of Services');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_direct, 'Job Materials Cost', 0, 1, 1, NOW(), NOW()
WHERE @grp_direct IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Job Materials Cost');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_direct, 'Stock Loss', 0, 1, 1, NOW(), NOW()
WHERE @grp_direct IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Stock Loss');

-- The settings row is created by the app on first use; make sure it exists.
INSERT INTO accounting_settings (id, edit_window_days)
SELECT 1, 30 WHERE NOT EXISTS (SELECT 1 FROM accounting_settings WHERE id = 1);

-- Point each setting at its ledger — only where nothing is chosen yet.
UPDATE accounting_settings SET stock_ledger_id            = (SELECT id FROM ledgers WHERE name = 'Stock'              ORDER BY id LIMIT 1) WHERE id = 1 AND stock_ledger_id IS NULL;
UPDATE accounting_settings SET cogs_ledger_id             = (SELECT id FROM ledgers WHERE name = 'Cost of Goods Sold' ORDER BY id LIMIT 1) WHERE id = 1 AND cogs_ledger_id IS NULL;
UPDATE accounting_settings SET cost_of_services_ledger_id = (SELECT id FROM ledgers WHERE name = 'Cost of Services'   ORDER BY id LIMIT 1) WHERE id = 1 AND cost_of_services_ledger_id IS NULL;
UPDATE accounting_settings SET job_materials_ledger_id    = (SELECT id FROM ledgers WHERE name = 'Job Materials Cost' ORDER BY id LIMIT 1) WHERE id = 1 AND job_materials_ledger_id IS NULL;
UPDATE accounting_settings SET stock_loss_ledger_id       = (SELECT id FROM ledgers WHERE name = 'Stock Loss'         ORDER BY id LIMIT 1) WHERE id = 1 AND stock_loss_ledger_id IS NULL;

COMMIT;

SET SQL_SAFE_UPDATES = @old_safe;


-- ---------------------------------------------------------------------
-- PART D — RESULT CHECK. Expect: every existing product for sale, none
-- tracking expiry, five ledgers, and all five settings filled in.
-- ---------------------------------------------------------------------

SELECT COUNT(*) AS products,
       SUM(is_for_sale = 1)  AS for_sale,
       SUM(is_for_sale = 0)  AS not_for_sale,
       SUM(track_expiry = 1) AS tracking_expiry
FROM products;

SELECT l.id, l.name, g.name AS `group`
FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id
WHERE l.name IN ('Stock', 'Cost of Goods Sold', 'Cost of Services', 'Job Materials Cost', 'Stock Loss');

SELECT stock_ledger_id, cogs_ledger_id, cost_of_services_ledger_id,
       job_materials_ledger_id, stock_loss_ledger_id
FROM accounting_settings WHERE id = 1;
