-- =====================================================================
-- 69_delivery_money.sql
-- Money on a delivery manifest.
--   Cash collected at the door  -> a Receipt for the customer (against their open invoice where there is one), remembered on the stop:
--       delivery_items.cod_amount / cod_voucher_id / cod_at
--   What a trip costs (fuel, courier, driver pay, other) -> a Payment voucher Dr Delivery Expenses, Cr the cash / bank / petty cash it came from:
--       delivery_costs  (one row per cost, linked to its voucher)
-- Run in Workbench. Safe to re-run. Adds only, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (before: 0 rows and 0 rows; after: 3 columns and 1 table)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'delivery_items'
  AND column_name IN ('cod_amount', 'cod_voucher_id', 'cod_at');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'delivery_costs';

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

CALL add_column_if_missing('delivery_items', 'cod_amount',     'DECIMAL(15,2) NULL');
CALL add_column_if_missing('delivery_items', 'cod_voucher_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('delivery_items', 'cod_at',         'DATETIME NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS delivery_costs (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    manifest_id       BIGINT UNSIGNED NOT NULL,
    category          VARCHAR(20)  NOT NULL DEFAULT 'other',   -- fuel | courier | driver_pay | other
    amount            DECIMAL(15,2) NOT NULL,
    expense_ledger_id BIGINT UNSIGNED NOT NULL,
    paid_ledger_id    BIGINT UNSIGNED NOT NULL,
    voucher_id        BIGINT UNSIGNED NULL,
    payee             VARCHAR(160) NULL,
    notes             VARCHAR(255) NULL,
    paid_on           DATE NOT NULL,
    created_by        BIGINT UNSIGNED NULL,
    cancelled_at      DATETIME NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_cost_manifest (manifest_id),
    KEY idx_cost_voucher (voucher_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- PART C — RESULT CHECK (expect 3 columns and 1 table)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'delivery_items'
  AND column_name IN ('cod_amount', 'cod_voucher_id', 'cod_at');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'delivery_costs';
