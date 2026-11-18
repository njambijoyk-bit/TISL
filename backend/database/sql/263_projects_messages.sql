-- =====================================================================
-- 263_projects_messages.sql
-- Projects stage 6 (docs/PROJECTS_STAGE6_SPEC.md): messages, meetings, working together.
--   project_threads               a conversation on a piece of work: subject, audience (team | client | others), owner, open or closed
--   project_thread_people         the contacts in a client or others conversation
--   project_thread_messages              messages: from a person or a contact, how it came (app, email, WhatsApp), edited, removed, what was sent
--   project_message_mentions      who a message mentions
--   project_message_reads         how far each person has read each conversation
--   project_tags                  the company's tags for conversations
--   project_thread_tags           which conversations carry which tags
--   project_follows               who follows which piece of work, conversation or task
--   project_meetings              meetings: when, where, link, agenda, audience, organiser, state, minutes
--   project_meeting_people        attendees (people and contacts), their answers, and an outside person's answer link
--   project_meeting_actions       action items from the minutes, and the tasks they became
-- Messages leave through the Core Notifier; this script holds no addresses of its own beyond what was sent where.
-- Needs script 257 (and 259 for contacts and parties). Safe to re-run: CREATE IF NOT EXISTS and INSERT IGNORE.
-- No permission seed is needed: the permissions came with script 257.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (the foundation is there), then what exists now (nothing on a first run).
SELECT COUNT(*) AS foundation_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_threads', 'project_thread_people', 'project_thread_messages', 'project_message_mentions', 'project_message_reads', 'project_tags', 'project_thread_tags', 'project_follows', 'project_meetings', 'project_meeting_people', 'project_meeting_actions');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_messages_guard;
DELIMITER $$
CREATE PROCEDURE projects_messages_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Projects foundation is not here. Run script 257 first. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL projects_messages_guard();
DROP PROCEDURE IF EXISTS projects_messages_guard;

CREATE TABLE IF NOT EXISTS project_threads (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id      BIGINT UNSIGNED NOT NULL,
    subject         VARCHAR(200) NOT NULL,
    audience        VARCHAR(8) NOT NULL DEFAULT 'team',                  -- team | client | others
    owner_id        BIGINT UNSIGNED NULL,                                -- who answers it
    state           VARCHAR(8) NOT NULL DEFAULT 'open',                  -- open | closed
    last_message_at TIMESTAMP NULL,
    created_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_project_threads_project (project_id),
    KEY idx_project_threads_last (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_thread_people (
    thread_id  BIGINT UNSIGNED NOT NULL,
    contact_id BIGINT UNSIGNED NOT NULL,                                 -- project_contacts (stage 3)
    added_by   BIGINT UNSIGNED NULL,
    added_at   TIMESTAMP NULL,
    PRIMARY KEY (thread_id, contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_thread_messages (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    thread_id      BIGINT UNSIGNED NOT NULL,
    user_id        BIGINT UNSIGNED NULL,                                 -- from a person, or
    contact_id     BIGINT UNSIGNED NULL,                                 -- from a contact (a reply that came in)
    body           TEXT NOT NULL,
    via            VARCHAR(10) NOT NULL DEFAULT 'app',                   -- app | email | whatsapp
    sent_to        TEXT NULL,                                            -- who it went to and by which channels, as JSON
    task_id        BIGINT UNSIGNED NULL,                                 -- the task it became (/task)
    edited_at      TIMESTAMP NULL,
    removed_at     TIMESTAMP NULL,
    removed_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    KEY idx_project_thread_messages_thread (thread_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_message_mentions (
    message_id BIGINT UNSIGNED NOT NULL,
    user_id    BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (message_id, user_id),
    KEY idx_project_message_mentions_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_message_reads (
    thread_id       BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,
    last_message_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    read_at         TIMESTAMP NULL,
    PRIMARY KEY (thread_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_tags (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`        VARCHAR(40) NOT NULL,                                   -- what is typed after #
    name         VARCHAR(60) NOT NULL,
    status_token VARCHAR(10) NULL,                                       -- info | good | warning | problem (a name, never a colour)
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    UNIQUE KEY uq_project_tags_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_thread_tags (
    thread_id BIGINT UNSIGNED NOT NULL,
    tag_id    BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (thread_id, tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_follows (
    user_id      BIGINT UNSIGNED NOT NULL,
    subject_type VARCHAR(10) NOT NULL,                                   -- project | thread | task
    subject_id   BIGINT UNSIGNED NOT NULL,
    muted        TINYINT(1) NOT NULL DEFAULT 0,                          -- 1 = stopped following something they would follow on their own
    created_at   TIMESTAMP NULL,
    PRIMARY KEY (user_id, subject_type, subject_id),
    KEY idx_project_follows_subject (subject_type, subject_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_meetings (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id        BIGINT UNSIGNED NOT NULL,
    title             VARCHAR(200) NOT NULL,
    starts_at         DATETIME NOT NULL,
    ends_at           DATETIME NOT NULL,
    location          VARCHAR(200) NULL,
    online_link       VARCHAR(300) NULL,
    agenda            TEXT NULL,
    audience          VARCHAR(8) NOT NULL DEFAULT 'team',                -- team | client | others
    organiser_id      BIGINT UNSIGNED NULL,
    state             VARCHAR(10) NOT NULL DEFAULT 'planned',            -- planned | held | cancelled
    minutes           TEXT NULL,
    minutes_shared_at TIMESTAMP NULL,
    thread_id         BIGINT UNSIGNED NULL,                              -- the conversation it was started from (/meet)
    created_by        BIGINT UNSIGNED NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_project_meetings_project (project_id),
    KEY idx_project_meetings_when (starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_meeting_people (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    meeting_id  BIGINT UNSIGNED NOT NULL,
    user_id     BIGINT UNSIGNED NULL,                                    -- a person, or
    contact_id  BIGINT UNSIGNED NULL,                                    -- a contact
    response    VARCHAR(8) NOT NULL DEFAULT 'pending',                   -- pending | yes | no | maybe
    answer_token VARCHAR(40) NULL,                                       -- an outside contact's link to answer without signing in
    answered_at TIMESTAMP NULL,
    KEY idx_project_meeting_people_meeting (meeting_id),
    UNIQUE KEY uq_project_meeting_people_token (answer_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_meeting_actions (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    meeting_id BIGINT UNSIGNED NOT NULL,
    text       VARCHAR(300) NOT NULL,
    user_id    BIGINT UNSIGNED NULL,                                     -- a person, or
    contact_id BIGINT UNSIGNED NULL,                                     -- the client's person
    due_date   DATE NULL,
    task_id    BIGINT UNSIGNED NULL,                                     -- the task it became
    sort_order INT NOT NULL DEFAULT 0,
    KEY idx_project_meeting_actions_meeting (meeting_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- project roles: the Lead and Members write in the work's conversations and plan its meetings
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, a.ability FROM project_roles JOIN (SELECT 'talk' AS ability UNION ALL SELECT 'meet' AS ability) a WHERE `key` IN ('lead', 'member');

-- a few tags to start with (renamed, switched off or added to in Configuration)
INSERT IGNORE INTO project_tags (`key`, name, status_token, created_at) VALUES ('urgent', 'Urgent', 'problem', NOW()), ('waiting', 'Waiting on them', 'warning', NOW()), ('decision', 'Needs a decision', 'info', NOW()), ('done', 'Sorted', 'good', NOW());

-- PART C - CHECK (expect 11 tables)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_threads', 'project_thread_people', 'project_thread_messages', 'project_message_mentions', 'project_message_reads', 'project_tags', 'project_thread_tags', 'project_follows', 'project_meetings', 'project_meeting_people', 'project_meeting_actions');
