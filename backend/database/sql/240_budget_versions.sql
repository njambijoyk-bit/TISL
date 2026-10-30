-- =====================================================================
-- 240_budget_versions.sql
-- Budgeting, step 2 of docs/BOOKS_BUDGETING_PLAN.md: budgets, their versions and approval. Run scripts 237 and 239 first.
--   budgets           a plan for a span of months (a financial year, say): name, type, from and to month. Several can exist (an operating budget, a capex budget).
--   budget_versions   Original, Revised 1, Forecast ... of one budget. Each has a status: draft (can be edited) -> submitted -> approved -> locked. An approved or locked
--                     version is never edited: a revision is a COPY, so what was approved stays as it was and the changes can be seen.
--   budget_approvals  who submitted, approved, rejected, locked or reopened a version, when, and what they said.
--   budget_rows.version_id   which version a row belongs to; its uniqueness now holds within a version.
-- Everything entered so far becomes one budget, "Imported budget", with one draft version "Original". Nothing is posted. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. What is already there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budgets', 'budget_versions', 'budget_approvals');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'budget_rows' AND column_name = 'version_id';
-- A2. What will be carried over into "Imported budget"
SELECT (SELECT COUNT(*) FROM budget_rows) AS budget_rows, (SELECT MIN(period) FROM budget_lines) AS first_month, (SELECT MAX(period) FROM budget_lines) AS last_month;

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS budgets (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    budget_type VARCHAR(20) NOT NULL DEFAULT 'operating',   -- operating, sales, purchases, payroll, capex, cash, project, departmental, master
    from_month  CHAR(7) NOT NULL,                            -- 'YYYY-MM'
    to_month    CHAR(7) NOT NULL,
    note        VARCHAR(255) NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_versions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    budget_id       BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(60) NOT NULL,                    -- Original, Revised 1, Forecast, Worst case ...
    kind            VARCHAR(10) NOT NULL DEFAULT 'original', -- original, revision, forecast, scenario
    status          VARCHAR(10) NOT NULL DEFAULT 'draft',    -- draft, submitted, approved, locked
    copied_from_id  BIGINT UNSIGNED NULL,
    note            VARCHAR(255) NULL,
    prepared_by     BIGINT UNSIGNED NULL,
    submitted_by    BIGINT UNSIGNED NULL,
    submitted_at    TIMESTAMP NULL,
    approved_by     BIGINT UNSIGNED NULL,
    approved_at     TIMESTAMP NULL,
    locked_by       BIGINT UNSIGNED NULL,
    locked_at       TIMESTAMP NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_budget_versions_budget (budget_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS budget_approvals (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    version_id  BIGINT UNSIGNED NOT NULL,
    action      VARCHAR(12) NOT NULL,                        -- created, submitted, approved, rejected, locked, reopened
    by_user     BIGINT UNSIGNED NULL,
    note        VARCHAR(255) NULL,
    created_at  TIMESTAMP NULL,
    KEY idx_budget_approvals_version (version_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS budget_versions_240;
DELIMITER $$
CREATE PROCEDURE budget_versions_240()
BEGIN
    DECLARE b BIGINT DEFAULT 0;
    DECLARE v BIGINT DEFAULT 0;
    DECLARE first_m CHAR(7);
    DECLARE last_m CHAR(7);
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'budget_rows' AND column_name = 'version_id') THEN
        ALTER TABLE budget_rows ADD COLUMN version_id BIGINT UNSIGNED NULL AFTER id;
    END IF;
    -- what was entered before versions existed becomes one budget with one draft version
    IF EXISTS (SELECT 1 FROM budget_rows WHERE version_id IS NULL) THEN
        SELECT COALESCE(MIN(period), DATE_FORMAT(CURDATE(), '%Y-01')), COALESCE(MAX(period), DATE_FORMAT(CURDATE(), '%Y-12')) INTO first_m, last_m FROM budget_lines;
        INSERT INTO budgets (name, budget_type, from_month, to_month, created_at, updated_at) VALUES ('Imported budget', 'operating', first_m, last_m, NOW(), NOW());
        SET b = LAST_INSERT_ID();
        INSERT INTO budget_versions (budget_id, name, kind, status, created_at, updated_at) VALUES (b, 'Original', 'original', 'draft', NOW(), NOW());
        SET v = LAST_INSERT_ID();
        INSERT INTO budget_approvals (version_id, action, note, created_at) VALUES (v, 'created', 'Made from the budget rows entered before versions existed', NOW());
        UPDATE budget_rows SET version_id = v WHERE id > 0 AND version_id IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'budget_rows' AND index_name = 'uq_budget_rows_combo') THEN
        ALTER TABLE budget_rows DROP INDEX uq_budget_rows_combo;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'budget_rows' AND index_name = 'uq_budget_rows_version_combo') THEN
        ALTER TABLE budget_rows ADD UNIQUE KEY uq_budget_rows_version_combo (version_id, target_type, target_id, dim_key);
    END IF;
END$$
DELIMITER ;
CALL budget_versions_240();
DROP PROCEDURE IF EXISTS budget_versions_240;

-- PART C - CHECK. Expect 3 rows, then 1 row, then rows_without_a_version = 0.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('budgets', 'budget_versions', 'budget_approvals');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'budget_rows' AND column_name = 'version_id';
SELECT (SELECT COUNT(*) FROM budget_rows WHERE version_id IS NULL) AS rows_without_a_version, (SELECT COUNT(*) FROM budgets) AS budgets, (SELECT COUNT(*) FROM budget_versions) AS versions;
