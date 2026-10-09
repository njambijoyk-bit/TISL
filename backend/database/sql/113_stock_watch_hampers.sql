-- =====================================================================
-- 113_stock_watch_hampers.sql
-- "Tell me when it is back" for hampers too (script 112 made it for products).
--   stock_watches.hamper_id      the hamper being waited for (then product_id and variant_id are 0)
--   stock_watch_runs.hamper_id   the same on the record of who was told
-- Existing requests are products and keep NULL. Safe to re-run.
-- Run in Workbench. DDL commits on its own; nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: 0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN ('stock_watches', 'stock_watch_runs') AND column_name = 'hamper_id';

-- PART B — CHANGE (DDL, commits on its own)
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
CREATE PROCEDURE add_index_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(190))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD KEY `', idx, '` (', cols, ')');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_column_if_missing('stock_watches', 'hamper_id', 'BIGINT UNSIGNED NULL AFTER variant_id');
CALL add_column_if_missing('stock_watch_runs', 'hamper_id', 'BIGINT UNSIGNED NULL AFTER variant_id');
CALL add_index_if_missing('stock_watches', 'idx_stock_watches_hamper', '`hamper_id`, `status`, `id`');
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

-- PART C — CHECK (expect: the column on both tables; every existing request is a product)
SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN ('stock_watches', 'stock_watch_runs') AND column_name = 'hamper_id';
SELECT COUNT(*) AS requests, SUM(hamper_id IS NULL) AS products_not_hampers FROM stock_watches;
