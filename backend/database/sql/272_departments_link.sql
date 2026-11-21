-- =====================================================================
-- 272_departments_link.sql
-- HR stage 1b, departments (docs/HR_STAGE1B_SPEC.md):
--   department_leads   a department's head and assistants, each with a sensitivity (work | personal | full). One head per department; a department
--                      always has a lead with full sensitivity (the app keeps it so).
--   project_owners     who a project belongs to: its branch, or a branch and one of its departments, one row each; one owner is the lead (its
--                      branch is the project's branch, and the project's costs are filed under the lead's cost centre).
-- Moves: each department's manager_employee_id becomes its head (sensitivity work: raise it to full on the Departments page for someone holding
-- hr.sensitive); each existing project gets its branch as its lead owner.
-- Needs scripts 101 (departments). Projects (257) is optional: without it project_owners waits empty. Safe to re-run. Adds only.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (departments are there), then what exists of this script, then departments and their current head.
SELECT COUNT(*) AS departments_table FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'departments';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('department_leads', 'project_owners');
SELECT d.id, l.name AS branch, d.name AS department, d.manager_employee_id FROM departments d LEFT JOIN locations l ON l.id = d.location_id ORDER BY l.name, d.name;

-- PART B - CREATE
DROP PROCEDURE IF EXISTS departments_link_guard;
DELIMITER $$
CREATE PROCEDURE departments_link_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'departments') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Run script 101_departments.sql first. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL departments_link_guard();
DROP PROCEDURE IF EXISTS departments_link_guard;

CREATE TABLE IF NOT EXISTS department_leads (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    department_id  BIGINT UNSIGNED NOT NULL,
    employee_id    BIGINT UNSIGNED NOT NULL,
    role           VARCHAR(10) NOT NULL DEFAULT 'assistant',          -- head | assistant
    sensitivity    VARCHAR(10) NOT NULL DEFAULT 'work',               -- work | personal | full (full needs hr.sensitive)
    appointed_by   BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_department_leads_person (department_id, employee_id),
    KEY idx_department_leads_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_owners (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id     BIGINT UNSIGNED NOT NULL,
    location_id    BIGINT UNSIGNED NOT NULL,                          -- the branch: a project never belongs to a department without its branch
    department_id  BIGINT UNSIGNED NULL,                              -- empty = the whole branch; else a department of that branch
    is_lead        TINYINT(1) NOT NULL DEFAULT 0,                     -- the lead files the project's costs
    created_at     TIMESTAMP NULL,
    UNIQUE KEY uq_project_owners (project_id, location_id, department_id),
    KEY idx_project_owners_department (department_id),
    KEY idx_project_owners_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- each department's current manager becomes its head
INSERT IGNORE INTO department_leads (department_id, employee_id, role, sensitivity, created_at, updated_at)
    SELECT id, manager_employee_id, 'head', 'work', NOW(), NOW() FROM departments WHERE manager_employee_id IS NOT NULL;

-- each existing project: its branch is its lead owner (only when the projects table is there)
DROP PROCEDURE IF EXISTS departments_link_projects;
DELIMITER $$
CREATE PROCEDURE departments_link_projects()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'projects') THEN
        SET @s = CONCAT('INSERT IGNORE INTO project_owners (project_id, location_id, department_id, is_lead, created_at) ',
            'SELECT p.id, p.location_id, NULL, 1, NOW() FROM projects p WHERE p.location_id IS NOT NULL ',
            'AND NOT EXISTS (SELECT 1 FROM project_owners o WHERE o.project_id = p.id)');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL departments_link_projects();
DROP PROCEDURE IF EXISTS departments_link_projects;

-- PART C - CHECK. Expect 2 tables. Then the departments that still need a lead with full sensitivity: give each one on the Departments page.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('department_leads', 'project_owners');
SELECT d.id, l.name AS branch, d.name AS department FROM departments d LEFT JOIN locations l ON l.id = d.location_id
    WHERE d.is_active = 1 AND NOT EXISTS (SELECT 1 FROM department_leads x WHERE x.department_id = d.id AND x.sensitivity = 'full');
