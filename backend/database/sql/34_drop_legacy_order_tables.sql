-- =====================================================================
-- 34_drop_legacy_order_tables.sql
-- Orders are vouchers now (Sales Order / Cash Sale / Invoice). This drops the
-- old order tables:  order_items, order_activity_logs, order_shipments, orders
--
-- BEFORE YOU RUN THIS — what still reads these tables and will then show
-- nothing (or fail) until it is re-pointed at vouchers:
--   * Delivery manifests, shipment tracking, driver / delivery ratings and incidents
--   * Product review eligibility ("bought this")
--   * The old reports / analytics screens, the chat assistant, reconciliation
--   * Customer history tabs, the activity feed and project order links
--     (these ones already return empty lists when the table is gone)
-- Test data only, so rows are not kept. Take a backup first if unsure.
--
-- Columns called order_id in other tables (delivery_items, product_reviews,
-- payments, referral_code_usage, booking_orders ...) are LEFT in place; only
-- the foreign keys that point at the dropped tables are removed, so those
-- tables keep working without a link.
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.

-- A1. Which of the four exist? (rows = tables still there)
SELECT table_name, table_rows AS approx_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('order_items', 'order_activity_logs', 'order_shipments', 'orders');

-- A2. Foreign keys from OTHER tables into them (these are removed in part B)
SELECT table_name, column_name, constraint_name, referenced_table_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name IN ('order_items', 'order_activity_logs', 'order_shipments', 'orders')
  AND table_name NOT IN ('order_items', 'order_activity_logs', 'order_shipments', 'orders');

-- A3. Exact row counts (run each on its own; an error "doesn't exist" means it is already gone)
-- SELECT COUNT(*) FROM orders;
-- SELECT COUNT(*) FROM order_items;
-- SELECT COUNT(*) FROM order_activity_logs;
-- SELECT COUNT(*) FROM order_shipments;


-- PART B — DROP (DDL, commits on its own)

DROP PROCEDURE IF EXISTS drop_fks_pointing_at;

DELIMITER $$
CREATE PROCEDURE drop_fks_pointing_at(IN parent VARCHAR(64))
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE child VARCHAR(64);
    DECLARE fk VARCHAR(64);
    DECLARE cur CURSOR FOR
        SELECT DISTINCT table_name, constraint_name
        FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE() AND referenced_table_name = parent
          AND table_name NOT IN ('order_items', 'order_activity_logs', 'order_shipments', 'orders');
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    OPEN cur;
    loop_fk: LOOP
        FETCH cur INTO child, fk;
        IF done = 1 THEN LEAVE loop_fk; END IF;
        SET @s = CONCAT('ALTER TABLE `', child, '` DROP FOREIGN KEY `', fk, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END LOOP;
    CLOSE cur;
END$$
DELIMITER ;

CALL drop_fks_pointing_at('orders');
CALL drop_fks_pointing_at('order_items');
CALL drop_fks_pointing_at('order_activity_logs');
CALL drop_fks_pointing_at('order_shipments');

DROP PROCEDURE IF EXISTS drop_fks_pointing_at;

SET FOREIGN_KEY_CHECKS = 0;   -- the four reference each other; drop them together
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS order_activity_logs;
DROP TABLE IF EXISTS order_shipments;
DROP TABLE IF EXISTS orders;
SET FOREIGN_KEY_CHECKS = 1;


-- PART C — RESULT CHECK. Expect 0 rows from both.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('order_items', 'order_activity_logs', 'order_shipments', 'orders');

SELECT table_name, column_name, constraint_name, referenced_table_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name IN ('order_items', 'order_activity_logs', 'order_shipments', 'orders');
