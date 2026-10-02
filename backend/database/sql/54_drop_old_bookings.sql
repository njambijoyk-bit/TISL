-- =====================================================================
-- 54_drop_old_bookings.sql
-- Step 2 of rebuilding Bookings: drops the old booking tables, and the two legacy product lists on services.
--   Tables:   bookings, booking_settings, booking_staff, booking_orders, booking_disqualifications, booking_activity_logs,
--             booking_worksheets, worksheet_items          (a table is dropped ONLY if its copy zz_bk_<name> exists — script 53)
--   Columns:  services.required_products, services.optional_products   (Materials used and the service options replace them)
-- Run it together with the matching code update (the app no longer reads these tables). Run in Workbench. Safe to re-run.
-- DROP is DDL: it cannot be rolled back — the zz_bk_ copies are the way back.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Every old table that still exists, and whether its copy exists (copy_exists must be 1 for each)
SELECT t.table_name, (SELECT COUNT(*) FROM information_schema.tables c WHERE c.table_schema = DATABASE() AND c.table_name = CONCAT('zz_bk_', t.table_name)) AS copy_exists
FROM information_schema.tables t
WHERE t.table_schema = DATABASE()
  AND t.table_name IN ('bookings', 'booking_settings', 'booking_staff', 'booking_orders', 'booking_disqualifications', 'booking_activity_logs', 'booking_worksheets', 'worksheet_items')
ORDER BY t.table_name;

-- A2. The service columns, and how many services use them
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name IN ('required_products', 'optional_products');
SELECT SUM(required_products IS NOT NULL AND required_products NOT IN ('[]', 'null', '')) AS services_with_required,
       SUM(optional_products IS NOT NULL AND optional_products NOT IN ('[]', 'null', '')) AS services_with_optional
FROM services;

-- PART B — DROP (DDL, commits on its own)
DROP PROCEDURE IF EXISTS drop_if_copied;
DROP PROCEDURE IF EXISTS drop_column_if_exists;

DELIMITER $$
CREATE PROCEDURE drop_if_copied(IN t VARCHAR(64))
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = t)
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = CONCAT('zz_bk_', t)) THEN
        SET @s = CONCAT('DROP TABLE `', t, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$

CREATE PROCEDURE drop_column_if_exists(IN tbl VARCHAR(64), IN col VARCHAR(64))
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `', col, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

SET FOREIGN_KEY_CHECKS = 0;
CALL drop_if_copied('worksheet_items');
CALL drop_if_copied('booking_worksheets');
CALL drop_if_copied('booking_activity_logs');
CALL drop_if_copied('booking_disqualifications');
CALL drop_if_copied('booking_orders');
CALL drop_if_copied('booking_staff');
CALL drop_if_copied('booking_settings');
CALL drop_if_copied('bookings');
SET FOREIGN_KEY_CHECKS = 1;

CALL drop_column_if_exists('services', 'required_products');
CALL drop_column_if_exists('services', 'optional_products');

DROP PROCEDURE IF EXISTS drop_if_copied;
DROP PROCEDURE IF EXISTS drop_column_if_exists;

-- PART C — RESULT CHECK
-- C1. Old tables still present — expect 0 rows
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('bookings', 'booking_settings', 'booking_staff', 'booking_orders', 'booking_disqualifications', 'booking_activity_logs', 'booking_worksheets', 'worksheet_items');

-- C2. Service columns still present — expect 0 rows
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name IN ('required_products', 'optional_products');

-- C3. The copies are still there — expect the zz_bk_ tables
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name LIKE 'zz\_bk\_%' ORDER BY table_name;
