-- =====================================================================
-- 187_menus_core_stock.sql
-- The kitchen's ingredients take part in the core Stock pages (Purchases menu): purchases, opening stock, counts, transfers, the stock journal and the stock reports.
--   voucher_items.ingredient_item_id        a voucher line can be an ingredient variant (item = the ingredient, variant = its variant); on Purchase, Goods received and Opening stock vouchers
--   menus_stock_batches.voucher_id / voucher_item_id   the voucher line a lot of ingredient came in on (so cancelling the voucher takes it off the shelf again)
--   stock_count_ingredient_lines            what a stock count asks about each ingredient variant (counted in packs, the bigger unit or the base unit)
--   stock_counts.ingredient_voucher_id      the Journal a count of ingredients made
--   stock_transfer_ingredient_lines         ingredient lots on the road between branches (the same Sent / Received steps as products)
-- Run 181 to 186 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'voucher_items' AND column_name = 'ingredient_item_id') OR (table_name = 'menus_stock_batches' AND column_name IN ('voucher_id', 'voucher_item_id')) OR (table_name = 'stock_counts' AND column_name = 'ingredient_voucher_id'));
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('stock_count_ingredient_lines', 'stock_transfer_ingredient_lines');

-- PART B - CREATE
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

CALL add_column_if_missing('voucher_items', 'ingredient_item_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_stock_batches', 'voucher_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_stock_batches', 'voucher_item_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('stock_counts', 'ingredient_voucher_id', 'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS stock_count_ingredient_lines (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    count_id     BIGINT UNSIGNED NOT NULL,
    item_id      BIGINT UNSIGNED NOT NULL,                         -- menus_ingredient_items
    expected_qty DECIMAL(18,4) NOT NULL,                           -- base unit: what the books say is on the shelf
    counted_qty  DECIMAL(18,4) NULL,                               -- base unit: what was found (empty = not counted)
    input_qty    DECIMAL(18,4) NULL,                               -- as typed
    input_unit   VARCHAR(8) NULL,                                  -- pack | alt | base
    unit_cost    DECIMAL(18,6) NOT NULL DEFAULT 0,                 -- average cost of one base unit when the count started
    variance_qty DECIMAL(18,4) NULL,                               -- base unit: counted less what was there when it was posted
    value_change DECIMAL(18,2) NULL,                               -- what that difference is worth (a loss is negative)
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_stock_count_ing (count_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_transfer_ingredient_lines (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    transfer_id   BIGINT UNSIGNED NOT NULL,
    item_id       BIGINT UNSIGNED NOT NULL,                        -- menus_ingredient_items
    batch_id      BIGINT UNSIGNED NOT NULL,                        -- the lot it left (menus_stock_batches)
    quantity      DECIMAL(18,4) NOT NULL,                          -- base unit
    unit_cost     DECIMAL(18,6) NOT NULL DEFAULT 0,
    received_qty  DECIMAL(18,4) NULL,                              -- base unit: what arrived
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_stock_transfer_ing (transfer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'voucher_items' AND column_name = 'ingredient_item_id') OR (table_name = 'menus_stock_batches' AND column_name IN ('voucher_id', 'voucher_item_id')) OR (table_name = 'stock_counts' AND column_name = 'ingredient_voucher_id'));
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('stock_count_ingredient_lines', 'stock_transfer_ingredient_lines');
