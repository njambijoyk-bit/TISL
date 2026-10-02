-- =====================================================================
-- 59_service_settings.sql
-- Services settings and the service accounts in Books → Settings → Default ledgers.
--   accounting_settings.default_service_ledger_id   Default service income account  → Services - standard (VAT-able)
--   accounting_settings.service_returns_ledger_id   Service returns                 → Service Returns
--   accounting_settings.booking_deposit_ledger_id   Booking deposits (liability)    → Customer Deposits - Bookings
--   accounting_settings.tips_payable_ledger_id      Tips payable (liability)        → Tips Payable
--   service_settings                                one row: cancellation_window_hours, reschedule_window_hours (default 24 each)
-- A setting that is already filled in is left alone. Needs script 56. This script commits by itself. Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Columns and table already there? (expect 0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'accounting_settings' AND column_name IN ('default_service_ledger_id', 'service_returns_ledger_id', 'booking_deposit_ledger_id', 'tips_payable_ledger_id');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'service_settings';

-- A2. The ledgers they will point at (expect 4 rows; run script 56 first if not)
SELECT id, name FROM ledgers WHERE name IN ('Services - standard (VAT-able)', 'Service Returns', 'Customer Deposits - Bookings', 'Tips Payable');

-- PART B — ADD (columns and table are DDL and commit on their own; the settings are saved at the end)
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

CALL add_column_if_missing('accounting_settings', 'default_service_ledger_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'service_returns_ledger_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'booking_deposit_ledger_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('accounting_settings', 'tips_payable_ledger_id',    'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS service_settings (
    id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    cancellation_window_hours INT NOT NULL DEFAULT 24,     -- a cancellation inside this many hours of the booking is "late"
    reschedule_window_hours   INT NOT NULL DEFAULT 24,     -- so is a move
    updated_by                BIGINT UNSIGNED NULL,
    updated_at                DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

START TRANSACTION;

INSERT INTO service_settings (cancellation_window_hours, reschedule_window_hours, updated_at)
SELECT 24, 24, NOW() WHERE NOT EXISTS (SELECT 1 FROM service_settings);

UPDATE accounting_settings SET default_service_ledger_id = (SELECT id FROM ledgers WHERE name = 'Services - standard (VAT-able)' LIMIT 1) WHERE default_service_ledger_id IS NULL;
UPDATE accounting_settings SET service_returns_ledger_id = (SELECT id FROM ledgers WHERE name = 'Service Returns' LIMIT 1)                WHERE service_returns_ledger_id IS NULL;
UPDATE accounting_settings SET booking_deposit_ledger_id = (SELECT id FROM ledgers WHERE name = 'Customer Deposits - Bookings' LIMIT 1)    WHERE booking_deposit_ledger_id IS NULL;
UPDATE accounting_settings SET tips_payable_ledger_id    = (SELECT id FROM ledgers WHERE name = 'Tips Payable' LIMIT 1)                     WHERE tips_payable_ledger_id IS NULL;

COMMIT;

-- PART C — RESULT CHECK (expect one row each, the four ids filled in)
SELECT default_service_ledger_id, service_returns_ledger_id, booking_deposit_ledger_id, tips_payable_ledger_id FROM accounting_settings;
SELECT * FROM service_settings;
