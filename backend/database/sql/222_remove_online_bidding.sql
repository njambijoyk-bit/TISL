-- =====================================================================
-- 222_remove_online_bidding.sql
-- DESTRUCTIVE: removes the online-bidding and vendor-filled pre-qualification tables, which the notice-board design no longer uses.
-- Bids, evaluation and awards happen offline; pre-qualification is recorded by staff (vendor_prequalifications, script 221).
--   dropped: tender_bids, tender_bid_items, tender_bid_documents, prequalification_templates, prequalifications, prequalification_documents
--   dropped column: vendor_orders.tender_bid_id
-- Run 221 first. Look at PART A before running PART B: anything in these tables is deleted and cannot be brought back (take a backup if any of it matters).
-- Safe to re-run (it skips what is already gone). Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. How much would be deleted. (A table that is already gone shows as an error: that is fine, skip its line.)
SELECT 'tender_bids' AS what, COUNT(*) AS rows_deleted FROM tender_bids
UNION ALL SELECT 'tender_bid_items', COUNT(*) FROM tender_bid_items
UNION ALL SELECT 'tender_bid_documents', COUNT(*) FROM tender_bid_documents
UNION ALL SELECT 'prequalification_templates', COUNT(*) FROM prequalification_templates
UNION ALL SELECT 'prequalifications', COUNT(*) FROM prequalifications
UNION ALL SELECT 'prequalification_documents', COUNT(*) FROM prequalification_documents;
SELECT COUNT(*) AS vendor_orders_linked_to_a_bid FROM vendor_orders WHERE tender_bid_id IS NOT NULL;

-- PART B - CHANGE (deletes)
DROP PROCEDURE IF EXISTS drop_vendor_order_tender_bid;
DELIMITER $$
CREATE PROCEDURE drop_vendor_order_tender_bid()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendor_orders' AND column_name = 'tender_bid_id') THEN
        ALTER TABLE vendor_orders DROP COLUMN tender_bid_id;
    END IF;
END$$
DELIMITER ;
CALL drop_vendor_order_tender_bid();
DROP PROCEDURE IF EXISTS drop_vendor_order_tender_bid;

DROP TABLE IF EXISTS tender_bid_documents;
DROP TABLE IF EXISTS tender_bid_items;
DROP TABLE IF EXISTS tender_bids;
DROP TABLE IF EXISTS prequalification_documents;
DROP TABLE IF EXISTS prequalifications;
DROP TABLE IF EXISTS prequalification_templates;

-- PART C - RESULT CHECK. Expect 0 rows from both.
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name IN ('tender_bids', 'tender_bid_items', 'tender_bid_documents', 'prequalification_templates', 'prequalifications', 'prequalification_documents');
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE() AND table_name = 'vendor_orders' AND column_name = 'tender_bid_id';
