-- =====================================================================
-- 72_company_logo.sql
-- The company can have a logo. It is uploaded in Books > Settings > Company, kept as a
-- file on the server, and printed top left on statements, letters and documents.
-- This script makes sure the table has the column that holds its address.
-- Run in Workbench. Safe to re-run: it only adds the column if it is missing.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Run first, on its own.
-- Does the column exist already? (1 row = yes, nothing more to do; 0 rows = run part B)
SELECT column_name, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'logo_url';

-- PART B - CHANGE (adds a column, commits on its own)
DROP PROCEDURE IF EXISTS add_company_logo_column;
DELIMITER $$
CREATE PROCEDURE add_company_logo_column()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'logo_url') THEN
        ALTER TABLE company_profile ADD COLUMN logo_url VARCHAR(255) NULL;
    END IF;
END$$
DELIMITER ;
CALL add_company_logo_column();
DROP PROCEDURE IF EXISTS add_company_logo_column;

-- PART C - RESULT CHECK. Expect 1 row, and logo_url empty (NULL) until a logo is uploaded.
SELECT id, name, logo_url FROM company_profile;
