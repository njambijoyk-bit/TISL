-- =====================================================================
-- 194_menus_recipes_stand_alone.sql
-- Menus dishes and recipes, build step 1.1 (docs/MENUS_DISHES_PLAN.md): a recipe can stand on its own, not only as "the recipe of one dish".
--   menus_recipes.dish_id   may now be empty (a recipe of its own, like a tomato and onion base that stew and pilau both use later)
--   menus_recipes.name      what a recipe of its own is called (a dish's recipe keeps taking the dish's name, so its name stays empty)
-- Every recipe that is there now is a dish's recipe and stays exactly as it is. Nothing in the till, the kitchen or the books changes.
-- Run 183 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the name column there already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND column_name = 'name';
-- A2. may dish_id be empty yet? (IS_NULLABLE says NO on the first run)
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND column_name = 'dish_id';
-- A3. how many recipes there are now (all of them are dishes' recipes)
SELECT COUNT(*) AS recipes FROM menus_recipes;

-- PART B - CHANGE
ALTER TABLE menus_recipes MODIFY dish_id BIGINT UNSIGNED NULL;

DROP PROCEDURE IF EXISTS add_recipe_name;
DELIMITER $$
CREATE PROCEDURE add_recipe_name()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND column_name = 'name') THEN
        ALTER TABLE menus_recipes ADD COLUMN name VARCHAR(120) NULL AFTER dish_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND index_name = 'uq_menus_recipe_name') THEN
        ALTER TABLE menus_recipes ADD UNIQUE KEY uq_menus_recipe_name (name);
    END IF;
END$$
DELIMITER ;
CALL add_recipe_name();
DROP PROCEDURE IF EXISTS add_recipe_name;

-- PART C - CHECK AFTER
-- C1. name is there, and dish_id now says YES to empty (2 rows)
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND column_name IN ('dish_id', 'name') ORDER BY column_name;
-- C2. the name key is there (1 row)
SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'menus_recipes' AND index_name = 'uq_menus_recipe_name';
-- C3. the recipes are as they were (the same count as A3; none has a name yet)
SELECT COUNT(*) AS recipes, SUM(name IS NOT NULL) AS with_a_name FROM menus_recipes;
