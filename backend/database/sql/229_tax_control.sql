-- =====================================================================
-- 229_tax_control.sql
-- Tax control, step T2 (docs/TAX_CONTROL_PLAN.md): the new columns and tables, and the conversion of what exists. Nothing on screen or in any posting
-- changes when this runs: the old columns stay where they are and keep being read until step T6.
--
--   ledger_groups (tax types)  tax_category, application_method, jurisdiction_id, input_ledger_id, cost_ledger_id
--                              tax_category   what kind of tax it is (replaces `kind`):  vat_gst, sales_tax, withholding_income, withholding_vat, income_tax,
--                                             payroll, excise, customs, property, capital_gains, turnover, stamp_duty, environmental, transaction_levy, other
--                              application_method  how it is applied (replaces `application_mode`):  added, included, withheld, reverse_charge, direct_liability
--                              jurisdiction_id  a tax district (area) it belongs to; empty means the company's whole country
--                              input_ledger_id  where recoverable input tax goes (reverse charge, and tax kept apart from output)
--                              cost_ledger_id   where non-recoverable tax goes (an expense, or the cost of stock)
--   ledgers (tax rates)        secondary_rate_value (the second part of a combined, higher-of or lower-of rate), tax_point
--   tax_rules                  exemption_behaviour (respect_exemptions, exclude_exempt_supplies, apply_independently), applies_to_all ("apply regardless")
--   voucher_item_taxes         calc_snapshot (the rate, base, exemption reason and amount as they were when the line was posted)
--   ledger_taxes (new)         the taxes a sales or purchase account carries, one row per tax: applies, zero_rated, exempt or out_of_scope
--   tax_control_settings (new) the Tax control tab's settings;  tax_control_log (new)  every change to them
--
-- Existing tax types: `kind` becomes tax_category and `application_mode` becomes application_method (additive -> added, withheld -> withheld).
-- Existing sales and purchase accounts: their one rate and their tax nature become rows of ledger_taxes. An account that is exempt, zero-rated, out of
-- scope or taxable with NO rate of its own is given to the company's one VAT type; if there is not exactly one, it is listed in PART C instead.
-- Safe to run twice: nothing already set is overwritten. Run each part on its own in Workbench.
-- Collation: the new tables use utf8mb4_unicode_ci and every text comparison against an existing column says so (as in 227 and 228).
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. What is already there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('ledger_taxes', 'tax_control_settings', 'tax_control_log')
UNION ALL SELECT CONCAT(table_name, '.', column_name) FROM information_schema.columns WHERE table_schema = DATABASE() AND (
      (table_name = 'ledger_groups' AND column_name IN ('tax_category', 'application_method', 'jurisdiction_id', 'input_ledger_id', 'cost_ledger_id'))
   OR (table_name = 'ledgers' AND column_name IN ('secondary_rate_value', 'tax_point'))
   OR (table_name = 'tax_rules' AND column_name IN ('exemption_behaviour', 'applies_to_all'))
   OR (table_name = 'voucher_item_taxes' AND column_name = 'calc_snapshot'));

-- A2. What this script builds on. Expect 14 rows with the types shown: rate_type must be varchar (an enum would refuse the new rate types).
SELECT table_name, column_name, column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND (
      (table_name = 'ledger_groups' AND column_name IN ('kind', 'application_mode', 'behaviour', 'code', 'is_active', 'control_ledger_id', 'payable_ledger_id', 'receivable_ledger_id'))
   OR (table_name = 'ledgers' AND column_name IN ('rate_type', 'tax_nature', 'tax_rate_ledger_id'))
   OR (table_name = 'tax_rules' AND column_name = 'tax_type_id')
   OR (table_name = 'voucher_item_taxes' AND column_name = 'ledger_id'))
ORDER BY table_name, column_name;

-- A3. The tax types today (each will get a category and a method)
SELECT g.id, g.name, g.kind, g.application_mode, g.is_active, (SELECT COUNT(*) FROM ledgers r WHERE r.group_id = g.id AND r.rate_type IS NOT NULL) AS rates
FROM ledger_groups g WHERE g.behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND g.application_mode IS NOT NULL ORDER BY g.name;

-- A4. Kinds and modes this script does not know (expect 0 rows; they get the category "other" and a method only if the mode is additive or withheld)
SELECT g.id, g.name, g.kind, g.application_mode FROM ledger_groups g
WHERE g.behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND g.application_mode IS NOT NULL
  AND (g.kind IS NULL OR g.kind COLLATE utf8mb4_unicode_ci NOT IN ('vat', 'excise', 'customs', 'withholding_income', 'withholding_vat', 'other')
       OR g.application_mode COLLATE utf8mb4_unicode_ci NOT IN ('additive', 'withheld'));

-- A5. The reserved group (expect exactly 1)
SELECT id, name FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Duties & Taxes';

-- A6. The accounts that carry a tax today (each becomes a row of ledger_taxes)
SELECT COALESCE(l.tax_nature, '(none)') AS tax_nature, l.tax_rate_ledger_id IS NOT NULL AS has_rate, COUNT(*) AS accounts
FROM ledgers l WHERE l.tax_nature IS NOT NULL OR l.tax_rate_ledger_id IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2;

-- A7. How many VAT types there are (the accounts with a nature but no rate go to the one VAT type; expect 1)
SELECT COUNT(*) AS vat_types FROM ledger_groups WHERE behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND kind COLLATE utf8mb4_unicode_ci = 'vat'
  AND application_mode COLLATE utf8mb4_unicode_ci = 'additive' AND is_active = 1;

-- PART B - CHANGE. Run B1 to B6 one after the other.

-- B1. The new columns
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = tbl)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('ledger_groups', 'tax_category', 'VARCHAR(40) NULL');
CALL add_column_if_missing('ledger_groups', 'application_method', 'VARCHAR(20) NULL');
CALL add_column_if_missing('ledger_groups', 'jurisdiction_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('ledger_groups', 'input_ledger_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('ledger_groups', 'cost_ledger_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('ledgers', 'secondary_rate_value', 'DECIMAL(18,6) NULL');
CALL add_column_if_missing('ledgers', 'tax_point', 'VARCHAR(20) NULL');
CALL add_column_if_missing('tax_rules', 'exemption_behaviour', "VARCHAR(30) NOT NULL DEFAULT 'respect_exemptions'");
CALL add_column_if_missing('tax_rules', 'applies_to_all', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL add_column_if_missing('voucher_item_taxes', 'calc_snapshot', 'JSON NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- B2. The new tables
CREATE TABLE IF NOT EXISTS ledger_taxes (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ledger_id    BIGINT UNSIGNED NOT NULL,
    tax_type_id  BIGINT UNSIGNED NOT NULL,
    tax_rate_id  BIGINT UNSIGNED NULL,
    treatment    VARCHAR(20) NOT NULL DEFAULT 'applies',
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_ledger_tax (ledger_id, tax_type_id),
    KEY idx_ledger_taxes_type (tax_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tax_control_settings (
    setting_key  VARCHAR(80) NOT NULL PRIMARY KEY,
    value        JSON NOT NULL,
    updated_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tax_control_log (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    setting_key      VARCHAR(80) NOT NULL,
    old_value        JSON NULL,
    new_value        JSON NOT NULL,
    changed_by       BIGINT UNSIGNED NULL,
    changed_by_name  VARCHAR(120) NULL,
    created_at       TIMESTAMP NULL,
    KEY idx_tax_control_log_key (setting_key, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- B3. Tax types: the category and the method, from the kind and the mode (a value already set is never changed)
UPDATE ledger_groups g
SET g.tax_category = CASE g.kind COLLATE utf8mb4_unicode_ci
        WHEN 'vat' THEN 'vat_gst' WHEN 'excise' THEN 'excise' WHEN 'customs' THEN 'customs'
        WHEN 'withholding_income' THEN 'withholding_income' WHEN 'withholding_vat' THEN 'withholding_vat' ELSE 'other' END
WHERE g.id > 0 AND g.behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND g.application_mode IS NOT NULL AND g.tax_category IS NULL;

UPDATE ledger_groups g
SET g.application_method = CASE g.application_mode COLLATE utf8mb4_unicode_ci WHEN 'withheld' THEN 'withheld' ELSE 'added' END
WHERE g.id > 0 AND g.behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND g.application_mode COLLATE utf8mb4_unicode_ci IN ('additive', 'withheld') AND g.application_method IS NULL;

-- B4. Sales and purchase accounts: each account's rate and tax nature become a row of ledger_taxes
SET @vat_types = (SELECT COUNT(*) FROM ledger_groups WHERE behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND tax_category COLLATE utf8mb4_unicode_ci = 'vat_gst'
                  AND application_method COLLATE utf8mb4_unicode_ci = 'added' AND is_active = 1);
SET @vat = IF(@vat_types = 1, (SELECT id FROM ledger_groups WHERE behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND tax_category COLLATE utf8mb4_unicode_ci = 'vat_gst'
                  AND application_method COLLATE utf8mb4_unicode_ci = 'added' AND is_active = 1 LIMIT 1), NULL);

-- an account with its own rate: the rate's type, the rate, and the account's nature (applies when it has none)
INSERT IGNORE INTO ledger_taxes (ledger_id, tax_type_id, tax_rate_id, treatment, sort_order, created_at, updated_at)
SELECT l.id, r.group_id, r.id,
       CASE l.tax_nature COLLATE utf8mb4_unicode_ci WHEN 'zero_rated' THEN 'zero_rated' WHEN 'exempt' THEN 'exempt' WHEN 'out_of_scope' THEN 'out_of_scope' ELSE 'applies' END,
       0, NOW(), NOW()
FROM ledgers l JOIN ledgers r ON r.id = l.tax_rate_ledger_id
WHERE l.id > 0 AND r.group_id IS NOT NULL;

-- an account with a nature and no rate: the company's one VAT type (skipped when there is not exactly one)
INSERT IGNORE INTO ledger_taxes (ledger_id, tax_type_id, tax_rate_id, treatment, sort_order, created_at, updated_at)
SELECT l.id, @vat, NULL,
       CASE l.tax_nature COLLATE utf8mb4_unicode_ci WHEN 'zero_rated' THEN 'zero_rated' WHEN 'exempt' THEN 'exempt' WHEN 'out_of_scope' THEN 'out_of_scope' ELSE 'applies' END,
       0, NOW(), NOW()
FROM ledgers l
WHERE l.id > 0 AND @vat IS NOT NULL AND l.tax_rate_ledger_id IS NULL AND l.tax_nature IS NOT NULL;

-- B5. The starting settings: the group that holds taxes (looked up by name this once, kept as an id from then on), the categories that are on, and which
-- methods each category allows. These are starting points for the company's tax adviser to confirm, and each is changed on the Tax control tab.
SET @taxgroup = (SELECT MIN(id) FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Duties & Taxes');

INSERT IGNORE INTO tax_control_settings (setting_key, value, created_at, updated_at)
SELECT 'tax_group_id', CAST(@taxgroup AS CHAR), NOW(), NOW() FROM DUAL WHERE @taxgroup IS NOT NULL;

INSERT IGNORE INTO tax_control_settings (setting_key, value, created_at, updated_at) VALUES
 ('enabled_categories', JSON_ARRAY('vat_gst', 'sales_tax', 'withholding_income', 'withholding_vat', 'income_tax', 'payroll', 'excise', 'customs', 'property',
                                   'capital_gains', 'turnover', 'stamp_duty', 'environmental', 'transaction_levy', 'other'), NOW(), NOW()),
 ('category_methods', JSON_OBJECT(
    'vat_gst',            JSON_ARRAY('added', 'included', 'reverse_charge'),
    'sales_tax',          JSON_ARRAY('added', 'included'),
    'withholding_income', JSON_ARRAY('withheld'),
    'withholding_vat',    JSON_ARRAY('withheld'),
    'income_tax',         JSON_ARRAY('direct_liability'),
    'payroll',            JSON_ARRAY('withheld', 'direct_liability'),
    'excise',             JSON_ARRAY('added', 'included'),
    'customs',            JSON_ARRAY('added'),
    'property',           JSON_ARRAY('direct_liability'),
    'capital_gains',      JSON_ARRAY('direct_liability'),
    'turnover',           JSON_ARRAY('added', 'direct_liability'),
    'stamp_duty',         JSON_ARRAY('added', 'direct_liability'),
    'environmental',      JSON_ARRAY('added', 'included'),
    'transaction_levy',   JSON_ARRAY('added', 'withheld'),
    'other',              JSON_ARRAY('added', 'included', 'withheld', 'reverse_charge', 'direct_liability')), NOW(), NOW());

-- PART C - RESULT CHECKS. Run on their own.
-- C1. The new columns are there (expect 10 rows; fewer means a table above does not exist in this database)
SELECT table_name, column_name, column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND (
      (table_name = 'ledger_groups' AND column_name IN ('tax_category', 'application_method', 'jurisdiction_id', 'input_ledger_id', 'cost_ledger_id'))
   OR (table_name = 'ledgers' AND column_name IN ('secondary_rate_value', 'tax_point'))
   OR (table_name = 'tax_rules' AND column_name IN ('exemption_behaviour', 'applies_to_all'))
   OR (table_name = 'voucher_item_taxes' AND column_name = 'calc_snapshot'))
ORDER BY table_name, column_name;

-- C2. Every tax type has a category and a method (expect 0 rows)
SELECT id, name, kind, application_mode, tax_category, application_method FROM ledger_groups
WHERE behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND application_mode IS NOT NULL AND (tax_category IS NULL OR application_method IS NULL);

-- C3. The conversion, side by side (each old kind and mode with what it became)
SELECT kind, application_mode, tax_category, application_method, COUNT(*) AS types FROM ledger_groups
WHERE behaviour COLLATE utf8mb4_unicode_ci = 'tax' AND application_mode IS NOT NULL GROUP BY kind, application_mode, tax_category, application_method;

-- C4. The accounts that carry a tax now (rows of ledger_taxes by treatment), and the ones that could not be converted (expect 0 unconverted: if some are listed
-- there is not exactly one VAT type, so give each of them its tax on the Tax and compliance page; the old columns still hold what they had)
SELECT treatment, COUNT(*) AS accounts FROM ledger_taxes GROUP BY treatment;
SELECT l.id, l.name, l.tax_nature, l.tax_rate_ledger_id FROM ledgers l
WHERE (l.tax_nature IS NOT NULL OR l.tax_rate_ledger_id IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM ledger_taxes t WHERE t.ledger_id = l.id);

-- C5. The starting settings: expect 3 rows (tax_group_id, enabled_categories, category_methods)
SELECT setting_key, LEFT(value, 120) AS value FROM tax_control_settings ORDER BY setting_key;

-- C6. The log is empty (0)
SELECT COUNT(*) AS log_rows FROM tax_control_log;
