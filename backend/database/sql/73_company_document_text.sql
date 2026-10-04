-- =====================================================================
-- 73_company_document_text.sql
-- Four more lines of text in the company settings, printed on customer invoices and receipts:
--   description   - the short line under the company name (what the company sells)
--   declaration   - the declaration printed at the foot of an invoice
--   payment_terms - the terms of payment, printed top right on an invoice
--   payment_mode  - how to pay (M-Pesa till, bank details), printed at the bottom of an invoice
-- Run in Workbench. Safe to re-run: it only adds a column that is missing.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Run first, on its own.
-- Which of the four columns exist already? (4 rows = nothing more to do; fewer = run part B)
SELECT column_name, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'company_profile'
  AND column_name IN ('description', 'declaration', 'payment_terms', 'payment_mode');

-- PART B - CHANGE (adds columns, commits on its own)
DROP PROCEDURE IF EXISTS add_company_document_text;
DELIMITER $$
CREATE PROCEDURE add_company_document_text()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'description') THEN
        ALTER TABLE company_profile ADD COLUMN description VARCHAR(255) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'declaration') THEN
        ALTER TABLE company_profile ADD COLUMN declaration TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'payment_terms') THEN
        ALTER TABLE company_profile ADD COLUMN payment_terms VARCHAR(255) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'payment_mode') THEN
        ALTER TABLE company_profile ADD COLUMN payment_mode TEXT NULL;
    END IF;
END$$
DELIMITER ;
CALL add_company_document_text();
DROP PROCEDURE IF EXISTS add_company_document_text;

-- PART C - RESULT CHECK. Expect 4 rows from the first query, and the four fields empty (NULL) until filled in Books > Settings > Company.
SELECT column_name, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'company_profile'
  AND column_name IN ('description', 'declaration', 'payment_terms', 'payment_mode');
SELECT id, name, description, declaration, payment_terms, payment_mode FROM company_profile;
