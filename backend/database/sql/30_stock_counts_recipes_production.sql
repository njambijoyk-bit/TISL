-- =====================================================================
-- 30_stock_counts_recipes_production.sql
-- Stock counts, recipes and production runs.
--
--   stock_counts / stock_count_lines   count a branch's shelves; post the differences
--   recipes / recipe_items             what an item is made of (per yield)
--   productions / production_lines     a run: ingredients used, finished batch made
--
-- A recipe can be "made ahead" (a production run makes a batch of finished
-- stock) or "made to order" (deduct_on_sale = 1: selling it uses the
-- ingredients, the dish itself holds no stock — e.g. a Menus dish).
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Tables already there? (expect 0 rows on first run)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('stock_counts', 'stock_count_lines', 'recipes', 'recipe_items', 'productions', 'production_lines');

-- PART B — CREATE THE TABLES
CREATE TABLE IF NOT EXISTS stock_counts (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number       VARCHAR(20) NULL,
    location_id  BIGINT UNSIGNED NOT NULL,
    status       VARCHAR(10) NOT NULL DEFAULT 'open',       -- open | posted | cancelled
    note         VARCHAR(255) NULL,
    created_by   BIGINT UNSIGNED NULL,
    posted_by    BIGINT UNSIGNED NULL,
    posted_at    DATETIME NULL,
    voucher_id   BIGINT UNSIGNED NULL,                      -- the journal for the net gain / loss
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_count_status (status),
    KEY idx_count_location (location_id)
);

CREATE TABLE IF NOT EXISTS stock_count_lines (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    count_id      BIGINT UNSIGNED NOT NULL,
    variant_id    BIGINT UNSIGNED NOT NULL,
    batch_id      BIGINT UNSIGNED NOT NULL,
    expected_qty  DECIMAL(18,4) NOT NULL,                   -- what the books said when the count began
    counted_qty   DECIMAL(18,4) NULL,                       -- what was found (empty = not counted)
    unit_cost     DECIMAL(18,4) NOT NULL DEFAULT 0,
    KEY idx_cline_count (count_id)
);

CREATE TABLE IF NOT EXISTS recipes (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    variant_id     BIGINT UNSIGNED NOT NULL,                -- the finished item
    yield_qty      DECIMAL(18,4) NOT NULL DEFAULT 1,        -- base units one batch of the recipe makes
    deduct_on_sale TINYINT(1) NOT NULL DEFAULT 0,           -- 1 = made to order: a sale uses the ingredients
    note           VARCHAR(255) NULL,
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_recipe_variant (variant_id)
);

CREATE TABLE IF NOT EXISTS recipe_items (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipe_id   BIGINT UNSIGNED NOT NULL,
    variant_id  BIGINT UNSIGNED NOT NULL,                   -- the ingredient
    quantity    DECIMAL(18,4) NOT NULL,                     -- base units used per yield
    KEY idx_ritem_recipe (recipe_id)
);

CREATE TABLE IF NOT EXISTS productions (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number       VARCHAR(20) NULL,
    recipe_id    BIGINT UNSIGNED NOT NULL,
    variant_id   BIGINT UNSIGNED NOT NULL,                  -- the finished item
    location_id  BIGINT UNSIGNED NOT NULL,
    quantity     DECIMAL(18,4) NOT NULL,                    -- made, base units
    unit_cost    DECIMAL(18,4) NOT NULL DEFAULT 0,          -- ingredients' cost / quantity
    batch_id     BIGINT UNSIGNED NULL,                      -- the finished batch
    status       VARCHAR(10) NOT NULL DEFAULT 'posted',     -- posted | cancelled
    note         VARCHAR(255) NULL,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_prod_recipe (recipe_id)
);

CREATE TABLE IF NOT EXISTS production_lines (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    production_id  BIGINT UNSIGNED NOT NULL,
    variant_id     BIGINT UNSIGNED NOT NULL,                -- the ingredient
    batch_id       BIGINT UNSIGNED NOT NULL,
    quantity       DECIMAL(18,4) NOT NULL,
    unit_cost      DECIMAL(18,4) NOT NULL DEFAULT 0,
    KEY idx_pline_production (production_id)
);

-- PART C — RESULT CHECK. Expect 6 rows.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('stock_counts', 'stock_count_lines', 'recipes', 'recipe_items', 'productions', 'production_lines');
