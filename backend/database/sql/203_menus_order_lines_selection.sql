-- =====================================================================
-- 203_menus_order_lines_selection.sql
-- Menus dishes and recipes, build step 3.4 (docs/MENUS_DISHES_PLAN.md): an order line remembers what was sold, so a later change to the dish never changes an old order.
--   menus_order_lines.serving_id   the size that was ordered (menus_servings)
--   menus_order_lines.serving      its name as it was
--   menus_order_lines.selection    the sides that came with it: [{slot, side, qty, upcharge, ...}] as picked, always-included sides too
-- The sides picked also travel to the sale in the line's `menu_uses`, which the books already carry for each dish line; stock does not read them yet (step 3.6). Nothing in the till changes
-- until the till takes these picks (step 3.7). Run 136 and 202 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. which columns are there already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_lines' AND column_name IN ('serving_id', 'serving', 'selection');

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_order_line_selection;
DELIMITER $$
CREATE PROCEDURE add_order_line_selection()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_lines' AND column_name = 'serving_id') THEN
        ALTER TABLE menus_order_lines ADD COLUMN serving_id BIGINT UNSIGNED NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_lines' AND column_name = 'serving') THEN
        ALTER TABLE menus_order_lines ADD COLUMN serving VARCHAR(60) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_lines' AND column_name = 'selection') THEN
        ALTER TABLE menus_order_lines ADD COLUMN selection JSON NULL;
    END IF;
END$$
DELIMITER ;
CALL add_order_line_selection();
DROP PROCEDURE IF EXISTS add_order_line_selection;

-- PART C - CHECK AFTER
-- C1. the three columns are there (3 rows)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_lines' AND column_name IN ('serving_id', 'serving', 'selection');
-- C2. no order line has a size or picks yet (0)
SELECT COUNT(*) AS lines_with_picks FROM menus_order_lines WHERE serving_id IS NOT NULL OR selection IS NOT NULL;
