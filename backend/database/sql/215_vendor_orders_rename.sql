-- =====================================================================
-- 215_vendor_orders_rename.sql
-- Phase 0: rename the PurchaseOrder model's tables to VendorOrder.
--   purchase_orders        → vendor_orders
--   purchase_order_items   → vendor_order_items
--   vendors.total_purchase_orders → vendors.total_vendor_orders
--   purchase_order_items.purchase_order_id → vendor_order_items.vendor_order_id
-- The books voucher type 'purchase_order' is a financial document and
-- does NOT change. DashboardService, CostCentreService and the voucher
-- flows reference that string, not these tables.
-- Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. do the old tables still exist? (2 rows on the first run, 0 after)
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name IN ('purchase_orders', 'purchase_order_items');

-- A2. do the new tables already exist? (0 rows on the first run, 2 after)
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name IN ('vendor_orders', 'vendor_order_items');

-- A3. does the old vendor stat column still exist? (1 row on first run, 0 after)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name = 'vendors'
   AND column_name = 'total_purchase_orders';

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS rename_po_to_vendor_order;
DELIMITER $$
CREATE PROCEDURE rename_po_to_vendor_order()
BEGIN
    -- 1. Rename purchase_orders → vendor_orders
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'purchase_orders')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'vendor_orders') THEN
        RENAME TABLE purchase_orders TO vendor_orders;
    END IF;

    -- 2. Rename purchase_order_items → vendor_order_items
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'purchase_order_items')
       AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'vendor_order_items') THEN
        RENAME TABLE purchase_order_items TO vendor_order_items;
    END IF;

    -- 3. Rename FK column purchase_order_id → vendor_order_id in vendor_order_items
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendor_order_items' AND column_name = 'purchase_order_id')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendor_order_items' AND column_name = 'vendor_order_id') THEN
        ALTER TABLE vendor_order_items CHANGE COLUMN purchase_order_id vendor_order_id BIGINT UNSIGNED NOT NULL;
    END IF;

    -- 4. Rename vendor stat column total_purchase_orders → total_vendor_orders
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'total_purchase_orders')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'total_vendor_orders') THEN
        ALTER TABLE vendors CHANGE COLUMN total_purchase_orders total_vendor_orders INT NOT NULL DEFAULT 0;
    END IF;
END$$
DELIMITER ;
CALL rename_po_to_vendor_order();
DROP PROCEDURE IF EXISTS rename_po_to_vendor_order;

-- PART C - CHECK AFTER
-- C1. old tables gone (0 rows)
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name IN ('purchase_orders', 'purchase_order_items');

-- C2. new tables exist (2 rows)
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name IN ('vendor_orders', 'vendor_order_items');

-- C3. new FK column exists (1 row)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name = 'vendor_order_items'
   AND column_name = 'vendor_order_id';

-- C4. new vendor stat column exists (1 row)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name = 'vendors'
   AND column_name = 'total_vendor_orders';
