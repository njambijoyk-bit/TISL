-- =====================================================================
-- 205_menus_recipe_line_flags.sql
-- Menus modifiers, build step 4.1 (docs/MENUS_DISHES_PLAN.md): two flags on a recipe line.
--   menus_recipe_lines.removable   the customer may ask to leave this ingredient out (no onions, no mayo)
--   menus_recipe_lines.extra_allowed  the customer may ask for more of this ingredient (extra cheese)
-- Only an ingredient line of a recipe that is made to order can carry them: a recipe that is made ahead in batches cannot lose its beef once it is cooked, and a recipe inside a recipe
-- is taken or left as a whole. Every line that is there now has both flags off, so nothing in the till, the kitchen or the books changes. What a removal or an extra costs comes in 4.2,
-- and choosing them on an order in 4.3.
-- Run 183 and 197 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. are the columns there already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name IN ('removable', 'extra_allowed');
-- A2. how many recipe lines there are now (they all keep both flags off)
SELECT COUNT(*) AS recipe_lines FROM menus_recipe_lines;

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_recipe_line_flags;
DELIMITER $$
CREATE PROCEDURE add_recipe_line_flags()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name = 'removable') THEN
        ALTER TABLE menus_recipe_lines ADD COLUMN removable TINYINT(1) NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name = 'extra_allowed') THEN
        ALTER TABLE menus_recipe_lines ADD COLUMN extra_allowed TINYINT(1) NOT NULL DEFAULT 0;
    END IF;
END$$
DELIMITER ;
CALL add_recipe_line_flags();
DROP PROCEDURE IF EXISTS add_recipe_line_flags;

-- PART C - CHECK AFTER
-- C1. both columns are there (2 rows)
SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_recipe_lines' AND column_name IN ('removable', 'extra_allowed') ORDER BY column_name;
-- C2. nothing is flagged yet (the same count as A2; 0 and 0)
SELECT COUNT(*) AS recipe_lines, SUM(removable) AS may_be_removed, SUM(extra_allowed) AS may_have_extra FROM menus_recipe_lines;
