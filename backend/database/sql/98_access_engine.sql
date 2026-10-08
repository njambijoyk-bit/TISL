-- =====================================================================
-- 98_access_engine.sql
-- The authorization engine: clearance levels, roles that hold permissions, module access, data scope,
-- approval limits, location scope and restrictions; several roles per person; time-limited grants.
--
--   clearance_levels      0 to 6, each with a name you can change
--   roles                 identity, the lowest clearance that may hold it, location scope (global / assigned / own),
--                         data scope, module it belongs to, restrictions, "acts as" (old role names it still satisfies)
--   permissions           what can be done (books.post, stock.adjust ...), declared per module
--   role_permissions      which permissions a role holds
--   role_modules          which modules a role may open ('*' = all)
--   role_approvals        what a role may approve and up to what amount (empty amount = no limit)
--   user_roles            the roles a person holds, optionally between two dates (the primary one mirrors users.role)
--   user_access_grants    extra branch (later cost centre / company) access, optionally between two dates
--   access_log            who changed whose roles or access, and what the engine refused in log-only mode
--   access_meta           which version of the built-in catalogue has been loaded
--   users.clearance_level a person's clearance (a ceiling: they can only hold roles at or below it)
--   users.default_location_id  a person's default branch (later it follows their employee record)
--   users.role            becomes a plain text column (it was a list of five fixed values) and stays as the primary role
--
-- THE ROLES AND PERMISSIONS ARE FILLED IN BY THE APP, not by this script.
-- After this script, run once from the backend folder:   php artisan access:seed
-- It loads the clearance levels, the built-in roles and permissions, gives every existing user their role and
-- clearance, and turns each existing branch assignment (location_user) into a permanent grant. It is safe to re-run.
-- Until it has run, the app keeps checking the old users.role column exactly as before.
-- Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. The type of users.role today (an enum needs widening; varchar is fine)
SELECT column_name, data_type, column_type, column_default
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name IN ('role', 'clearance_level', 'default_location_id');

-- A2. Which roles your users have today (every one of these becomes a role)
SELECT role, COUNT(*) AS users FROM users GROUP BY role ORDER BY users DESC;

-- A3. Tables of the engine already there? (expect 0 rows on the first run)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('clearance_levels', 'roles', 'permissions', 'role_permissions', 'role_modules', 'role_approvals',
                     'user_roles', 'user_access_grants', 'access_log', 'access_meta');

-- A4. Branch assignments that will become permanent grants
SELECT COUNT(*) AS location_user_rows FROM location_user;


-- ---------------------------------------------------------------------
-- PART B — CREATE (DDL, commits on its own; every step skips itself if already done)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clearance_levels (
    level TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(60) NOT NULL,
    name VARCHAR(100) NOT NULL,
    kind VARCHAR(10) NOT NULL DEFAULT 'staff',               -- staff | portal (customers, vendors, applicants: only their own things)
    min_clearance TINYINT UNSIGNED NOT NULL DEFAULT 1,       -- the lowest clearance level that may hold this role
    scope_type VARCHAR(10) NOT NULL DEFAULT 'assigned',      -- global | assigned | own  (which branches)
    data_scope VARCHAR(10) NOT NULL DEFAULT 'all',           -- all | assigned | own     (which records inside a branch)
    module_key VARCHAR(40) NULL,                             -- the module this role belongs to (shown only while it is on); empty = core
    acts_as JSON NULL,                                       -- old role names this role still satisfies in the existing route checks
    restrictions JSON NULL,                                  -- {"read_only":false,"hours":{"from":"08:00","to":"18:00","days":[1,2,3,4,5]},"ip_allow":["10.0.0.0/8"],"max_discount_percent":10}
    description VARCHAR(255) NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_roles_key (`key`),
    INDEX idx_roles_clearance (min_clearance)
);

CREATE TABLE IF NOT EXISTS permissions (
    `key` VARCHAR(80) NOT NULL PRIMARY KEY,
    module_key VARCHAR(40) NULL,
    group_name VARCHAR(60) NOT NULL DEFAULT 'General',
    label VARCHAR(150) NOT NULL,
    is_write TINYINT(1) NOT NULL DEFAULT 0,                  -- a write permission is refused to a read-only role
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_permissions_module (module_key)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id BIGINT UNSIGNED NOT NULL,
    permission_key VARCHAR(80) NOT NULL,
    PRIMARY KEY (role_id, permission_key),
    CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT fk_rp_permission FOREIGN KEY (permission_key) REFERENCES permissions (`key`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role_modules (
    role_id BIGINT UNSIGNED NOT NULL,
    module_key VARCHAR(40) NOT NULL,                         -- '*' = every module
    PRIMARY KEY (role_id, module_key),
    CONSTRAINT fk_rm_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role_approvals (
    role_id BIGINT UNSIGNED NOT NULL,
    approval_key VARCHAR(80) NOT NULL,                       -- e.g. journal.approve, purchase.approve, refund.approve, campaign.publish
    max_amount DECIMAL(16,2) NULL,                           -- in the base currency; empty = no limit
    PRIMARY KEY (role_id, approval_key),
    CONSTRAINT fk_ra_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    role_id BIGINT UNSIGNED NOT NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    starts_at DATETIME NULL,
    expires_at DATETIME NULL,
    assigned_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_user_roles (user_id, role_id),
    INDEX idx_user_roles_role (role_id),
    CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_access_grants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    resource_type VARCHAR(20) NOT NULL,                      -- location now; cost_centre and entity later
    resource_id BIGINT UNSIGNED NOT NULL,
    access VARCHAR(10) NOT NULL DEFAULT 'full',              -- full | view
    starts_at DATETIME NULL,
    expires_at DATETIME NULL,                                -- empty = for good
    granted_by BIGINT UNSIGNED NULL,
    reason VARCHAR(255) NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'active',            -- active | revoked
    revoked_by BIGINT UNSIGNED NULL,
    revoked_at DATETIME NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_grants_user (user_id, resource_type, status),
    INDEX idx_grants_resource (resource_type, resource_id),
    CONSTRAINT fk_grant_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS access_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    actor_id BIGINT UNSIGNED NULL,
    subject_user_id BIGINT UNSIGNED NULL,
    action VARCHAR(40) NOT NULL,                             -- role_assigned, role_removed, clearance_changed, grant_added, grant_revoked, role_saved, would_deny ...
    details JSON NULL,
    ip VARCHAR(45) NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_access_log_subject (subject_user_id, created_at),
    INDEX idx_access_log_action (action, created_at)
);

CREATE TABLE IF NOT EXISTS access_meta (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    catalog_version INT NOT NULL DEFAULT 0,
    seeded_at DATETIME NULL
);
INSERT IGNORE INTO access_meta (id, catalog_version, seeded_at) VALUES (1, 0, NULL);

-- columns on users, and the role column as plain text
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS widen_user_role;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$

CREATE PROCEDURE widen_user_role()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role' AND data_type = 'enum') THEN
        ALTER TABLE users MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'customer';
    END IF;
END$$
DELIMITER ;

CALL widen_user_role();
CALL add_column_if_missing('users', 'clearance_level',     'TINYINT UNSIGNED NOT NULL DEFAULT 0');
CALL add_column_if_missing('users', 'default_location_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS widen_user_role;


-- ---------------------------------------------------------------------
-- PART C — RESULT CHECK
-- ---------------------------------------------------------------------

-- C1. Ten tables (expect 10 rows)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('clearance_levels', 'roles', 'permissions', 'role_permissions', 'role_modules', 'role_approvals',
                     'user_roles', 'user_access_grants', 'access_log', 'access_meta')
ORDER BY table_name;

-- C2. users.role is text now, and the two new columns are there (expect 3 rows, role = varchar)
SELECT column_name, data_type, column_type
FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name IN ('role', 'clearance_level', 'default_location_id');

-- C3. Nothing is loaded yet. Now run:  php artisan access:seed
SELECT (SELECT COUNT(*) FROM roles) AS roles, (SELECT COUNT(*) FROM permissions) AS permissions, (SELECT COUNT(*) FROM user_roles) AS user_roles;
