-- =====================================================================
-- 131_email_sign_in_links.sql
-- Security, phase 4.1 (docs/SECURITY_PHASE4.md): the one-time sign-in link a CUSTOMER can ask for by email instead of typing a password.
--   auth_email_links   one row per link: the link and the asking browser are kept only as hashes, so a stolen copy of this table opens nothing
-- Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the table is absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'auth_email_links';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS auth_email_links (
    id           CHAR(64) NOT NULL PRIMARY KEY,                       -- sha256 of the code in the emailed link
    user_id      BIGINT UNSIGNED NOT NULL,
    binder_hash  CHAR(64) NOT NULL,                                   -- sha256 of the code kept in the asking browser's cookie (a forwarded link without it does nothing)
    ip           VARCHAR(45) NULL,
    user_agent   VARCHAR(255) NULL,
    tries        TINYINT UNSIGNED NOT NULL DEFAULT 0,                 -- wrong-browser attempts; the link is burnt after a few
    expires_at   DATETIME NOT NULL,
    used_at      DATETIME NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_auth_email_links_user (user_id, used_at, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - READ-ONLY CHECK
SELECT COUNT(*) AS links FROM auth_email_links;
