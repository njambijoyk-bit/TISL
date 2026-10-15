-- =====================================================================
-- 175_pos_variance.sql
-- Point of sale: how big a cash over or short may be before closing the shift needs a supervisor's PIN.
--   pos_branch_settings.variance_limit  per branch, in the base currency (default 100.00; 0 = any difference needs the PIN)
-- Run 169 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pos_branch_settings' AND column_name = 'variance_limit';

-- PART B - CREATE
DROP PROCEDURE IF EXISTS add_pos_variance_limit;
DELIMITER $$
CREATE PROCEDURE add_pos_variance_limit()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pos_branch_settings' AND column_name = 'variance_limit') THEN
        ALTER TABLE pos_branch_settings ADD COLUMN variance_limit DECIMAL(14,2) NOT NULL DEFAULT 100.00;
    END IF;
END$$
DELIMITER ;
CALL add_pos_variance_limit();
DROP PROCEDURE IF EXISTS add_pos_variance_limit;

-- PART C - CHECK AFTER
SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pos_branch_settings' AND column_name = 'variance_limit';
