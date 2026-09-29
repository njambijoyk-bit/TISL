-- =====================================================================
-- 23_stock_batches.sql                    (PLATFORM_PLAN §17–18, step 2)
-- Batches: every arrival of stock is a batch holding its own quantity per
-- branch and its own cost. Products that do not track expiry get batches
-- too (batch number and expiry stay empty) — that is how valued stock
-- knows what each item cost.
--
--   stock_batches           one row per arrival: variant, batch no, mfg /
--                           expiry date, unit cost (BASE currency, per base
--                           unit), the voucher that brought it in, status
--   stock_batch_balances    how many of a batch sit at each branch
--   stock_movements         + batch_id, unit_cost (every movement names the
--                           batch it took from / went into, and its cost)
--
-- variant_location_stock stays what the shop reads: it is the TOTAL of a
-- variant's batch balances at that branch (the app keeps them equal).
--
-- Existing stock is moved into one "opening" batch per variant at cost 0.
-- Set the real opening cost in PART E (optional) before selling, or cost of
-- goods sold on that stock will post as 0.
--
-- Run after 22_stock_fields_and_ledgers.sql. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Tables / columns already present? (expect 0 rows on first run)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'stock_movements' AND column_name IN ('batch_id', 'unit_cost')))
UNION ALL
SELECT table_name, NULL FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('stock_batches', 'stock_batch_balances');

-- A2. Stock that will be moved into opening batches
SELECT COUNT(DISTINCT product_variant_id) AS variants_with_stock,
       COUNT(*)                           AS branch_rows,
       SUM(quantity)                      AS total_units
FROM variant_location_stock WHERE quantity > 0;

-- A3. Variants holding stock with NO branch rows (legacy "global" stock).
--     These are not moved into batches; give them branch stock in the app first.
SELECT v.id, v.sku, v.stock_quantity
FROM product_variants v
WHERE v.stock_quantity > 0
  AND NOT EXISTS (SELECT 1 FROM variant_location_stock s WHERE s.product_variant_id = v.id);


-- ---------------------------------------------------------------------
-- PART B — TABLES AND COLUMNS (DDL, commits on its own)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_batches (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    variant_id          BIGINT UNSIGNED NOT NULL,
    batch_no            VARCHAR(60)  NULL,
    mfg_date            DATE         NULL,
    expiry_date         DATE         NULL,
    unit_cost           DECIMAL(18,4) NOT NULL DEFAULT 0,
    received_at         DATE         NOT NULL,
    received_voucher_id BIGINT UNSIGNED NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',   -- active | expired | quarantined | recalled
    notes               VARCHAR(255) NULL,
    created_at          TIMESTAMP    NULL,
    updated_at          TIMESTAMP    NULL,
    KEY idx_batch_variant (variant_id, status, expiry_date),
    KEY idx_batch_voucher (received_voucher_id),
    KEY idx_batch_expiry  (expiry_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_batch_balances (
    batch_id    BIGINT UNSIGNED NOT NULL,
    location_id BIGINT UNSIGNED NOT NULL,
    quantity    DECIMAL(18,4)   NOT NULL DEFAULT 0,
    PRIMARY KEY (batch_id, location_id),
    KEY idx_balance_location (location_id),
    CONSTRAINT fk_balance_batch FOREIGN KEY (batch_id) REFERENCES stock_batches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CALL add_column_if_missing('stock_movements', 'batch_id',  'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('stock_movements', 'unit_cost', 'DECIMAL(18,4) NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- index on stock_movements.batch_id, only if missing
SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'stock_movements' AND index_name = 'idx_movement_batch');
SET @sql := IF(@has_idx = 0, 'ALTER TABLE stock_movements ADD INDEX idx_movement_batch (batch_id)', 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------------------------------------------------------------------
-- PART C — OPENING BATCHES (transaction). One batch per variant that has
-- branch stock and no batch yet; its balances copy variant_location_stock.
-- ---------------------------------------------------------------------

SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

INSERT INTO stock_batches (variant_id, batch_no, unit_cost, received_at, status, notes, created_at, updated_at)
SELECT s.product_variant_id, NULL, 0, CURDATE(), 'active', 'Opening balance (before batches)', NOW(), NOW()
FROM variant_location_stock s
WHERE s.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM stock_batches b WHERE b.variant_id = s.product_variant_id)
GROUP BY s.product_variant_id;

INSERT INTO stock_batch_balances (batch_id, location_id, quantity)
SELECT b.id, s.location_id, s.quantity
FROM variant_location_stock s
JOIN stock_batches b ON b.variant_id = s.product_variant_id AND b.notes = 'Opening balance (before batches)'
WHERE s.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM stock_batch_balances x WHERE x.batch_id = b.id AND x.location_id = s.location_id);

COMMIT;

SET SQL_SAFE_UPDATES = @old_safe;


-- ---------------------------------------------------------------------
-- PART D — RESULT CHECK. The first query must return NO rows: every
-- (variant, branch) total in variant_location_stock equals its batches.
-- ---------------------------------------------------------------------

SELECT s.product_variant_id, s.location_id, s.quantity AS shop_quantity,
       COALESCE(t.batch_total, 0) AS batch_total
FROM variant_location_stock s
LEFT JOIN (
    SELECT b.variant_id, x.location_id, SUM(x.quantity) AS batch_total
    FROM stock_batch_balances x JOIN stock_batches b ON b.id = x.batch_id
    GROUP BY b.variant_id, x.location_id
) t ON t.variant_id = s.product_variant_id AND t.location_id = s.location_id
WHERE ABS(s.quantity - COALESCE(t.batch_total, 0)) > 0.0001;

SELECT COUNT(*) AS batches, SUM(unit_cost = 0) AS batches_at_zero_cost FROM stock_batches;


-- ---------------------------------------------------------------------
-- PART E — OPTIONAL: real opening cost for existing stock.
-- Cost is per BASE unit, in the BASE currency. Edit and run per variant
-- (or bulk from a spreadsheet) BEFORE the first sale of that stock.
-- ---------------------------------------------------------------------
-- UPDATE stock_batches SET unit_cost = 150.0000
-- WHERE variant_id = 123 AND notes = 'Opening balance (before batches)';
