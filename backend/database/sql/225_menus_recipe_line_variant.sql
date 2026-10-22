-- =====================================================================
-- 225_menus_recipe_line_variant.sql
-- Menus recipes: a recipe line may name the variant it takes (menus_recipe_lines.item_id).
--   empty   the ingredient's pick rule chooses the variant, as it always has (preferred, cheapest, first expiring)
--   set     that variant's batches are taken first; if it runs short the rest comes from the other variants in the usual order
-- Every line that is there now keeps it empty, so nothing in the till, the kitchen or the books changes.
-- Run 183 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the column there already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name = 'item_id';
-- A2. how many recipe lines there are now (they all stay on the pick rule)
SELECT COUNT(*) AS recipe_lines FROM menus_recipe_lines;

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_recipe_line_variant;
DELIMITER $$
CREATE PROCEDURE add_recipe_line_variant()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name = 'item_id') THEN
        ALTER TABLE menus_recipe_lines ADD COLUMN item_id BIGINT UNSIGNED NULL;
    END IF;
END$$
DELIMITER ;
CALL add_recipe_line_variant();
DROP PROCEDURE IF EXISTS add_recipe_line_variant;

-- PART C - CHECK AFTER
-- C1. the column is there (1 row)
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name = 'item_id';
-- C2. no line names a variant yet (0)
SELECT COUNT(*) AS lines_naming_a_variant FROM menus_recipe_lines WHERE item_id IS NOT NULL;
