-- =====================================================================
-- 97_location_capabilities.sql
-- What each location is allowed to do, and the stock customers can actually buy.
--
--   locations.kind                shop | warehouse | factory | other (a label; it only fills in sensible defaults)
--   locations.sells_to_customers  1 = customers can choose it and buy from it (a shop). 0 = staff only (a warehouse or factory)
--   locations.fulfils_orders      1 = delivery notes may be made from it
--   locations.receives_purchases  1 = goods received notes may land in it
--   locations.produces            1 = production runs may happen in it
--
--   products.sellable_quantity          stock customers can buy: the sum over locations that sell to customers
--   product_variants.sellable_quantity  the same, for one variant
--   (stock_quantity keeps meaning "everything we hold, in every location", for staff.)
--
-- Every location you have today becomes a "shop" that does everything but produce, so nothing changes
-- until you edit a location. After this, set your warehouse to kind = warehouse, and untick "Sells to customers".
-- Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. New columns already there? (expect 0 rows on the first run)
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'locations' AND column_name IN ('kind', 'sells_to_customers', 'fulfils_orders', 'receives_purchases', 'produces'))
    OR (table_name IN ('products', 'product_variants') AND column_name = 'sellable_quantity'));

-- A2. Your locations (so you can see which one is the warehouse)
SELECT id, code, name, is_active, is_default FROM locations ORDER BY sort_order, name;

-- A3. How much stock each location holds right now
SELECT l.id, l.name, COUNT(s.location_id) AS stock_rows, COALESCE(SUM(s.quantity), 0) AS units_held
FROM locations l
LEFT JOIN variant_location_stock s ON s.location_id = l.id
GROUP BY l.id, l.name
ORDER BY l.id;

-- A4. The type of the stock columns being mirrored (for your information)
SELECT table_name, column_name, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND column_name = 'stock_quantity'
  AND table_name IN ('products', 'product_variants');


-- A5. Locations where production runs have already been recorded (these keep "Produces" switched on below)
SELECT location_id, COUNT(*) AS production_runs FROM productions GROUP BY location_id;


-- ---------------------------------------------------------------------
-- PART B — ADD COLUMNS, THEN FILL THE STOCK COLUMNS (each step skips itself if already done)
-- ---------------------------------------------------------------------

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

CALL add_column_if_missing('locations', 'kind',               'VARCHAR(20) NOT NULL DEFAULT ''shop''');
CALL add_column_if_missing('locations', 'sells_to_customers', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_column_if_missing('locations', 'fulfils_orders',     'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_column_if_missing('locations', 'receives_purchases', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_column_if_missing('locations', 'produces',           'TINYINT(1) NOT NULL DEFAULT 0');

CALL add_column_if_missing('product_variants', 'sellable_quantity', 'DECIMAL(14,4) NOT NULL DEFAULT 0');
CALL add_column_if_missing('products',         'sellable_quantity', 'DECIMAL(14,4) NOT NULL DEFAULT 0');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- A location that has already made things keeps being allowed to (new locations start with Produces off)
UPDATE locations SET produces = 1 WHERE id > 0 AND id IN (SELECT DISTINCT location_id FROM productions);

-- Fill the new stock columns. A variant with stock rows counts the rows of active locations that sell to customers;
-- one with no rows at all keeps its own stock figure (the same rule the app uses when it recalculates).
UPDATE product_variants v
SET v.sellable_quantity = CASE
    WHEN EXISTS (SELECT 1 FROM variant_location_stock s WHERE s.product_variant_id = v.id)
        THEN COALESCE((SELECT SUM(s.quantity) FROM variant_location_stock s
                       JOIN locations l ON l.id = s.location_id
                       WHERE s.product_variant_id = v.id AND l.is_active = 1 AND l.sells_to_customers = 1), 0)
    ELSE v.stock_quantity
END
WHERE v.id > 0;

-- A product is the sum of its variants (a product with no variants keeps its own stock figure)
UPDATE products p
SET p.sellable_quantity = COALESCE((SELECT SUM(v.sellable_quantity) FROM product_variants v WHERE v.product_id = p.id), p.stock_quantity)
WHERE p.id > 0;


-- ---------------------------------------------------------------------
-- PART C — RESULT CHECK
-- ---------------------------------------------------------------------

-- C1. Five new columns on locations and one each on products and variants (expect 7 rows)
SELECT table_name, column_name, column_type, column_default
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'locations' AND column_name IN ('kind', 'sells_to_customers', 'fulfils_orders', 'receives_purchases', 'produces'))
    OR (table_name IN ('products', 'product_variants') AND column_name = 'sellable_quantity'))
ORDER BY table_name, column_name;

-- C2. Every location is a shop for now (expect your locations, each kind = shop, sells = 1; produces = 1 only where you had production runs)
SELECT id, name, kind, sells_to_customers, fulfils_orders, receives_purchases, produces FROM locations ORDER BY id;

-- C3. Products whose customer-buyable stock differs from the total held. On the first run this is 0 rows,
--     because every location still sells to customers. After you mark a warehouse, these are the products the
--     warehouse holds that shops do not.
SELECT id, name, stock_quantity, sellable_quantity FROM products
WHERE ABS(stock_quantity - sellable_quantity) > 0.00005
ORDER BY id LIMIT 50;
