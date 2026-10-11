-- =====================================================================
-- 128_step_up.sql
-- Security, phase 2 (docs/SECURITY_PLAN.md): asking for more proof only when an action is sensitive.
--   auth_pending_actions   one row per "are you sure it is you?" question: what is being asked (the facts the screen shows, from the server's own record), who asked, and how it was answered
-- The rules themselves (which actions, how strong, off / test / on) are in code and in security_settings (script 125).
-- Safe to re-run. Run each part on its own in Workbench. Run 124_passkeys.sql and 125_security_policy.sql first.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the table is absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'auth_pending_actions';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS auth_pending_actions (
    id                    CHAR(40) NOT NULL PRIMARY KEY,                 -- random; the browser hands it back on the retry
    user_id               BIGINT UNSIGNED NOT NULL,
    token_id              BIGINT UNSIGNED NOT NULL,                      -- the sign-in (session) that started it: no other session can use it
    rule                  VARCHAR(40) NOT NULL,                          -- payment_keys, access_change, ...
    params_hash           CHAR(64) NOT NULL,                             -- fingerprint of the exact request (method, route, every value): an approval for one action can not authorize another
    facts                 JSON NOT NULL,                                 -- what the screen shows: who, where, what, how much - from the server, never from the browser
    strength_needed       TINYINT UNSIGNED NOT NULL DEFAULT 2,
    reason_required       TINYINT(1) NOT NULL DEFAULT 0,
    needs_second_person   TINYINT(1) NOT NULL DEFAULT 0,                 -- recorded now; enforced when the Council of Two arrives
    reason                VARCHAR(300) NULL,                             -- why, in the person's own words (critical actions)
    approved_at           DATETIME NULL,
    approved_with         VARCHAR(10) NULL,                              -- passkey | password
    approved_credential_id BIGINT UNSIGNED NULL,
    covers_until          DATETIME NULL,                                 -- a short run of related actions may ride on one approval (rules that allow it)
    used_at               DATETIME NULL,                                 -- an approval works once (unless it covers a run)
    cancelled_at          DATETIME NULL,
    expires_at            DATETIME NOT NULL,
    created_at            TIMESTAMP NULL,
    updated_at            TIMESTAMP NULL,
    KEY idx_auth_pending_user (user_id, rule, approved_at),
    KEY idx_auth_pending_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - VERIFY (read-only)
SELECT COUNT(*) AS questions_asked FROM auth_pending_actions;
