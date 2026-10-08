-- =====================================================================
-- 100_legal_entities.sql
-- Legal entities, groundwork. A legal entity is a company with its own books (later steps give each its own chart, base currency,
-- period lock, numbering and bank accounts). This script only creates the table, makes ONE default entity from today's company
-- profile and base currency, and ties every location to it. Nothing about how the system behaves changes.
--
-- locations.legal_entity_id   which company a branch belongs to (filled for every existing location)
-- A second entity is added later from the company switcher; the switcher stays hidden while there is one.
-- Run in Workbench. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Is the table / column already there? (expect 0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND ((table_name = 'locations' AND column_name = 'legal_entity_id') OR table_name = 'legal_entities');

-- A2. What the default entity will be made from
SELECT name, short_code, legal_name, country, tax_pin FROM company_profile LIMIT 1;
SELECT id, code, name FROM currencies WHERE is_base = 1;

-- A3. Your locations
SELECT id, code, name, is_active, is_default FROM locations ORDER BY sort_order, name;


-- ---------------------------------------------------------------------
-- PART B — CREATE AND FILL
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS legal_entities (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,                    -- trading name
    short_code VARCHAR(12) NOT NULL,
    legal_name VARCHAR(200) NULL,
    country VARCHAR(80) NULL,
    tax_pin VARCHAR(40) NULL,
    base_currency_id BIGINT UNSIGNED NULL,         -- the currency its books are kept in
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY legal_entities_short_code_unique (short_code)
);

-- the one default entity, from the company profile and the current base currency (skipped if an entity exists)
INSERT INTO legal_entities (name, short_code, legal_name, country, tax_pin, base_currency_id, is_default, is_active, sort_order, created_at, updated_at)
SELECT COALESCE(NULLIF(cp.name, ''), 'My company'), COALESCE(NULLIF(cp.short_code, ''), 'CO'), cp.legal_name, cp.country, cp.tax_pin,
       (SELECT id FROM currencies WHERE is_base = 1 LIMIT 1), 1, 1, 0, NOW(), NOW()
FROM (SELECT 1) one
LEFT JOIN company_profile cp ON 1 = 1
WHERE NOT EXISTS (SELECT 1 FROM legal_entities)
LIMIT 1;

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

CALL add_column_if_missing('locations', 'legal_entity_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- every location that has no entity yet belongs to the default one
UPDATE locations SET legal_entity_id = (SELECT id FROM legal_entities WHERE is_default = 1 LIMIT 1) WHERE legal_entity_id IS NULL;


-- ---------------------------------------------------------------------
-- PART C — CHECK THE RESULT
-- ---------------------------------------------------------------------

-- C1. One default entity (expect 1 row)
SELECT e.id, e.short_code, e.name, e.legal_name, e.country, c.code AS base_currency FROM legal_entities e LEFT JOIN currencies c ON c.id = e.base_currency_id;

-- C2. No location without an entity (expect 0)
SELECT COUNT(*) AS locations_without_entity FROM locations WHERE legal_entity_id IS NULL;
