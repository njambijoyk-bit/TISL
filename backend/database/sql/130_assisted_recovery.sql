-- =====================================================================
-- 130_assisted_recovery.sql
-- Security, phase 3 (docs/SECURITY_PLAN.md): assisted recovery for staff who have lost every passkey device and every recovery code.
-- The person asks; two other administrators who could reset a sign-in themselves approve (neither is the person); then a 24-hour cooling-off during which the person and the administrators are
-- told, and anyone of them can cancel; after that the person may start the recovery, which lets one sign-in add a new passkey for 15 minutes and nothing else.
--   auth_recovery_requests    one row per request: who asked, how it ended up
--   auth_recovery_approvals   one row per administrator who approved it, with how and why
-- Safe to re-run. Run each part on its own in Workbench. Run 124_passkeys.sql and 126_recovery_codes.sql first.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the tables are absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('auth_recovery_requests', 'auth_recovery_approvals');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS auth_recovery_requests (
    id               CHAR(40) NOT NULL PRIMARY KEY,
    user_id          BIGINT UNSIGNED NOT NULL,                       -- the person who is locked out
    kind             VARCHAR(12) NOT NULL DEFAULT 'self',            -- self: they asked | reset: an administrator reset their sign-in methods
    asked_by_id      BIGINT UNSIGNED NOT NULL,                       -- the person, or the administrator who started a reset
    note             VARCHAR(300) NULL,                              -- what they said: "my phone was stolen"
    ip               VARCHAR(45) NULL,
    user_agent       VARCHAR(255) NULL,
    needed           TINYINT UNSIGNED NOT NULL DEFAULT 2,            -- how many approvals it needs
    release_at       DATETIME NULL,                                  -- the cooling-off ends here (set by the last approval)
    declined_at      DATETIME NULL,
    declined_by_id   BIGINT UNSIGNED NULL,
    decline_note     VARCHAR(300) NULL,
    cancelled_at     DATETIME NULL,
    cancelled_by     VARCHAR(12) NULL,                               -- person | admin | link
    cancelled_by_id  BIGINT UNSIGNED NULL,
    used_at          DATETIME NULL,                                  -- the person started the recovery
    executed_at      DATETIME NULL,                                  -- a reset has been carried out
    expires_at       DATETIME NOT NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_auth_recovery_requests_user (user_id, used_at, cancelled_at),
    KEY idx_auth_recovery_requests_release (release_at, executed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_recovery_approvals (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    request_id      CHAR(40) NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,                        -- the administrator
    approved_with   VARCHAR(10) NOT NULL,                            -- passkey | password
    credential_id   BIGINT UNSIGNED NULL,
    note            VARCHAR(300) NULL,                               -- why they approved, in their own words
    ip              VARCHAR(45) NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_auth_recovery_approvals (request_id, user_id),     -- each administrator counts once
    KEY idx_auth_recovery_approvals_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK (expect: 2 tables)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('auth_recovery_requests', 'auth_recovery_approvals');
