-- =====================================================================
-- 65_verification.sql
-- Voucher verification — a second pair of eyes that NEVER touches the books (Tally-style).
--   verification_settings      one row: the day of the next month by which a month should be verified
--   verification_assignments   who verifies what: a voucher type (or every voucher), payroll runs, or attendance months;
--                              optionally one branch and a range of months; checking every one, a percentage, or hand-picked ones
--   verification_items         one row per thing to verify (a voucher, a payroll run, a person's attendance month) with its status
--   verification_log           every status change: who, what, when, the note
-- Statuses: pending · verified · internal_observation / internal_clarified · external_query / external_clarified (who clarified) · altered
-- (a verified voucher that was edited afterwards comes back as "altered" to be checked again).
-- Run in Workbench. Safe to re-run. It only creates tables, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('verification_settings', 'verification_assignments', 'verification_items', 'verification_log');

-- PART B — CREATE (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS verification_settings (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    due_day     INT NOT NULL DEFAULT 10,
    updated_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS verification_assignments (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,                    -- the verifier
    scope_type  VARCHAR(20) NOT NULL,                        -- voucher_type | all_vouchers | payroll | attendance
    scope_id    BIGINT UNSIGNED NULL,                        -- the voucher type, for voucher_type
    location_id BIGINT UNSIGNED NULL,                        -- only this branch's vouchers
    sampling    VARCHAR(10) NOT NULL DEFAULT 'all',          -- all | percent | manual
    percent     INT NOT NULL DEFAULT 100,
    from_month  CHAR(7) NULL,                                -- 2026-08
    to_month    CHAR(7) NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY verification_assign_user (user_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS verification_items (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_type      VARCHAR(20) NOT NULL,                  -- voucher | payroll_run | attendance_month
    subject_key       VARCHAR(40) NOT NULL,                  -- the voucher id, the run id, "userId:2026-08"
    month             CHAR(7) NOT NULL,
    type_key          VARCHAR(40) NOT NULL,                  -- vt:12 | payroll | attendance
    type_label        VARCHAR(80) NOT NULL,
    ref               VARCHAR(60) NULL,
    item_date         DATE NULL,
    particulars       VARCHAR(160) NULL,
    amount            DECIMAL(15,2) NULL,
    assignment_id     BIGINT UNSIGNED NULL,
    assigned_to       BIGINT UNSIGNED NOT NULL,
    selected          TINYINT(1) NOT NULL DEFAULT 1,         -- in the sample (always 1 when checking every one)
    status            VARCHAR(24) NOT NULL DEFAULT 'pending',
    note              VARCHAR(255) NULL,
    verified_stamp    VARCHAR(60) NULL,                      -- what it looked like when verified (its version), to spot a later edit
    verified_by       BIGINT UNSIGNED NULL,
    verified_at       DATETIME NULL,
    clarified_by_name VARCHAR(120) NULL,                     -- external clarification: who cleared it up
    clarified_note    VARCHAR(255) NULL,
    clarified_at      DATETIME NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    UNIQUE KEY verification_item_subject (subject_type, subject_key),
    KEY verification_item_work (assigned_to, month, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS verification_log (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    item_id     BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NULL,
    status      VARCHAR(24) NOT NULL,
    note        VARCHAR(255) NULL,
    created_at  TIMESTAMP NULL,
    KEY verification_log_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C — CHECK (expect four rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('verification_settings', 'verification_assignments', 'verification_items', 'verification_log');
