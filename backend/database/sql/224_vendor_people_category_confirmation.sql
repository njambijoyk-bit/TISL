-- =====================================================================
-- 224  People category: staff confirmation and the certificate scan (Extras module)
--   vendors.special_group_status        unconfirmed | confirmed. A vendor who names their own people category stays unconfirmed until staff check the certificate.
--   vendors.special_group_confirmed_by  the staff user who confirmed it
--   vendors.special_group_confirmed_at  when
--   vendors.special_group_scans         JSON list of the stored page images of the certificate (the server re-draws every upload as plain images; the original file is never kept)
-- Run 221 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (0 rows on the first run)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'vendors'
   AND column_name IN ('special_group_status', 'special_group_confirmed_by', 'special_group_confirmed_at', 'special_group_scans');
SELECT special_group, COUNT(*) AS vendors FROM vendors GROUP BY special_group;

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_vendor_people_category_columns;
DELIMITER $$
CREATE PROCEDURE add_vendor_people_category_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'special_group_status') THEN
        ALTER TABLE vendors ADD COLUMN special_group_status VARCHAR(20) NOT NULL DEFAULT 'unconfirmed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'special_group_confirmed_by') THEN
        ALTER TABLE vendors ADD COLUMN special_group_confirmed_by BIGINT UNSIGNED NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'special_group_confirmed_at') THEN
        ALTER TABLE vendors ADD COLUMN special_group_confirmed_at DATETIME NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'special_group_scans') THEN
        ALTER TABLE vendors ADD COLUMN special_group_scans TEXT NULL;
    END IF;
END$$
DELIMITER ;
CALL add_vendor_people_category_columns();
DROP PROCEDURE IF EXISTS add_vendor_people_category_columns;

-- Categories staff entered themselves before this script count as confirmed (staff put them there)
UPDATE vendors SET special_group_status = 'confirmed', special_group_confirmed_at = NOW()
 WHERE id > 0 AND special_group IS NOT NULL AND special_group_status = 'unconfirmed' AND special_group_confirmed_at IS NULL;

-- PART C - RESULT CHECK. Expect 4 columns.
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'vendors'
   AND column_name IN ('special_group_status', 'special_group_confirmed_by', 'special_group_confirmed_at', 'special_group_scans');
SELECT special_group, special_group_status, COUNT(*) AS vendors FROM vendors GROUP BY special_group, special_group_status;
