-- =====================================================================
-- 116_payment_settings.sql
-- Payment keys (M-Pesa today, cards later) set on a screen instead of in .env. OWNER ONLY (permission payments.keys).
--   payment_settings           one row: the live settings, encrypted with the application key; which version of each part is live
--   payment_setting_versions   every save is a numbered version holding the whole part (encrypted), so any change can be rolled back
--   payment_setting_logs       append-only record of who did what and when (never a key)
-- Nothing changes until someone saves on the screen: with nothing saved, the keys in .env keep working exactly as now. Safe to run twice.
-- Run in Workbench. DDL commits on its own; nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: no rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('payment_settings', 'payment_setting_versions', 'payment_setting_logs');

-- PART B — CHANGE
CREATE TABLE IF NOT EXISTS payment_settings (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    mpesa_enc LONGTEXT NULL,
    versions JSON NULL,                                    -- part => the live version id
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_setting_versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    part VARCHAR(20) NOT NULL,
    version_no INT UNSIGNED NOT NULL,
    snapshot_enc LONGTEXT NULL,
    summary VARCHAR(500) NULL,
    changed_keys JSON NULL,
    action VARCHAR(20) NOT NULL DEFAULT 'save',            -- save | rollback
    rolled_back_from BIGINT UNSIGNED NULL,
    tested_ok TINYINT(1) NULL,
    has_secrets TINYINT(1) NOT NULL DEFAULT 0,
    secrets_purged_at DATETIME NULL,
    secrets_purged_by BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_payment_setting_versions (part, version_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_setting_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    event VARCHAR(40) NOT NULL,
    part VARCHAR(20) NULL,
    version_id BIGINT UNSIGNED NULL,
    summary VARCHAR(500) NULL,
    context JSON NULL,
    ip VARCHAR(45) NULL,
    created_at TIMESTAMP NULL,
    KEY idx_payment_setting_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C — CHECK (expect: 3 tables, nothing saved yet)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('payment_settings', 'payment_setting_versions', 'payment_setting_logs');
SELECT COUNT(*) AS versions FROM payment_setting_versions;
