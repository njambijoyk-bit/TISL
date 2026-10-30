-- =====================================================================
-- 241_budget_templates.sql
-- Budgeting, step 3 of docs/BOOKS_BUDGETING_PLAN.md: templates. Run scripts 237, 239 and 240 first.
--   budget_templates        a reusable structure: name, description, type. Made from a budget version ("Save as a template"), used to start a new budget for a new year or branch.
--   budget_template_lines   one planned account in a template, with any cost centre, department, branch and initiative, whether it is a recovery, and HOW its months are
--                           filled (method + params: a fixed amount, a yearly figure split by season, a percent of another line, last year plus growth ...). A template holds no
--                           month amounts of its own; they are worked out for the new budget's months when it is made.
-- Nothing in the books changes. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. What is already there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budget_templates', 'budget_template_lines');

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS budget_templates (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    description VARCHAR(255) NULL,
    budget_type VARCHAR(20) NOT NULL DEFAULT 'operating',
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_template_lines (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    template_id    BIGINT UNSIGNED NOT NULL,
    target_type    VARCHAR(10) NOT NULL,           -- 'group' or 'ledger'
    target_id      BIGINT UNSIGNED NOT NULL,
    cost_centre_id BIGINT UNSIGNED NULL,
    department_id  BIGINT UNSIGNED NULL,
    location_id    BIGINT UNSIGNED NULL,
    initiative_id  BIGINT UNSIGNED NULL,
    is_recovery    TINYINT(1) NOT NULL DEFAULT 0,
    method         VARCHAR(20) NOT NULL DEFAULT 'manual',
    method_params  TEXT NULL,                      -- JSON; a 'percent' line names the template line it takes a percent of as {"of_line": id}
    note           VARCHAR(160) NULL,
    sort_order     INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_budget_template_lines_template (template_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK. Expect 2 rows.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budget_templates', 'budget_template_lines');
