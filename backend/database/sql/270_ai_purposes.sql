-- =====================================================================
-- 270_ai_purposes.sql
-- AI purposes (docs/AI_PURPOSES_SPEC.md, build A.1): each kind of AI work has its own line of keys, each place with its own model.
--   ai_key_purposes        the purposes a key that is not open to all is kept to
--   ai_purpose_lines       each purpose's line: key, place (1 = first choice), model (empty = the key's own model)
--   ai_purpose_settings    a purpose's monthly limit (tokens, or estimated cost in USD), and when the 80% notice went out
--   ai_gateway_settings    how long a refused key rests (one row)
--   ai_calls               one row per try of a key: purpose, key, model, tokens, estimated cost, time, place, outcome. Never what was asked or answered.
-- And on ai_provider_keys: open_to_all, resting_until, rest_reason.
-- Moving the keys you have (only on the first run, when open_to_all is added):
--   used for all -> open to all; used for analytics -> kept to analytics, explain and drafts; used for mimi or screening -> kept to that one.
-- Needs script 67. Safe to re-run: a second run changes nothing you set on the screen. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (script 67 was run), then the tables of this script that exist (none on a first run), then your keys.
SELECT COUNT(*) AS keys_script_67_ran FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_provider_keys' AND column_name = 'used_for';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('ai_key_purposes', 'ai_purpose_lines', 'ai_purpose_settings', 'ai_gateway_settings', 'ai_calls');
SELECT id, provider, label, used_for, priority, is_active FROM ai_provider_keys ORDER BY priority, id;

-- PART B - CREATE
DROP PROCEDURE IF EXISTS ai_purposes_guard;
DELIMITER $$
CREATE PROCEDURE ai_purposes_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_provider_keys' AND column_name = 'used_for') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Run script 67_ai_provider_keys.sql first. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL ai_purposes_guard();
DROP PROCEDURE IF EXISTS ai_purposes_guard;

CREATE TABLE IF NOT EXISTS ai_key_purposes (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    key_id      BIGINT UNSIGNED NOT NULL,
    purpose     VARCHAR(20) NOT NULL,                                    -- mimi | screening | analytics | explain | drafts
    created_at  TIMESTAMP NULL,
    UNIQUE KEY uq_ai_key_purposes (key_id, purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_purpose_lines (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    purpose     VARCHAR(20) NOT NULL,
    key_id      BIGINT UNSIGNED NOT NULL,
    position    INT NOT NULL DEFAULT 1,                                  -- 1 = first choice
    model       VARCHAR(80) NULL,                                        -- empty = the key's own model
    updated_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_ai_purpose_lines (purpose, key_id),
    KEY idx_ai_purpose_lines_order (purpose, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_purpose_settings (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    purpose        VARCHAR(20) NOT NULL,
    monthly_limit  DECIMAL(14,4) NULL,                                   -- null = no limit
    limit_unit     VARCHAR(6) NOT NULL DEFAULT 'tokens',                 -- tokens | cost (estimated USD, not a bill)
    warned_month   CHAR(7) NULL,                                         -- the month (YYYY-MM) the 80% notice went out
    updated_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_ai_purpose_settings (purpose)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_gateway_settings (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    rest_minutes  INT NOT NULL DEFAULT 10,                               -- how long a key that is over quota or refused rests (0 = never rests)
    updated_by    BIGINT UNSIGNED NULL,
    updated_at    TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_calls (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    purpose            VARCHAR(20) NOT NULL,
    key_id             BIGINT UNSIGNED NULL,
    provider           VARCHAR(20) NULL,
    model              VARCHAR(80) NULL,
    prompt_tokens      INT NOT NULL DEFAULT 0,
    completion_tokens  INT NOT NULL DEFAULT 0,
    cost_estimate      DECIMAL(12,6) NOT NULL DEFAULT 0,                 -- the rough rates on the usage screen: an estimate, not a bill
    ms                 INT NOT NULL DEFAULT 0,
    position           INT NOT NULL DEFAULT 1,                           -- the key's place in the line this call went down (1 = first choice)
    outcome            VARCHAR(8) NOT NULL DEFAULT 'ok',                 -- ok | failed | refused (licence or limit: no key was tried)
    error              VARCHAR(255) NULL,
    created_at         TIMESTAMP NULL,
    KEY idx_ai_calls_purpose (purpose, created_at),
    KEY idx_ai_calls_key (key_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO ai_gateway_settings (id, rest_minutes, updated_at) VALUES (1, 10, NOW());

-- the new key columns, and moving the keys you have (only when open_to_all is added, so a second run keeps what you set)
DROP PROCEDURE IF EXISTS ai_purposes_keys;
DELIMITER $$
CREATE PROCEDURE ai_purposes_keys()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_provider_keys' AND column_name = 'open_to_all') THEN
        SET @s = CONCAT('ALTER TABLE ai_provider_keys ', 'ADD COLUMN open_to_all TINYINT(1) NOT NULL DEFAULT 1');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
        UPDATE ai_provider_keys SET open_to_all = CASE WHEN used_for = 'all' THEN 1 ELSE 0 END;
        INSERT IGNORE INTO ai_key_purposes (key_id, purpose, created_at) SELECT id, 'analytics', NOW() FROM ai_provider_keys WHERE used_for = 'analytics';
        INSERT IGNORE INTO ai_key_purposes (key_id, purpose, created_at) SELECT id, 'explain', NOW() FROM ai_provider_keys WHERE used_for = 'analytics';
        INSERT IGNORE INTO ai_key_purposes (key_id, purpose, created_at) SELECT id, 'drafts', NOW() FROM ai_provider_keys WHERE used_for = 'analytics';
        INSERT IGNORE INTO ai_key_purposes (key_id, purpose, created_at) SELECT id, used_for, NOW() FROM ai_provider_keys WHERE used_for IN ('mimi', 'screening');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_provider_keys' AND column_name = 'resting_until') THEN
        SET @s = CONCAT('ALTER TABLE ai_provider_keys ', 'ADD COLUMN resting_until DATETIME NULL');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_provider_keys' AND column_name = 'rest_reason') THEN
        SET @s = CONCAT('ALTER TABLE ai_provider_keys ', 'ADD COLUMN rest_reason VARCHAR(255) NULL');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL ai_purposes_keys();
DROP PROCEDURE IF EXISTS ai_purposes_keys;

-- PART C - CHECK. Expect 5 tables, 3 columns, then each key with whether it is open to all and what it is kept to.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('ai_key_purposes', 'ai_purpose_lines', 'ai_purpose_settings', 'ai_gateway_settings', 'ai_calls');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_provider_keys' AND column_name IN ('open_to_all', 'resting_until', 'rest_reason');
SELECT k.id, k.label, k.used_for, k.open_to_all, GROUP_CONCAT(p.purpose ORDER BY p.purpose) AS kept_to FROM ai_provider_keys k LEFT JOIN ai_key_purposes p ON p.key_id = k.id GROUP BY k.id, k.label, k.used_for, k.open_to_all;
