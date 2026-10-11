-- =====================================================================
-- 138_menus_counter.sql
-- Menus module, step 5 (docs/MENUS_PLAN.md): the counter (till) and tabs.
--   menus_orders        gets: service (dine in / take out), the number to call out, a tab label, the cashier, tip, service charge, the cash handed over and the change,
--                       how it was paid and the tax per rate (for the receipt) and when it was settled. phone may now be empty (a counter customer need not give one).
--                       payment may now be "open" (a tab: ordered, not yet paid).
--   menus_order_lines   gets: round (a tab is ordered in rounds), what the choices change in the recipe, and the set-meal sides, so a tab can be booked when it is settled
--   menus_tickets       one ticket per order per station per round (a tab's second round gets its own tickets)
--   menus_channels      the "Counter" way in (switched on)
-- Run 132 to 137 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_orders' AND column_name IN ('service', 'short_no', 'label', 'cashier_id', 'tip', 'service_charge', 'tendered', 'change_due', 'tax_breakdown', 'settled_at', 'tenders'))
    OR (table_name = 'menus_order_lines' AND column_name IN ('round', 'uses', 'linked'))
    OR (table_name = 'menus_tickets' AND column_name = 'round'));
SELECT code FROM menus_channels WHERE code = 'counter';

-- PART B - CHANGES
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS drop_index_if_present;
DROP PROCEDURE IF EXISTS add_unique_if_missing;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
CREATE PROCEDURE drop_index_if_present(IN tbl VARCHAR(64), IN idx VARCHAR(64))
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.statistics
               WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP INDEX `', idx, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
CREATE PROCEDURE add_unique_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD UNIQUE KEY `', idx, '` (', cols, ')');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('menus_orders', 'service', 'VARCHAR(10) NULL');
CALL add_column_if_missing('menus_orders', 'short_no', 'INT UNSIGNED NULL');
CALL add_column_if_missing('menus_orders', 'label', 'VARCHAR(80) NULL');
CALL add_column_if_missing('menus_orders', 'cashier_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_orders', 'tip', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
CALL add_column_if_missing('menus_orders', 'service_charge', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
CALL add_column_if_missing('menus_orders', 'tendered', 'DECIMAL(12,2) NULL');
CALL add_column_if_missing('menus_orders', 'change_due', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
CALL add_column_if_missing('menus_orders', 'tax_breakdown', 'JSON NULL');
CALL add_column_if_missing('menus_orders', 'settled_at', 'DATETIME NULL');
CALL add_column_if_missing('menus_orders', 'tenders', 'JSON NULL');
CALL add_column_if_missing('menus_order_lines', 'round', 'SMALLINT UNSIGNED NOT NULL DEFAULT 1');
CALL add_column_if_missing('menus_order_lines', 'uses', 'JSON NULL');
CALL add_column_if_missing('menus_order_lines', 'linked', 'JSON NULL');
CALL add_column_if_missing('menus_tickets', 'round', 'SMALLINT UNSIGNED NOT NULL DEFAULT 1');

CALL drop_index_if_present('menus_tickets', 'uq_menus_ticket');
CALL add_unique_if_missing('menus_tickets', 'uq_menus_ticket_round', 'order_id, station_id, round');

ALTER TABLE menus_orders MODIFY phone VARCHAR(40) NULL;

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS drop_index_if_present;
DROP PROCEDURE IF EXISTS add_unique_if_missing;

INSERT INTO menus_channels (code, name, order_type, is_active, prep_minutes, slot_minutes, max_days_ahead, allow_asap, payment_modes, sort_order, created_at, updated_at)
SELECT 'counter', 'Counter', 'counter', 1, 0, 15, 0, 1, JSON_ARRAY('later'), 10, NOW(), NOW() FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM menus_channels WHERE code = 'counter');
