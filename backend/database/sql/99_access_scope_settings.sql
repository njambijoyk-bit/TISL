-- =====================================================================
-- 99_access_scope_settings.sql
-- Branch limits, switched on one area at a time.
--
-- access_settings holds the owner's choices, one row per area:
--     scope_mode            the default for every area           off | log | on
--     scope_mode.books      Books: vouchers, day book, reports   off | log | on
--     scope_mode.stock      Stock                                off | log | on
-- off = nobody is limited by branch. log = nothing is refused, but the Activity tab lists what would have been hidden or refused.
-- on  = people are limited to their default branch plus the branches they were given (admin, super admin and senior accountant never are).
-- A missing row means "use the default"; with no default row the server setting ACCESS_SCOPE_MODE (log unless changed) applies.
-- The owner changes these on Settings > Roles & access. Run script 98 first.
-- Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. The access engine is there (expect 1 row: roles)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'roles';

-- A2. Is the settings table already there? (expect 0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'access_settings';


-- ---------------------------------------------------------------------
-- PART B — CREATE (DDL, commits on its own)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS access_settings (
    `key` VARCHAR(60) NOT NULL PRIMARY KEY,
    value VARCHAR(255) NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);


-- ---------------------------------------------------------------------
-- PART C — RESULT CHECK
-- ---------------------------------------------------------------------

-- C1. The table exists (expect 1 row)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'access_settings';

-- C2. No choices yet: every area follows the server default, which is "log" (expect 0 rows)
SELECT `key`, value FROM access_settings ORDER BY `key`;
