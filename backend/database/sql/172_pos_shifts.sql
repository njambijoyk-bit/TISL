-- =====================================================================
-- 172_pos_shifts.sql
-- Point of sale, step 6 (docs/POS_PLAN.md): shifts and cash-up.
--   pos_shifts       a cashier's shift at a station: the float they started with, and at the close what the drawer held against what it should
--   vouchers.shift_id the shift a document was made in
-- Until this script is run, no shift is asked for. After it, a branch asks for an open shift to sell (Point of sale -> Stations: "must open a shift"). Run 169 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pos_shifts';
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'shift_id';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS pos_shifts (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id        BIGINT UNSIGNED NOT NULL,
    station_id     BIGINT UNSIGNED NOT NULL,
    location_id    BIGINT UNSIGNED NOT NULL,
    status         VARCHAR(8) NOT NULL DEFAULT 'open',          -- open | closed
    opened_at      DATETIME NOT NULL,
    opening_float  DECIMAL(15,2) NOT NULL DEFAULT 0,
    closed_at      DATETIME NULL,
    closed_by      BIGINT UNSIGNED NULL,                        -- the cashier, or a supervisor closing it for them
    counted        JSON NULL,                                   -- what was counted, by payment method
    report         JSON NULL,                                   -- the Z report as it was at the close
    variance       DECIMAL(15,2) NULL,                          -- counted cash less expected cash
    note           VARCHAR(255) NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_pos_shifts_user (user_id, status),
    KEY idx_pos_shifts_station (station_id, status),
    KEY idx_pos_shifts_location (location_id, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS add_pos_shift_column;
DELIMITER $$
CREATE PROCEDURE add_pos_shift_column()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'shift_id') THEN
        ALTER TABLE vouchers ADD COLUMN shift_id BIGINT UNSIGNED NULL;
        ALTER TABLE vouchers ADD KEY idx_vouchers_shift (shift_id);
    END IF;
END$$
DELIMITER ;
CALL add_pos_shift_column();
DROP PROCEDURE IF EXISTS add_pos_shift_column;

-- PART C - CHECK AFTER
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pos_shifts';
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'shift_id';
