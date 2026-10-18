-- =====================================================================
-- 200_menus_sides.sql
-- Menus dishes and recipes, build steps 2.1 and 2.2 (docs/MENUS_DISHES_PLAN.md): sides, and how much of each goes in a serving.
--   menus_sides          what is served: ugali, pilau, kale, nyama choma, a soda. A side is made from a recipe of its own (script 194) or is a ready-to-serve ingredient bought and sold as it is.
--                        It may name the unit its amounts are written in (grams for a recipe counted in kilograms) and the station that usually makes it.
--   menus_side_amounts   how much of the side goes in each serving size: Jumbo 350 g, Medium 250 g, Kids 100 g. Where a size has no row, the side's own amount is used (1 for a soda).
-- Nothing is sold through sides yet: dishes and the till work as before. Run 137, 193 and 194 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. are the tables there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_sides', 'menus_side_amounts');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_sides (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(80) NOT NULL,
    recipe_id      BIGINT UNSIGNED NULL,                           -- made from this recipe of its own ...
    ingredient_id  BIGINT UNSIGNED NULL,                           -- ... or it is this ready-to-serve ingredient (exactly one of the two)
    unit_id        BIGINT UNSIGNED NULL,                           -- the unit the amounts are written in; empty: the recipe's own unit (or portions), or the ingredient's base unit
    base_amount    DECIMAL(18,4) NOT NULL DEFAULT 1,               -- in a serving, when its size has no amount of its own
    station_id     BIGINT UNSIGNED NULL,                           -- the station that usually makes it (menus_stations)
    note           VARCHAR(255) NULL,
    sort_order     INT NOT NULL DEFAULT 0,
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_menus_side_name (name),
    KEY idx_menus_side_recipe (recipe_id),
    KEY idx_menus_side_ingredient (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_side_amounts (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    side_id     BIGINT UNSIGNED NOT NULL,
    serving_id  BIGINT UNSIGNED NOT NULL,                          -- menus_servings
    amount      DECIMAL(18,4) NOT NULL,                            -- in the side's unit
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_side_amount (side_id, serving_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the two tables are there (2 rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_sides', 'menus_side_amounts');
-- C2. nothing in them yet (0 and 0)
SELECT (SELECT COUNT(*) FROM menus_sides) AS sides, (SELECT COUNT(*) FROM menus_side_amounts) AS amounts;
