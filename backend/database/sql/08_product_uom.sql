-- =====================================================================
-- 08_product_uom.sql
-- Product-level unit of measure.
--   products.default_unit_id   the unit ALL variant stock is counted in
--   products.alternate_unit_id optional second selling unit (same dimension)
-- Backfills default_unit_id from each product's default variant's base unit.
-- Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Columns already present? (expect 0 rows on first run)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'products'
  AND column_name IN ('default_unit_id', 'alternate_unit_id');

-- A2. Products whose variants use different base units (need a manual fix)
SELECT v.product_id, COUNT(DISTINCT u.unit_id) AS distinct_base_units
FROM product_variants v
JOIN product_variant_units u ON u.variant_id = v.id AND u.role = 'base'
GROUP BY v.product_id
HAVING distinct_base_units > 1;


-- ---------------------------------------------------------------------
-- PART B — ADD COLUMNS (DDL, commits on its own)
-- Skips itself if the column already exists.
-- ---------------------------------------------------------------------

SET @has_default := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'default_unit_id');
SET @sql := IF(@has_default = 0,
  'ALTER TABLE products
     ADD COLUMN default_unit_id BIGINT UNSIGNED NULL AFTER currency_id,
     ADD COLUMN alternate_unit_id BIGINT UNSIGNED NULL AFTER default_unit_id,
     ADD CONSTRAINT fk_products_default_unit FOREIGN KEY (default_unit_id) REFERENCES units_of_measure(id) ON DELETE SET NULL,
     ADD CONSTRAINT fk_products_alternate_unit FOREIGN KEY (alternate_unit_id) REFERENCES units_of_measure(id) ON DELETE SET NULL',
  'SELECT ''columns already exist'' AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ---------------------------------------------------------------------
-- PART C — BACKFILL (prefers the default variant's base unit, else the
-- lowest-id variant's). Only touches rows where default_unit_id IS NULL.
-- ---------------------------------------------------------------------

UPDATE products p
JOIN (
    SELECT v.product_id,
           SUBSTRING_INDEX(GROUP_CONCAT(u.unit_id ORDER BY v.is_default DESC, v.id ASC), ',', 1) AS unit_id
    FROM product_variants v
    JOIN product_variant_units u ON u.variant_id = v.id AND u.role = 'base'
    GROUP BY v.product_id
) x ON x.product_id = p.id
SET p.default_unit_id = x.unit_id
WHERE p.default_unit_id IS NULL;


-- ---------------------------------------------------------------------
-- PART D — VERIFY
-- ---------------------------------------------------------------------

SELECT COUNT(*) AS products_without_default_unit FROM products WHERE default_unit_id IS NULL;
-- Products without variants stay NULL until an admin picks a unit in the form.
