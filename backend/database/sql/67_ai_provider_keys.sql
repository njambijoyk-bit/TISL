-- =====================================================================
-- 67_ai_provider_keys.sql
-- AI keys that are entered on the screen, for any company's model, and chosen per purpose — no more keys in the server's .env.
--   model        which model this key calls (empty = the provider's default)
--   base_url     optional: a different endpoint (Qwen in China, an OpenAI-compatible service, a proxy)
--   used_for     analytics | mimi | screening | all — what this key may be used for (all = every purpose)
--   priority     lowest is tried first; if a key fails (busy, over quota, bad key) the next one is tried
--   last_error / last_error_at   what went wrong the last time, shown on the screen
-- Providers: anthropic, openai, gemini, qwen. Existing keys become used_for = all. Several keys can be in use at once.
-- Run in Workbench. Safe to re-run. Columns only, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run; 6 once done) and the keys you have
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_provider_keys'
  AND column_name IN ('model', 'base_url', 'used_for', 'priority', 'last_error', 'last_error_at');
SELECT id, provider, label, is_active FROM ai_provider_keys;

-- PART B — ADD (DDL, commits on its own)
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

CALL add_column_if_missing('ai_provider_keys', 'model',         'VARCHAR(80) NULL');
CALL add_column_if_missing('ai_provider_keys', 'base_url',      'VARCHAR(200) NULL');
CALL add_column_if_missing('ai_provider_keys', 'used_for',         "VARCHAR(10) NOT NULL DEFAULT 'all'");
CALL add_column_if_missing('ai_provider_keys', 'priority',      'INT NOT NULL DEFAULT 100');
CALL add_column_if_missing('ai_provider_keys', 'last_error',    'VARCHAR(255) NULL');
CALL add_column_if_missing('ai_provider_keys', 'last_error_at', 'DATETIME NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — CHECK (expect 6 rows)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_provider_keys'
  AND column_name IN ('model', 'base_url', 'used_for', 'priority', 'last_error', 'last_error_at');
