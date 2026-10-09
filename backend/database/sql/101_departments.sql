-- =====================================================================
-- 101_departments.sql
-- Cost centres, step 2: departments, and an employee's branch, department and cost centre shares. Run script 100 first.
--
-- departments               one row per branch: Sales at Branch A and Sales at Branch B are two rows. Each has its own cost centre,
--                           made under that branch's cost centre.
-- standard_departments      a ready list of names that can be added to a branch in one click (edit it in the app)
-- employees.location_id     the branch the person works at
-- employees.department_id   their department there
-- employee_cost_centres     which cost centres their pay is split across: kind home | project | other, share_percent, valid_from / valid_to.
--                           Shares in force on any date must total 100 (the app checks it).
--
-- The old text columns (employees.department, employees.work_location, users.department) are kept and stay in step.
-- Part B matches your existing text into branches and departments. READ PART A FIRST: it shows exactly what Part B will do.
-- Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Already there? (expect 0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND ((table_name = 'employees' AND column_name IN ('location_id', 'department_id')) OR table_name IN ('departments', 'employee_cost_centres', 'standard_departments'));

-- A2. Script 100 is there (expect 1 row, and cost centres on every location: 0 locations without one)
SELECT COUNT(*) AS cost_centres FROM cost_centres;
SELECT COUNT(*) AS locations_without_cost_centre FROM locations WHERE cost_centre_id IS NULL;

-- A3. THE REVIEW: what your employees' text says today, and which branch it will be matched to.
--     A work location text that equals a branch's name or code (ignoring capitals) goes to that branch; anything else, or empty, goes to your default branch.
--     Every distinct department text becomes a department at the matched branch.
SELECT COALESCE(NULLIF(TRIM(e.work_location), ''), '(empty)') AS work_location_text,
       COALESCE(NULLIF(TRIM(e.department), ''), '(empty)')    AS department_text,
       COALESCE(
           (SELECT l.name FROM locations l WHERE LOWER(l.name) = LOWER(TRIM(e.work_location)) OR LOWER(l.code) = LOWER(TRIM(e.work_location)) LIMIT 1),
           (SELECT l.name FROM locations l WHERE l.is_default = 1 LIMIT 1),
           (SELECT l.name FROM locations l ORDER BY l.sort_order, l.id LIMIT 1)
       ) AS will_become_branch,
       COUNT(*) AS employees
FROM employees e
WHERE e.deleted_at IS NULL
GROUP BY work_location_text, department_text, will_become_branch
ORDER BY will_become_branch, department_text;

-- A4. Your branches
SELECT id, code, name, is_default, cost_centre_id FROM locations ORDER BY sort_order, name;


-- ---------------------------------------------------------------------
-- PART B — CREATE, THEN MATCH (each step skips itself if already done)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS departments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    location_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    code VARCHAR(30) NULL,
    cost_centre_id BIGINT UNSIGNED NULL,
    manager_employee_id BIGINT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY departments_location_name_unique (location_id, name),
    KEY departments_cost_centre_idx (cost_centre_id)
);

CREATE TABLE IF NOT EXISTS standard_departments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY standard_departments_name_unique (name)
);

INSERT INTO standard_departments (name, sort_order, created_at, updated_at)
SELECT n.name, n.o, NOW(), NOW()
FROM (SELECT 'Sales' AS name, 1 AS o UNION ALL SELECT 'Procurement', 2 UNION ALL SELECT 'Finance', 3 UNION ALL SELECT 'Human Resources', 4
      UNION ALL SELECT 'Operations', 5 UNION ALL SELECT 'Logistics', 6 UNION ALL SELECT 'Customer Service', 7 UNION ALL SELECT 'IT', 8
      UNION ALL SELECT 'Marketing', 9 UNION ALL SELECT 'Administration', 10 UNION ALL SELECT 'Production', 11 UNION ALL SELECT 'Stores', 12) n
WHERE NOT EXISTS (SELECT 1 FROM standard_departments s WHERE s.name = n.name);

-- The rest of the database compares text in utf8mb4_unicode_ci; make these tables match (safe to repeat).
ALTER TABLE departments CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE standard_departments CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_cost_centres (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    employee_id BIGINT UNSIGNED NOT NULL,
    cost_centre_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(20) NOT NULL DEFAULT 'home',          -- home | project | other
    share_percent DECIMAL(5,2) NOT NULL DEFAULT 100,
    valid_from DATE NULL,
    valid_to DATE NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY employee_cost_centres_employee_idx (employee_id),
    KEY employee_cost_centres_cc_idx (cost_centre_id)
);

DROP PROCEDURE IF EXISTS add_column_if_missing;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('employees', 'location_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('employees', 'department_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- 1. the branch each employee works at (the branch whose name or code matches the old text, else the default branch)
UPDATE employees e
SET e.location_id = COALESCE(
    (SELECT l.id FROM locations l WHERE LOWER(l.name) = LOWER(TRIM(e.work_location)) OR LOWER(l.code) = LOWER(TRIM(e.work_location)) LIMIT 1),
    (SELECT l.id FROM locations l WHERE l.is_default = 1 LIMIT 1),
    (SELECT l.id FROM locations l ORDER BY l.sort_order, l.id LIMIT 1))
WHERE e.id > 0 AND e.location_id IS NULL;

-- 2. a department for every distinct department text at the branch it was matched to
INSERT INTO departments (location_id, name, is_active, created_at, updated_at)
SELECT DISTINCT e.location_id, TRIM(e.department), 1, NOW(), NOW()
FROM employees e
WHERE e.location_id IS NOT NULL AND TRIM(COALESCE(e.department, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM departments d WHERE d.location_id = e.location_id AND d.name = TRIM(e.department) COLLATE utf8mb4_unicode_ci);

-- 3. each department gets its own cost centre, under its branch's cost centre
INSERT INTO cost_centres (parent_id, location_id, name, code, type, purpose, is_system, is_active, sort_order, created_at, updated_at)
SELECT l.cost_centre_id, d.location_id, d.name, CONCAT('DEP-', d.id), 'other', 'department', 0, 1, 100, NOW(), NOW()
FROM departments d JOIN locations l ON l.id = d.location_id
WHERE d.cost_centre_id IS NULL AND l.cost_centre_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM cost_centres c WHERE c.code = CONCAT('DEP-', d.id) COLLATE utf8mb4_unicode_ci);

UPDATE departments d JOIN cost_centres c ON c.code = CONCAT('DEP-', d.id) COLLATE utf8mb4_unicode_ci SET d.cost_centre_id = c.id WHERE d.id > 0 AND d.cost_centre_id IS NULL;

-- 4. each employee's department
UPDATE employees e
JOIN departments d ON d.location_id = e.location_id AND d.name = TRIM(e.department) COLLATE utf8mb4_unicode_ci
SET e.department_id = d.id
WHERE e.id > 0 AND e.department_id IS NULL;

-- 5. everyone's home cost centre: their department's, 100%
INSERT INTO employee_cost_centres (employee_id, cost_centre_id, kind, share_percent, created_at, updated_at)
SELECT e.id, d.cost_centre_id, 'home', 100, NOW(), NOW()
FROM employees e JOIN departments d ON d.id = e.department_id
WHERE d.cost_centre_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM employee_cost_centres x WHERE x.employee_id = e.id);


-- ---------------------------------------------------------------------
-- PART C — CHECK THE RESULT
-- ---------------------------------------------------------------------

-- C1. Departments per branch, with their cost centres and head count
SELECT l.name AS branch, d.name AS department, c.code AS cost_centre_code,
       (SELECT COUNT(*) FROM employees e WHERE e.department_id = d.id) AS employees
FROM departments d JOIN locations l ON l.id = d.location_id LEFT JOIN cost_centres c ON c.id = d.cost_centre_id
ORDER BY l.name, d.name;

-- C2. Employees still without a branch or department (expect 0, unless their department text was empty)
SELECT COUNT(*) AS without_branch FROM employees WHERE deleted_at IS NULL AND location_id IS NULL;
SELECT COUNT(*) AS without_department FROM employees WHERE deleted_at IS NULL AND department_id IS NULL;

-- C3. Departments without a cost centre (expect 0)
SELECT COUNT(*) AS departments_without_cost_centre FROM departments WHERE cost_centre_id IS NULL;
