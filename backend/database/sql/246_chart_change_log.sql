-- =====================================================================
-- 246_chart_change_log.sql
-- Chart of accounts, step 1 of the starter accounts: a record of ledgers moved from one group to another (by a starter pack now, by a person later), so a move can be traced.
--   chart_change_log  which ledger, from which group to which, why, who and when. Nothing in the books changes: a ledger keeps its postings when it moves.
-- Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Is the table there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'chart_change_log';

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS chart_change_log (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ledger_id     BIGINT UNSIGNED NOT NULL,
    from_group_id BIGINT UNSIGNED NULL,
    to_group_id   BIGINT UNSIGNED NULL,
    reason        VARCHAR(160) NULL,                  -- "Starter pack: Finance costs"
    changed_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    KEY idx_chart_change_log_ledger (ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK. Expect 1 row.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'chart_change_log';
