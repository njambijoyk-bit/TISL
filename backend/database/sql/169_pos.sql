-- =====================================================================
-- 169_pos.sql
-- Point of sale, step 1 (docs/POS_PLAN.md): stations and the receipt paper of each branch. The point of sale belongs to the Extras module.
--   pos_stations        a till or a self-checkout screen at a branch (a branch has many stations; one is the default)
--   pos_station_users   the stations a person works at, and which one is theirs by default
--   pos_branch_settings per branch: the receipt paper offered and the default, and whether a shift must be open to sell
--   vouchers.station_id the station a document was made at (empty for documents made anywhere else)
-- Run 98 (access) first, then run `php artisan access:seed` so the new pos.* permissions reach the built-in roles. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('pos_stations', 'pos_station_users', 'pos_branch_settings');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'station_id';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS pos_stations (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    location_id   BIGINT UNSIGNED NOT NULL,
    name          VARCHAR(80) NOT NULL,
    code          VARCHAR(20) NOT NULL,
    kind          VARCHAR(14) NOT NULL DEFAULT 'staff',          -- staff | self_checkout
    paper         VARCHAR(8) NULL,                                -- a4 | pos110 | pos85 | pos80 | pos58 (empty = the branch's)
    is_default    TINYINT(1) NOT NULL DEFAULT 0,                  -- the station used when none is chosen (one staff station per branch)
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    token_hash    CHAR(64) NULL,                                  -- self checkout only: the secret in its address, stored hashed
    last_seen_at  DATETIME NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_pos_stations_code (location_id, code),
    KEY idx_pos_stations_location (location_id, is_active),
    UNIQUE KEY uq_pos_stations_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_station_users (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT UNSIGNED NOT NULL,
    station_id   BIGINT UNSIGNED NOT NULL,
    is_default   TINYINT(1) NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_pos_station_users (user_id, station_id),
    KEY idx_pos_station_users_station (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_branch_settings (
    location_id    BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    paper_default  VARCHAR(8) NOT NULL DEFAULT 'pos80',
    paper_allowed  JSON NULL,                                     -- the sizes the cashier may pick from (empty = all five)
    require_shift  TINYINT(1) NOT NULL DEFAULT 1,                 -- a shift must be open to sell
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP PROCEDURE IF EXISTS add_pos_columns;
DELIMITER $$
CREATE PROCEDURE add_pos_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'station_id') THEN
        ALTER TABLE vouchers ADD COLUMN station_id BIGINT UNSIGNED NULL;                                        -- the point of sale station the document was made at
        ALTER TABLE vouchers ADD KEY idx_vouchers_station (station_id);
    END IF;
END$$
DELIMITER ;
CALL add_pos_columns();
DROP PROCEDURE IF EXISTS add_pos_columns;

-- PART C - CHECK. Expect three tables, then the column.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('pos_stations', 'pos_station_users', 'pos_branch_settings');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vouchers' AND column_name = 'station_id';
