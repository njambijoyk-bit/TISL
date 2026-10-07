-- =====================================================================
-- 96_drop_legacy_product_service_columns.sql
-- Drops columns nothing uses any more, and moves a service's unit onto the units table.
--   products.bulk_pricing, products.recommended_products   never read or written
--   products.purchase_count                                never counted (stock is tracked on the stock side)
--   products.variants                                      the old JSON text list; the product_variants table is the only variants system now
--   services.quote_count, services.order_count             never counted
--   services.service_category                              a text copy of the category name; services.category_id is the reference
--   services.unit_of_measure                               a hardcoded word (project, hour, day...); replaced by services.price_unit_id, a foreign key to
--                                                          units_of_measure (service units). Part B fills price_unit_id from the old word where a service
--                                                          unit with the same code exists, and only where price_unit_id is still empty.
-- Left alone on purpose: services.max_concurrent_bookings (kept for later), the ratings columns, and the service rate fields and pricing_model.
-- Test data only: whatever was in the dropped columns is lost.
-- Safe to re-run: each step is skipped if already done.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK.
-- A1. Which of the 8 columns are still there (up to 8 rows; 0 rows = already done).
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'products' AND column_name IN ('bulk_pricing', 'recommended_products', 'purchase_count', 'variants'))
    OR (table_name = 'services' AND column_name IN ('quote_count', 'order_count', 'service_category', 'unit_of_measure')))
ORDER BY table_name, column_name;

-- A2. Services whose old unit word has NO service unit with the same code (they keep price_unit_id empty; pick a unit on the service form afterwards).
--     Only meaningful while services.unit_of_measure still exists.
SELECT s.unit_of_measure AS old_word, COUNT(*) AS services
FROM services s
LEFT JOIN units_of_measure u ON LOWER(u.code) = LOWER(s.unit_of_measure) AND u.dimension = 'service_unit'
WHERE s.id > 0 AND s.price_unit_id IS NULL AND s.unit_of_measure IS NOT NULL AND u.id IS NULL
GROUP BY s.unit_of_measure;

-- A3. Products that hold an old text list of variants but have no real variants (that list is lost by part B).
SELECT p.id, p.name, p.variants FROM products p
WHERE p.id > 0 AND p.variants IS NOT NULL AND JSON_LENGTH(p.variants) > 0
  AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS drop_legacy_column;
DROP PROCEDURE IF EXISTS drop_legacy_product_service_columns;
DELIMITER $$
CREATE PROCEDURE drop_legacy_column(IN tbl VARCHAR(64), IN col VARCHAR(64))
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @sql = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `', col, '`');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

CREATE PROCEDURE drop_legacy_product_service_columns()
BEGIN
    -- the unit word becomes a foreign key value first (only while the old column is still there)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'unit_of_measure') THEN
        UPDATE services s
        JOIN units_of_measure u ON LOWER(u.code) = LOWER(s.unit_of_measure) AND u.dimension = 'service_unit'
        SET s.price_unit_id = u.id
        WHERE s.id > 0 AND s.price_unit_id IS NULL;
    END IF;

    CALL drop_legacy_column('products', 'bulk_pricing');
    CALL drop_legacy_column('products', 'recommended_products');
    CALL drop_legacy_column('products', 'purchase_count');
    CALL drop_legacy_column('products', 'variants');
    CALL drop_legacy_column('services', 'quote_count');
    CALL drop_legacy_column('services', 'order_count');
    CALL drop_legacy_column('services', 'service_category');
    CALL drop_legacy_column('services', 'unit_of_measure');
END$$
DELIMITER ;
CALL drop_legacy_product_service_columns();
DROP PROCEDURE IF EXISTS drop_legacy_product_service_columns;
DROP PROCEDURE IF EXISTS drop_legacy_column;

-- PART C - RESULT CHECK. Expect 0 rows from the first query (all 8 gone), then every service with its unit.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'products' AND column_name IN ('bulk_pricing', 'recommended_products', 'purchase_count', 'variants'))
    OR (table_name = 'services' AND column_name IN ('quote_count', 'order_count', 'service_category', 'unit_of_measure')));
SELECT s.id, s.name, u.name AS unit FROM services s LEFT JOIN units_of_measure u ON u.id = s.price_unit_id WHERE s.id > 0 ORDER BY s.id;
