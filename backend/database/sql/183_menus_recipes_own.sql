-- =====================================================================
-- 183_menus_recipes_own.sql
-- Menus owns its stock (docs/MENUS_STOCK_PLAN.md), step 3: recipes written on ingredients, and the record of what a sale used.
--   menus_recipes        a dish's recipe: how many portions one batch makes, whether it is made to order (a sale uses the ingredients) or made ahead
--   menus_recipe_lines   what goes in: an ingredient, an amount in its base or alternate unit, and the waste in preparing it
--   menus_recipe_steps   the method
--   menus_uses           one record each time stock was used for a dish (a sale, later a production run): what it cost and the journal that booked it, so it can be undone
--   menus_stock_moves.use_id   ties each "used" movement to its record
-- The earlier recipe tables (recipes, recipe_items, recipe_steps, which pointed at product variants) are left alone for now.
-- Run 181 and 182 first. Nothing in the shop changes. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_recipes', 'menus_recipe_lines', 'menus_recipe_steps', 'menus_uses');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_stock_moves' AND column_name = 'use_id';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_recipes (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id         BIGINT UNSIGNED NOT NULL,
    yield_qty       DECIMAL(18,4) NOT NULL DEFAULT 1,              -- portions one batch makes (the lines are for this many)
    made_to_order   TINYINT(1) NOT NULL DEFAULT 1,                 -- 1 = a sale uses the ingredients; 0 = made ahead in batches
    note            VARCHAR(255) NULL,
    visibility      VARCHAR(12) NOT NULL DEFAULT 'internal',       -- internal | public (may be shown on the website and in courses)
    prep_minutes    SMALLINT UNSIGNED NULL,
    cook_minutes    SMALLINT UNSIGNED NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_menus_recipe_dish (dish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_recipe_lines (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipe_id      BIGINT UNSIGNED NOT NULL,
    ingredient_id  BIGINT UNSIGNED NOT NULL,
    quantity       DECIMAL(18,4) NOT NULL,                         -- for the recipe's whole yield, in the unit below
    unit           VARCHAR(4) NOT NULL DEFAULT 'base',             -- base | alt (the ingredient's own units)
    waste_pct      DECIMAL(5,2) NOT NULL DEFAULT 0,                -- lost in preparing it: 5 means 5 percent more is taken from stock
    position       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_menus_recipe_line (recipe_id, position),
    KEY idx_menus_recipe_line_ing (ingredient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_recipe_steps (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipe_id   BIGINT UNSIGNED NOT NULL,
    position    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    body        TEXT NOT NULL,
    minutes     SMALLINT UNSIGNED NULL,
    image       VARCHAR(255) NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_menus_recipe_step (recipe_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_uses (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ref_type     VARCHAR(20) NOT NULL,                             -- voucher | production | waste ...
    ref_id       BIGINT UNSIGNED NOT NULL,
    dish_id      BIGINT UNSIGNED NULL,
    recipe_id    BIGINT UNSIGNED NULL,
    location_id  BIGINT UNSIGNED NOT NULL,
    portions     DECIMAL(18,4) NOT NULL DEFAULT 0,
    cost         DECIMAL(18,2) NOT NULL DEFAULT 0,                 -- at the cost of the batches it came from
    journal_id   BIGINT UNSIGNED NULL,                             -- Dr Food Cost of Sales, Cr Food Ingredients Inventory
    status       VARCHAR(10) NOT NULL DEFAULT 'posted',            -- posted | reversed
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_use_ref (ref_type, ref_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_menus_move_use_id;
DELIMITER $$
CREATE PROCEDURE add_menus_move_use_id()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_stock_moves' AND column_name = 'use_id') THEN
        ALTER TABLE menus_stock_moves ADD COLUMN use_id BIGINT UNSIGNED NULL;
        ALTER TABLE menus_stock_moves ADD KEY idx_menus_move_use (use_id);
    END IF;
END$$
DELIMITER ;
CALL add_menus_move_use_id();
DROP PROCEDURE IF EXISTS add_menus_move_use_id;

-- PART C - CHECK AFTER (4 tables and the column)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_recipes', 'menus_recipe_lines', 'menus_recipe_steps', 'menus_uses');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_stock_moves' AND column_name = 'use_id';
