-- =====================================================================
-- 243_budget_transfers.sql
-- Budgeting, step 6 of docs/BOOKS_BUDGETING_PLAN.md: moving budget from one line to another after a version is approved. Run scripts 237, 239 and 240 first.
--   budget_transfers  a request to move an amount of one month's budget from one row of a version to another row of the same version, with who asked, who decided and why.
--                     The approved version is never edited: an approved transfer is added to the plan wherever the plan is read (the report, the controls), and the request
--                     stays on the record as the audit trail.
-- Nothing in the books changes. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Is the table there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'budget_transfers';

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS budget_transfers (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version_id     BIGINT UNSIGNED NOT NULL,
    from_row_id    BIGINT UNSIGNED NOT NULL,
    to_row_id      BIGINT UNSIGNED NOT NULL,
    period         CHAR(7) NOT NULL,                       -- 'YYYY-MM': the month whose budget moves
    amount         DECIMAL(18,2) NOT NULL,
    status         VARCHAR(10) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, withdrawn
    note           VARCHAR(255) NULL,                      -- why it is asked for
    requested_by   BIGINT UNSIGNED NULL,
    decided_by     BIGINT UNSIGNED NULL,
    decided_at     TIMESTAMP NULL,
    decision_note  VARCHAR(255) NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_budget_transfers_version (version_id, status),
    KEY idx_budget_transfers_rows (from_row_id, to_row_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK. Expect 1 row.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'budget_transfers';
