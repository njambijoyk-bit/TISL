-- =====================================================================
-- 09_retire_hamper_auction_orders.sql
-- Hampers and auctions no longer have their own order tables — they sell
-- through the normal checkout / sales register. Test data only, so the
-- tables are dropped without preserving rows.
--
-- Drops:  hamper_orders, auction_orders (+ any *_items child tables you
--         list in PART B)
-- Cleans: payments.auction_order_id, referral_code_usage.hamper_order_id,
--         hamper_activity_logs.hamper_order_id,
--         auction_order_activity_logs.auction_order_id
-- Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Every table with "hamper_order" / "auction_order" in its name
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND (table_name LIKE '%hamper\_order%' OR table_name LIKE '%auction\_order%');

-- A2. Foreign keys pointing at the two order tables (these get removed below)
SELECT table_name, column_name, constraint_name, referenced_table_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name IN ('hamper_orders', 'auction_orders');


-- ---------------------------------------------------------------------
-- PART B — DROP (DDL, commits on its own)
-- Helper: drop a column and any foreign key / index on it, if it exists.
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS drop_column_if_exists;

DELIMITER $$
CREATE PROCEDURE drop_column_if_exists(IN tbl VARCHAR(64), IN col VARCHAR(64))
BEGIN
    DECLARE fk_name VARCHAR(64);
    DECLARE done INT DEFAULT 0;
    DECLARE cur CURSOR FOR
        SELECT constraint_name FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col
          AND referenced_table_name IS NOT NULL;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = tbl)
       AND EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        OPEN cur;
        fk_loop: LOOP
            FETCH cur INTO fk_name;
            IF done = 1 THEN LEAVE fk_loop; END IF;
            SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP FOREIGN KEY `', fk_name, '`');
            PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
        END LOOP;
        CLOSE cur;
        SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `', col, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL drop_column_if_exists('payments',                    'auction_order_id');
CALL drop_column_if_exists('referral_code_usage',         'hamper_order_id');
CALL drop_column_if_exists('hamper_activity_logs',        'hamper_order_id');
CALL drop_column_if_exists('auction_order_activity_logs', 'auction_order_id');

DROP PROCEDURE IF EXISTS drop_column_if_exists;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS hamper_orders;
DROP TABLE IF EXISTS auction_orders;
SET FOREIGN_KEY_CHECKS = 1;


-- ---------------------------------------------------------------------
-- PART C — VERIFY (expect 0 rows from both)
-- ---------------------------------------------------------------------

SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('hamper_orders', 'auction_orders');

SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'payments' AND column_name = 'auction_order_id')
    OR (table_name = 'referral_code_usage' AND column_name = 'hamper_order_id'));
