-- =====================================================================
-- 264_projects_links_more.sql
-- Projects stage 7 (docs/PROJECTS_STAGE7_SPEC.md): linking modules.
--   project_links.role_key        what a linked record is to the work (a key from project_link_roles); empty = not said
--   project_link_roles            the company's list of link roles: Agreed value, Supplier, Deliverable, Related (renamed or added to in Configuration)
-- Removed links already stay in project_links with deleted_at (script 257); they can now be restored.
-- Needs script 257. Safe to re-run: the column is added only when missing, CREATE IF NOT EXISTS and INSERT IGNORE.
-- No permission seed is needed.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (the foundation is there), then what exists now (nothing on a first run).
SELECT COUNT(*) AS foundation_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_links';
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'project_links' AND column_name = 'role_key';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_link_roles';

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_links_guard;
DELIMITER $$
CREATE PROCEDURE projects_links_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_links') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Projects foundation is not here. Run script 257 first. Nothing was changed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'project_links' AND column_name = 'role_key') THEN
        SET @s = CONCAT('ALTER TABLE `project_links` ', 'ADD COLUMN `role_key` VARCHAR(30) NULL');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL projects_links_guard();
DROP PROCEDURE IF EXISTS projects_links_guard;

CREATE TABLE IF NOT EXISTS project_link_roles (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`        VARCHAR(30) NOT NULL,
    name         VARCHAR(60) NOT NULL,
    status_token VARCHAR(10) NULL,                                       -- info | good | warning | problem (a name, never a colour)
    sort_order   INT NOT NULL DEFAULT 0,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    UNIQUE KEY uq_project_link_roles_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- four to start with
INSERT IGNORE INTO project_link_roles (`key`, name, status_token, sort_order, created_at) VALUES ('agreed_value', 'Agreed value', 'good', 1, NOW()), ('supplier', 'Supplier', 'info', 2, NOW()), ('deliverable', 'Deliverable', 'warning', 3, NOW()), ('related', 'Related', NULL, 4, NOW());

-- PART C - CHECK (expect 1 and 1)
SELECT COUNT(*) AS role_column FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'project_links' AND column_name = 'role_key';
SELECT COUNT(*) AS roles_table FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_link_roles';
