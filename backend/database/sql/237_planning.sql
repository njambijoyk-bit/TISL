-- =====================================================================
-- 237_planning.sql
-- Budgets and the cash forecast (Books -> Configuration -> Planning; the Visual reports "Budget against actual" and "Cash forecast" charts).
--   budget_lines     what a person plans to spend (or earn) on an expense or income ledger group, or on one ledger, in one month.
--   forecast_items   the recurring and one-off money in and out that the books cannot know yet: payroll, rent, loan repayments, a tax payment, a retainer. Each says
--                    whether it is confirmed (a contract, a schedule) or an estimate, so the forecast can show the two apart.
-- Nothing is posted and no existing table changes. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. What is already there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budget_lines', 'forecast_items');

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS budget_lines (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    period      CHAR(7) NOT NULL,                 -- 'YYYY-MM'
    target_type VARCHAR(10) NOT NULL,             -- 'group' (the group and everything under it) or 'ledger'
    target_id   BIGINT UNSIGNED NOT NULL,         -- ledger_groups.id or ledgers.id
    amount      DECIMAL(18,2) NOT NULL DEFAULT 0, -- in the base currency, a positive number: spend for an expense, earnings for an income
    note        VARCHAR(160) NULL,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_budget_line (period, target_type, target_id),
    KEY idx_budget_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forecast_items (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    label        VARCHAR(120) NOT NULL,
    kind         VARCHAR(20) NOT NULL DEFAULT 'other',   -- payroll, rent, loan, tax, supplier, retainer, other
    direction    VARCHAR(3) NOT NULL DEFAULT 'out',      -- 'in' or 'out'
    amount       DECIMAL(18,2) NOT NULL,                  -- each time it happens, a positive number, in the base currency
    frequency    VARCHAR(12) NOT NULL DEFAULT 'monthly', -- once, weekly, monthly, quarterly, yearly
    start_date   DATE NOT NULL,                           -- the first time (the only time for 'once')
    end_date     DATE NULL,                               -- the last time it can happen; empty = keeps going
    certainty    VARCHAR(10) NOT NULL DEFAULT 'estimate',-- 'confirmed' (a contract or schedule) or 'estimate'
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    note         VARCHAR(255) NULL,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_forecast_items_active (is_active, start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK. Expect 2 rows.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budget_lines', 'forecast_items');
