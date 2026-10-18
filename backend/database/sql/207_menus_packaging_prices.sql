-- =====================================================================
-- 207_menus_packaging_prices.sql
-- Menus packaging, build step 5.1 (docs/MENUS_DISHES_PLAN.md section 6): the price list for takeaway packaging.
--   menus_packaging_prices  one row per ingredient item (a variant: "Container 750 ml") of the kind that Menus, Configuration names as the packaging kind. It holds the price of ONE
--                           unit (not of a pack), the currency it is in (empty: the Menus currency) and the sales account it is booked to (empty: the account the dishes are sold to,
--                           else the books' default). If the packaging kind is changed, or an item moves to another kind, its row stays but is greyed out and read-only until that kind
--                           is the packaging kind again.
-- Nothing is charged or changed on an order: the rules that say what packaging goes with what come in 5.2, and the checkout in 5.3 and 5.4.
-- Run 190 and 193 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the table there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_packaging_prices';
-- A2. the kinds of ingredient there are (one of them is chosen as the packaging kind in Menus, Configuration)
SELECT id, code, name FROM menus_ingredient_kinds ORDER BY sort_order, id;

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_packaging_prices (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    item_id     BIGINT UNSIGNED NOT NULL,                          -- menus_ingredient_items.id
    price       DECIMAL(12,2) NOT NULL,                            -- one unit
    currency_id BIGINT UNSIGNED NULL,                              -- empty: the Menus currency
    ledger_id   BIGINT UNSIGNED NULL,                              -- the sales account; empty: the dishes' sales account
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_packaging_price_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the table is there and empty (1 row, 0 prices)
SELECT COUNT(*) AS prices FROM menus_packaging_prices;
