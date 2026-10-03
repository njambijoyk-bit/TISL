-- =====================================================================
-- 71_asset_depreciation.sql
-- Assets that depreciate, in their own currency.
--   inventory_categories : which ledgers an asset category posts to, and its default method / life / rate
--       asset_ledger_id (Fixed Assets) · accumulated_ledger_id (Accumulated Depreciation) · expense_ledger_id (Depreciation Expense)
--       default_method (none | straight_line | reducing_balance) · default_life_years · default_rate (% a year, reducing balance)
--   inventory_instances  : each asset
--       currency_id / exchange_rate     the currency its cost and floor are in (blank = base) and the rate when it was bought
--       floor_value                     depreciation STOPS when the asset's book value reaches this (land: its value; a sofa: what it is still worth)
--       depreciation_method / depreciation_rate / in_service_date
--       acquisition_voucher_id          the voucher that booked the purchase
--       opening_accumulated / depreciated_to   for assets that were already depreciated before you started: how much, and up to which month-end
--   asset_depreciation   : one row per asset per month that has been posted (and the journal it went into)
-- Run in Workbench. Safe to re-run. Adds only, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (before: 0 rows each; after: 6, 12 and 1)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_categories'
  AND column_name IN ('asset_ledger_id', 'accumulated_ledger_id', 'expense_ledger_id', 'default_method', 'default_life_years', 'default_rate');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_instances'
  AND column_name IN ('currency_id', 'exchange_rate', 'floor_value', 'depreciation_method', 'depreciation_rate', 'in_service_date', 'acquisition_voucher_id', 'opening_accumulated', 'depreciated_to', 'disposal_voucher_id', 'disposed_on', 'sale_proceeds');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'asset_depreciation';

-- PART B — ADD (DDL, commits on its own)
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('inventory_categories', 'asset_ledger_id',       'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('inventory_categories', 'accumulated_ledger_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('inventory_categories', 'expense_ledger_id',     'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('inventory_categories', 'default_method',        "VARCHAR(20) NOT NULL DEFAULT 'none'");
CALL add_column_if_missing('inventory_categories', 'default_life_years',    'INT NULL');
CALL add_column_if_missing('inventory_categories', 'default_rate',          'DECIMAL(7,4) NULL');

CALL add_column_if_missing('inventory_instances', 'currency_id',            'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('inventory_instances', 'exchange_rate',          'DECIMAL(18,8) NULL');
CALL add_column_if_missing('inventory_instances', 'floor_value',            'DECIMAL(15,2) NOT NULL DEFAULT 0');
CALL add_column_if_missing('inventory_instances', 'depreciation_method',    "VARCHAR(20) NOT NULL DEFAULT 'none'");
CALL add_column_if_missing('inventory_instances', 'depreciation_rate',      'DECIMAL(7,4) NULL');
CALL add_column_if_missing('inventory_instances', 'in_service_date',        'DATE NULL');
CALL add_column_if_missing('inventory_instances', 'acquisition_voucher_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('inventory_instances', 'opening_accumulated',    'DECIMAL(15,2) NOT NULL DEFAULT 0');
CALL add_column_if_missing('inventory_instances', 'depreciated_to',         'DATE NULL');
CALL add_column_if_missing('inventory_instances', 'disposal_voucher_id',    'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('inventory_instances', 'disposed_on',            'DATE NULL');
CALL add_column_if_missing('inventory_instances', 'sale_proceeds',          'DECIMAL(15,2) NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS asset_depreciation (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    instance_id   BIGINT UNSIGNED NOT NULL,
    period_end    DATE NOT NULL,                 -- the month-end this charge is for
    amount        DECIMAL(15,2) NOT NULL,        -- in the asset's own currency
    currency_id   BIGINT UNSIGNED NULL,
    voucher_id    BIGINT UNSIGNED NULL,          -- the Journal it was posted in
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_asset_month (instance_id, period_end),
    KEY idx_dep_voucher (voucher_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- PART C — RESULT CHECK (expect 6, 12 and 1 rows)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_categories'
  AND column_name IN ('asset_ledger_id', 'accumulated_ledger_id', 'expense_ledger_id', 'default_method', 'default_life_years', 'default_rate');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_instances'
  AND column_name IN ('currency_id', 'exchange_rate', 'floor_value', 'depreciation_method', 'depreciation_rate', 'in_service_date', 'acquisition_voucher_id', 'opening_accumulated', 'depreciated_to', 'disposal_voucher_id', 'disposed_on', 'sale_proceeds');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'asset_depreciation';
