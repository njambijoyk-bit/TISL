-- 47: start auctions from scratch for testing — empties the auction tables, keeps every setting.
-- Run in MySQL Workbench against the TISL database, block by block.
-- Kept: the charge ledgers and their settings (ledgers), the auction terms policy, products, customers, currencies.
-- NOT touched here: the vouchers (orders / invoices / receipts / deposit journals) that auctions created — see block 2.

-- ── 1. read-only: what is there now ──
SELECT 'auctions' AS tbl, COUNT(*) AS rows_now FROM auctions
UNION ALL SELECT 'auction_bids', COUNT(*) FROM auction_bids
UNION ALL SELECT 'auction_registrations', COUNT(*) FROM auction_registrations
UNION ALL SELECT 'auction_charges', COUNT(*) FROM auction_charges
UNION ALL SELECT 'auction_order_activity_logs', COUNT(*) FROM auction_order_activity_logs;

-- ── 2. read-only: vouchers that auctions made (registration orders, winning-bid orders and what came from them) ──
-- These hold real postings, so do not delete them here. Cancel them from Books (the entries reverse properly),
-- or leave them: they do no harm to a fresh auction test.
SELECT v.id, v.voucher_number, t.name AS type, v.status, v.total_amount
FROM vouchers v JOIN voucher_types t ON t.id = v.voucher_type_id
WHERE JSON_EXTRACT(v.meta, '$.auction_id') IS NOT NULL
   OR v.id IN (SELECT order_voucher_id FROM auction_registrations WHERE order_voucher_id IS NOT NULL)
ORDER BY v.id;

-- ── 3. empty the auction tables (children first) ──
START TRANSACTION;
DELETE FROM auction_bids;
DELETE FROM auction_registrations;
DELETE FROM auction_charges;
DELETE FROM auction_order_activity_logs;
DELETE FROM auctions;

-- ── 4. check: every count should be 0 ──
SELECT 'auctions' AS tbl, COUNT(*) AS rows_now FROM auctions
UNION ALL SELECT 'auction_bids', COUNT(*) FROM auction_bids
UNION ALL SELECT 'auction_registrations', COUNT(*) FROM auction_registrations
UNION ALL SELECT 'auction_charges', COUNT(*) FROM auction_charges
UNION ALL SELECT 'auction_order_activity_logs', COUNT(*) FROM auction_order_activity_logs;
COMMIT;

-- ── 5. optional: forget who agreed to the auction terms (so the tick-box shows again for every customer) ──
-- DELETE FROM policy_acceptances WHERE action_context = 'auction_bidding';
