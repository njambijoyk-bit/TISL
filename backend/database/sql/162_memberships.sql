-- =====================================================================
-- 162_memberships.sql
-- Memberships module, step 1 (docs/MEMBERSHIPS_PLAN.md): the foundation.
--   membership_plans           a plan: what it costs per period, the joining fee, trial and grace days, which branches it covers
--   membership_plan_benefits   what a plan gives (course access, meal-plan discount, ...): a type and its settings
--   membership_settings        one row of settings
-- Money is not kept here: periods and invoices come in the next script. Prices are before tax; the tax comes from the sales account.
-- Run 132 to 161 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('membership_plans', 'membership_plan_benefits', 'membership_settings');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS membership_plans (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(120) NOT NULL,
    slug             VARCHAR(140) NOT NULL,
    summary          VARCHAR(300) NULL,
    description      TEXT NULL,
    cover            VARCHAR(255) NULL,
    period_unit      VARCHAR(6) NOT NULL DEFAULT 'month',          -- day | week | month | year
    period_count     SMALLINT UNSIGNED NOT NULL DEFAULT 1,         -- every 3 months = unit month, count 3
    price            DECIMAL(14,2) NOT NULL DEFAULT 0,             -- per period, before tax
    joining_fee      DECIMAL(14,2) NOT NULL DEFAULT 0,             -- once, before tax
    ledger_id        BIGINT UNSIGNED NULL,                         -- the sales account the period is booked under
    joining_ledger_id BIGINT UNSIGNED NULL,                        -- ...and the joining fee (empty = the same)
    trial_days       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    grace_days       SMALLINT UNSIGNED NOT NULL DEFAULT 7,         -- days a late payment keeps the benefits
    auto_renew       TINYINT(1) NOT NULL DEFAULT 1,
    capacity         INT UNSIGNED NULL,                            -- the most members (empty = no limit)
    all_branches     TINYINT(1) NOT NULL DEFAULT 1,
    branch_ids       JSON NULL,
    status           VARCHAR(10) NOT NULL DEFAULT 'draft',         -- draft | published | archived
    sort_order       INT NOT NULL DEFAULT 0,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_membership_plans_slug (slug),
    KEY idx_membership_plans_status (status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS membership_plan_benefits (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    plan_id     BIGINT UNSIGNED NOT NULL,
    type        VARCHAR(20) NOT NULL,                              -- courses | meals | ... (a module registers its types)
    config      JSON NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_membership_plan_benefits_plan (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS membership_settings (
    id          TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    settings    JSON NULL,
    updated_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK. Expect three tables.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('membership_plans', 'membership_plan_benefits', 'membership_settings');
