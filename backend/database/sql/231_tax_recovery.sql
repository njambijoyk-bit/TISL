-- =====================================================================
-- 231_tax_recovery.sql
-- Tax control, tax recovery (docs/TAX_CONTROL_PLAN.md, section 18): whether the tax a buyer pays on a purchase can be claimed back.
--   ledger_groups.recovery       recoverable | non_recoverable | conditional.
--                                recoverable      the tax is input tax: debited to the tax ledger and claimed back on the return (how VAT works).
--                                non_recoverable  the tax is part of what the goods cost: it goes into the cost of the item (the stock), or to the type's cost ledger.
--                                conditional      recoverable only when the company stands in the right position for it (company_role below).
--   ledger_groups.company_role   how the company stands for this tax: ordinary (a purchaser), manufacturer (licensed to make the goods the tax is on) or importer.
--                                Only a manufacturer recovers a conditional tax; an importer's duty on import belongs to the customs module (a later phase).
-- It only matters on PURCHASES. What is charged on sales (the liability of a manufacturer or an importer) is not touched.
-- Excise starts as non_recoverable (an ordinary purchaser cannot claim it back); every other type starts as recoverable, as it has always posted.
-- Documents already posted are never changed. New documents use the new treatment.
-- Safe to run twice. Run each part on its own in Workbench. Run 229 first.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Script 229 has been run (expect the columns tax_category and application_method)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ledger_groups' AND column_name IN ('tax_category', 'application_method', 'recovery', 'company_role');

-- A2. The tax types, and what they will start as. Excise types change from "claimed back" to "part of the cost" for NEW purchases.
SELECT id, name, code, tax_category, application_method,
       CASE WHEN tax_category COLLATE utf8mb4_unicode_ci = 'excise' THEN 'non_recoverable' ELSE 'recoverable' END AS recovery_after
FROM ledger_groups WHERE behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND application_method COLLATE utf8mb4_unicode_ci = 'added';

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = tbl)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_column_if_missing('ledger_groups', 'recovery', 'VARCHAR(20) NULL');
CALL add_column_if_missing('ledger_groups', 'company_role', 'VARCHAR(20) NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

UPDATE ledger_groups
SET recovery = CASE WHEN tax_category COLLATE utf8mb4_unicode_ci = 'excise' THEN 'non_recoverable' ELSE 'recoverable' END, company_role = 'ordinary'
WHERE id > 0 AND behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND application_method COLLATE utf8mb4_unicode_ci = 'added' AND recovery IS NULL;

-- PART C - CHECK THE RESULT (expect no row with a missing recovery)
SELECT id, name, tax_category, recovery, company_role FROM ledger_groups WHERE behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND application_method COLLATE utf8mb4_unicode_ci = 'added';
