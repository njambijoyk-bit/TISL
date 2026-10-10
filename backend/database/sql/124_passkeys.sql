-- =====================================================================
-- 124_passkeys.sql
-- Security, phase 1 (docs/SECURITY_PLAN.md): passkeys and devices.
--   auth_credentials   one row per passkey or security key a person has added (the "planks of the ship": nickname, when and how it was added, last use, replaced by, revoked)
--   auth_challenges    single-use questions the server asked a device to sign (sign in, add a passkey, confirm an action); each works once and runs out in 2 minutes
--   auth_sessions      gets: which passkey a sign-in used, how strong it was (0 password, 2 passkey with fingerprint/face/PIN), when strong proof last happened, and whether the session is restricted
-- Safe to re-run. Run each part on its own in Workbench. Run 123_security_core.sql first.
-- =====================================================================

-- PART A - READ-ONLY CHECK (what exists now; auth_credentials and auth_challenges are absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('auth_credentials', 'auth_challenges', 'auth_sessions');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'auth_sessions' AND column_name IN ('credential_id', 'strength', 'last_strong_at', 'restricted');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS auth_credentials (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id             BIGINT UNSIGNED NOT NULL,
    credential_hash     CHAR(64) NOT NULL,                              -- sha256 of the credential id: the id can be long, this is what is looked up
    credential_id       TEXT NOT NULL,                                  -- base64url
    public_key          TEXT NOT NULL,                                  -- base64 of the COSE public key
    user_handle         VARCHAR(100) NOT NULL,                          -- base64url; the same for all of one person's credentials
    name                VARCHAR(80) NOT NULL,                           -- "Amina's phone"
    kind                VARCHAR(20) NOT NULL DEFAULT 'passkey',         -- passkey (built into a phone or computer) | security_key (a USB / NFC key)
    transports          JSON NULL,
    aaguid              CHAR(36) NULL,
    attestation_type    VARCHAR(20) NULL,
    counter             BIGINT UNSIGNED NOT NULL DEFAULT 0,
    backup_eligible     TINYINT(1) NULL,                                -- may be copied to the person's Apple / Google account ("synced")
    backup_status       TINYINT(1) NULL,                                -- is, right now
    uv_initialized      TINYINT(1) NULL,
    added_method        VARCHAR(20) NOT NULL DEFAULT 'first',           -- first | approved | recovery | replacement
    added_by_id         BIGINT UNSIGNED NULL,                           -- the credential that approved this one
    replaced_by_id      BIGINT UNSIGNED NULL,                           -- the credential that took its place ("a new phone replaced the old one")
    last_used_at        DATETIME NULL,
    last_used_ip        VARCHAR(45) NULL,
    last_used_device    VARCHAR(120) NULL,
    disabled_at         DATETIME NULL,                                  -- switched off because it looks copied (its counter went backwards)
    disabled_reason     VARCHAR(40) NULL,
    revoked_at          DATETIME NULL,
    revoked_by_id       BIGINT UNSIGNED NULL,                           -- the person who removed it
    revoked_reason      VARCHAR(40) NULL,                               -- removed | replaced | lost | admin
    created_at          TIMESTAMP NULL,
    updated_at          TIMESTAMP NULL,
    UNIQUE KEY uq_auth_credentials_hash (credential_hash),
    KEY idx_auth_credentials_user (user_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_challenges (
    id              CHAR(40) NOT NULL PRIMARY KEY,                      -- random; the browser hands it back with its answer
    purpose         VARCHAR(20) NOT NULL,                               -- register | sign_in | step_up | recover
    user_id         BIGINT UNSIGNED NULL,                               -- null for a sign-in where the device says who it is
    challenge       CHAR(43) NOT NULL,                                  -- base64url of the 32 random bytes the device signs
    context_hash    CHAR(64) NULL,                                      -- step-up: sha256 of the action this question is about
    options         JSON NOT NULL,                                      -- what was asked, exactly
    ip              VARCHAR(45) NULL,
    expires_at      DATETIME NOT NULL,
    used_at         DATETIME NULL,
    created_at      TIMESTAMP NULL,
    KEY idx_auth_challenges_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - the new columns on auth_sessions (each skips itself if already there)
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

CALL add_column_if_missing('auth_sessions', 'credential_id', 'BIGINT UNSIGNED NULL AFTER method');
CALL add_column_if_missing('auth_sessions', 'strength', 'TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER credential_id');
CALL add_column_if_missing('auth_sessions', 'last_strong_at', 'DATETIME NULL AFTER strength');
CALL add_column_if_missing('auth_sessions', 'restricted', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER last_strong_at');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART D - CHECK (expect: 3 tables, 4 columns)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('auth_credentials', 'auth_challenges', 'auth_sessions');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'auth_sessions' AND column_name IN ('credential_id', 'strength', 'last_strong_at', 'restricted');
