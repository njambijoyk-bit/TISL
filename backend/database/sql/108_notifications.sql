-- =====================================================================
-- 108_notifications.sql
-- The notification system (docs/NOTIFICATIONS_PLAN.md): one place every message goes through, with settings set up on screens (no keys in code or .env),
-- a version for every change (so any change can be rolled back), an append-only log of every action, and a log of every delivery.
--   notification_settings           one row (id 1): the LIVE settings, per part: general + types (plain) and email + whatsapp (encrypted by the app)
--   notification_setting_versions   every saved version of a part, whole, secrets encrypted; replacing a key never loses the old one
--   notification_setting_logs       who did what, when, from where (never a secret value); the app cannot change or delete a row
--   notification_deliveries         every message on every channel: sent, failed, waiting to be sent by hand ...; text blanked after 12 months
--   customers.notify_mode           NULL = the company default; email | whatsapp | both
--   customers.notify_essential_only 1 = only the messages that matter (orders, payments, refunds, delays); 0 = everything; NULL = the company default
--   customers.whatsapp_consent_at / _source   when and from where (profile | checkout) the WhatsApp number was given for updates
-- Existing rows keep NULL, so nothing changes until someone chooses. (If you ran an earlier copy of this script, also run 109_notify_essential_tristate.sql.) Safe to run twice.
-- Run in Workbench. DDL commits on its own, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: no tables and no columns on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('notification_settings', 'notification_setting_versions', 'notification_setting_logs', 'notification_deliveries');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers'
  AND column_name IN ('notify_mode', 'notify_essential_only', 'whatsapp_consent_at', 'whatsapp_consent_source');

-- PART B — CHANGE (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS notification_settings (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,                 -- always 1
    general JSON NULL,
    types JSON NULL,
    email_enc LONGTEXT NULL,                                  -- encrypted by the app (host, username, password ...)
    whatsapp_enc LONGTEXT NULL,                               -- encrypted by the app (provider keys ...)
    versions JSON NULL,                                       -- part => id of its current version
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_setting_versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    part VARCHAR(20) NOT NULL,                                -- general | types | email | whatsapp
    version_no INT UNSIGNED NOT NULL,                         -- 1, 2, 3 ... within the part
    snapshot_enc LONGTEXT NULL,                               -- the whole part, encrypted
    summary VARCHAR(500) NULL,                                -- in words, never a secret value
    changed_keys JSON NULL,
    action VARCHAR(20) NOT NULL DEFAULT 'save',               -- save | rollback
    rolled_back_from BIGINT UNSIGNED NULL,
    tested_ok TINYINT(1) NULL,                                -- 1 the connection test passed, 0 saved anyway after a failed test, NULL not tested
    has_secrets TINYINT(1) NOT NULL DEFAULT 0,
    secrets_purged_at DATETIME NULL,
    secrets_purged_by BIGINT UNSIGNED NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_notification_version (part, version_no),
    KEY idx_notification_versions_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_setting_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NULL,
    event VARCHAR(40) NOT NULL,                               -- saved | tested | rolled_back | keys_purged | message_retried | whatsapp_marked_sent | whatsapp_skipped ...
    part VARCHAR(20) NULL,
    version_id BIGINT UNSIGNED NULL,
    summary VARCHAR(500) NULL,
    context JSON NULL,
    ip VARCHAR(45) NULL,
    created_at TIMESTAMP NULL,
    KEY idx_notification_logs_created (created_at),
    KEY idx_notification_logs_event (event)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_deliveries (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    notification_id BIGINT UNSIGNED NULL,                     -- the bell row, when there is one
    notifiable_type VARCHAR(60) NULL,
    notifiable_id BIGINT UNSIGNED NULL,
    type VARCHAR(60) NOT NULL,                                -- order_placed, preorder_delayed ...
    channel VARCHAR(12) NOT NULL,                             -- database | email | whatsapp
    via VARCHAR(8) NULL,                                      -- link | api (whatsapp)
    status VARCHAR(12) NOT NULL,                              -- queued | sent | delivered | read | failed | to_send | skipped
    to_address VARCHAR(190) NULL,
    subject VARCHAR(255) NULL,
    body MEDIUMTEXT NULL,
    wa_url TEXT NULL,
    external_id VARCHAR(100) NULL,
    error VARCHAR(500) NULL,
    attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    sent_at DATETIME NULL,
    delivered_at DATETIME NULL,
    read_at DATETIME NULL,
    handled_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY idx_notification_deliveries_status (channel, status),
    KEY idx_notification_deliveries_notification (notification_id),
    KEY idx_notification_deliveries_notifiable (notifiable_type, notifiable_id),
    KEY idx_notification_deliveries_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_column_if_missing('customers', 'notify_mode', 'VARCHAR(10) NULL');
CALL add_column_if_missing('customers', 'notify_essential_only', 'TINYINT(1) NULL DEFAULT NULL');
CALL add_column_if_missing('customers', 'whatsapp_consent_at', 'DATETIME NULL');
CALL add_column_if_missing('customers', 'whatsapp_consent_source', 'VARCHAR(10) NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — CHECK (expect: 4 tables; 4 columns; no setting saved yet, every customer on the company default)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('notification_settings', 'notification_setting_versions', 'notification_setting_logs', 'notification_deliveries');
SELECT COUNT(*) AS customer_columns FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers'
  AND column_name IN ('notify_mode', 'notify_essential_only', 'whatsapp_consent_at', 'whatsapp_consent_source');
SELECT (SELECT COUNT(*) FROM notification_settings) AS settings_rows, (SELECT COUNT(*) FROM notification_setting_versions) AS versions,
       (SELECT COUNT(*) FROM customers WHERE notify_mode IS NULL) AS customers_on_company_default;
