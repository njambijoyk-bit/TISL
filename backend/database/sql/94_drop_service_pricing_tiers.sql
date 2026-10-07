-- =====================================================================
-- 94_drop_service_pricing_tiers.sql
-- Services: drops the old services.pricing_tiers column. Nothing edited it and nothing used it for pricing; real pricing is the packages
-- (service_variants) and the fees. The website and the server no longer read or write it (a service's brochure now lists its packages instead).
-- Test data only: whatever was in the column is lost.
-- Safe to re-run: the column is only dropped if it is there.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 1 row = the column is still there. Then the services that hold something in it (these values are lost by part B).
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'pricing_tiers';

SELECT id, name, pricing_tiers FROM services
WHERE id > 0 AND pricing_tiers IS NOT NULL AND JSON_LENGTH(pricing_tiers) > 0;

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS drop_service_pricing_tiers;
DELIMITER $$
CREATE PROCEDURE drop_service_pricing_tiers()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'pricing_tiers') THEN
        ALTER TABLE services DROP COLUMN pricing_tiers;
    END IF;
END$$
DELIMITER ;
CALL drop_service_pricing_tiers();
DROP PROCEDURE IF EXISTS drop_service_pricing_tiers;

-- PART C - RESULT CHECK. Expect 0 rows: the column is gone.
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'pricing_tiers';
