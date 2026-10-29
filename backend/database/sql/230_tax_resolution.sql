-- =====================================================================
-- 230_tax_resolution.sql
-- Tax control, step T6 (docs/TAX_CONTROL_PLAN.md): what the tax calculation needs beyond script 229.
--   ledgers.base_includes   for a tax rate that is calculated on the price PLUS other taxes: which tax types it includes (a list of tax type ids).
--                           Empty means every tax calculated before it on the same line, which is what "after discounts and earlier taxes" has always meant.
--   tax_opt_outs (new)      an item (a product or a service) that does not carry a tax: its own opt-out of one tax type, with a reason. For example a product
--                           that is not excisable on an account that carries excise.
-- Nothing changes in what is charged when this runs: no rate has a base_includes list and no item has an opt-out until someone sets one.
-- Safe to run twice. Run each part on its own in Workbench. Run 229 first.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. What is already there? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'tax_opt_outs'
UNION ALL SELECT CONCAT(table_name, '.', column_name) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ledgers' AND column_name = 'base_includes';

-- A2. Script 229 has been run (expect 1 row: ledger_taxes)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'ledger_taxes';

-- A3. The rates that are calculated on earlier taxes today (these keep their meaning: every earlier tax on the line)
SELECT l.id, l.name, g.name AS tax_type FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id
WHERE l.rate_type IS NOT NULL AND l.calculation_base COLLATE utf8mb4_unicode_ci = 'total_payable';

-- PART B - CHANGE
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
CALL add_column_if_missing('ledgers', 'base_includes', 'JSON NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS tax_opt_outs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    taxable_type  VARCHAR(40) NOT NULL,
    taxable_id    BIGINT UNSIGNED NOT NULL,
    tax_type_id   BIGINT UNSIGNED NOT NULL,
    reason        VARCHAR(160) NULL,
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_tax_opt_out (taxable_type, taxable_id, tax_type_id),
    KEY idx_tax_opt_out_type (tax_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - RESULT CHECKS. Run on their own.
-- C1. The new column and table are there (expect 2 rows)
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'ledgers' AND column_name = 'base_includes') OR (table_name = 'tax_opt_outs' AND column_name = 'tax_type_id'));

-- C2. Nothing has an opt-out or a base list yet (expect 0 and 0)
SELECT (SELECT COUNT(*) FROM tax_opt_outs) AS opt_outs, (SELECT COUNT(*) FROM ledgers WHERE base_includes IS NOT NULL) AS rates_with_a_base_list;
