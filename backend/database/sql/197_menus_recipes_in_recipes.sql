-- =====================================================================
-- 197_menus_recipes_in_recipes.sql
-- Menus dishes and recipes, build step 1.4 (docs/MENUS_DISHES_PLAN.md): a recipe line can be another recipe, not only an ingredient
-- (a tomato and onion base that a stew and a pilau both use).
--   menus_recipe_lines.ingredient_id   may now be empty (a line that is a recipe)
--   menus_recipe_lines.sub_recipe_id   the recipe of its own (script 194) this line uses; its amount is in that recipe's unit (script 195) or portions
-- Every line that is there now is an ingredient line and stays exactly as it is. Nothing in the till, the kitchen or the books changes.
-- Run 183 and 194 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the column there already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name = 'sub_recipe_id';
-- A2. may ingredient_id be empty yet? (IS_NULLABLE says NO on the first run)
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name = 'ingredient_id';
-- A3. how many recipe lines there are now (all of them are ingredient lines)
SELECT COUNT(*) AS recipe_lines FROM menus_recipe_lines;

-- PART B - CHANGE
ALTER TABLE menus_recipe_lines MODIFY ingredient_id BIGINT UNSIGNED NULL;

DROP PROCEDURE IF EXISTS add_recipe_sub_line;
DELIMITER $$
CREATE PROCEDURE add_recipe_sub_line()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name = 'sub_recipe_id') THEN
        ALTER TABLE menus_recipe_lines ADD COLUMN sub_recipe_id BIGINT UNSIGNED NULL AFTER ingredient_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND index_name = 'idx_menus_recipe_line_sub') THEN
        ALTER TABLE menus_recipe_lines ADD KEY idx_menus_recipe_line_sub (sub_recipe_id);
    END IF;
END$$
DELIMITER ;
CALL add_recipe_sub_line();
DROP PROCEDURE IF EXISTS add_recipe_sub_line;

-- PART C - CHECK AFTER
-- C1. sub_recipe_id is there, and ingredient_id now says YES to empty (2 rows)
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name IN ('ingredient_id', 'sub_recipe_id') ORDER BY column_name;
-- C2. the lines are as they were (the same count as A3; none is a recipe line yet)
SELECT COUNT(*) AS recipe_lines, SUM(sub_recipe_id IS NOT NULL) AS lines_that_are_recipes FROM menus_recipe_lines;
