-- =====================================================================
-- 100_cost_centres.sql
-- Cost centres, step 1 of docs/COST_CENTRES_AND_ENTITIES_PLAN.md. One set of books; a cost centre says what a cost or income belongs to.
--
-- cost_centres            nested to any depth: Branch A > Utilities, Stock, Payroll, Projects, its departments.
--                         `purpose` is a free label (stock, payroll, utilities...) the defaults can use. `type` is general | head_office | branch | other.
-- cost_centre_settings    the defaults, so no entry is ever without a cost centre:
--                           general, head_office                       the two built-in ones
--                           default_sales, default_purchases, default_expenses, default_payroll, default_stock
--                                                                      the cost centre used for that kind of document when nothing is chosen
--                           line_override                              1 = a line may take a different cost centre from its voucher
--                         (a default of 0 or a missing row means "the location's cost centre, else General")
-- locations.cost_centre_id  each branch's own cost centre, made here for every location (and by the app for new ones)
--
-- Nothing in the books changes yet: no voucher or entry carries a cost centre until step 3.
-- Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Already there? (expect 0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND ((table_name = 'locations' AND column_name = 'cost_centre_id') OR table_name IN ('cost_centres', 'cost_centre_settings'));

-- A2. The locations that will each get a cost centre
SELECT id, code, name, kind, is_active FROM locations ORDER BY sort_order, name;

-- A3. The access catalogue (needed for the permissions; run script 98 first if this is empty)
SELECT COUNT(*) AS roles FROM roles;


-- ---------------------------------------------------------------------
-- PART B — CREATE AND FILL
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cost_centres (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    parent_id BIGINT UNSIGNED NULL,
    location_id BIGINT UNSIGNED NULL,               -- the branch it belongs to (null for General, Head office and free-standing ones)
    name VARCHAR(120) NOT NULL,
    code VARCHAR(30) NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'other',      -- general | head_office | branch | other
    purpose VARCHAR(40) NULL,                       -- free label: stock, payroll, utilities, sales, project ...
    description VARCHAR(255) NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 0,        -- General, Head office and the branch ones: renamed but never deleted
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY cost_centres_code_unique (code),
    KEY cost_centres_parent_idx (parent_id),
    KEY cost_centres_location_idx (location_id)
);

CREATE TABLE IF NOT EXISTS cost_centre_settings (
    `key` VARCHAR(40) NOT NULL PRIMARY KEY,
    value VARCHAR(60) NOT NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
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

CALL add_column_if_missing('locations', 'cost_centre_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- the two built-in cost centres
INSERT INTO cost_centres (name, code, type, purpose, description, is_system, sort_order, created_at, updated_at)
SELECT 'General', 'GENERAL', 'general', 'general', 'Where anything lands when nothing more specific is chosen', 1, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM cost_centres WHERE code = 'GENERAL');

INSERT INTO cost_centres (name, code, type, purpose, description, is_system, sort_order, created_at, updated_at)
SELECT 'Head office', 'HEAD-OFFICE', 'head_office', 'shared', 'Costs shared by every branch', 1, 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM cost_centres WHERE code = 'HEAD-OFFICE');

-- one cost centre per location
INSERT INTO cost_centres (name, code, type, location_id, purpose, is_system, sort_order, created_at, updated_at)
SELECT l.name, CONCAT('BR-', UPPER(REPLACE(l.code, ' ', '-'))), 'branch', l.id, 'branch', 1, 10 + l.sort_order, NOW(), NOW()
FROM locations l
WHERE NOT EXISTS (SELECT 1 FROM cost_centres c WHERE c.location_id = l.id AND c.type = 'branch');

UPDATE locations l
JOIN cost_centres c ON c.location_id = l.id AND c.type = 'branch'
SET l.cost_centre_id = c.id
WHERE l.id > 0 AND l.cost_centre_id IS NULL;   -- (l.id > 0 keeps Workbench's safe update mode happy)

-- the defaults: every kind of document starts on General, so nothing is ever empty
INSERT INTO cost_centre_settings (`key`, value, created_at, updated_at)
SELECT k.name, (SELECT id FROM cost_centres WHERE code = k.code), NOW(), NOW()
FROM (SELECT 'general' AS name, 'GENERAL' AS code UNION ALL SELECT 'head_office', 'HEAD-OFFICE'
      UNION ALL SELECT 'default_sales', 'GENERAL' UNION ALL SELECT 'default_purchases', 'GENERAL' UNION ALL SELECT 'default_expenses', 'GENERAL'
      UNION ALL SELECT 'default_payroll', 'GENERAL' UNION ALL SELECT 'default_stock', 'GENERAL') k
WHERE NOT EXISTS (SELECT 1 FROM cost_centre_settings s WHERE s.`key` = k.name);

INSERT INTO cost_centre_settings (`key`, value, created_at, updated_at)
SELECT 'line_override', '1', NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM cost_centre_settings WHERE `key` = 'line_override');


-- ---------------------------------------------------------------------
-- PART C — CHECK THE RESULT
-- ---------------------------------------------------------------------

-- C1. General, Head office and one per location
SELECT id, code, name, type, location_id, parent_id FROM cost_centres ORDER BY sort_order, id;

-- C2. No location without a cost centre (expect 0)
SELECT COUNT(*) AS locations_without_cost_centre FROM locations WHERE cost_centre_id IS NULL;

-- C3. The defaults (expect 8 rows, every value filled)
SELECT s.`key`, s.value, c.name AS cost_centre FROM cost_centre_settings s LEFT JOIN cost_centres c ON c.id = s.value AND s.`key` <> 'line_override' ORDER BY s.`key`;
