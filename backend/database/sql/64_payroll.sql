-- =====================================================================
-- 64_payroll.sql
-- Payroll: runs, payslip lines, and the deduction/earning types — all editable, nothing hard-coded to one country.
--
--   Ledger groups     Statutory Payroll Liabilities   (under Current Liabilities)  PAYE Payable, NSSF Payable, SHIF Payable, Housing Levy Payable, NITA Payable
--                     Employee Benefits / Payroll Expenses (under Indirect Expenses)  Salaries & Wages, Employer NSSF Contribution, Employer Housing Levy, NITA Levy
--                     Salaries Payable                 sits directly under Current Liabilities (what is owed to staff until they are paid)
--   payroll_settings          one row: overtime multiplier, whether absence is deducted, the two ledgers every run posts to
--   payroll_components        every earning / deduction / employer contribution: how it is worked out and the ledgers it posts to
--   payroll_employee_items    per person: an extra deduction/earning (a loan, a union fee), an own amount, or an exemption
--   payroll_runs              one run per month: draft → approved (posted to the books) → paid
--   payroll_lines             one payslip per person per run, with the full breakdown kept as it was worked out
-- The components are STARTER rows, switched OFF, for Kenya (PAYE, NSSF, SHIF, Housing Levy, NITA). Rates and limits change: check them, edit them
-- on the Payroll settings screen, then switch them on. Add your own (another country, another levy) there too.
-- This script commits by itself. Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. The groups this builds on (expect Current Liabilities and Indirect Expenses, one row each)
SELECT id, name, nature, parent_id FROM ledger_groups WHERE name IN ('Current Liabilities', 'Indirect Expenses', 'Statutory Payroll Liabilities', 'Employee Benefits / Payroll Expenses') ORDER BY name;
-- A2. Tables and ledgers already there? (expect 0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('payroll_settings', 'payroll_components', 'payroll_employee_items', 'payroll_runs', 'payroll_lines');
SELECT id, name FROM ledgers WHERE name IN ('Salaries & Wages', 'Salaries Payable', 'PAYE Payable', 'NSSF Payable', 'SHIF Payable', 'Housing Levy Payable', 'NITA Payable', 'Employer NSSF Contribution', 'Employer Housing Levy', 'NITA Levy');

-- PART B — TABLES (DDL, commit on their own)
CREATE TABLE IF NOT EXISTS payroll_settings (
    id                          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    overtime_multiplier         DECIMAL(6,2) NOT NULL DEFAULT 1.50,
    deduct_absence              TINYINT(1) NOT NULL DEFAULT 1,
    salaries_expense_ledger_id  BIGINT UNSIGNED NULL,
    salaries_payable_ledger_id  BIGINT UNSIGNED NULL,
    updated_by                  BIGINT UNSIGNED NULL,
    created_at                  TIMESTAMP NULL,
    updated_at                  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_components (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code              VARCHAR(30) NOT NULL,
    name              VARCHAR(80) NOT NULL,
    kind              VARCHAR(12) NOT NULL,                  -- earning | deduction | employer
    calc              VARCHAR(10) NOT NULL DEFAULT 'fixed',  -- fixed | percent | bands
    base              VARCHAR(10) NOT NULL DEFAULT 'gross',  -- what a percent / bands applies to: basic | gross | taxable
    value             DECIMAL(15,4) NOT NULL DEFAULT 0,      -- the amount (fixed) or the percent
    bands             JSON NULL,                             -- [{upto: 24000, rate: 10}, …, {upto: null, rate: 35}] — each slice taxed at its own rate
    base_cap          DECIMAL(15,2) NULL,                    -- the base counts only up to this (an upper earnings limit)
    min_amount        DECIMAL(15,2) NULL,
    max_amount        DECIMAL(15,2) NULL,
    relief            DECIMAL(15,2) NULL,                    -- taken off the result, not below nothing (personal relief)
    reduces_taxable   TINYINT(1) NOT NULL DEFAULT 0,         -- taken off before the taxable pay is worked out (a pension, a levy that is tax-deductible)
    applies_to        VARCHAR(10) NOT NULL DEFAULT 'all',    -- all | selected (only people given it under their items)
    ledger_id         BIGINT UNSIGNED NULL,                  -- where it posts (the liability to the authority, a loan account…)
    expense_ledger_id BIGINT UNSIGNED NULL,                  -- employer contributions: the cost
    jurisdiction      VARCHAR(40) NULL,
    notes             VARCHAR(255) NULL,
    sort_order        INT NOT NULL DEFAULT 0,
    is_active         TINYINT(1) NOT NULL DEFAULT 0,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    UNIQUE KEY payroll_component_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_employee_items (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NOT NULL,
    component_id  BIGINT UNSIGNED NOT NULL,
    amount        DECIMAL(15,4) NULL,                        -- this person's own amount (fixed) or rate (percent); empty = the component's
    exempt        TINYINT(1) NOT NULL DEFAULT 0,             -- this person does not have it
    note          VARCHAR(160) NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY payroll_item_once (user_id, component_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_runs (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number                VARCHAR(20) NOT NULL,              -- PR-2026-10
    period_start          DATE NOT NULL,
    period_end            DATE NOT NULL,
    status                VARCHAR(12) NOT NULL DEFAULT 'draft',   -- draft | approved | paid | cancelled
    total_gross           DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_deductions      DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_net             DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_employer        DECIMAL(15,2) NOT NULL DEFAULT 0,
    journal_voucher_id    BIGINT UNSIGNED NULL,
    payment_voucher_id    BIGINT UNSIGNED NULL,
    notes                 VARCHAR(255) NULL,
    created_by            BIGINT UNSIGNED NULL,
    approved_by           BIGINT UNSIGNED NULL,
    approved_at           DATETIME NULL,
    paid_at               DATETIME NULL,
    created_at            TIMESTAMP NULL,
    updated_at            TIMESTAMP NULL,
    UNIQUE KEY payroll_run_number (number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS payroll_lines (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    run_id              BIGINT UNSIGNED NOT NULL,
    user_id             BIGINT UNSIGNED NOT NULL,
    basic               DECIMAL(15,2) NOT NULL DEFAULT 0,
    days_expected       DECIMAL(6,2) NOT NULL DEFAULT 0,
    days_unpaid         DECIMAL(6,2) NOT NULL DEFAULT 0,
    overtime_hours      DECIMAL(8,2) NOT NULL DEFAULT 0,
    absence_deduction   DECIMAL(15,2) NOT NULL DEFAULT 0,
    overtime_pay        DECIMAL(15,2) NOT NULL DEFAULT 0,
    gross               DECIMAL(15,2) NOT NULL DEFAULT 0,
    taxable             DECIMAL(15,2) NOT NULL DEFAULT 0,
    total_deductions    DECIMAL(15,2) NOT NULL DEFAULT 0,
    net                 DECIMAL(15,2) NOT NULL DEFAULT 0,
    employer_cost       DECIMAL(15,2) NOT NULL DEFAULT 0,
    unverified_days     INT NOT NULL DEFAULT 0,              -- working days not yet verified in attendance
    accepted_unverified TINYINT(1) NOT NULL DEFAULT 0,       -- finance/admin accepted paying with those days unverified
    adjustments         JSON NULL,                           -- typed-in extras for this run: [{description, amount, kind: earning|deduction, ledger_id}]
    breakdown           JSON NULL,                           -- every component as worked out: [{component_id, name, kind, amount, ledger_id, expense_ledger_id}]
    created_at          TIMESTAMP NULL,
    updated_at          TIMESTAMP NULL,
    UNIQUE KEY payroll_line_person (run_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C — GROUPS, LEDGERS AND THE STARTER COMPONENTS (one transaction, committed at the end)
SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

SET @grp_liab := (SELECT id FROM ledger_groups WHERE name = 'Current Liabilities' ORDER BY id LIMIT 1);
SET @grp_exp  := (SELECT id FROM ledger_groups WHERE name = 'Indirect Expenses' ORDER BY id LIMIT 1);

INSERT INTO ledger_groups (parent_id, name, nature, is_primary, is_system, affects_gross_profit, sort_order, created_at, updated_at)
SELECT @grp_liab, 'Statutory Payroll Liabilities', 'liability', 0, 0, 0, 80, NOW(), NOW()
WHERE @grp_liab IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_groups x WHERE x.name = 'Statutory Payroll Liabilities');
INSERT INTO ledger_groups (parent_id, name, nature, is_primary, is_system, affects_gross_profit, sort_order, created_at, updated_at)
SELECT @grp_exp, 'Employee Benefits / Payroll Expenses', 'expense', 0, 0, 0, 20, NOW(), NOW()
WHERE @grp_exp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_groups x WHERE x.name = 'Employee Benefits / Payroll Expenses');
SET @grp_stat := (SELECT id FROM ledger_groups WHERE name = 'Statutory Payroll Liabilities' ORDER BY id LIMIT 1);
SET @grp_pay  := (SELECT id FROM ledger_groups WHERE name = 'Employee Benefits / Payroll Expenses' ORDER BY id LIMIT 1);

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT n.grp, n.name, 0, 0, 1, NOW(), NOW()
FROM (SELECT @grp_pay AS grp, 'Salaries & Wages' AS name
      UNION ALL SELECT @grp_pay, 'Employer NSSF Contribution'
      UNION ALL SELECT @grp_pay, 'Employer Housing Levy'
      UNION ALL SELECT @grp_pay, 'NITA Levy'
      UNION ALL SELECT @grp_liab, 'Salaries Payable'
      UNION ALL SELECT @grp_stat, 'PAYE Payable'
      UNION ALL SELECT @grp_stat, 'NSSF Payable'
      UNION ALL SELECT @grp_stat, 'SHIF Payable'
      UNION ALL SELECT @grp_stat, 'Housing Levy Payable'
      UNION ALL SELECT @grp_stat, 'NITA Payable') n
WHERE n.grp IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers l WHERE l.name = n.name);

INSERT INTO payroll_settings (overtime_multiplier, deduct_absence, salaries_expense_ledger_id, salaries_payable_ledger_id, created_at, updated_at)
SELECT 1.5, 1, (SELECT id FROM ledgers WHERE name = 'Salaries & Wages' LIMIT 1), (SELECT id FROM ledgers WHERE name = 'Salaries Payable' LIMIT 1), NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM payroll_settings);

-- starter components: OFF until you have checked the rates
INSERT INTO payroll_components (code, name, kind, calc, base, value, bands, base_cap, min_amount, max_amount, relief, reduces_taxable, applies_to, ledger_id, expense_ledger_id, jurisdiction, notes, sort_order, is_active, created_at, updated_at)
SELECT c.code, c.name, c.kind, c.calc, c.base, c.value, c.bands, c.base_cap, c.min_amount, c.max_amount, c.relief, c.reduces_taxable, 'all',
       (SELECT id FROM ledgers WHERE name = c.ledger LIMIT 1), (SELECT id FROM ledgers WHERE name = c.exp LIMIT 1), 'Kenya', c.notes, c.sort, 0, NOW(), NOW()
FROM (
      SELECT 'NSSF_EE' AS code, 'NSSF (employee)' AS name, 'deduction' AS kind, 'percent' AS calc, 'basic' AS base, 6 AS value, NULL AS bands, NULL AS base_cap, NULL AS min_amount, NULL AS max_amount, NULL AS relief, 1 AS reduces_taxable, 'NSSF Payable' AS ledger, NULL AS exp, 'STARTER — set the upper earnings limit (base cap) and confirm the rate' AS notes, 10 AS sort
      UNION ALL SELECT 'SHIF', 'SHIF', 'deduction', 'percent', 'gross', 2.75, NULL, NULL, 300, NULL, NULL, 1, 'SHIF Payable', NULL, 'STARTER — confirm the rate and the minimum; confirm whether it is tax-deductible for you', 20
      UNION ALL SELECT 'AHL_EE', 'Affordable Housing Levy (employee)', 'deduction', 'percent', 'gross', 1.5, NULL, NULL, NULL, NULL, NULL, 1, 'Housing Levy Payable', NULL, 'STARTER — confirm the rate', 30
      UNION ALL SELECT 'PAYE', 'PAYE', 'deduction', 'bands', 'taxable', 0,
             JSON_ARRAY(JSON_OBJECT('upto', 24000, 'rate', 10), JSON_OBJECT('upto', 32333, 'rate', 25), JSON_OBJECT('upto', 500000, 'rate', 30), JSON_OBJECT('upto', 800000, 'rate', 32.5), JSON_OBJECT('upto', NULL, 'rate', 35)),
             NULL, NULL, NULL, 2400, 0, 'PAYE Payable', NULL, 'STARTER — monthly bands and personal relief: check them against the current KRA tables', 40
      UNION ALL SELECT 'NSSF_ER', 'NSSF (employer)', 'employer', 'percent', 'basic', 6, NULL, NULL, NULL, NULL, NULL, 0, 'NSSF Payable', 'Employer NSSF Contribution', 'STARTER — same limit as the employee side', 50
      UNION ALL SELECT 'AHL_ER', 'Affordable Housing Levy (employer)', 'employer', 'percent', 'gross', 1.5, NULL, NULL, NULL, NULL, NULL, 0, 'Housing Levy Payable', 'Employer Housing Levy', 'STARTER — confirm the rate', 60
      UNION ALL SELECT 'NITA', 'NITA levy (employer)', 'employer', 'fixed', 'gross', 50, NULL, NULL, NULL, NULL, NULL, 0, 'NITA Payable', 'NITA Levy', 'STARTER — a flat amount per employee per month; confirm it', 70
     ) c
WHERE NOT EXISTS (SELECT 1 FROM payroll_components p WHERE p.code = c.code);

COMMIT;
SET SQL_SAFE_UPDATES = @old_safe;

-- PART D — RESULT CHECK (this script has already committed)
-- D1. The groups and ledgers (expect 2 groups; 10 ledgers)
SELECT g.name AS grp, l.name FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id
WHERE l.name IN ('Salaries & Wages', 'Salaries Payable', 'PAYE Payable', 'NSSF Payable', 'SHIF Payable', 'Housing Levy Payable', 'NITA Payable', 'Employer NSSF Contribution', 'Employer Housing Levy', 'NITA Levy') ORDER BY g.name, l.name;
-- D2. The starter components (expect 7, all is_active = 0) and where each posts
SELECT c.code, c.name, c.kind, c.calc, c.base, c.value, c.is_active, l.name AS posts_to, e.name AS employer_cost
FROM payroll_components c LEFT JOIN ledgers l ON l.id = c.ledger_id LEFT JOIN ledgers e ON e.id = c.expense_ledger_id ORDER BY c.sort_order;
-- D3. The settings (expect 1 row, both ledgers filled in)
SELECT s.overtime_multiplier, s.deduct_absence, a.name AS salaries_expense, b.name AS salaries_payable FROM payroll_settings s LEFT JOIN ledgers a ON a.id = s.salaries_expense_ledger_id LEFT JOIN ledgers b ON b.id = s.salaries_payable_ledger_id;
