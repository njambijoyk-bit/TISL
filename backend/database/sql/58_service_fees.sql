-- =====================================================================
-- 58_service_fees.sql
-- Which fees a service carries and what each comes to. The fees themselves are ledgers (script 56, Books → Chart of accounts →
-- Service Income → Service Fees); this table is a service's switches and amount overrides:
--   service_fees   one row per service and fee ledger: is it on, the amount for this service (empty = the ledger's own),
--                  and an optional condition (always / on-site visits / urgent bookings / after hours / larger groups)
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'service_fees';

-- PART B — CREATE (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS service_fees (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    service_id       BIGINT UNSIGNED NOT NULL,
    ledger_id        BIGINT UNSIGNED NOT NULL,
    is_enabled       TINYINT(1) NOT NULL DEFAULT 1,
    amount           DECIMAL(18,6) NULL,                      -- in the service's own currency (a percentage for percent fees)
    `condition`      VARCHAR(20) NOT NULL DEFAULT 'always',   -- always | onsite | urgent | after_hours | group
    condition_value  DECIMAL(10,2) NULL,                      -- urgent: within this many hours · group: this many people or more
    position         INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_service_fee (service_id, ledger_id),
    KEY idx_service_fee_ledger (ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C — RESULT CHECK (expect 1 row)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'service_fees';
