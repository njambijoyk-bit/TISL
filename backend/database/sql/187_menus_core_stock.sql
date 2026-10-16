-- =====================================================================
-- 187_menus_core_stock.sql
-- The kitchen's ingredients take part in the core Stock pages (Purchases menu): purchases, opening stock, counts, transfers, the stock journal and the stock reports.
--   voucher_items.ingredient_item_id        a voucher line can be an ingredient variant (item = the ingredient, variant = its variant); on Purchase, Goods received and Opening stock vouchers
--   menus_stock_batches.voucher_id / voucher_item_id   the voucher line a lot of ingredient came in on (so cancelling the voucher takes it off the shelf again)
--   stock_count_ingredient_lines            what a stock count asks about each ingredient variant (counted in packs, the bigger unit or the base unit)
--   stock_counts.ingredient_voucher_id      the Journal a count of ingredients made
--   stock_transfer_ingredient_lines         ingredient lots on the road between branches (the same Sent / Received steps as products)
--   stock_movements                         the movements the kitchen made before today are copied in, so the stock journal and the stock reports show them too (new ones arrive by themselves)
-- Run 181 to 186 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'voucher_items' AND column_name = 'ingredient_item_id') OR (table_name = 'menus_stock_batches' AND column_name IN ('voucher_id', 'voucher_item_id')) OR (table_name = 'stock_counts' AND column_name = 'ingredient_voucher_id'));
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('stock_count_ingredient_lines', 'stock_transfer_ingredient_lines');
-- how many kitchen movements are not yet in the stock journal (those made before the first copied one)
SELECT COUNT(*) AS movements_to_copy FROM menus_stock_moves m
 WHERE m.created_at < COALESCE((SELECT MIN(x.created_at) FROM stock_movements x WHERE x.item_type = 'menus_ingredient_item'), '9999-12-31');

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

-- PART B2 - COPY THE KITCHEN'S EARLIER MOVEMENTS INTO THE STOCK JOURNAL (run after part B; running it again copies nothing more)
INSERT INTO stock_movements (voucher_id, voucher_item_id, variant_id, location_id, quantity, movement_type, movement_date, created_at, batch_id, unit_cost, ref_type, ref_id, reversed, item_type, item_id)
SELECT m.voucher_id, NULL, NULL, m.location_id, m.quantity,
       CASE m.kind WHEN 'purchase' THEN 'purchase' WHEN 'opening' THEN 'opening_stock' WHEN 'use' THEN 'ingredient_use' WHEN 'use_reversal' THEN 'ingredient_use'
                   WHEN 'waste' THEN 'write_off' WHEN 'waste_reversal' THEN 'write_off' WHEN 'transfer_out' THEN 'transfer_out' WHEN 'transfer_in' THEN 'transfer_in'
                   WHEN 'count' THEN IF(m.quantity < 0, 'count_loss', 'count_gain') WHEN 'reversal' THEN 'reversal' ELSE m.kind END,
       m.moved_on, m.created_at, NULL, m.unit_cost, CASE WHEN m.ref_type = 'transfer' THEN 'menus_transfer' ELSE COALESCE(m.ref_type, m.kind) END, m.ref_id, 0, 'menus_ingredient_item', m.item_id
  FROM menus_stock_moves m
 WHERE m.created_at < COALESCE((SELECT MIN(x.created_at) FROM stock_movements x WHERE x.item_type = 'menus_ingredient_item'), '9999-12-31');

-- PART C - CHECK AFTER
SELECT COUNT(*) AS movements_still_to_copy FROM menus_stock_moves m
 WHERE m.created_at < COALESCE((SELECT MIN(x.created_at) FROM stock_movements x WHERE x.item_type = 'menus_ingredient_item'), '9999-12-31');
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'voucher_items' AND column_name = 'ingredient_item_id') OR (table_name = 'menus_stock_batches' AND column_name IN ('voucher_id', 'voucher_item_id')) OR (table_name = 'stock_counts' AND column_name = 'ingredient_voucher_id'));
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('stock_count_ingredient_lines', 'stock_transfer_ingredient_lines');
