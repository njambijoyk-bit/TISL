-- =====================================================================
-- 184_menus_dishes_own.sql
-- Menus owns its stock (docs/MENUS_STOCK_PLAN.md), step 4: a dish stands on its own, with no product behind it.
--   menus_dishes.price           the dish's own price before tax (copied from the product the dish had, where it had one); product_id and variant_id become optional
--   voucher_items.dish_id        which dish a dish line sold
--   menus_option_uses            a choice that uses more of an ingredient (extra cheese) or leaves one out: now names the ingredient and its unit
--   menus_order_lines.variant_id optional (an order line names the dish)
--   menus_productions            a batch of a made-ahead dish made from ingredients (the cake): what it used, what it cost
--   menus_dish_batches           the portions of a made-ahead dish on the shelf, per branch, costed per portion
--   menus_dish_moves             every change to them (made, sold, taken back, wasted)
-- Run 181 to 183 first. Nothing in the shop changes. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_dishes' AND column_name = 'price') OR (table_name = 'voucher_items' AND column_name = 'dish_id') OR (table_name = 'menus_option_uses' AND column_name IN ('ingredient_id', 'unit')));
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_productions', 'menus_dish_batches', 'menus_dish_moves');
SELECT id, name FROM menus_dishes ORDER BY id;   -- the dishes that exist now (their price is filled in by Part B)

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

CALL add_column_if_missing('menus_dishes', 'price', 'DECIMAL(18,2) NOT NULL DEFAULT 0');
CALL add_column_if_missing('voucher_items', 'dish_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_option_uses', 'ingredient_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_option_uses', 'unit', "VARCHAR(4) NOT NULL DEFAULT 'base'");
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- a dish that had a product keeps the price the product carried
UPDATE menus_dishes d JOIN product_variant_units u ON u.variant_id = d.variant_id AND u.role = 'base' SET d.price = u.price WHERE d.price = 0 AND u.price IS NOT NULL;

-- the product behind a dish, and the variant on an order line, are no longer needed
ALTER TABLE menus_dishes MODIFY product_id BIGINT UNSIGNED NULL, MODIFY variant_id BIGINT UNSIGNED NULL;
ALTER TABLE menus_order_lines MODIFY variant_id BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS menus_productions (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number       VARCHAR(20) NOT NULL,
    dish_id      BIGINT UNSIGNED NOT NULL,
    recipe_id    BIGINT UNSIGNED NULL,
    location_id  BIGINT UNSIGNED NOT NULL,
    portions     DECIMAL(18,4) NOT NULL,
    cost         DECIMAL(18,2) NOT NULL DEFAULT 0,                 -- what the ingredients cost
    unit_cost    DECIMAL(18,6) NOT NULL DEFAULT 0,                 -- per portion
    batch_id     BIGINT UNSIGNED NULL,                             -- the dish batch it made
    use_id       BIGINT UNSIGNED NULL,                             -- the record of the ingredients it used
    status       VARCHAR(10) NOT NULL DEFAULT 'posted',            -- posted | cancelled
    note         VARCHAR(255) NULL,
    made_on      DATE NOT NULL,
    created_by   BIGINT UNSIGNED NULL,
    cancelled_at TIMESTAMP NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_menus_production_no (number),
    KEY idx_menus_production_dish (dish_id, location_id, made_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_dish_batches (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id        BIGINT UNSIGNED NOT NULL,
    location_id    BIGINT UNSIGNED NOT NULL,
    production_id  BIGINT UNSIGNED NULL,
    batch_no       VARCHAR(60) NULL,
    made_on        DATE NOT NULL,
    expiry_date    DATE NULL,
    unit_cost      DECIMAL(18,6) NOT NULL DEFAULT 0,               -- per portion
    qty_in         DECIMAL(18,4) NOT NULL,
    qty_left       DECIMAL(18,4) NOT NULL,
    status         VARCHAR(10) NOT NULL DEFAULT 'ok',              -- ok | held
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_menus_dish_batch (dish_id, location_id, qty_left),
    KEY idx_menus_dish_batch_expiry (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_dish_moves (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id        BIGINT UNSIGNED NOT NULL,
    location_id    BIGINT UNSIGNED NOT NULL,
    batch_id       BIGINT UNSIGNED NULL,
    kind           VARCHAR(20) NOT NULL,                           -- production | production_reversal | sale | sale_reversal | (later) waste | count
    quantity       DECIMAL(18,4) NOT NULL,                         -- portions; in is positive, out is negative
    unit_cost      DECIMAL(18,6) NOT NULL DEFAULT 0,
    use_id         BIGINT UNSIGNED NULL,
    production_id  BIGINT UNSIGNED NULL,
    ref_type       VARCHAR(20) NULL,
    ref_id         BIGINT UNSIGNED NULL,
    note           VARCHAR(255) NULL,
    moved_on       DATE NOT NULL,
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_menus_dish_move (dish_id, location_id, moved_on),
    KEY idx_menus_dish_move_use (use_id),
    KEY idx_menus_dish_move_ref (ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER (the new columns and tables; every dish has the price it had)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_dishes' AND column_name = 'price') OR (table_name = 'voucher_items' AND column_name = 'dish_id') OR (table_name = 'menus_option_uses' AND column_name IN ('ingredient_id', 'unit')));
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_productions', 'menus_dish_batches', 'menus_dish_moves');
SELECT id, name, price FROM menus_dishes ORDER BY id;
