-- =====================================================================
-- 195_menus_recipe_yield_unit.sql
-- Menus dishes and recipes, build step 1.2 (docs/MENUS_DISHES_PLAN.md): what a batch of a recipe makes is counted in a unit.
--   menus_recipes.yield_unit_id   the unit one batch is counted in (kilograms, litres, pieces: from the units table; mass, volume or count).
--                                 Empty means portions, as every recipe is today. Only a recipe of its own (script 194) may have one; a dish's recipe counts portions.
-- Every recipe that is there now keeps counting portions. Nothing in the till, the kitchen or the books changes.
-- Run 183 and 194 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the column there already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND column_name = 'yield_unit_id';
-- A2. the units a batch may be counted in (mass, volume and count units that are switched on)
SELECT id, code, name, dimension FROM units_of_measure WHERE is_active = 1 AND dimension IN ('mass', 'volume', 'count') ORDER BY dimension, to_base_factor;

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_recipe_yield_unit;
DELIMITER $$
CREATE PROCEDURE add_recipe_yield_unit()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND column_name = 'yield_unit_id') THEN
        ALTER TABLE menus_recipes ADD COLUMN yield_unit_id BIGINT UNSIGNED NULL AFTER yield_qty;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND constraint_name = 'fk_menus_recipes_yield_unit') THEN
        ALTER TABLE menus_recipes ADD CONSTRAINT fk_menus_recipes_yield_unit FOREIGN KEY (yield_unit_id) REFERENCES units_of_measure (id) ON DELETE RESTRICT;
    END IF;
END$$
DELIMITER ;
CALL add_recipe_yield_unit();
DROP PROCEDURE IF EXISTS add_recipe_yield_unit;

-- PART C - CHECK AFTER
-- C1. the column is there (1 row)
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND column_name = 'yield_unit_id';
-- C2. the foreign key is there (1 row): a unit that a recipe counts in cannot be deleted
SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND constraint_name = 'fk_menus_recipes_yield_unit';
-- C3. every recipe still counts portions (with_a_unit is 0)
SELECT COUNT(*) AS recipes, SUM(yield_unit_id IS NOT NULL) AS with_a_unit FROM menus_recipes;
