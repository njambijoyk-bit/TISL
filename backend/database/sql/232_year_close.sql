-- =====================================================================
-- 232_year_close.sql
-- Year-end close (docs/BOOKS_REPORTS_PLAN.md, section 7, step 7): prepare -> approve -> lock, and what each balance-sheet ledger carries into the next year.
--   year_closes            one row per attempt to close a financial year: who prepared, approved, locked or reopened it, when, the checklist and the figures
--                          (profit for the year, earnings kept from earlier years, the opening difference). A year can be closed, reopened and closed again;
--                          each attempt is its own row, and the older ones stay as history.
--   ledger_year_balances   each ledger's balance at the end of the year, what it carries forward (balance-sheet ledgers carry their balance; income and expense
--                          ledgers carry nothing, their profit moves to retained earnings), and the statement line it was on at that moment, so a later change of
--                          line never silently changes a closed year.
--   year_close_log         every step, who did it and why (a reopening needs a reason).
-- Nothing is posted and nothing changes in the books when this runs. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. What is already there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('year_closes', 'ledger_year_balances', 'year_close_log');

-- A2. The financial years, and which are closed today (a closed year stays closed; it can be reopened through the new close)
SELECT id, name, start_date, end_date, is_closed FROM financial_years ORDER BY start_date;

-- A3. The opening balances must net to nothing before a year can be closed (expect 0.00; anything else is listed in the close checklist)
SELECT ROUND(SUM(CASE WHEN opening_side COLLATE utf8mb4_unicode_ci = 'D' THEN opening_balance ELSE -opening_balance END), 2) AS opening_difference FROM ledgers;

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS year_closes (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    financial_year_id BIGINT UNSIGNED NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'prepared',   -- prepared, approved, locked, reopened, superseded
    prepared_by       BIGINT UNSIGNED NULL,
    prepared_at       TIMESTAMP NULL,
    approved_by       BIGINT UNSIGNED NULL,
    approved_at       TIMESTAMP NULL,
    locked_by         BIGINT UNSIGNED NULL,
    locked_at         TIMESTAMP NULL,
    reopened_by       BIGINT UNSIGNED NULL,
    reopened_at       TIMESTAMP NULL,
    reopen_reason     VARCHAR(255) NULL,
    checklist         JSON NULL,
    summary           JSON NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_year_closes_year (financial_year_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ledger_year_balances (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    year_close_id     BIGINT UNSIGNED NOT NULL,
    financial_year_id BIGINT UNSIGNED NOT NULL,
    ledger_id         BIGINT UNSIGNED NOT NULL,
    group_id          BIGINT UNSIGNED NULL,
    statement_id      BIGINT UNSIGNED NULL,
    nature            VARCHAR(20) NULL,
    closing_amount    DECIMAL(18,2) NOT NULL DEFAULT 0,   -- at the end of the year, debit positive
    carried_amount    DECIMAL(18,2) NOT NULL DEFAULT 0,   -- what the next year starts with: the closing balance for balance-sheet ledgers, 0 for income and expense
    reclassified      TINYINT(1) NOT NULL DEFAULT 0,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    UNIQUE KEY uq_year_close_ledger (year_close_id, ledger_id),
    KEY idx_ledger_year_balances_year (financial_year_id, ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS year_close_log (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    year_close_id BIGINT UNSIGNED NOT NULL,
    action        VARCHAR(20) NOT NULL,
    user_id       BIGINT UNSIGNED NULL,
    user_name     VARCHAR(120) NULL,
    note          VARCHAR(255) NULL,
    created_at    TIMESTAMP NULL,
    KEY idx_year_close_log (year_close_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK THE RESULT (expect the three tables, 0 rows in each)
SELECT 'year_closes' AS t, COUNT(*) AS n FROM year_closes UNION ALL SELECT 'ledger_year_balances', COUNT(*) FROM ledger_year_balances UNION ALL SELECT 'year_close_log', COUNT(*) FROM year_close_log;
