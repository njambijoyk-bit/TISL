-- =====================================================================
-- 92_service_video_brochure.sql
-- Services: brochure settings replace the old Brochure URL box.
--   services.brochure_meta            JSON: this service's own brochure choices (template, price shown, images, charges, policy...)
--   service_settings.brochure_defaults JSON: the shop-wide brochure defaults a service falls back to
--   services.brochure_url             DROPPED (it was only ever a pasted link and was never shown). Test data only.
-- Service videos need no change: the existing services.video_url holds a link or the path of an uploaded file.
-- Safe to re-run: each step is skipped if already done.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Shows which of the three columns exist now (brochure_url should be there until you run part B).
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'services' AND column_name IN ('brochure_meta', 'brochure_url'))
    OR (table_name = 'service_settings' AND column_name = 'brochure_defaults'));

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS service_brochure_columns;
DELIMITER $$
CREATE PROCEDURE service_brochure_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'brochure_meta') THEN
        ALTER TABLE services ADD COLUMN brochure_meta JSON NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'service_settings') THEN
        SELECT 'service_settings is missing: run script 59 first' AS note;
    ELSEIF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'service_settings' AND column_name = 'brochure_defaults') THEN
        ALTER TABLE service_settings ADD COLUMN brochure_defaults JSON NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'brochure_url') THEN
        ALTER TABLE services DROP COLUMN brochure_url;
    END IF;
END$$
DELIMITER ;
CALL service_brochure_columns();
DROP PROCEDURE IF EXISTS service_brochure_columns;

-- PART C - RESULT CHECK. Expect 2 rows (services.brochure_meta and service_settings.brochure_defaults); brochure_url should be gone.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'services' AND column_name IN ('brochure_meta', 'brochure_url'))
    OR (table_name = 'service_settings' AND column_name = 'brochure_defaults'));
