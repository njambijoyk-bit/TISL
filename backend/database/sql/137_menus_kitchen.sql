-- =====================================================================
-- 137_menus_kitchen.sql
-- Menus module, step 4 (docs/MENUS_PLAN.md): the kitchen screens.
--   menus_stations      a place food is made (grill, cold, pastry, bar): its own screen, and how long a ticket may wait before it turns red
--   menus_dishes        gets station_id: which station makes the dish (a dish with none goes to the station marked "takes everything else")
--   menus_tickets       one ticket per order per station: new, started, ready (the order is ready when every ticket is)
--   menus_order_lines   gets ticket_id: which ticket a dish is on
-- Run 132 to 136 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_stations', 'menus_tickets');
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_dishes' AND column_name = 'station_id') OR (table_name = 'menus_order_lines' AND column_name = 'ticket_id'));

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

CALL add_column_if_missing('menus_dishes', 'station_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_order_lines', 'ticket_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS menus_stations (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(80) NOT NULL,
    location_id    BIGINT UNSIGNED NULL,                        -- NULL = serves every branch
    target_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15,       -- a ticket older than this is shown late
    is_default     TINYINT(1) NOT NULL DEFAULT 0,               -- takes the dishes that name no station
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    sort_order     INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_tickets (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id     BIGINT UNSIGNED NOT NULL,
    station_id   BIGINT UNSIGNED NOT NULL,
    status       VARCHAR(10) NOT NULL DEFAULT 'new',            -- new | started | ready | cancelled
    due_at       DATETIME NOT NULL,                             -- when the customer wants it
    started_at   DATETIME NULL,
    ready_at     DATETIME NULL,
    cancelled_at DATETIME NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_menus_ticket (order_id, station_id),
    KEY idx_menus_ticket_station (station_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
