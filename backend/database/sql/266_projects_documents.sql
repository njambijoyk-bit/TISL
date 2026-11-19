-- =====================================================================
-- 266_projects_documents.sql
-- Projects stage 9 (docs/PROJECTS_STAGE9_SPEC.md): documents and portals.
--   project_folders               folders on a piece of work, and the Core vault folder that holds the work's files
--   project_files                 a file on a piece of work: its vault document, folder, team or shared, expiry, register line
--   project_doc_templates         document templates with fill-in fields
--   project_file_requests         asking for a file or a sign-off: from whom, by when, the file and version, the answer
--   project_register_kinds        register kinds (drawing register, document register, permit register...)
--   project_registers             a piece of work's registers
--   project_register_lines        their lines: number, title, revision, status, file
--   project_guest_links           links with an end date for someone outside
--   project_guest_visits          every opening of a guest link
-- A file's bytes, versions and audit stay in the Core vault (vault_folders, vault_documents); nothing here copies them.
-- Needs script 257. Safe to re-run: CREATE IF NOT EXISTS and INSERT IGNORE. No permission seed is needed.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 and 1 (the foundation and the vault are there), then what exists now (nothing on a first run).
SELECT COUNT(*) AS foundation_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members';
SELECT COUNT(*) AS vault_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'vault_documents';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_folders', 'project_files', 'project_doc_templates', 'project_file_requests', 'project_register_kinds', 'project_registers', 'project_register_lines', 'project_guest_links', 'project_guest_visits');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_documents_guard;
DELIMITER $$
CREATE PROCEDURE projects_documents_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Projects foundation is not here. Run script 257 first. Nothing was changed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'vault_documents') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The document vault is not here. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL projects_documents_guard();
DROP PROCEDURE IF EXISTS projects_documents_guard;

CREATE TABLE IF NOT EXISTS project_folders (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id      BIGINT UNSIGNED NOT NULL,
    parent_id       BIGINT UNSIGNED NULL,                                -- empty = at the top of the work
    name            VARCHAR(120) NOT NULL,
    deleted_at      TIMESTAMP NULL,
    created_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_project_folders_project (project_id, parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_files (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id        BIGINT UNSIGNED NOT NULL,
    folder_id         BIGINT UNSIGNED NULL,                              -- project_folders; empty = at the top
    vault_document_id BIGINT UNSIGNED NOT NULL,
    name              VARCHAR(200) NOT NULL,
    shared            TINYINT(1) NOT NULL DEFAULT 0,                     -- 1 = the client (portal) and guest links see it
    shared_by         BIGINT UNSIGNED NULL,
    shared_at         TIMESTAMP NULL,
    expires_on        DATE NULL,                                         -- a permit, an insurance certificate
    warned            VARCHAR(20) NULL,                                  -- which expiry warnings went (60,30,7,0)
    source            VARCHAR(12) NOT NULL DEFAULT 'upload',             -- upload | template | request | guest
    uploaded_by       BIGINT UNSIGNED NULL,
    deleted_at        TIMESTAMP NULL,
    deleted_by        BIGINT UNSIGNED NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_project_files_project (project_id, folder_id),
    KEY idx_project_files_expiry (expires_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_doc_templates (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    industry_key VARCHAR(30) NULL,                                       -- empty = every industry
    body        MEDIUMTEXT NOT NULL,                                     -- text with {{fields}}; plain text and simple formatting
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_file_requests (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT UNSIGNED NOT NULL,
    kind         VARCHAR(8) NOT NULL,                                    -- file | signoff
    what         VARCHAR(300) NOT NULL,
    user_id      BIGINT UNSIGNED NULL,                                   -- asked of a colleague, or
    contact_id   BIGINT UNSIGNED NULL,                                   -- a client or party contact, or
    guest_link_id BIGINT UNSIGNED NULL,                                  -- a guest link
    file_id      BIGINT UNSIGNED NULL,                                   -- signoff: the file; file: the file that came back
    version_number INT NULL,                                             -- signoff: the exact version
    folder_id    BIGINT UNSIGNED NULL,                                   -- file: where what comes back goes
    due_on       DATE NULL,
    token        VARCHAR(60) NULL,                                       -- an outsider's link to answer without signing in
    state        VARCHAR(10) NOT NULL DEFAULT 'open',                    -- open | done | declined | cancelled
    answer_name  VARCHAR(120) NULL,                                      -- signoff: the typed name
    answer_note  VARCHAR(1000) NULL,
    answer_ip    VARCHAR(45) NULL,
    answered_at  TIMESTAMP NULL,
    reminded_on  DATE NULL,
    asked_by     BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_project_file_requests_token (token),
    KEY idx_project_file_requests_project (project_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_register_kinds (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`       VARCHAR(30) NOT NULL,
    name        VARCHAR(80) NOT NULL,
    statuses    VARCHAR(300) NULL,                                       -- the line statuses, comma separated
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NULL,
    UNIQUE KEY uq_project_register_kinds_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_registers (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id  BIGINT UNSIGNED NOT NULL,
    kind_id     BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(120) NOT NULL,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    KEY idx_project_registers_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_register_lines (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    register_id BIGINT UNSIGNED NOT NULL,
    number      VARCHAR(40) NOT NULL,
    title       VARCHAR(200) NOT NULL,
    revision    VARCHAR(20) NULL,
    status      VARCHAR(40) NULL,
    file_id     BIGINT UNSIGNED NULL,
    updated_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_project_register_lines_register (register_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_guest_links (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id  BIGINT UNSIGNED NOT NULL,
    token       VARCHAR(60) NOT NULL,
    name        VARCHAR(120) NOT NULL,                                   -- who it is for
    email       VARCHAR(190) NULL,
    ends_on     DATE NOT NULL,
    ended_at    TIMESTAMP NULL,                                          -- ended early
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    UNIQUE KEY uq_project_guest_links_token (token),
    KEY idx_project_guest_links_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_guest_visits (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    link_id     BIGINT UNSIGNED NOT NULL,
    what        VARCHAR(30) NOT NULL,                                    -- opened | file | answered
    file_id     BIGINT UNSIGNED NULL,
    ip          VARCHAR(45) NULL,
    created_at  TIMESTAMP NULL,
    KEY idx_project_guest_visits_link (link_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- project roles: the Lead and Members keep the work's files (add, share, ask for sign-off)
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, 'files' FROM project_roles WHERE `key` IN ('lead', 'member');

-- register kinds to start with (changed or added to in Configuration)
INSERT IGNORE INTO project_register_kinds (`key`, name, statuses, created_at) VALUES
    ('drawings', 'Drawing register', 'For information,For comment,For construction,Superseded', NOW()),
    ('documents', 'Document register', 'Draft,Issued,Signed,Superseded', NOW()),
    ('permits', 'Permit register', 'Applied for,Granted,Expired,Refused', NOW());

-- PART C - CHECK (expect 9 tables)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_folders', 'project_files', 'project_doc_templates', 'project_file_requests', 'project_register_kinds', 'project_registers', 'project_register_lines', 'project_guest_links', 'project_guest_visits');
