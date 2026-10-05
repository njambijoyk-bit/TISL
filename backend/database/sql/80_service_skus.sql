-- =====================================================================
-- 80_service_skus.sql
-- Every service now has a SKU (new ones are generated, like products). This gives any existing service that has none a SKU
-- (SRV-00012 style, from its id, so it is unique). Safe to re-run: it only touches services with no SKU.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK: services with no SKU (0 rows = nothing to do)
SELECT id, name, sku FROM services WHERE sku IS NULL OR TRIM(sku) = '';

-- PART B - CHANGE (fills the blanks)
UPDATE services
SET sku = CONCAT('SRV-', LPAD(id, 5, '0'))
WHERE (sku IS NULL OR TRIM(sku) = '')
  AND NOT EXISTS (SELECT 1 FROM (SELECT sku FROM services) s2 WHERE s2.sku = CONCAT('SRV-', LPAD(services.id, 5, '0')));

-- PART C - RESULT CHECK: expect 0 rows
SELECT id, name, sku FROM services WHERE sku IS NULL OR TRIM(sku) = '';
