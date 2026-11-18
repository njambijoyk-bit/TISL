-- =====================================================================
-- 262_notify_staff_and_replies.sql
-- Core notifications (docs/PROJECTS_STAGE6_SPEC.md, builds 6.4 and 6.5): two things every module can use.
--   notification_staff_prefs      a staff member's choice per group of notices: bell only, bell and email, bell and WhatsApp
--   notification_reply_routes     a reply address token: what it points at (module, kind, id), who it went to, by which channel
--   notification_inbound          every reply that came in (email or WhatsApp), and where it was filed, or that it waits
-- Nothing existing is changed. Until a person or the company sets a choice, staff hear exactly as today.
-- Safe to re-run: every table is CREATE IF NOT EXISTS.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect what exists now (nothing on a first run).
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('notification_staff_prefs', 'notification_reply_routes', 'notification_inbound');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS notification_staff_prefs (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL,
    grp        VARCHAR(30) NOT NULL,                                     -- a group of notice types (NotificationTypes::GROUPS)
    mode       VARCHAR(10) NOT NULL,                                     -- bell | email | whatsapp (the bell always)
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_notification_staff_prefs (user_id, grp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_reply_routes (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    token        VARCHAR(40) NOT NULL,                                   -- in the reply address: replies+TOKEN@domain
    module       VARCHAR(30) NOT NULL,                                   -- who files the reply: projects, tickets...
    subject_type VARCHAR(30) NOT NULL,                                   -- thread, ticket...
    subject_id   BIGINT UNSIGNED NOT NULL,
    contact      VARCHAR(190) NULL,                                      -- the address or number it was sent to
    contact_ref  VARCHAR(60) NULL,                                       -- the module's own reference for that person (a contact id)
    channel      VARCHAR(10) NOT NULL,                                   -- email | whatsapp
    created_at   TIMESTAMP NULL,
    UNIQUE KEY uq_notification_reply_routes_token (token),
    KEY idx_notification_reply_routes_contact (channel, contact)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_inbound (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    channel      VARCHAR(10) NOT NULL,                                   -- email | whatsapp
    external_id  VARCHAR(190) NULL,                                      -- the mail's Message-ID or the provider's message id (read once)
    from_address VARCHAR(190) NOT NULL,
    from_name    VARCHAR(190) NULL,
    subject      VARCHAR(250) NULL,
    body         TEXT NULL,
    received_at  TIMESTAMP NULL,
    route_id     BIGINT UNSIGNED NULL,
    state        VARCHAR(10) NOT NULL DEFAULT 'waiting',                 -- filed | waiting | discarded
    filed_module VARCHAR(30) NULL,
    filed_type   VARCHAR(30) NULL,
    filed_id     BIGINT UNSIGNED NULL,
    filed_by     BIGINT UNSIGNED NULL,
    filed_at     TIMESTAMP NULL,
    note         VARCHAR(200) NULL,
    UNIQUE KEY uq_notification_inbound_external (channel, external_id),
    KEY idx_notification_inbound_state (state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- PART C - CHECK (expect 3 tables)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('notification_staff_prefs', 'notification_reply_routes', 'notification_inbound');
