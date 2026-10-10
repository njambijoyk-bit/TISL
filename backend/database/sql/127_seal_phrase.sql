-- =====================================================================
-- 127_seal_phrase.sql
-- Security, phase 1 (docs/SECURITY_PLAN.md): the seal phrase - a few words the person chose, shown on the sign-in page only to a browser they have signed in from before.
-- It is a small flourish that helps a person notice a copy of the page; the real protection is the passkey.
--   auth_seals   one row per person who chose a phrase
-- Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the table is absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'auth_seals';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS auth_seals (
    user_id     BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    phrase      VARCHAR(60) NOT NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - VERIFY (read-only; how many people chose one - the phrases themselves are not for reading here)
SELECT COUNT(*) AS people_with_a_seal FROM auth_seals;
