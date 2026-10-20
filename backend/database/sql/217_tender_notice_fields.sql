-- =====================================================================
-- 217_tender_notice_fields.sql
-- Public tender notice details (Extras module), as a procurement notice shows them.
--   tenders.ocid                   open contracting identifier (optional)
--   tenders.procurement_method     open_tender | restricted_tender | request_for_quotation | request_for_proposal | expression_of_interest | direct_procurement | framework_agreement
--   tenders.submission_method      electronic | physical | both
--   tenders.reservation_scheme     e.g. "AGPO - Youth", "AGPO - Women", "AGPO - PWD" (optional text)
--   tenders.has_preference_scheme  1 when a preference and reservation scheme applies
--   tenders.opening_venue          where the bids are opened
--   tenders.tender_fee             fee to obtain the tender document (0 = free)
--   tenders.validity_days          how long a bid must stay valid, in days
--   tenders.financial_year         e.g. 2026/2027
--   tenders.public_link            link to the notice elsewhere (e.g. the government portal)
-- The tender number, title, category (goods/services/works), published date and close date/time already exist
-- (tender_number, title, category, published_at, submission_deadline). Run 216 first. Safe to re-run.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Which of the new columns exist already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'tenders'
   AND column_name IN ('ocid', 'procurement_method', 'submission_method', 'reservation_scheme', 'has_preference_scheme',
                       'opening_venue', 'tender_fee', 'validity_days', 'financial_year', 'public_link');

-- PART B - CHANGE (adds each missing column)
DROP PROCEDURE IF EXISTS add_tender_notice_fields;
DELIMITER $$
CREATE PROCEDURE add_tender_notice_fields()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'ocid') THEN
        ALTER TABLE tenders ADD COLUMN ocid VARCHAR(100) NULL AFTER tender_number;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'procurement_method') THEN
        ALTER TABLE tenders ADD COLUMN procurement_method VARCHAR(30) NOT NULL DEFAULT 'open_tender' AFTER category;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'submission_method') THEN
        ALTER TABLE tenders ADD COLUMN submission_method VARCHAR(20) NOT NULL DEFAULT 'electronic' AFTER procurement_method;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'reservation_scheme') THEN
        ALTER TABLE tenders ADD COLUMN reservation_scheme VARCHAR(100) NULL AFTER submission_method;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'has_preference_scheme') THEN
        ALTER TABLE tenders ADD COLUMN has_preference_scheme TINYINT(1) NOT NULL DEFAULT 0 AFTER reservation_scheme;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'opening_venue') THEN
        ALTER TABLE tenders ADD COLUMN opening_venue VARCHAR(255) NULL AFTER opening_date;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'tender_fee') THEN
        ALTER TABLE tenders ADD COLUMN tender_fee DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER opening_venue;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'validity_days') THEN
        ALTER TABLE tenders ADD COLUMN validity_days INT UNSIGNED NULL AFTER tender_fee;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'financial_year') THEN
        ALTER TABLE tenders ADD COLUMN financial_year VARCHAR(9) NULL AFTER validity_days;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'public_link') THEN
        ALTER TABLE tenders ADD COLUMN public_link VARCHAR(500) NULL AFTER financial_year;
    END IF;
END$$
DELIMITER ;
CALL add_tender_notice_fields();
DROP PROCEDURE IF EXISTS add_tender_notice_fields;

-- PART C - RESULT CHECK. Expect 10 rows.
SELECT column_name, column_type, column_default FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'tenders'
   AND column_name IN ('ocid', 'procurement_method', 'submission_method', 'reservation_scheme', 'has_preference_scheme',
                       'opening_venue', 'tender_fee', 'validity_days', 'financial_year', 'public_link')
 ORDER BY ordinal_position;
