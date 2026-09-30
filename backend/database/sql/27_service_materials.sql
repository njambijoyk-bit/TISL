-- =====================================================================
-- 27_service_materials.sql                (PLATFORM_PLAN §17–18, step 7)
-- Materials under a service line.
--
--   service_variant_materials   the default materials of a service package
--                               (e.g. manicure: 0.05 bottle of gel polish,
--                               1 file), each CHARGED to the customer or
--                               INCLUDED in the price
--   voucher_items.material_mode charged | included | bought_outside |
--                               customer_supplied — set on a line that is a
--                               material of the service line above it
--   voucher_items.cost_amount   what a bought-outside part cost us, in the
--                               voucher's currency
--   voucher_items.paid_ledger_id  the supplier / cash / bank ledger it was
--                               paid from (or is owed to)
--
-- The ledgers (Cost of Services, Job Materials Cost) came with script 22.
-- Run after 22–26. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Already there? (expect 0 rows on first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'voucher_items'
  AND column_name IN ('material_mode', 'cost_amount', 'paid_ledger_id')
UNION ALL
SELECT table_name, NULL FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'service_variant_materials';

-- A2. The two ledgers materials post to (expect 2 rows; if a row is missing, run script 22 or pick ledgers in Books settings)
SELECT id, name FROM ledgers WHERE name IN ('Cost of Services', 'Job Materials Cost');


-- ---------------------------------------------------------------------
-- PART B — TABLE AND COLUMNS (DDL, commits on its own; each skips itself if present)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service_variant_materials (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    service_variant_id BIGINT UNSIGNED NOT NULL,          -- the package
    variant_id         BIGINT UNSIGNED NOT NULL,          -- the product variant used
    quantity           DECIMAL(18,4)   NOT NULL DEFAULT 1, -- in the product's stock (base) unit
    mode               VARCHAR(20)     NOT NULL DEFAULT 'included',   -- charged | included
    position           INT UNSIGNED    NOT NULL DEFAULT 0,
    created_at         TIMESTAMP       NULL,
    updated_at         TIMESTAMP       NULL,
    KEY idx_svm_package (service_variant_id),
    KEY idx_svm_variant (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CALL add_column_if_missing('voucher_items', 'material_mode',  'VARCHAR(20) NULL');
CALL add_column_if_missing('voucher_items', 'cost_amount',    'DECIMAL(15,2) NULL');
CALL add_column_if_missing('voucher_items', 'paid_ledger_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;


-- ---------------------------------------------------------------------
-- PART C — RESULT CHECK. Expect: the table, and three voucher_items columns.
-- ---------------------------------------------------------------------

SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'voucher_items' AND column_name IN ('material_mode', 'cost_amount', 'paid_ledger_id'))
    OR (table_name = 'service_variant_materials' AND column_name IN ('service_variant_id', 'variant_id', 'quantity', 'mode')))
ORDER BY table_name, column_name;
