-- =====================================================================
-- 165_menus_membership.sql
-- Memberships step 4 (docs/MEMBERSHIPS_PLAN.md): meal plans for members.
--   menus_plans.requires_membership   1 = only people who hold a membership in good standing may subscribe (and keep the plan running)
--   menus_plans.membership_plan_ids   which membership plans count (empty = any)
-- Off for every plan until you tick it. It only has an effect while the Memberships module is licensed and switched on.
-- Run 150 and 162 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_plans' AND column_name IN ('requires_membership', 'membership_plan_ids');

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_menus_plan_membership_columns;
DELIMITER $$
CREATE PROCEDURE add_menus_plan_membership_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_plans' AND column_name = 'requires_membership') THEN
        ALTER TABLE menus_plans ADD COLUMN requires_membership TINYINT(1) NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_plans' AND column_name = 'membership_plan_ids') THEN
        ALTER TABLE menus_plans ADD COLUMN membership_plan_ids JSON NULL;
    END IF;
END$$
DELIMITER ;
CALL add_menus_plan_membership_columns();
DROP PROCEDURE IF EXISTS add_menus_plan_membership_columns;

-- PART C - CHECK. Expect two rows.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_plans' AND column_name IN ('requires_membership', 'membership_plan_ids');
