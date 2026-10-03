-- =====================================================================
-- 70_assets_clear_test_data.sql
-- The inventory engine becomes the ASSET register (furniture, equipment, what is issued to staff). It no longer touches stock.
--   1. Clears the test data in it (all the inventory_* tables). Nothing in the books or the shop refers to these rows.
--   2. Drops the two stock-only columns on inventory_items: product_id (the link to shop products) and low_stock_threshold.
-- Run in Workbench. Safe to re-run. Part B deletes rows: it is a transaction, so look at the counts in Part A first,
-- then run COMMIT; (or ROLLBACK; to undo) when it stops.
-- =====================================================================

-- PART A — READ-ONLY CHECK: how many rows each table holds now (they all go), and whether the two stock columns are still there
SELECT 'inventory_items' AS tbl, COUNT(*) AS n FROM inventory_items
UNION ALL SELECT 'inventory_instances', COUNT(*) FROM inventory_instances
UNION ALL SELECT 'inventory_assignments', COUNT(*) FROM inventory_assignments
UNION ALL SELECT 'inventory_repairs', COUNT(*) FROM inventory_repairs
UNION ALL SELECT 'inventory_disputes', COUNT(*) FROM inventory_disputes
UNION ALL SELECT 'inventory_return_audits', COUNT(*) FROM inventory_return_audits
UNION ALL SELECT 'inventory_groups', COUNT(*) FROM inventory_groups
UNION ALL SELECT 'inventory_categories', COUNT(*) FROM inventory_categories
UNION ALL SELECT 'inventory_locations', COUNT(*) FROM inventory_locations;
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_items'
  AND column_name IN ('product_id', 'low_stock_threshold');

-- PART B — CLEAR (a transaction; children first)
START TRANSACTION;
SET FOREIGN_KEY_CHECKS = 0;
DELETE FROM inventory_return_audit_items;
DELETE FROM inventory_return_audits;
DELETE FROM inventory_disputes;
DELETE FROM inventory_repairs;
DELETE FROM inventory_lifecycle_movements;
DELETE FROM inventory_location_movements;
DELETE FROM inventory_group_members;
DELETE FROM inventory_assignments;
DELETE FROM inventory_instances;
DELETE FROM inventory_items;
DELETE FROM inventory_groups;
DELETE FROM inventory_categories;
DELETE FROM inventory_locations;
DELETE FROM inventory_export_logs;
DELETE FROM inventory_export_presets;
SET FOREIGN_KEY_CHECKS = 1;
-- Check the counts below are all 0, then run:  COMMIT;   (or  ROLLBACK;  to keep everything)
SELECT 'inventory_items' AS tbl, COUNT(*) AS n FROM inventory_items
UNION ALL SELECT 'inventory_instances', COUNT(*) FROM inventory_instances
UNION ALL SELECT 'inventory_assignments', COUNT(*) FROM inventory_assignments;
