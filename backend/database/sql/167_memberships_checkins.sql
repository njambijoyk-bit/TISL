-- =====================================================================
-- 167_memberships_checkins.sql
-- Memberships step 6 (docs/MEMBERSHIPS_PLAN.md): check-in and the member card.
--   membership_checkins   every check-in at a door or desk, let in or turned away, with the reason, the branch and who did it
-- The member card is a signed QR (code type "mem"): it needs no table, it is checked without the database and cannot be guessed or altered.
-- Run 163 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'membership_checkins';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS membership_checkins (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    membership_id  BIGINT UNSIGNED NULL,
    user_id        BIGINT UNSIGNED NOT NULL,
    location_id    BIGINT UNSIGNED NULL,
    result         VARCHAR(8) NOT NULL,                              -- ok | denied
    reason         VARCHAR(200) NULL,
    method         VARCHAR(8) NOT NULL DEFAULT 'card',               -- card | manual
    by_user_id     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    KEY idx_membership_checkins_user (user_id, created_at),
    KEY idx_membership_checkins_location (location_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'membership_checkins';
