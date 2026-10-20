-- =====================================================================
-- 220_policy_acceptance_vendor.sql
-- Policy acceptances for vendors. A row already says who accepted through customer_id (a customer) and user_id (the login);
-- a vendor who registers has no customer record, so the Acceptances list showed a blank person. This adds the vendor:
--   policy_acceptances.vendor_id       the vendor who accepted (NULL for a customer or anyone else)
--   policy_acceptances.vendor_number   the vendor's number as it was then (like customer_number, a record kept as it was)
-- Who accepted is whichever of customer_id / vendor_id is set; no separate "type" column is kept, so the two can never disagree.
-- Rows already recorded by a vendor registering (context vendor_register) are linked to their vendor.
-- Run 216 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. which of the new columns exist already? (0 rows on the first run)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'policy_acceptances' AND column_name IN ('vendor_id', 'vendor_number');

-- A2. acceptances with neither a customer nor a vendor that can be linked to a vendor by their login
SELECT pa.id, pa.action_context, pa.user_id, v.id AS vendor_id, v.vendor_number
  FROM policy_acceptances pa JOIN vendors v ON v.user_id = pa.user_id
 WHERE pa.customer_id IS NULL;

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS add_policy_acceptance_vendor;
DELIMITER $$
CREATE PROCEDURE add_policy_acceptance_vendor()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'policy_acceptances' AND column_name = 'vendor_id') THEN
        ALTER TABLE policy_acceptances ADD COLUMN vendor_id BIGINT UNSIGNED NULL AFTER customer_id;
        ALTER TABLE policy_acceptances ADD KEY idx_policy_acceptances_vendor (vendor_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'policy_acceptances' AND column_name = 'vendor_number') THEN
        ALTER TABLE policy_acceptances ADD COLUMN vendor_number VARCHAR(40) NULL AFTER vendor_id;
    END IF;
END$$
DELIMITER ;
CALL add_policy_acceptance_vendor();
DROP PROCEDURE IF EXISTS add_policy_acceptance_vendor;

-- B2. link the acceptances a vendor made when registering (only ones with no customer and no vendor yet)
UPDATE policy_acceptances pa
  JOIN vendors v ON v.user_id = pa.user_id
   SET pa.vendor_id = v.id, pa.vendor_number = v.vendor_number
 WHERE pa.customer_id IS NULL AND pa.vendor_id IS NULL;

-- PART C - RESULT CHECK. Expect both columns, and the vendor_register rows now carrying a vendor.
SELECT column_name, column_type FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'policy_acceptances' AND column_name IN ('vendor_id', 'vendor_number');
SELECT id, action_context, user_id, customer_id, vendor_id, vendor_number FROM policy_acceptances WHERE vendor_id IS NOT NULL ORDER BY id DESC LIMIT 20;
