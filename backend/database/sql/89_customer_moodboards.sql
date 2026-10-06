-- =====================================================================
-- 89_customer_moodboards.sql
-- Campaigns: customers can make moodboards. Adds two columns to campaign_moodboards:
--   source      'staff' (every moodboard so far) or 'customer'
--   visibility  'public' (every moodboard so far) or 'private' (a customer's own, until they ask to publish it)
-- Existing moodboards keep working exactly as they do today. Safe to re-run: each column is only added if it is missing.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 2 rows = both columns are already there (nothing to do); fewer = run part B.
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'campaign_moodboards' AND column_name IN ('source', 'visibility');

-- PART B - CHANGE (adds up to two columns)
DROP PROCEDURE IF EXISTS add_moodboard_owner_columns;
DELIMITER $$
CREATE PROCEDURE add_moodboard_owner_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = 'campaign_moodboards' AND column_name = 'source') THEN
        ALTER TABLE campaign_moodboards ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'staff' AFTER owner_user_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = 'campaign_moodboards' AND column_name = 'visibility') THEN
        ALTER TABLE campaign_moodboards ADD COLUMN visibility VARCHAR(10) NOT NULL DEFAULT 'public' AFTER source;
    END IF;
END$$
DELIMITER ;
CALL add_moodboard_owner_columns();
DROP PROCEDURE IF EXISTS add_moodboard_owner_columns;

-- PART C - RESULT CHECK. Expect 2 rows (source, visibility).
SELECT column_name, column_type, column_default FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'campaign_moodboards' AND column_name IN ('source', 'visibility');
