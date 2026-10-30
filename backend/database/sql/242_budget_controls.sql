-- =====================================================================
-- 242_budget_controls.sql
-- Budgeting, step 5 of docs/BOOKS_BUDGETING_PLAN.md: what happens when a voucher would take spending over its budget. Run scripts 237, 239 and 240 first.
--   budget_control_rules  an exception to the company-wide choice (Budgeting -> Controls): this ledger group, ledger, department or cost centre warns, waits for approval,
--                         blocks, or is not checked, whatever the default says.
--   budget_overrides      each time a voucher took a budget line over its budget: what the line was, the budget, what had been spent, this voucher's amount, the choice in force
--                         and where it stands (noted, waiting for approval, approved, rejected, withdrawn when the voucher was cancelled).
-- Nothing in the books changes. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. What is already there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budget_control_rules', 'budget_overrides');

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS budget_control_rules (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    scope_type  VARCHAR(12) NOT NULL,               -- 'ledger', 'group', 'department' or 'cost_centre'
    scope_id    BIGINT UNSIGNED NOT NULL,
    mode        VARCHAR(10) NOT NULL,               -- off, warn, approval, block
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_budget_control_rules (scope_type, scope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_overrides (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    voucher_id    BIGINT UNSIGNED NOT NULL,
    line_label    VARCHAR(255) NOT NULL,             -- "Rent, Admin"
    budget        DECIMAL(18,2) NOT NULL DEFAULT 0,  -- what was budgeted for the period checked
    spent_before  DECIMAL(18,2) NOT NULL DEFAULT 0,  -- what the books already showed
    amount        DECIMAL(18,2) NOT NULL DEFAULT 0,  -- this voucher's part
    over_by       DECIMAL(18,2) NOT NULL DEFAULT 0,
    mode          VARCHAR(10) NOT NULL,              -- the choice in force: warn, approval, block
    permitted     TINYINT(1) NOT NULL DEFAULT 0,     -- 1 = the person may exceed budgets
    status        VARCHAR(10) NOT NULL DEFAULT 'noted',  -- noted, pending, approved, rejected, withdrawn
    requested_by  BIGINT UNSIGNED NULL,
    decided_by    BIGINT UNSIGNED NULL,
    decided_at    TIMESTAMP NULL,
    note          VARCHAR(255) NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_budget_overrides_voucher (voucher_id),
    KEY idx_budget_overrides_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK. Expect 2 rows.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budget_control_rules', 'budget_overrides');
