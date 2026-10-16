-- =====================================================================
-- 181_menus_ingredients_own.sql
-- Menus owns its stock (docs/MENUS_STOCK_PLAN.md), step 1: ingredients that stand on their own, with no product behind them.
--   menus_ingredients        "Wheat flour": a base unit (g) and an optional alternate unit (kg) of the same kind, found in units_of_measure, how the kitchen
--                            picks between its variants, allergens and tags
--   menus_ingredient_items   a VARIANT of it: Exe, Pembe, Soko. It uses the ingredient's units. It may have a pack size (Exe 2 kg = 2000 g) so stock can be
--                            counted in packs; the pack size is kept in the base unit
-- The earlier tables (menus_ingredient_families, menus_ingredient_variants, which pointed at product variants) are left alone for now.
-- Nothing in the shop or the books changes. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the tables are absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_ingredients', 'menus_ingredient_items');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_ingredients (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(120) NOT NULL,
    base_unit_id  BIGINT UNSIGNED NOT NULL,                      -- the smallest unit: stock is kept in it (units_of_measure)
    alt_unit_id   BIGINT UNSIGNED NULL,                          -- a bigger unit of the same kind, for buying and counting (kg for g)
    pick_rule     VARCHAR(16) NOT NULL DEFAULT 'preferred',      -- preferred | cheapest | first_expiring
    allergens     JSON NULL,
    tags          JSON NULL,
    notes         VARCHAR(255) NULL,
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_menus_ingredient_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_ingredient_items (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ingredient_id  BIGINT UNSIGNED NOT NULL,
    name           VARCHAR(120) NOT NULL,                        -- "Exe 2 kg"
    code           VARCHAR(40) NULL,
    pack_size      DECIMAL(18,6) NULL,                           -- one pack, in the ingredient's BASE unit (2 kg of a gram ingredient = 2000)
    track_expiry   TINYINT(1) NOT NULL DEFAULT 0,
    preference     SMALLINT UNSIGNED NOT NULL DEFAULT 1,         -- 1 = preferred
    is_allowed     TINYINT(1) NOT NULL DEFAULT 1,                -- 0 = never used as a substitute
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_menus_ingredient_item_name (ingredient_id, name),
    KEY idx_menus_ingredient_item_pref (ingredient_id, preference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - READ-ONLY CHECK
SELECT i.name, COUNT(v.id) AS variants FROM menus_ingredients i LEFT JOIN menus_ingredient_items v ON v.ingredient_id = i.id GROUP BY i.id, i.name;
