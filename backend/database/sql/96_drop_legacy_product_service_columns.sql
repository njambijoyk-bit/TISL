-- =====================================================================
-- 96_drop_legacy_product_service_columns.sql
-- Drops columns nothing uses any more, and moves a service's price onto "starting price + price unit".
--   products.bulk_pricing, products.recommended_products   never read or written
--   products.purchase_count                                never counted (stock is tracked on the stock side)
--   products.variants                                      the old JSON text list; the product_variants table is the only variants system now
--   services.quote_count, services.order_count             never counted
--   services.service_category                              a text copy of the category name; services.category_id is the reference
--   services.unit_of_measure                               a hardcoded word (project, hour, day...); replaced by services.price_unit_id
--   services.pricing_model, hourly_rate, daily_rate        hardcoded pricing models and rate boxes; a service now has a STARTING PRICE (base_price),
--                                                          a minimum charge, and a PRICE UNIT (price_unit_id, a foreign key to units_of_measure, service units).
--
-- What part B does with prices, in this order (only where the old columns still exist):
--   1. price_unit_id is filled from the old unit word (unit_of_measure) where a service unit with the same code exists.
--   2. base_price becomes the hourly rate for hourly services and the daily rate for daily services (the rate was the real price).
--   3. price_unit_id, if still empty, is filled from the pricing model: hourly -> hour/hr, daily -> day, subscription -> month/mo,
--      fixed or project_based -> project (a service unit with that code must exist).
--   >>> If part A5 shows a model with no service unit found, add that unit first (Settings, Units of measure, Measures: service unit),
--       THEN run part B. After part B the old model is gone and cannot be mapped again (the unit can still be picked on the service form).
-- Left alone on purpose: services.max_concurrent_bookings (kept for later), the ratings columns, and minimum_charge.
-- Test data only: whatever was in the dropped columns is lost.
-- (The comparisons force one collation, because services and units_of_measure use different ones.)
-- Safe to re-run: each step is skipped if already done.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK.
-- A1. Which of the 11 columns are still there (up to 11 rows; 0 rows = already done).
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'products' AND column_name IN ('bulk_pricing', 'recommended_products', 'purchase_count', 'variants'))
    OR (table_name = 'services' AND column_name IN ('quote_count', 'order_count', 'service_category', 'unit_of_measure', 'pricing_model', 'hourly_rate', 'daily_rate')))
ORDER BY table_name, column_name;

-- A2. Services whose old unit word has NO service unit with the same code (they keep price_unit_id empty until step 3 or until you pick one on the form).
--     Only meaningful while services.unit_of_measure still exists.
SELECT s.unit_of_measure AS old_word, COUNT(*) AS services
FROM services s
LEFT JOIN units_of_measure u ON LOWER(u.code) COLLATE utf8mb4_unicode_ci = LOWER(s.unit_of_measure) COLLATE utf8mb4_unicode_ci AND u.dimension = 'service_unit'
WHERE s.id > 0 AND s.price_unit_id IS NULL AND s.unit_of_measure IS NOT NULL AND u.id IS NULL
GROUP BY s.unit_of_measure;

-- A3. Products that hold an old text list of variants but have no real variants (that list is lost by part B).
SELECT p.id, p.name, p.variants FROM products p
WHERE p.id > 0 AND p.variants IS NOT NULL AND JSON_LENGTH(p.variants) > 0
  AND NOT EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id);

-- A4. Each service's price today and what it becomes (only while the old pricing columns exist).
SELECT s.id, s.name, s.pricing_model, s.base_price AS old_base_price, s.hourly_rate, s.daily_rate,
       CASE s.pricing_model WHEN 'hourly' THEN s.hourly_rate WHEN 'daily' THEN s.daily_rate ELSE s.base_price END AS new_starting_price
FROM services s WHERE s.id > 0 ORDER BY s.id;

-- A5. For each pricing model: how many services, and is a matching service unit set up? (service_unit_found = 0 means: add that unit before part B)
SELECT s.pricing_model, COUNT(DISTINCT s.id) AS services, MAX(u.id IS NOT NULL) AS service_unit_found
FROM services s
LEFT JOIN units_of_measure u ON u.dimension = 'service_unit'
  AND FIND_IN_SET(LOWER(u.code) COLLATE utf8mb4_unicode_ci, CAST(CASE s.pricing_model WHEN 'hourly' THEN 'hour,hr,hours' WHEN 'daily' THEN 'day,days' WHEN 'subscription' THEN 'month,mo,months' ELSE 'project' END AS CHAR) COLLATE utf8mb4_unicode_ci) > 0
WHERE s.id > 0
GROUP BY s.pricing_model;

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
    -- 1. the old unit word becomes a foreign key value
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'unit_of_measure') THEN
        UPDATE services s
        JOIN units_of_measure u ON LOWER(u.code) COLLATE utf8mb4_unicode_ci = LOWER(s.unit_of_measure) COLLATE utf8mb4_unicode_ci AND u.dimension = 'service_unit'
        SET s.price_unit_id = u.id
        WHERE s.id > 0 AND s.price_unit_id IS NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'pricing_model') THEN
        -- 2. the rate that was the real price becomes the starting price
        UPDATE services SET base_price = hourly_rate WHERE id > 0 AND pricing_model = 'hourly' AND hourly_rate IS NOT NULL;
        UPDATE services SET base_price = daily_rate  WHERE id > 0 AND pricing_model = 'daily'  AND daily_rate  IS NOT NULL;

        -- 3. the price unit, where it is still empty, comes from the pricing model
        UPDATE services s
        JOIN units_of_measure u ON u.dimension = 'service_unit'
         AND FIND_IN_SET(LOWER(u.code) COLLATE utf8mb4_unicode_ci, CAST(CASE s.pricing_model WHEN 'hourly' THEN 'hour,hr,hours' WHEN 'daily' THEN 'day,days' WHEN 'subscription' THEN 'month,mo,months' ELSE 'project' END AS CHAR) COLLATE utf8mb4_unicode_ci) > 0
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
    CALL drop_legacy_column('services', 'pricing_model');
    CALL drop_legacy_column('services', 'hourly_rate');
    CALL drop_legacy_column('services', 'daily_rate');
END$$
DELIMITER ;
CALL drop_legacy_product_service_columns();
DROP PROCEDURE IF EXISTS drop_legacy_product_service_columns;
DROP PROCEDURE IF EXISTS drop_legacy_column;

-- PART C - RESULT CHECK. Expect 0 rows from the first query (all 11 gone), then every service with its starting price and unit.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'products' AND column_name IN ('bulk_pricing', 'recommended_products', 'purchase_count', 'variants'))
    OR (table_name = 'services' AND column_name IN ('quote_count', 'order_count', 'service_category', 'unit_of_measure', 'pricing_model', 'hourly_rate', 'daily_rate')));
SELECT s.id, s.name, s.base_price AS starting_price, s.minimum_charge, u.name AS price_unit FROM services s LEFT JOIN units_of_measure u ON u.id = s.price_unit_id WHERE s.id > 0 ORDER BY s.id;
