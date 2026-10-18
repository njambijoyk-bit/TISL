-- =====================================================================
-- 213_menus_dish_currency.sql
-- Menus currencies, build step 7.1 (docs/MENUS_DISHES_PLAN.md section 5): a dish can be priced in a currency of its own.
--   menus_dishes.currency_id            the currency the dish's price (and what is added to it: sizes, extras, fees) is in. Empty: the Menus currency (Menus, Configuration), else the base currency.
--   menus_order_lines.native_currency_id  when a line was converted, the currency the dish is priced in
--   menus_order_lines.native_price      what one portion cost in that currency, as listed that day
--   menus_order_lines.native_rate       what one unit of that currency was worth in the order's currency that day (the line's own price is already converted at it)
-- Running this script also writes orders in the Menus currency (the base currency when none is chosen): a dish in yen and a bag in shillings on a shilling menu are each converted at the rate of
-- the day, prices are rounded to two decimals as they are converted, and the order's total is the sum of the rounded lines, so there is never a separate rounding line.
-- Without this script nothing changes: orders are written in the base currency as before. Run 136 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. which columns are there already? (0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_dishes' AND column_name = 'currency_id') OR (table_name = 'menus_order_lines' AND column_name IN ('native_currency_id', 'native_price', 'native_rate')));
-- A2. the Menus currency and the base currency (so you know which one orders will be written in)
SELECT (SELECT code FROM currencies WHERE is_base = 1 LIMIT 1) AS base_currency, (SELECT JSON_UNQUOTE(JSON_EXTRACT(settings, '$.currency_id')) FROM menus_settings WHERE id = 1) AS menus_currency_id;  -- null: the base currency

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_dish_currency;
DELIMITER $$
CREATE PROCEDURE add_dish_currency()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_dishes' AND column_name = 'currency_id') THEN
        ALTER TABLE menus_dishes ADD COLUMN currency_id BIGINT UNSIGNED NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_lines' AND column_name = 'native_currency_id') THEN
        ALTER TABLE menus_order_lines ADD COLUMN native_currency_id BIGINT UNSIGNED NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_lines' AND column_name = 'native_price') THEN
        ALTER TABLE menus_order_lines ADD COLUMN native_price DECIMAL(12,2) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_lines' AND column_name = 'native_rate') THEN
        ALTER TABLE menus_order_lines ADD COLUMN native_rate DECIMAL(18,8) NULL;
    END IF;
END$$
DELIMITER ;
CALL add_dish_currency();
DROP PROCEDURE IF EXISTS add_dish_currency;

-- PART C - CHECK AFTER
-- C1. the four columns are there (4 rows)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_dishes' AND column_name = 'currency_id') OR (table_name = 'menus_order_lines' AND column_name IN ('native_currency_id', 'native_price', 'native_rate')));
-- C2. no dish has a currency of its own yet (0)
SELECT COUNT(*) AS dishes_with_a_currency FROM menus_dishes WHERE currency_id IS NOT NULL;
