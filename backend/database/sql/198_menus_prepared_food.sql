-- =====================================================================
-- 198_menus_prepared_food.sql
-- Menus dishes and recipes, build steps 1.5 and 1.6 (docs/MENUS_DISHES_PLAN.md): food cooked ahead is made in a batch from a recipe of its own, and waits on the shelf as prepared stock.
--   menus_prep_runs         one batch made: the recipe, the branch, who made it and when, how much was planned and how much came out, what it cost, the time it was
--                           expected to take and the time it took
--   menus_prep_run_inputs   what the batch used, ingredient by ingredient: what the recipe said and what was really used (so the difference is kept)
--   menus_prep_lots         the prepared stock on the shelf: what a batch made, how much is left, what it cost for each unit
--   menus_prep_moves        every change to it (made, undone; later served, wasted, counted)
-- Making a batch uses the ingredients and books Dr Prepared Food Inventory, Cr the ingredient stock accounts (script 193 made the account). Dishes made ahead keep the shelf they have
-- (menus_dish_batches); they move over to this one in a later step.
-- Run 181 to 185, 193 and 194 to 197 first. Nothing in the shop changes. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. which of the tables are there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_prep_runs', 'menus_prep_run_inputs', 'menus_prep_lots', 'menus_prep_moves');
-- A2. the account the batches are booked to (1 row; if it is empty run 193 first)
SELECT id, name FROM ledgers WHERE name = 'Prepared Food Inventory';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_prep_runs (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number            VARCHAR(20) NOT NULL,
    recipe_id         BIGINT UNSIGNED NOT NULL,
    location_id       BIGINT UNSIGNED NOT NULL,
    chef_id           BIGINT UNSIGNED NULL,                            -- who made it (menus_chefs)
    status            VARCHAR(10) NOT NULL DEFAULT 'posted',           -- posted | cancelled
    planned_qty       DECIMAL(18,4) NOT NULL,                          -- the batch size the inputs and the time were worked out for (in the recipe's unit, or portions)
    qty               DECIMAL(18,4) NOT NULL,                          -- what really came out, in the same unit
    unit_id           BIGINT UNSIGNED NULL,                            -- the unit the recipe counted in when it was made (empty: portions)
    expected_minutes  SMALLINT UNSIGNED NULL,                          -- from the recipe's time by batch size
    started_at        DATETIME NULL,
    finished_at       DATETIME NULL,
    cost              DECIMAL(18,2) NOT NULL DEFAULT 0,                -- what the ingredients cost, in the base currency
    unit_cost         DECIMAL(18,6) NOT NULL DEFAULT 0,                -- for each unit that came out
    lot_id            BIGINT UNSIGNED NULL,
    use_id            BIGINT UNSIGNED NULL,                            -- the record of the ingredients used (it holds the journal)
    client_key        VARCHAR(60) NULL,                                -- stops a double press making the batch twice
    note              VARCHAR(255) NULL,
    made_on           DATE NOT NULL,
    created_by        BIGINT UNSIGNED NULL,
    cancelled_at      TIMESTAMP NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    UNIQUE KEY uq_menus_prep_run_no (number),
    UNIQUE KEY uq_menus_prep_run_key (client_key),
    KEY idx_menus_prep_run_recipe (recipe_id, location_id, made_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_prep_run_inputs (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_id          BIGINT UNSIGNED NOT NULL,
    ingredient_id   BIGINT UNSIGNED NOT NULL,
    expected_qty    DECIMAL(18,4) NOT NULL,                            -- what the recipe says, in the ingredient's base unit
    used_qty        DECIMAL(18,4) NOT NULL,                            -- what was really used
    cost            DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_menus_prep_input_run (run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_prep_lots (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipe_id     BIGINT UNSIGNED NOT NULL,
    location_id   BIGINT UNSIGNED NOT NULL,
    run_id        BIGINT UNSIGNED NULL,
    lot_no        VARCHAR(60) NULL,
    made_on       DATE NOT NULL,
    expiry_date   DATE NULL,
    unit_cost     DECIMAL(18,6) NOT NULL DEFAULT 0,                    -- for each unit, in the base currency
    qty_in        DECIMAL(18,4) NOT NULL,
    qty_left      DECIMAL(18,4) NOT NULL,
    status        VARCHAR(10) NOT NULL DEFAULT 'ok',                   -- ok | held
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_menus_prep_lot (recipe_id, location_id, qty_left),
    KEY idx_menus_prep_lot_expiry (expiry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_prep_moves (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipe_id     BIGINT UNSIGNED NOT NULL,
    location_id   BIGINT UNSIGNED NOT NULL,
    lot_id        BIGINT UNSIGNED NULL,
    kind          VARCHAR(20) NOT NULL,                                -- production | production_reversal | (later) served | waste | count
    quantity      DECIMAL(18,4) NOT NULL,                              -- in is positive, out is negative
    unit_cost     DECIMAL(18,6) NOT NULL DEFAULT 0,
    run_id        BIGINT UNSIGNED NULL,
    ref_type      VARCHAR(20) NULL,
    ref_id        BIGINT UNSIGNED NULL,
    note          VARCHAR(255) NULL,
    moved_on      DATE NOT NULL,
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_menus_prep_move (recipe_id, location_id, moved_on),
    KEY idx_menus_prep_move_lot (lot_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the four tables are there (4 rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_prep_runs', 'menus_prep_run_inputs', 'menus_prep_lots', 'menus_prep_moves');
-- C2. nothing made yet (0 and 0)
SELECT (SELECT COUNT(*) FROM menus_prep_runs) AS batches, (SELECT COUNT(*) FROM menus_prep_lots) AS lots;
