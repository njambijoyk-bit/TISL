-- =====================================================================
-- 233_reconciliation.sql
-- The reconciliation hub (docs/BOOKS_REPORTS_PLAN.md, section 6, step 9): a statement (bank, M-Pesa, a supplier's) set against the books for one ledger.
-- The earlier reconciliation-sessions feature was dropped by script 78 (its tables held test data only), so these tables are new and have their own names:
--   recon_sessions         one reconciliation of one ledger up to a statement date: the statement's opening and closing balance, who prepared, approved and locked it,
--                          and the proof as it stood when prepared. Status: open, prepared, approved, locked, reopened.
--   recon_statement_lines  the lines of the imported statement. The amount is signed in the ledger's own direction: positive makes the ledger bigger (money in for a
--                          bank, more owed for a creditor). A line is matched to one book entry (voucher_entries.id) or left unmatched.
--   recon_log              every step, who did it and why.
-- A book entry matched in a LOCKED session is cleared and is not offered again; the rest stay outstanding (cheques not yet cashed, deposits in transit).
-- Nothing is posted and nothing changes in the books when this runs. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. What is already there? (0 rows on the first run; the old reconciliation_sessions / reconciliation_lines must stay gone)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('recon_sessions', 'recon_statement_lines', 'recon_log', 'reconciliation_sessions', 'reconciliation_lines');

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS recon_sessions (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ledger_id         BIGINT UNSIGNED NOT NULL,
    kind              VARCHAR(20) NOT NULL DEFAULT 'bank',        -- bank, mobile_money, cash, counterparty, other
    statement_from    DATE NULL,
    statement_to      DATE NOT NULL,
    statement_opening DECIMAL(18,2) NULL,                         -- in the ledger's own direction
    statement_closing DECIMAL(18,2) NOT NULL DEFAULT 0,
    status            VARCHAR(20) NOT NULL DEFAULT 'open',
    created_by        BIGINT UNSIGNED NULL,
    prepared_by       BIGINT UNSIGNED NULL,
    prepared_at       TIMESTAMP NULL,
    approved_by       BIGINT UNSIGNED NULL,
    approved_at       TIMESTAMP NULL,
    locked_by         BIGINT UNSIGNED NULL,
    locked_at         TIMESTAMP NULL,
    reopened_by       BIGINT UNSIGNED NULL,
    reopened_at       TIMESTAMP NULL,
    reopen_reason     VARCHAR(255) NULL,
    note              VARCHAR(255) NULL,
    proof             JSON NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_recon_sessions_ledger (ledger_id, statement_to),
    KEY idx_recon_sessions_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recon_statement_lines (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id       BIGINT UNSIGNED NOT NULL,
    line_no          INT NOT NULL DEFAULT 0,
    line_date        DATE NOT NULL,
    description      VARCHAR(255) NULL,
    reference        VARCHAR(120) NULL,
    amount           DECIMAL(18,2) NOT NULL,                      -- signed in the ledger's own direction
    balance          DECIMAL(18,2) NULL,
    matched_entry_id BIGINT UNSIGNED NULL,                        -- voucher_entries.id
    match_how        VARCHAR(20) NULL,                            -- reference, amount, manual, booked
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_recon_lines_session (session_id, line_date),
    KEY idx_recon_lines_entry (matched_entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recon_log (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT UNSIGNED NOT NULL,
    action     VARCHAR(20) NOT NULL,
    user_id    BIGINT UNSIGNED NULL,
    user_name  VARCHAR(120) NULL,
    note       VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    KEY idx_recon_log (session_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK THE RESULT (expect the three tables, 0 rows in each)
SELECT 'recon_sessions' AS t, COUNT(*) AS n FROM recon_sessions UNION ALL SELECT 'recon_statement_lines', COUNT(*) FROM recon_statement_lines UNION ALL SELECT 'recon_log', COUNT(*) FROM recon_log;
