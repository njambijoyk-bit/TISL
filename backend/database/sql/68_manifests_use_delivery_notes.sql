-- =====================================================================
-- 68_manifests_use_delivery_notes.sql
-- Delivery manifests are built from Delivery Notes (vouchers) instead of the old orders.
--   A manifest STOP is one place a driver goes to; it can carry several Delivery Notes
--   (two notes for the same customer and address are ONE stop).
--   delivery_item_vouchers   which Delivery Notes are on which stop
--   delivery_items           gets the customer, contact, address and a stop key (customer + address) so notes group
--   delivery_items.order_id / delivery_ratings.order_id   become optional (old manifests keep theirs)
-- A failed or returned stop does not touch the Delivery Note: it is simply free for another manifest.
-- Run in Workbench. Safe to re-run. Adds only, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (before: 0 rows from the first query; after: 5 rows and 1 row)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'delivery_items'
  AND column_name IN ('customer_id', 'contact_name', 'contact_phone', 'address', 'stop_key');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'delivery_item_vouchers';
SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'delivery_items' AND column_name = 'order_id') OR (table_name = 'delivery_ratings' AND column_name = 'order_id'));

-- PART B — CHANGE (DDL, commits on its own)
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS make_nullable;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = tbl)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
CREATE PROCEDURE make_nullable(IN tbl VARCHAR(64), IN col VARCHAR(64))
BEGIN
    DECLARE ctype TEXT;
    SELECT column_type INTO ctype FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col AND is_nullable = 'NO' LIMIT 1;
    IF ctype IS NOT NULL THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` MODIFY COLUMN `', col, '` ', ctype, ' NULL');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('delivery_items', 'customer_id',   'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('delivery_items', 'contact_name',  'VARCHAR(160) NULL');
CALL add_column_if_missing('delivery_items', 'contact_phone', 'VARCHAR(40) NULL');
CALL add_column_if_missing('delivery_items', 'address',       'VARCHAR(500) NULL');
CALL add_column_if_missing('delivery_items', 'stop_key',      'VARCHAR(255) NULL');

CALL make_nullable('delivery_items', 'order_id');
CALL make_nullable('delivery_ratings', 'order_id');

CREATE TABLE IF NOT EXISTS delivery_item_vouchers (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    delivery_item_id BIGINT UNSIGNED NOT NULL,
    voucher_id       BIGINT UNSIGNED NOT NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_stop_note (delivery_item_id, voucher_id),
    KEY idx_note_voucher (voucher_id),
    CONSTRAINT fk_div_item FOREIGN KEY (delivery_item_id) REFERENCES delivery_items (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS make_nullable;

-- PART C — RESULT CHECK (expect 5 columns, 1 table, and is_nullable = YES on both order_id rows)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'delivery_items'
  AND column_name IN ('customer_id', 'contact_name', 'contact_phone', 'address', 'stop_key');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'delivery_item_vouchers';
SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'delivery_items' AND column_name = 'order_id') OR (table_name = 'delivery_ratings' AND column_name = 'order_id'));
