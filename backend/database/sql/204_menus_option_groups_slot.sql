-- =====================================================================
-- 204_menus_option_groups_slot.sql
-- Menus dishes and recipes, build step 3.5 (docs/MENUS_DISHES_PLAN.md): "Choose a side" set meals become slots. The old group of choices is kept, and marked as replaced so it is not offered twice.
--   menus_option_groups.slot_id   the slot (script 202) that now does the job of this group of choices; a group with one is no longer offered when ordering and no longer asks to be answered
-- Nothing is deleted: clear slot_id and the group is offered again. Run 135 and 202 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the column there already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_option_groups' AND column_name = 'slot_id';

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_option_group_slot;
DELIMITER $$
CREATE PROCEDURE add_option_group_slot()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_option_groups' AND column_name = 'slot_id') THEN
        ALTER TABLE menus_option_groups ADD COLUMN slot_id BIGINT UNSIGNED NULL;
    END IF;
END$$
DELIMITER ;
CALL add_option_group_slot();
DROP PROCEDURE IF EXISTS add_option_group_slot;

-- PART C - CHECK AFTER
-- C1. the column is there (1 row)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_option_groups' AND column_name = 'slot_id';
-- C2. no group is replaced yet (0)
SELECT COUNT(*) AS replaced_groups FROM menus_option_groups WHERE slot_id IS NOT NULL;
