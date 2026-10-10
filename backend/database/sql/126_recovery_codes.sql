-- =====================================================================
-- 126_recovery_codes.sql
-- Security, phase 1 (docs/SECURITY_PLAN.md): recovery codes - the first way back in for someone who has lost the device their passkey lives on.
--   auth_recovery_codes   ten single-use codes per person, shown once when made, kept only as a one-way fingerprint; a new set ends the old one
--   auth_sessions         gets recovery_at: when a recovery code was last used in that session (it lets the person add a new passkey for 15 minutes, and nothing else)
-- Safe to re-run. Run each part on its own in Workbench. Run 124_passkeys.sql first.
-- =====================================================================

-- PART A - READ-ONLY CHECK (what exists now; the table is absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'auth_recovery_codes';
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'auth_sessions' AND column_name = 'recovery_at';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS auth_recovery_codes (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    batch       CHAR(26) NOT NULL,                                  -- one set, made together
    code_hash   CHAR(64) NOT NULL,                                  -- keyed fingerprint of the code: the code itself is not kept anywhere
    used_at     DATETIME NULL,
    used_ip     VARCHAR(45) NULL,
    revoked_at  DATETIME NULL,                                      -- ended because a newer set was made
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_auth_recovery_codes_hash (code_hash),
    KEY idx_auth_recovery_codes_user (user_id, used_at, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - the new column on auth_sessions (skips itself if already there)
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE stmt FROM @s;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('auth_sessions', 'recovery_at', 'DATETIME NULL AFTER restricted');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART D - CHECK (expect: 1 table, 1 column)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'auth_recovery_codes';
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'auth_sessions' AND column_name = 'recovery_at';
