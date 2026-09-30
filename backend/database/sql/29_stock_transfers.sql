-- =====================================================================
-- 29_stock_transfers.sql        (stock between branches)
-- A transfer takes stock out of one branch and puts it in another. While it is
-- on the road it is "in transit": out of the sending branch, not yet in the
-- receiving one. Batches (number, expiry, cost) travel with the stock.
--
--   stock_transfers        one row per transfer (TR-000001 ...)
--   stock_transfer_lines   what is on it: variant, batch, quantity sent / received
--
-- Nothing is posted to the books: it is the same stock, in the same company.
-- (A shortfall on receipt is written off as a Stock Loss by the app.)
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Tables already there? (expect 0 rows on first run)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('stock_transfers', 'stock_transfer_lines');

-- A2. Both parent tables exist? (expect 2 rows)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('locations', 'product_variants');

-- PART B — CREATE THE TABLES
CREATE TABLE IF NOT EXISTS stock_transfers (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number           VARCHAR(20) NULL,
    from_location_id BIGINT UNSIGNED NOT NULL,
    to_location_id   BIGINT UNSIGNED NOT NULL,
    status           VARCHAR(12) NOT NULL DEFAULT 'in_transit',   -- in_transit | received | cancelled
    note             VARCHAR(255) NULL,
    sent_by          BIGINT UNSIGNED NULL,
    sent_at          DATETIME NULL,
    received_by      BIGINT UNSIGNED NULL,
    received_at      DATETIME NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_transfer_status (status),
    KEY idx_transfer_from (from_location_id),
    KEY idx_transfer_to (to_location_id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_lines (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    transfer_id   BIGINT UNSIGNED NOT NULL,
    variant_id    BIGINT UNSIGNED NOT NULL,
    batch_id      BIGINT UNSIGNED NOT NULL,
    quantity      DECIMAL(18,4) NOT NULL,            -- sent, base units
    received_qty  DECIMAL(18,4) NULL,                -- filled in on receipt
    unit_cost     DECIMAL(18,4) NOT NULL DEFAULT 0,
    KEY idx_tline_transfer (transfer_id),
    KEY idx_tline_variant (variant_id)
);

-- PART C — RESULT CHECK. Expect 2 rows.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('stock_transfers', 'stock_transfer_lines');
