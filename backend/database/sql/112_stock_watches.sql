-- =====================================================================
-- 112_stock_watches.sql
-- "Tell me when it is back": someone leaves an email on an out-of-stock product and is told when it can be bought again.
--   stock_watches       one request: product + variant + email (and the customer, when signed in), with its status
--   stock_watch_runs    one line each time waiting people were told (automatically or by staff): how many, in what mode
-- Existing data is not touched. Safe to run twice.
-- Run in Workbench. DDL commits on its own; nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: no rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('stock_watches', 'stock_watch_runs');

-- PART B — CHANGE
CREATE TABLE IF NOT EXISTS stock_watches (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NULL,                     -- set when the person was signed in
    email VARCHAR(190) NOT NULL,
    name VARCHAR(120) NULL,
    token CHAR(40) NOT NULL,                               -- the "stop these alerts" link
    status VARCHAR(10) NOT NULL DEFAULT 'waiting',         -- waiting | notified | stopped | expired
    notified_at DATETIME NULL,
    stopped_at DATETIME NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_stock_watches_token (token),
    KEY idx_stock_watches_queue (variant_id, status, id),
    KEY idx_stock_watches_email (email, status),
    KEY idx_stock_watches_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_watch_runs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    variant_id BIGINT UNSIGNED NOT NULL,
    trigger_by VARCHAR(10) NOT NULL,                       -- auto | staff
    mode VARCHAR(10) NOT NULL,                             -- stock (as many as there is stock) | all
    stock DECIMAL(14,4) NOT NULL DEFAULT 0,                -- what could be bought when it ran
    told INT UNSIGNED NOT NULL DEFAULT 0,
    left_waiting INT UNSIGNED NOT NULL DEFAULT 0,
    user_id BIGINT UNSIGNED NULL,                          -- who, when staff did it
    created_at TIMESTAMP NULL,
    KEY idx_stock_watch_runs_variant (variant_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C — CHECK (expect: 2 tables, no requests yet)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('stock_watches', 'stock_watch_runs');
SELECT COUNT(*) AS requests FROM stock_watches;
