-- =====================================================================
-- 49_stock_item_type.sql
-- Stock that is not only products. Every stock movement and every batch now says WHAT KIND of item
-- it is (item_type) and which one (item_id). Products stay as they are: item_type 'product_variant',
-- item_id = the variant. Menus ingredients, course books and so on will post with their own type.
-- variant_id stays (and keeps working) but may now be empty for items that are not products.
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Which of the new columns exist already? (0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name IN ('stock_movements', 'stock_batches') AND column_name IN ('item_type', 'item_id');

-- A2. How many movements and batches will be marked as products
SELECT (SELECT COUNT(*) FROM stock_movements) AS movements, (SELECT COUNT(*) FROM stock_batches) AS batches;

-- PART B — ADD THE COLUMNS (DDL, commits on its own)
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

CALL add_column_if_missing('stock_movements', 'item_type', "VARCHAR(40) NOT NULL DEFAULT 'product_variant'");
CALL add_column_if_missing('stock_movements', 'item_id',   'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('stock_batches',   'item_type', "VARCHAR(40) NOT NULL DEFAULT 'product_variant'");
CALL add_column_if_missing('stock_batches',   'item_id',   'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- items that are not products have no variant
ALTER TABLE stock_movements MODIFY variant_id BIGINT UNSIGNED NULL;
ALTER TABLE stock_batches   MODIFY variant_id BIGINT UNSIGNED NULL;

-- indexes, only if missing
SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'stock_movements' AND index_name = 'idx_movement_item');
SET @sql := IF(@has_idx = 0, 'ALTER TABLE stock_movements ADD INDEX idx_movement_item (item_type, item_id, movement_date)', 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'stock_batches' AND index_name = 'idx_batch_item');
SET @sql := IF(@has_idx = 0, 'ALTER TABLE stock_batches ADD INDEX idx_batch_item (item_type, item_id)', 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- PART C — MARK THE EXISTING ROWS AS PRODUCTS (transaction)
SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

UPDATE stock_movements SET item_type = 'product_variant', item_id = variant_id WHERE item_id IS NULL AND variant_id IS NOT NULL;
UPDATE stock_batches   SET item_type = 'product_variant', item_id = variant_id WHERE item_id IS NULL AND variant_id IS NOT NULL;

-- PART D — RESULT CHECK. Both numbers must be 0 before you COMMIT.
SELECT (SELECT COUNT(*) FROM stock_movements WHERE item_id IS NULL AND variant_id IS NOT NULL) AS movements_unmarked,
       (SELECT COUNT(*) FROM stock_batches   WHERE item_id IS NULL AND variant_id IS NOT NULL) AS batches_unmarked;

COMMIT;
SET SQL_SAFE_UPDATES = @old_safe;
