-- =====================================================================
-- 209_menus_order_packaging.sql
-- Menus packaging, build step 5.4 (docs/MENUS_DISHES_PLAN.md section 6): the packaging list an order was checked out with.
--   menus_order_packaging  one row per packaging item on an order: the count it ended with (0 = taken off), the count the rules asked for, the price of one unit and the amount (from the
--                          price list, never typed), whether it is charged and compulsory, whether the receipt shows it, how the line came about (a rule, added by the cashier, swapped for
--                          another item) and, when it was taken off or changed, the reason that was given (kept so the kitchen can see why guests do without a container).
-- Nothing is charged or posted yet: the permission to waive comes in 5.5 and the posting in 5.6.
-- Run 207 and 208 first, and 126 for the orders. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the table there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_order_packaging';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_order_packaging (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id         BIGINT UNSIGNED NOT NULL,
    item_id          BIGINT UNSIGNED NOT NULL,                     -- menus_ingredient_items.id
    name             VARCHAR(160) NOT NULL,                        -- as it was named then
    quantity         SMALLINT UNSIGNED NOT NULL DEFAULT 0,         -- 0: taken off
    asked            SMALLINT UNSIGNED NOT NULL DEFAULT 0,         -- what the rules asked for
    unit_price       DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount           DECIMAL(12,2) NOT NULL DEFAULT 0,
    charged          TINYINT(1) NOT NULL DEFAULT 0,
    compulsory       TINYINT(1) NOT NULL DEFAULT 0,
    receipt          VARCHAR(6) NOT NULL DEFAULT 'auto',
    source           VARCHAR(8) NOT NULL DEFAULT 'rule',           -- rule | added | swapped
    replaces_item_id BIGINT UNSIGNED NULL,
    reason           VARCHAR(200) NULL,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_menus_order_packaging_order (order_id),
    KEY idx_menus_order_packaging_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the table is there and empty (1 row, 0 lines)
SELECT COUNT(*) AS packaging_lines FROM menus_order_packaging;
