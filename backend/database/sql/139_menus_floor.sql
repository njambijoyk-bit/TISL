-- =====================================================================
-- 139_menus_floor.sql
-- Menus module, step 6 (docs/MENUS_PLAN.md): tables and the floor.
--   menus_areas     a part of the floor at a branch (Indoor, Patio, Bar)
--   menus_tables    a table: seats, where it sits on the floor plan, its QR code, who is at it, and (optionally) the bookable table it is in the Bookings calendar,
--                   so reservations made there show on the floor
--   menus_orders    gets table_id and guests (a tab at a table)
-- Run 132 to 138 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_areas', 'menus_tables');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_orders' AND column_name IN ('table_id', 'guests');

-- PART B - CHANGES
DROP PROCEDURE IF EXISTS add_column_if_missing;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('menus_orders', 'table_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_orders', 'guests', 'SMALLINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS menus_areas (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    location_id BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(60) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_menus_area_location (location_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_tables (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    area_id        BIGINT UNSIGNED NOT NULL,
    name           VARCHAR(40) NOT NULL,
    seats          SMALLINT UNSIGNED NOT NULL DEFAULT 2,
    shape          VARCHAR(8) NOT NULL DEFAULT 'square',        -- square | round
    x              SMALLINT UNSIGNED NOT NULL DEFAULT 0,        -- place on the plan, in grid squares
    y              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    w              SMALLINT UNSIGNED NOT NULL DEFAULT 2,
    h              SMALLINT UNSIGNED NOT NULL DEFAULT 2,
    qr_token       CHAR(24) NOT NULL,                           -- what the table's QR code opens
    resource_id    BIGINT UNSIGNED NULL,                        -- the same table in the Bookings calendar (reservations)
    state          VARCHAR(10) NOT NULL DEFAULT 'free',         -- free | seated | cleaning (ordered / eating / bill / reserved are worked out from the tab and the calendar)
    guests         SMALLINT UNSIGNED NULL,
    seated_at      DATETIME NULL,
    bill_asked_at  DATETIME NULL,
    merged_into    BIGINT UNSIGNED NULL,                        -- joined to another table for a big party
    sort_order     INT NOT NULL DEFAULT 0,
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_menus_table_qr (qr_token),
    KEY idx_menus_table_area (area_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
