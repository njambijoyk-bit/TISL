-- =====================================================================
-- 201_menus_sides_from_dishes.sql
-- Menus dishes and recipes, build step 2.3 (docs/MENUS_DISHES_PLAN.md): today's dishes get sides. Two columns that keep track of where a copy came from; the copying itself is done in the app
-- (Menus, Sides, "Make sides from the dishes' recipes"), which shows what it will do first and does nothing twice.
--   menus_recipes.copied_from_recipe_id   a recipe of its own that was copied from a dish's recipe: the dish's recipe it was copied from
--   menus_sides.from_dish_id              a side that was made from a dish's recipe: the dish (step 3 builds a one-side dish from it)
-- The dish keeps its own recipe: selling still works exactly as before until selling through sides is switched on (step 2.4). Run 183, 194, 197 and 200 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. which columns are there already? (0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'menus_recipes' AND column_name = 'copied_from_recipe_id') OR (table_name = 'menus_sides' AND column_name = 'from_dish_id'));
-- A2. how many dishes have a recipe now (these are what the app will copy)
SELECT COUNT(*) AS dish_recipes FROM menus_recipes WHERE dish_id IS NOT NULL;

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_sides_from_dishes;
DELIMITER $$
CREATE PROCEDURE add_sides_from_dishes()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND column_name = 'copied_from_recipe_id') THEN
        ALTER TABLE menus_recipes ADD COLUMN copied_from_recipe_id BIGINT UNSIGNED NULL AFTER dish_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_sides' AND column_name = 'from_dish_id') THEN
        ALTER TABLE menus_sides ADD COLUMN from_dish_id BIGINT UNSIGNED NULL AFTER ingredient_id;
    END IF;
END$$
DELIMITER ;
CALL add_sides_from_dishes();
DROP PROCEDURE IF EXISTS add_sides_from_dishes;

-- PART C - CHECK AFTER
-- C1. both columns are there (2 rows)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'menus_recipes' AND column_name = 'copied_from_recipe_id') OR (table_name = 'menus_sides' AND column_name = 'from_dish_id'));
-- C2. nothing copied yet (0 and 0)
SELECT (SELECT COUNT(*) FROM menus_recipes WHERE copied_from_recipe_id IS NOT NULL) AS copies, (SELECT COUNT(*) FROM menus_sides WHERE from_dish_id IS NOT NULL) AS sides_from_dishes;
