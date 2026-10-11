-- =====================================================================
-- 144_menus_private_chef.sql
-- Menus module, step 11 (docs/MENUS_PLAN.md section 5): cooking services, private chef at home.
--   A private chef job is a request like a cake or catering job (script 143: quote, deposit, balance), with the chef who will cook it and how long they stay.
--   menus_requests.chef_id            the chef (Menus -> Chefs) assigned to the job
--   menus_requests.duration_minutes   how long the chef is booked from event_at (the chef can not be booked twice at once)
-- Run 143 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_requests' AND column_name IN ('chef_id', 'duration_minutes');

-- PART B - CHANGES
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
CREATE PROCEDURE add_index_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD KEY `', idx, '` (', cols, ')');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('menus_requests', 'chef_id', 'BIGINT UNSIGNED NULL AFTER location_id');
CALL add_column_if_missing('menus_requests', 'duration_minutes', 'SMALLINT UNSIGNED NULL AFTER headcount');
CALL add_index_if_missing('menus_requests', 'idx_menus_requests_chef', 'chef_id, event_at');

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

-- PART C - CHECK
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_requests' AND column_name IN ('chef_id', 'duration_minutes');
