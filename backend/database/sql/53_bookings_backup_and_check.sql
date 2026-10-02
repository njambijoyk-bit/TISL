-- =====================================================================
-- 53_bookings_backup_and_check.sql
-- Step 1 of rebuilding Bookings: look at what is there, and keep a copy before anything is dropped. Nothing is dropped here.
-- Tables of the old booking system:
--   bookings, booking_settings, booking_staff, booking_orders, booking_disqualifications, booking_activity_logs,
--   booking_worksheets, worksheet_items
-- Part B copies each one that exists into zz_bk_<name> (you can drop those copies later). Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Which of the old booking tables exist here
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('bookings', 'booking_settings', 'booking_staff', 'booking_orders', 'booking_disqualifications', 'booking_activity_logs', 'booking_worksheets', 'worksheet_items')
ORDER BY table_name;

-- A2. How many rows each one holds
SET @sql := (SELECT GROUP_CONCAT(CONCAT('SELECT ''', table_name, ''' AS booking_table, COUNT(*) AS row_count FROM `', table_name, '`') SEPARATOR ' UNION ALL ')
             FROM information_schema.tables
             WHERE table_schema = DATABASE()
               AND table_name IN ('bookings', 'booking_settings', 'booking_staff', 'booking_orders', 'booking_disqualifications', 'booking_activity_logs', 'booking_worksheets', 'worksheet_items'));
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

-- A3. Tables OUTSIDE the booking set that point at a booking table with a foreign key (these would block a drop; expect 0 rows)
SELECT table_name AS pointing_table, column_name, referenced_table_name
FROM information_schema.key_column_usage
WHERE table_schema = DATABASE()
  AND referenced_table_name IN ('bookings', 'booking_settings', 'booking_staff', 'booking_orders', 'booking_disqualifications', 'booking_activity_logs', 'booking_worksheets', 'worksheet_items')
  AND table_name NOT IN ('bookings', 'booking_settings', 'booking_staff', 'booking_orders', 'booking_disqualifications', 'booking_activity_logs', 'booking_worksheets', 'worksheet_items');

-- A4. Other tables that have a booking_id column (so we know what refers to a booking by number only)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND column_name IN ('booking_id', 'booking_number')
  AND table_name NOT IN ('bookings', 'booking_settings', 'booking_staff', 'booking_orders', 'booking_disqualifications', 'booking_activity_logs', 'booking_worksheets', 'worksheet_items')
ORDER BY table_name;

-- PART B — KEEP A COPY (DDL, commits on its own). Copies only the tables that exist; skips any copy already made.
DROP PROCEDURE IF EXISTS keep_copy;

DELIMITER $$
CREATE PROCEDURE keep_copy(IN t VARCHAR(64))
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = t)
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = CONCAT('zz_bk_', t)) THEN
        SET @s = CONCAT('CREATE TABLE `zz_bk_', t, '` AS SELECT * FROM `', t, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL keep_copy('bookings');
CALL keep_copy('booking_settings');
CALL keep_copy('booking_staff');
CALL keep_copy('booking_orders');
CALL keep_copy('booking_disqualifications');
CALL keep_copy('booking_activity_logs');
CALL keep_copy('booking_worksheets');
CALL keep_copy('worksheet_items');

DROP PROCEDURE IF EXISTS keep_copy;

-- PART C — RESULT CHECK. Each original and its copy must show the same number of rows.
SELECT table_name, table_rows AS approx_rows FROM information_schema.tables
WHERE table_schema = DATABASE() AND (table_name LIKE 'zz\_bk\_%' OR table_name IN ('bookings', 'booking_settings', 'booking_staff', 'booking_orders', 'booking_disqualifications', 'booking_activity_logs', 'booking_worksheets', 'worksheet_items'))
ORDER BY REPLACE(table_name, 'zz_bk_', ''), table_name;
