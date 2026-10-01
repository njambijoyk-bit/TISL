-- =====================================================================
-- 43_company_contacts.sql
-- The company can have several phone numbers and email addresses, one of each marked
-- as the DEFAULT. The default email is the address the system sends mail from and
-- replies come back to; the default phone is the number printed first on invoices and
-- quoted in WhatsApp messages to customers.
--   company_profile.phones   [{"value":"+2547...","label":"Sales","is_default":1}, ...]
--   company_profile.emails   [{"value":"sales@...","label":"Sales","is_default":1}, ...]
-- The old single `phone` and `email` columns stay and always hold the default one.
-- Existing numbers/addresses become the first (default) entry.
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Your company row now
SELECT id, name, email, phone FROM company_profile;

-- A2. Do the new columns exist already? (expect 0 rows on the first run, 2 after)
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name IN ('phones', 'emails');

-- PART B — CHANGE (DDL, commits on its own)
DROP PROCEDURE IF EXISTS add_company_contact_columns;
DELIMITER $$
CREATE PROCEDURE add_company_contact_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'phones') THEN
        ALTER TABLE company_profile ADD COLUMN phones LONGTEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name = 'emails') THEN
        ALTER TABLE company_profile ADD COLUMN emails LONGTEXT NULL;
    END IF;
END$$
DELIMITER ;
CALL add_company_contact_columns();
DROP PROCEDURE IF EXISTS add_company_contact_columns;

START TRANSACTION;
UPDATE company_profile
SET phones = JSON_ARRAY(JSON_OBJECT('value', phone, 'label', 'Main', 'is_default', 1))
WHERE (phones IS NULL OR phones = '') AND phone IS NOT NULL AND phone <> '';
UPDATE company_profile
SET emails = JSON_ARRAY(JSON_OBJECT('value', email, 'label', 'Main', 'is_default', 1))
WHERE (emails IS NULL OR emails = '') AND email IS NOT NULL AND email <> '';
COMMIT;

-- PART C — RESULT CHECK. Expect both columns listed, and your number / address inside them.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'company_profile' AND column_name IN ('phones', 'emails');
SELECT id, name, email, phone, phones, emails FROM company_profile;
