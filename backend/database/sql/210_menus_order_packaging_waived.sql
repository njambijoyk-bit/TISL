-- =====================================================================
-- 210_menus_order_packaging_waived.sql
-- Menus packaging, build step 5.5 (docs/MENUS_DISHES_PLAN.md section 6): waiving a charge that is compulsory is logged like a discount.
--   menus_order_packaging.waived_amount  what the customer was not charged for a compulsory, priced line (the rules' amount less the amount it ended with); 0 when nothing was waived
--   menus_order_packaging.waived_by      who waived it (they hold the permission to waive packaging)
-- Run 209 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. are the columns there already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_packaging' AND column_name IN ('waived_amount', 'waived_by');

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_order_packaging_waived;
DELIMITER $$
CREATE PROCEDURE add_order_packaging_waived()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_packaging' AND column_name = 'waived_amount') THEN
        ALTER TABLE menus_order_packaging ADD COLUMN waived_amount DECIMAL(12,2) NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_packaging' AND column_name = 'waived_by') THEN
        ALTER TABLE menus_order_packaging ADD COLUMN waived_by BIGINT UNSIGNED NULL;
    END IF;
END$$
DELIMITER ;
CALL add_order_packaging_waived();
DROP PROCEDURE IF EXISTS add_order_packaging_waived;

-- PART C - CHECK AFTER
-- C1. both columns are there (2 rows)
SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_order_packaging' AND column_name IN ('waived_amount', 'waived_by') ORDER BY column_name;
-- C2. nothing is waived yet (0)
SELECT COALESCE(SUM(waived_amount), 0) AS waived FROM menus_order_packaging;
