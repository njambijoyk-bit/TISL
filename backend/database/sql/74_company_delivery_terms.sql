-- =====================================================================
-- 74_company_delivery_terms.sql
-- One more line of company text: the terms of delivery, printed on customer invoices and cash sales.
-- Run in Workbench. Safe to re-run: it only adds the column if it is missing.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Run first, on its own.
-- (1 row = the column exists already, nothing more to do; 0 rows = run part B)
SELECT column_name, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'delivery_terms';

-- PART B - CHANGE (adds a column, commits on its own)
DROP PROCEDURE IF EXISTS add_company_delivery_terms;
DELIMITER $$
CREATE PROCEDURE add_company_delivery_terms()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'delivery_terms') THEN
        ALTER TABLE company_profile ADD COLUMN delivery_terms VARCHAR(255) NULL;
    END IF;
END$$
DELIMITER ;
CALL add_company_delivery_terms();
DROP PROCEDURE IF EXISTS add_company_delivery_terms;

-- PART C - RESULT CHECK. Expect 1 row from the first query, and delivery_terms empty (NULL) until filled in Books > Settings > Company.
SELECT column_name, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'delivery_terms';
SELECT id, name, delivery_terms FROM company_profile;
