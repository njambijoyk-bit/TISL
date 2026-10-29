-- =====================================================================
-- 234_company_tax_details.sql
-- The company's tax jurisdiction and tax registrations, kept on the company details so documents never read Tax control (docs/TAX_CONTROL_PLAN.md, section 19).
--   company_profile.tax_country              the country of registration (two letters), copied here whenever it is saved in Tax control
--   company_profile.tax_registrations        what the company is registered for and its number (VAT, PAYE, excise licence ...), copied the same way (JSON list of {name, number})
--   company_profile.show_tax_jurisdiction    print the country of registration on documents
--   company_profile.show_tax_registrations   print the registrations on documents
-- Both switches start off: nothing printed on a document changes until someone ticks them under Books -> Configuration -> Company.
-- Run script 229 first if you want the values Tax control already holds copied now. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. The columns that exist already (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name IN ('tax_country', 'tax_registrations', 'show_tax_jurisdiction', 'show_tax_registrations');
-- A2. What Tax control holds today (empty before script 229, or when nothing was entered)
SELECT setting_key, value FROM tax_control_settings WHERE setting_key IN ('tax_country', 'tax_registrations');

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
CALL add_column_if_missing('company_profile', 'tax_country', 'VARCHAR(2) NULL');
CALL add_column_if_missing('company_profile', 'tax_registrations', 'JSON NULL');
CALL add_column_if_missing('company_profile', 'show_tax_jurisdiction', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL add_column_if_missing('company_profile', 'show_tax_registrations', 'TINYINT(1) NOT NULL DEFAULT 0');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- copy what Tax control holds now (only where the company has nothing yet)
UPDATE company_profile cp
JOIN tax_control_settings s ON s.setting_key COLLATE utf8mb4_unicode_ci = 'tax_country'
SET cp.tax_country = UPPER(LEFT(JSON_UNQUOTE(s.value), 2))
WHERE cp.tax_country IS NULL AND JSON_UNQUOTE(s.value) <> '';

UPDATE company_profile cp
JOIN tax_control_settings s ON s.setting_key COLLATE utf8mb4_unicode_ci = 'tax_registrations'
SET cp.tax_registrations = s.value
WHERE cp.tax_registrations IS NULL AND JSON_LENGTH(s.value) > 0;

-- PART C - CHECK THE RESULT (expect the four columns; the two switches 0)
SELECT id, tax_country, tax_registrations, show_tax_jurisdiction, show_tax_registrations FROM company_profile;
