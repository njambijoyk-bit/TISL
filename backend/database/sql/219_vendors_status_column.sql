-- =====================================================================
-- 219_vendors_status_column.sql
-- Makes sure vendors.status can hold every status a vendor moves through: pending_approval, active, suspended.
-- If the column was created as a fixed list (ENUM) that does not include them, saving "suspended" fails or is stored blank.
-- This turns it into plain text, keeping every value as it is. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. data_type 'enum' means part B is needed; 'varchar' means it is already fine.
SELECT column_name, data_type, column_type, column_default FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'status';

-- PART B - CHANGE (only when the column is an ENUM)
DROP PROCEDURE IF EXISTS widen_vendors_status;
DELIMITER $$
CREATE PROCEDURE widen_vendors_status()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'status' AND data_type = 'enum') THEN
        ALTER TABLE vendors MODIFY status VARCHAR(30) NOT NULL DEFAULT 'pending_approval';
    END IF;
END$$
DELIMITER ;
CALL widen_vendors_status();
DROP PROCEDURE IF EXISTS widen_vendors_status;

-- PART C - RESULT CHECK. Expect data_type varchar.
SELECT status, COUNT(*) AS vendors FROM vendors GROUP BY status;
SELECT column_name, data_type, column_type FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'status';
