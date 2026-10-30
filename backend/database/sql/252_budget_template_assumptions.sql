-- =====================================================================
-- 252_budget_template_assumptions.sql
-- Budget templates can carry named assumptions (growth, inflation, a staff-cost rise...): numbers a template's lines can point at instead of carrying their own, and that are changed in one place
-- when a budget is made from the template (what-if). Run script 241 first.
--   budget_templates.assumptions  JSON list of { key, label, value } (percent)
-- Nothing else changes. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 0 rows on the first run.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'budget_templates' AND column_name = 'assumptions';

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_column_if_missing('budget_templates', 'assumptions', 'JSON NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C - CHECK. Expect 1 row.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'budget_templates' AND column_name = 'assumptions';
