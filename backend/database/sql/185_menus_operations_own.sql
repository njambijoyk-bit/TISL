-- =====================================================================
-- 185_menus_operations_own.sql
-- Menus owns its stock (docs/MENUS_STOCK_PLAN.md), step 5: wastage, stock taking, moving stock between branches, and the level to keep.
--   menus_waste.item_id / dish_id   what was wasted is now an ingredient variant (or a dish); variant_id (the old product link) becomes optional
--   menus_ingredient_items.reorder_level   the least to keep of a variant at a branch, in the ingredient's BASE unit (reorder suggestions use it)
--   menus_counts / menus_count_lines       a stock take: what the system expected, what was counted (in packs, the bigger unit or the base unit), the difference
--   menus_transfers / menus_transfer_lines stock sent from one branch to another, lot by lot
-- Run 181 to 184 first (and 142, which made menus_waste). Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_waste' AND column_name IN ('item_id', 'dish_id')) OR (table_name = 'menus_ingredient_items' AND column_name = 'reorder_level'));
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_counts', 'menus_count_lines', 'menus_transfers', 'menus_transfer_lines');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('menus_waste', 'item_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_waste', 'dish_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_ingredient_items', 'reorder_level', 'DECIMAL(18,4) NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

ALTER TABLE menus_waste MODIFY variant_id BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS menus_counts (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number       VARCHAR(20) NOT NULL,
    location_id  BIGINT UNSIGNED NOT NULL,
    counted_on   DATE NOT NULL,
    note         VARCHAR(255) NULL,
    value_change DECIMAL(18,2) NOT NULL DEFAULT 0,                 -- worth of the difference: negative is stock lost, positive is stock found
    journal_id   BIGINT UNSIGNED NULL,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_menus_count_no (number),
    KEY idx_menus_count_loc (location_id, counted_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_count_lines (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    count_id     BIGINT UNSIGNED NOT NULL,
    item_id      BIGINT UNSIGNED NOT NULL,
    input_qty    DECIMAL(18,4) NOT NULL,                           -- as counted
    input_unit   VARCHAR(8) NOT NULL DEFAULT 'base',               -- pack | alt | base
    expected     DECIMAL(18,4) NOT NULL,                           -- base unit: what the system said was there
    counted      DECIMAL(18,4) NOT NULL,                           -- base unit
    variance     DECIMAL(18,4) NOT NULL,                           -- counted less expected
    value_change DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_count_line (count_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_transfers (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number           VARCHAR(20) NOT NULL,
    from_location_id BIGINT UNSIGNED NOT NULL,
    to_location_id   BIGINT UNSIGNED NOT NULL,
    transferred_on   DATE NOT NULL,
    note             VARCHAR(255) NULL,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_menus_transfer_no (number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_transfer_lines (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    transfer_id  BIGINT UNSIGNED NOT NULL,
    item_id      BIGINT UNSIGNED NOT NULL,
    quantity     DECIMAL(18,4) NOT NULL,                           -- base unit
    unit_cost    DECIMAL(18,6) NOT NULL DEFAULT 0,                 -- average of the lots sent
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_transfer_line (transfer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_waste' AND column_name IN ('item_id', 'dish_id')) OR (table_name = 'menus_ingredient_items' AND column_name = 'reorder_level'));
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_counts', 'menus_count_lines', 'menus_transfers', 'menus_transfer_lines');
