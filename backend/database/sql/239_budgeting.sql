-- =====================================================================
-- 239_budgeting.sql
-- Budgeting, step 1 of docs/BOOKS_BUDGETING_PLAN.md (Books -> Configuration -> Budgeting). Run script 237 first.
--   budget_initiatives  a one-off or time-limited thing that has its own budget (Website redesign, New warehouse, Cash sales), nested to any depth. NOT the Projects
--                       module; project_id can point at one of its projects (optional, never required).
--   budget_rows         one planned line: an income, expense or balance-sheet ledger group or ledger, with any mix of cost centre, department, branch and initiative,
--                       whether it is a recovery (an expense expected to be credited back), and how its months were filled (method + params, kept so the person can see
--                       and rerun it). dim_key = 'costcentre-department-branch-initiative-recovery' ids (0 = none) so one row is unique per combination.
--   budget_lines        (script 237) the amount per month; row_id now says which row it belongs to. The old (period, target) key is replaced by (row_id, period).
-- Existing budget lines keep their amounts: each distinct target becomes one budget row with no dimensions. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. What is already there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budget_initiatives', 'budget_rows');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'budget_lines' AND column_name = 'row_id';
-- A2. The budget lines that will be carried over (script 237 must have been run)
SELECT COUNT(*) AS budget_line_rows, COUNT(DISTINCT target_type, target_id) AS distinct_targets FROM budget_lines;

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS budget_initiatives (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    parent_id   BIGINT UNSIGNED NULL,
    code        VARCHAR(30) NULL,
    name        VARCHAR(120) NOT NULL,
    note        VARCHAR(255) NULL,
    project_id  BIGINT UNSIGNED NULL,              -- optional link to the Projects module
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    sort_order  INT NOT NULL DEFAULT 0,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_budget_initiatives_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_rows (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    target_type    VARCHAR(10) NOT NULL,           -- 'group' (the group and everything under it) or 'ledger'
    target_id      BIGINT UNSIGNED NOT NULL,       -- ledger_groups.id or ledgers.id
    cost_centre_id BIGINT UNSIGNED NULL,
    department_id  BIGINT UNSIGNED NULL,           -- a department has its own cost centre: that is what its actuals are read from
    location_id    BIGINT UNSIGNED NULL,           -- the branch
    initiative_id  BIGINT UNSIGNED NULL,
    is_recovery    TINYINT(1) NOT NULL DEFAULT 0,  -- an expense account expected to be credited (travel recharged to a customer): it lowers the net spend
    method         VARCHAR(20) NOT NULL DEFAULT 'manual',   -- manual, fixed, annual, seasonal, percent, quantity, history, copy
    method_params  TEXT NULL,                      -- JSON of what the method used (amount, percents, quantity and rate, growth ...)
    dim_key        VARCHAR(60) NOT NULL DEFAULT '0-0-0-0-0',
    note           VARCHAR(160) NULL,
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_budget_rows_combo (target_type, target_id, dim_key),
    KEY idx_budget_rows_cc (cost_centre_id),
    KEY idx_budget_rows_initiative (initiative_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS budgeting_239;
DELIMITER $$
CREATE PROCEDURE budgeting_239()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'budget_lines' AND column_name = 'row_id') THEN
        ALTER TABLE budget_lines ADD COLUMN row_id BIGINT UNSIGNED NULL AFTER id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'budget_lines' AND index_name = 'uq_budget_line') THEN
        ALTER TABLE budget_lines DROP INDEX uq_budget_line;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'budget_lines' AND index_name = 'uq_budget_row_period') THEN
        -- carry over what was there: one row per distinct target, then point each month at its row
        INSERT IGNORE INTO budget_rows (target_type, target_id, dim_key, created_at, updated_at)
            SELECT DISTINCT target_type, target_id, '0-0-0-0-0', NOW(), NOW() FROM budget_lines WHERE row_id IS NULL;
        UPDATE budget_lines bl JOIN budget_rows r ON r.target_type = bl.target_type AND r.target_id = bl.target_id AND r.dim_key = '0-0-0-0-0'
            SET bl.row_id = r.id WHERE bl.id > 0 AND bl.row_id IS NULL;   -- id > 0 so Workbench's safe-update mode allows it
        ALTER TABLE budget_lines ADD UNIQUE KEY uq_budget_row_period (row_id, period);
    END IF;
END$$
DELIMITER ;
CALL budgeting_239();
DROP PROCEDURE IF EXISTS budgeting_239;

-- PART C - CHECK. Expect 2 rows, then 1 row, then every figure matching.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budget_initiatives', 'budget_rows');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'budget_lines' AND column_name = 'row_id';
SELECT (SELECT COUNT(*) FROM budget_lines WHERE row_id IS NULL) AS months_without_a_row, (SELECT COUNT(*) FROM budget_rows) AS rows_made;
