-- =====================================================================
-- 123_security_core.sql
-- Security, phase 0 (docs/SECURITY_PLAN.md): who is signed in where, and the one log of sign-in events.
--   auth_sessions     one row per signed-in browser (one login token): where from, what kind of browser, when last seen, whether it was ended
--   security_events   sign-in succeeded / failed / blocked, password changed or reset, sessions ended, ...
-- Safe to re-run: CREATE IF NOT EXISTS. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (which of the two exist now; none on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('auth_sessions', 'security_events');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS auth_sessions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    token_id        BIGINT UNSIGNED NOT NULL,                            -- personal_access_tokens.id
    tokenable_type  VARCHAR(120) NOT NULL,
    tokenable_id    BIGINT UNSIGNED NOT NULL,
    method          VARCHAR(20) NOT NULL DEFAULT 'password',             -- password | google | microsoft | register | reset (later: passkey, link)
    ip              VARCHAR(45) NULL,
    user_agent      VARCHAR(255) NULL,
    device_key      CHAR(40) NULL,                                       -- sha1 of "Chrome on Windows": a browser seen before, or not
    label           VARCHAR(120) NULL,                                   -- "Chrome on Windows"
    last_seen_at    DATETIME NULL,
    revoked_at      DATETIME NULL,
    revoked_reason  VARCHAR(40) NULL,                                    -- logout | password_changed | password_reset | signed_out_everywhere | revoked | admin | suspended
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_auth_sessions_token (token_id),
    KEY idx_auth_sessions_who (tokenable_type, tokenable_id),
    KEY idx_auth_sessions_device (tokenable_type, tokenable_id, device_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS security_events (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_type  VARCHAR(40) NULL,                                      -- user | applicant (null when the email matched nobody)
    subject_id    BIGINT UNSIGNED NULL,
    event         VARCHAR(40) NOT NULL,                                  -- login_ok | login_failed | login_blocked | new_device | password_changed | password_reset | sessions_ended | logout ...
    severity      VARCHAR(10) NOT NULL DEFAULT 'info',                   -- info | notice | warning | alert
    email_tried   VARCHAR(190) NULL,                                     -- what was typed at the sign-in screen
    ip            VARCHAR(45) NULL,
    user_agent    VARCHAR(255) NULL,
    detail        JSON NULL,
    created_at    TIMESTAMP NULL,
    KEY idx_security_events_subject (subject_type, subject_id, created_at),
    KEY idx_security_events_event (event, created_at),
    KEY idx_security_events_ip (ip, created_at),
    KEY idx_security_events_email (email_tried, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK (expect 2 rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('auth_sessions', 'security_events');
