-- =====================================================================
-- 41_cash_counts.sql
-- The day-end cash count: what was counted in a cash ledger (till, petty cash, driver cash)
-- against what the books say it should be, and the journal that put a difference on the
-- Cash Over / Short ledger (script 37). One row per count.
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Does the table exist already? (expect 0 rows on first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cash_counts';

-- A2. Your cash ledgers (these are the ones that can be counted)
SELECT l.id, l.name FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE g.name = 'Cash-in-hand' ORDER BY l.name;

-- A3. The Cash Over / Short setting from script 37 (expect one row with a number)
SELECT cash_over_short_ledger_id FROM accounting_settings WHERE id = 1;

-- PART B — CREATE (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS cash_counts (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    ledger_id          BIGINT UNSIGNED NOT NULL,
    count_date         DATE NOT NULL,
    counted            DECIMAL(18,2) NOT NULL,              -- what was in the till
    book_balance       DECIMAL(18,2) NOT NULL,              -- what the books said on that date
    difference         DECIMAL(18,2) NOT NULL DEFAULT 0,    -- counted - book (negative = short)
    reason             VARCHAR(255) NULL,
    adjust_voucher_id  BIGINT UNSIGNED NULL,                -- the journal that posted the difference (cancel it to undo)
    counted_by         BIGINT UNSIGNED NULL,
    created_at         DATETIME NULL,
    updated_at         DATETIME NULL,
    PRIMARY KEY (id),
    KEY idx_cash_count_ledger (ledger_id, count_date),
    KEY idx_cash_count_adjust (adjust_voucher_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- PART C — RESULT CHECK. Expect 1 row for the table and 11 columns.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cash_counts';
SELECT COUNT(*) AS columns_found FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cash_counts';
