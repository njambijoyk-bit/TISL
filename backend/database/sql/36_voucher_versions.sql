-- =====================================================================
-- 36_voucher_versions.sql
-- The edit log: every time a voucher is created, altered or deleted (cancelled)
-- a snapshot of it is kept, so any two versions can be compared side by side
-- (like Tally's "Edit Log"). Version 1 is the voucher as first saved; a voucher
-- that existed before this script gets its first version the first time it is
-- altered or cancelled (the state it was in just before).
--
--   voucher_versions   voucher_id, version, activity (created | altered | deleted),
--                      user_id, snapshot (JSON), created_at
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Already there? (expect 0 rows on first run)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'voucher_versions';

-- A2. The parent table exists (expect 1 row)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'vouchers';

-- PART B — CREATE THE TABLE
CREATE TABLE IF NOT EXISTS voucher_versions (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    voucher_id  BIGINT UNSIGNED NOT NULL,
    version     INT UNSIGNED NOT NULL,
    activity    VARCHAR(10) NOT NULL,              -- created | altered | deleted
    user_id     BIGINT UNSIGNED NULL,
    snapshot    LONGTEXT NOT NULL,                 -- the voucher as it was, as JSON
    created_at  DATETIME NOT NULL,
    UNIQUE KEY uq_voucher_version (voucher_id, version),
    KEY idx_version_activity (activity, created_at)
);

-- PART C — RESULT CHECK. Expect 1 row.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'voucher_versions';
