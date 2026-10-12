-- =====================================================================
-- 149_menus_rota_more_pay.sql
-- Menus module, step 16 (docs/MENUS_PLAN.md): pay per shift or per hour, overtime approval for other staff, clocking in by Wi-Fi or QR at the door.
--   menus_chefs.pay_mode / shift_rate / hour_rate   how a chef is paid: salary (as before), a fixed amount per shift worked, or an amount per hour worked
--   menus_overtime.user_id                          overtime entries now belong to a person (chef or other staff); chef_id stays for chefs
--   menus_clock_sites.networks                      the public internet addresses of a branch's Wi-Fi (an address or range, one per line or comma)
--   menus_clock_events.method                       how the place was proved: gps, qr or wifi
-- Run 148 first. Safe to re-run (if it stopped part way, just run PART B again). Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_chefs' AND column_name IN ('pay_mode', 'shift_rate', 'hour_rate'))
    OR (table_name = 'menus_overtime' AND column_name = 'user_id')
    OR (table_name = 'menus_clock_sites' AND column_name = 'networks')
    OR (table_name = 'menus_clock_events' AND column_name = 'method'));

-- PART B - CHANGES
DROP PROCEDURE IF EXISTS add_column_if_missing;
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
CREATE PROCEDURE add_unique_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD UNIQUE KEY `', idx, '` (', cols, ')');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('menus_chefs', 'pay_mode', "VARCHAR(10) NOT NULL DEFAULT 'salary'");
CALL add_column_if_missing('menus_chefs', 'shift_rate', 'DECIMAL(12,2) NULL');
CALL add_column_if_missing('menus_chefs', 'hour_rate', 'DECIMAL(12,2) NULL');
CALL add_column_if_missing('menus_overtime', 'user_id', 'BIGINT UNSIGNED NULL AFTER id');
CALL add_column_if_missing('menus_clock_sites', 'networks', 'TEXT NULL');
CALL add_column_if_missing('menus_clock_events', 'method', 'VARCHAR(8) NULL');

-- existing entries belong to chefs: give them their person, let other staff have entries with no chef, and make a person's day unique
-- (a key column in the WHERE keeps MySQL Workbench's safe-update mode happy: id is the primary key)
UPDATE menus_overtime o JOIN menus_chefs c ON c.id = o.chef_id SET o.user_id = c.user_id WHERE o.id > 0 AND o.user_id IS NULL;
ALTER TABLE menus_overtime MODIFY chef_id BIGINT UNSIGNED NULL;
CALL add_unique_if_missing('menus_overtime', 'uq_menus_overtime_user_day', 'user_id, work_date');

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_unique_if_missing;

-- PART C - CHECK
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_chefs' AND column_name IN ('pay_mode', 'shift_rate', 'hour_rate'))
    OR (table_name = 'menus_overtime' AND column_name = 'user_id')
    OR (table_name = 'menus_clock_sites' AND column_name = 'networks')
    OR (table_name = 'menus_clock_events' AND column_name = 'method'));
