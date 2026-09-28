-- =====================================================================
-- 10_hamper_auction_locations.sql
-- Hampers and auctions belong to ONE branch, and their items are VARIANTS
-- that must be stocked at that branch.
--   hampers.location_id        the owning branch
--   hamper_items.variant_id    the variant (product_id stays for display)
--   auctions.location_id       the owning branch
--   auctions.variant_id        the auctioned variant
-- Backfills existing rows to the default branch and the product's default
-- variant. Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Columns already present? (expect 0 rows on first run)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'hampers'      AND column_name = 'location_id')
    OR (table_name = 'hamper_items' AND column_name = 'variant_id')
    OR (table_name = 'auctions'     AND column_name IN ('location_id', 'variant_id')));

-- A2. The default branch that existing rows will be assigned to
SELECT id, name FROM locations WHERE is_default = 1 LIMIT 1;


-- ---------------------------------------------------------------------
-- PART B — ADD COLUMNS (DDL, commits on its own; each skips if present)
-- ---------------------------------------------------------------------

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'hampers' AND column_name = 'location_id');
SET @sql := IF(@c = 0,
  'ALTER TABLE hampers ADD COLUMN location_id BIGINT UNSIGNED NULL,
     ADD CONSTRAINT fk_hampers_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL',
  'SELECT ''hampers.location_id exists'' AS note');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'hamper_items' AND column_name = 'variant_id');
SET @sql := IF(@c = 0,
  'ALTER TABLE hamper_items ADD COLUMN variant_id BIGINT UNSIGNED NULL,
     ADD CONSTRAINT fk_hamper_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL',
  'SELECT ''hamper_items.variant_id exists'' AS note');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'auctions' AND column_name = 'location_id');
SET @sql := IF(@c = 0,
  'ALTER TABLE auctions ADD COLUMN location_id BIGINT UNSIGNED NULL,
     ADD CONSTRAINT fk_auctions_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL',
  'SELECT ''auctions.location_id exists'' AS note');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @c := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'auctions' AND column_name = 'variant_id');
SET @sql := IF(@c = 0,
  'ALTER TABLE auctions ADD COLUMN variant_id BIGINT UNSIGNED NULL,
     ADD CONSTRAINT fk_auctions_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL',
  'SELECT ''auctions.variant_id exists'' AS note');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------------------------------------------------------------------
-- PART C — BACKFILL (only rows still NULL)
-- ---------------------------------------------------------------------

SET @main := (SELECT id FROM locations WHERE is_default = 1 ORDER BY id LIMIT 1);

UPDATE hampers SET location_id = @main WHERE location_id IS NULL AND @main IS NOT NULL;
UPDATE auctions SET location_id = @main WHERE location_id IS NULL AND @main IS NOT NULL;

UPDATE hamper_items hi
JOIN (SELECT product_id, SUBSTRING_INDEX(GROUP_CONCAT(id ORDER BY is_default DESC, id ASC), ',', 1) AS vid
      FROM product_variants GROUP BY product_id) v ON v.product_id = hi.product_id
SET hi.variant_id = v.vid
WHERE hi.variant_id IS NULL;

UPDATE auctions a
JOIN (SELECT product_id, SUBSTRING_INDEX(GROUP_CONCAT(id ORDER BY is_default DESC, id ASC), ',', 1) AS vid
      FROM product_variants GROUP BY product_id) v ON v.product_id = a.product_id
SET a.variant_id = v.vid
WHERE a.variant_id IS NULL;


-- ---------------------------------------------------------------------
-- PART D — VERIFY
-- ---------------------------------------------------------------------

SELECT
  (SELECT COUNT(*) FROM hampers      WHERE location_id IS NULL) AS hampers_without_branch,
  (SELECT COUNT(*) FROM hamper_items WHERE variant_id  IS NULL) AS hamper_items_without_variant,
  (SELECT COUNT(*) FROM auctions     WHERE location_id IS NULL) AS auctions_without_branch,
  (SELECT COUNT(*) FROM auctions     WHERE variant_id  IS NULL) AS auctions_without_variant;
-- Rows left NULL are products with no variants yet: open the product once
-- (a Standard variant is created when it gets stock) and re-save the hamper/auction.
