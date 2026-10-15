-- =====================================================================
-- 176_pos_station_ledgers.sql
-- Point of sale: each station can have its own cash-in-hand ledger and bank ledger. What is paid in cash at the station posts to its cash ledger;
-- every other way of paying (bank transfer, card, M-Pesa) posts to its bank ledger. Left empty, the payment method's own ledger is used.
--   pos_stations.cash_ledger_id, pos_stations.bank_ledger_id
-- Run 169 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pos_stations' AND column_name IN ('cash_ledger_id', 'bank_ledger_id');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS add_pos_station_ledgers;
DELIMITER $$
CREATE PROCEDURE add_pos_station_ledgers()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pos_stations' AND column_name = 'cash_ledger_id') THEN
        ALTER TABLE pos_stations ADD COLUMN cash_ledger_id BIGINT UNSIGNED NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pos_stations' AND column_name = 'bank_ledger_id') THEN
        ALTER TABLE pos_stations ADD COLUMN bank_ledger_id BIGINT UNSIGNED NULL;
    END IF;
END$$
DELIMITER ;
CALL add_pos_station_ledgers();
DROP PROCEDURE IF EXISTS add_pos_station_ledgers;

-- PART C - CHECK AFTER
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pos_stations' AND column_name IN ('cash_ledger_id', 'bank_ledger_id');
