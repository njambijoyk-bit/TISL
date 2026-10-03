-- =====================================================================
-- 70b_assets_drop_stock_columns.sql
-- Run AFTER 70 (and its COMMIT). Drops the two stock-only columns from inventory_items:
--   product_id (the link to shop products) and low_stock_threshold.
-- DDL, commits on its own. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECK (before: 2 rows; after: 0 rows)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_items'
  AND column_name IN ('product_id', 'low_stock_threshold');

-- PART B — DROP
DROP PROCEDURE IF EXISTS drop_column_and_fks;
DELIMITER $$
CREATE PROCEDURE drop_column_and_fks(IN tbl VARCHAR(64), IN col VARCHAR(64))
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE fk VARCHAR(64);
    DECLARE cur CURSOR FOR SELECT constraint_name FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col AND referenced_table_name IS NOT NULL;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
    OPEN cur;
    fk_loop: LOOP
        FETCH cur INTO fk;
        IF done = 1 THEN LEAVE fk_loop; END IF;
        SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP FOREIGN KEY `', fk, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END LOOP;
    CLOSE cur;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `', col, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL drop_column_and_fks('inventory_items', 'product_id');
CALL drop_column_and_fks('inventory_items', 'low_stock_threshold');
DROP PROCEDURE IF EXISTS drop_column_and_fks;

-- PART C — RESULT CHECK (expect 0 rows)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_items'
  AND column_name IN ('product_id', 'low_stock_threshold');
