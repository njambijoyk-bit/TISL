-- =====================================================================
-- 111_preorder_offer_supply.sql
-- A preorder offer can be linked to the purchase order(s) that will bring the stock for it.
--   preorder_offer_supply   offer_id + the purchase order (a voucher) linked to it
-- What is linked is only a pointer: how much is still to arrive and when (the purchase order's due date) are read from the purchase order itself,
-- so they can never disagree with it. Existing offers have no links, so nothing changes until someone links one. Safe to run twice.
-- Run in Workbench. DDL commits on its own; nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: no rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'preorder_offer_supply';

-- PART B — CHANGE
CREATE TABLE IF NOT EXISTS preorder_offer_supply (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offer_id BIGINT UNSIGNED NOT NULL,
    voucher_id BIGINT UNSIGNED NOT NULL,                -- the purchase order
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_preorder_offer_supply (offer_id, voucher_id),
    KEY idx_preorder_offer_supply_voucher (voucher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C — CHECK (expect: the table once, no links yet)
SELECT COUNT(*) AS table_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'preorder_offer_supply';
SELECT COUNT(*) AS links FROM preorder_offer_supply;
