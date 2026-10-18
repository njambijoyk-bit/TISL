-- =====================================================================
-- 211_menus_condiments.sql
-- Menus free condiments, build step 5.8 (docs/MENUS_DISHES_PLAN.md section 6): the ketchup and mayonnaise that come with fries.
--   menus_dish_condiments   the allowance on a dish: an ingredient and how many go with each dish sold (fries: 2 ketchup, 1 mayonnaise). They are free.
--   menus_order_condiments  what an order was checked out with: the allowance for the order, and what was actually given. Giving a different count shows a warning, never a block, and the
--                           stock follows what was actually given.
-- Run 181 first (the ingredients). Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. are the tables there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_dish_condiments', 'menus_order_condiments');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_dish_condiments (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id       BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    quantity      SMALLINT UNSIGNED NOT NULL DEFAULT 1,           -- in the ingredient's base unit (a sachet is one each), for each dish sold
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_menus_dish_condiment (dish_id, ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_order_condiments (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id      BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    name          VARCHAR(160) NOT NULL,
    allowed       INT UNSIGNED NOT NULL DEFAULT 0,                -- what the allowances of the dishes ordered add up to
    given         INT UNSIGNED NOT NULL DEFAULT 0,                -- what was actually given
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_menus_order_condiment_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. both tables are there and empty (1 row each, 0 and 0)
SELECT (SELECT COUNT(*) FROM menus_dish_condiments) AS allowances, (SELECT COUNT(*) FROM menus_order_condiments) AS order_lines;
