-- =====================================================================
-- 132_menus_ingredients.sql
-- Menus module, step 1.1 (docs/MENUS_PLAN.md): ingredient families and their variants.
--   menus_ingredient_families   "Wheat flour": the unit recipes use (g, ml, each), how the kitchen picks a variant, allergens and tags
--   menus_ingredient_variants   the real stock items in a family ("Exe 2 kg", "Pembe 24 kg"), in order of preference, and how much of the
--                               family's unit one stock unit of that item holds (a 2 kg pack in a family measured in grams = 2000)
-- A recipe line can name a family ("200 g wheat flour"); the kitchen then takes the preferred variant first and the others when it runs out.
-- Nothing in the shop or the books changes. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the tables are absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_ingredient_families', 'menus_ingredient_variants');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_ingredient_families (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(120) NOT NULL,
    unit_id      BIGINT UNSIGNED NOT NULL,                       -- the unit recipes are written in (units_of_measure)
    pick_rule    VARCHAR(16) NOT NULL DEFAULT 'preferred',       -- preferred | cheapest | first_expiring
    allergens    JSON NULL,                                      -- ["milk","wheat"]
    tags         JSON NULL,                                      -- ["meat","pork","alcohol"...]: what it is, for diet badges
    notes        VARCHAR(255) NULL,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_menus_family_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_ingredient_variants (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    family_id      BIGINT UNSIGNED NOT NULL,
    variant_id     BIGINT UNSIGNED NOT NULL,                     -- the stock item (product_variants)
    preference     SMALLINT UNSIGNED NOT NULL DEFAULT 1,         -- 1 = preferred
    units_per_stock DECIMAL(18,6) NOT NULL DEFAULT 1,            -- family units in one stock unit of this item
    is_allowed     TINYINT(1) NOT NULL DEFAULT 1,                -- 0 = never used as a substitute
    sell_retail    TINYINT(1) NOT NULL DEFAULT 0,                -- 1 = also sold in the shop (a jar of spice); 0 = hidden from the shop
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_menus_ingredient_variant (variant_id),
    KEY idx_menus_ingredient_family (family_id, preference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - READ-ONLY CHECK
SELECT f.name, COUNT(v.id) AS variants FROM menus_ingredient_families f LEFT JOIN menus_ingredient_variants v ON v.family_id = f.id GROUP BY f.id, f.name;
