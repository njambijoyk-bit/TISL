-- =====================================================================
-- 271_hr_foundation.sql
-- HR stage 1, the foundation (docs/HR_STAGE1_SPEC.md):
--   hr_employment_types        the company's employment types, replacing the free text (the ones already used are carried over)
--   hr_settings / _versions    HR configuration (numbering, required fields, people seeing their own pay details), every save a numbered version
--   employee_changes           every change to an employee record: field, tier, old and new (encrypted for pay and identity), who, when, why
--   employees (guarded)        the six bank and identity columns widened to hold encrypted text; employment_type_id
-- Then run once: php artisan hr:encrypt-fields   (encrypts the bank and identity numbers already there; safe to run again)
-- Run each part on its own in Workbench. Safe to re-run. Adds only.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect the employees table, then what exists of this script (nothing on a first run), then the employment types in use.
SELECT COUNT(*) AS employees_table FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'employees';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('hr_employment_types', 'hr_settings', 'hr_settings_versions', 'employee_changes');
SELECT employment_type, COUNT(*) AS people FROM employees GROUP BY employment_type;

-- PART B - CREATE
DROP PROCEDURE IF EXISTS hr_foundation_guard;
DELIMITER $$
CREATE PROCEDURE hr_foundation_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'employees') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'There is no employees table. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL hr_foundation_guard();
DROP PROCEDURE IF EXISTS hr_foundation_guard;

CREATE TABLE IF NOT EXISTS hr_employment_types (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`              VARCHAR(40) NOT NULL,
    name               VARCHAR(80) NOT NULL,
    paid_by_payroll    TINYINT(1) NOT NULL DEFAULT 1,                  -- paid through payroll by default
    is_active          TINYINT(1) NOT NULL DEFAULT 1,
    sort_order         INT NOT NULL DEFAULT 0,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    UNIQUE KEY uq_hr_employment_types_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hr_settings (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    part         VARCHAR(30) NOT NULL,                                 -- general
    value        JSON NOT NULL,
    version      INT NOT NULL DEFAULT 1,
    updated_by   BIGINT UNSIGNED NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_hr_settings_part (part)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS hr_settings_versions (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    part         VARCHAR(30) NOT NULL,
    version      INT NOT NULL,
    value        JSON NOT NULL,
    action       VARCHAR(12) NOT NULL DEFAULT 'saved',                 -- saved | rolled_back
    note         VARCHAR(200) NULL,
    by_user      BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    UNIQUE KEY uq_hr_settings_versions (part, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS employee_changes (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    employee_id   BIGINT UNSIGNED NOT NULL,
    employee_name VARCHAR(160) NULL,                                  -- kept so the history reads after the record is deleted for good
    field         VARCHAR(60) NULL,                                   -- null for a whole-record action (created, deleted, restored)
    tier          VARCHAR(10) NOT NULL DEFAULT 'work',                -- work | personal | sensitive
    old_value     TEXT NULL,                                          -- encrypted when the tier is sensitive
    new_value     TEXT NULL,
    action        VARCHAR(10) NOT NULL DEFAULT 'changed',             -- created | changed | status | shown | imported | bulk | deleted | restored | purged
    reason        VARCHAR(255) NULL,
    by_user       BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    KEY idx_employee_changes_employee (employee_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO hr_employment_types (`key`, name, paid_by_payroll, sort_order, created_at, updated_at) VALUES
    ('full_time', 'Permanent', 1, 10, NOW(), NOW()),
    ('contract', 'Contract', 1, 20, NOW(), NOW()),
    ('part_time', 'Casual / part time', 1, 30, NOW(), NOW()),
    ('intern', 'Intern', 1, 40, NOW(), NOW()),
    ('probation', 'Probation', 1, 50, NOW(), NOW());
-- the types already typed on records, so nobody loses theirs
INSERT IGNORE INTO hr_employment_types (`key`, name, paid_by_payroll, sort_order, created_at, updated_at)
    SELECT DISTINCT LOWER(REPLACE(TRIM(employment_type), ' ', '_')), TRIM(employment_type), 1, 100, NOW(), NOW() FROM employees WHERE employment_type IS NOT NULL AND TRIM(employment_type) <> '';

-- the employees table: widen the bank and identity columns for encrypted text, link the employment type
DROP PROCEDURE IF EXISTS hr_foundation_columns;
DELIMITER $$
CREATE PROCEDURE hr_foundation_columns()
BEGIN
    DECLARE col VARCHAR(64);
    DECLARE done INT DEFAULT 0;
    DECLARE cur CURSOR FOR SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'employees'
        AND column_name IN ('bank_account_number', 'bank_account_name', 'id_number', 'kra_pin', 'nssf_number', 'nhif_number') AND data_type <> 'text';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
    OPEN cur;
    widen: LOOP
        FETCH cur INTO col;
        IF done = 1 THEN LEAVE widen; END IF;
        SET @s = CONCAT('ALTER TABLE employees ', 'MODIFY COLUMN `', col, '` TEXT NULL');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END LOOP;
    CLOSE cur;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'employees' AND column_name = 'employment_type_id') THEN
        SET @s = CONCAT('ALTER TABLE employees ', 'ADD COLUMN employment_type_id BIGINT UNSIGNED NULL');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL hr_foundation_columns();
DROP PROCEDURE IF EXISTS hr_foundation_columns;
UPDATE employees e JOIN hr_employment_types t ON t.`key` = LOWER(REPLACE(TRIM(e.employment_type), ' ', '_')) SET e.employment_type_id = t.id WHERE e.employment_type_id IS NULL;

-- PART C - CHECK. Expect 4 tables, the six columns as text, and every employee with a type linked (0 without, unless their type is empty).
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('hr_employment_types', 'hr_settings', 'hr_settings_versions', 'employee_changes');
SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'employees' AND column_name IN ('bank_account_number', 'bank_account_name', 'id_number', 'kra_pin', 'nssf_number', 'nhif_number', 'employment_type_id');
SELECT COUNT(*) AS employees_without_a_type FROM employees WHERE employment_type_id IS NULL AND employment_type IS NOT NULL AND TRIM(employment_type) <> '';
