-- =====================================================================
-- 125_security_policy.sql
-- Security, phase 1 (docs/SECURITY_PLAN.md): who must use a passkey, and the owner's switches for it.
--   security_settings   one row per setting the owner can change from the screen (rule mode off / log / enforce, grace dates, which roles). A missing row means "the default in config/security.php".
-- Safe to re-run. Run each part on its own in Workbench. Run 124_passkeys.sql first.
-- =====================================================================

-- PART A - READ-ONLY CHECK (what exists now; the table is absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'security_settings';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS security_settings (
    setting_key     VARCHAR(80) NOT NULL PRIMARY KEY,                   -- passkeys.mode, passkeys.enforce_from, passkeys.roles, ...
    value           JSON NULL,
    updated_by_id   BIGINT UNSIGNED NULL,                               -- who last changed it
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - VERIFY (read-only)
SELECT setting_key, value, updated_by_id, updated_at FROM security_settings ORDER BY setting_key;
