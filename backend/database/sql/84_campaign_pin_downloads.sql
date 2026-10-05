-- =====================================================================
-- 84_campaign_pin_downloads.sql
-- Campaigns, step 7: counts how many times each pin's picture or video was downloaded, so a campaign's numbers can show downloads.
-- Adds one column to campaign_pins. Nothing else is changed. Safe to re-run: the column is only added if it is missing.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 1 row = the column is already there (nothing to do); 0 rows = run part B.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'campaign_pins' AND column_name = 'download_count';

-- PART B - CHANGE (adds one column)
DROP PROCEDURE IF EXISTS add_pin_download_count;
DELIMITER $$
CREATE PROCEDURE add_pin_download_count()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = 'campaign_pins' AND column_name = 'download_count') THEN
        ALTER TABLE campaign_pins ADD COLUMN download_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER allow_download;
    END IF;
END$$
DELIMITER ;
CALL add_pin_download_count();
DROP PROCEDURE IF EXISTS add_pin_download_count;

-- PART C - RESULT CHECK. Expect 1 row.
SELECT column_name, column_type, column_default FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'campaign_pins' AND column_name = 'download_count';
