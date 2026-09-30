-- =====================================================================
-- 42_drop_legacy_quotes.sql
-- Removes the old quotes system. Quotations are vouchers now (Quotation voucher
-- type), so these tables are no longer used:
--     quote_items, quote_requests, quotes
-- Also removes the old link columns that pointed at them:
--     vouchers.quote_request_id  (only if the column exists)
--     orders.quote_id            (only if the orders table is still there)
--     order_items.quote_item_id  (only if the order_items table is still there)
-- Quotation vouchers themselves are NOT touched.
--
-- Test data only, so rows are not kept. Take a backup first if unsure.
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.

-- A1. Which of the three exist? (rows = tables still there)
SELECT table_name, table_rows AS approx_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('quote_items', 'quote_requests', 'quotes');

-- A2. Foreign keys from OTHER tables into them (these are removed in part B)
SELECT table_name, column_name, constraint_name, referenced_table_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name IN ('quote_items', 'quote_requests', 'quotes')
  AND table_name NOT IN ('quote_items', 'quote_requests', 'quotes');

-- A3. Old link columns still present
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'vouchers'    AND column_name = 'quote_request_id')
    OR (table_name = 'orders'      AND column_name = 'quote_id')
    OR (table_name = 'order_items' AND column_name = 'quote_item_id'));

-- A4. Quotation vouchers are kept (this is how many you have)
SELECT COUNT(*) AS quotation_vouchers
FROM vouchers v JOIN voucher_types t ON t.id = v.voucher_type_id
WHERE t.base_type = 'quotation';


-- PART B — DROP (DDL, commits on its own)

DROP PROCEDURE IF EXISTS drop_legacy_quote_links;

DELIMITER $$
CREATE PROCEDURE drop_legacy_quote_links()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE child VARCHAR(64);
    DECLARE fk VARCHAR(64);
    DECLARE cur CURSOR FOR
        SELECT DISTINCT table_name, constraint_name
        FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE()
          AND referenced_table_name IN ('quote_items', 'quote_requests', 'quotes')
          AND table_name NOT IN ('quote_items', 'quote_requests', 'quotes');
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    -- 1. foreign keys from other tables into the quote tables
    OPEN cur;
    loop_fk: LOOP
        FETCH cur INTO child, fk;
        IF done = 1 THEN LEAVE loop_fk; END IF;
        SET @s = CONCAT('ALTER TABLE `', child, '` DROP FOREIGN KEY `', fk, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END LOOP;
    CLOSE cur;

    -- 2. the link columns (each only if it is there)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'quote_request_id') THEN
        ALTER TABLE vouchers DROP COLUMN quote_request_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'quote_id') THEN
        ALTER TABLE orders DROP COLUMN quote_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order_items' AND column_name = 'quote_item_id') THEN
        ALTER TABLE order_items DROP COLUMN quote_item_id;
    END IF;
END$$
DELIMITER ;

CALL drop_legacy_quote_links();
DROP PROCEDURE IF EXISTS drop_legacy_quote_links;

SET FOREIGN_KEY_CHECKS = 0;   -- the three reference each other; drop them together
DROP TABLE IF EXISTS quote_items;
DROP TABLE IF EXISTS quote_requests;
DROP TABLE IF EXISTS quotes;
SET FOREIGN_KEY_CHECKS = 1;


-- PART C — RESULT CHECK. Expect 0 rows from each of the first three; the last
-- shows your quotation vouchers are still there.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('quote_items', 'quote_requests', 'quotes');

SELECT table_name, column_name, constraint_name, referenced_table_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name IN ('quote_items', 'quote_requests', 'quotes');

SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'vouchers'    AND column_name = 'quote_request_id')
    OR (table_name = 'orders'      AND column_name = 'quote_id')
    OR (table_name = 'order_items' AND column_name = 'quote_item_id'));

SELECT COUNT(*) AS quotation_vouchers
FROM vouchers v JOIN voucher_types t ON t.id = v.voucher_type_id
WHERE t.base_type = 'quotation';
