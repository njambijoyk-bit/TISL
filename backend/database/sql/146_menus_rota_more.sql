-- =====================================================================
-- 146_menus_rota_more.sql
-- Menus module, step 13: the rest of the rota (docs/MENUS_PLAN.md).
--   menus_rota_patterns   a repeating weekly pattern for a chef (Monday to Friday 08:00 to 16:00 at the Grill, from this day, until that day)
--   menus_swaps           a chef asks a colleague to take a shift (or trade shifts); the colleague agrees, a manager approves
--   menus_days_off.charged_days   the leave days taken off the chef's balance when leave was approved (so they can be given back)
--   menus_shifts.pattern_id       the pattern a draft shift was planned from
--   menus_shifts.watch_notified_at  when managers were told the chef had not signed in for this shift
-- Run 145 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_rota_patterns', 'menus_swaps');
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()
  AND ((table_name = 'menus_days_off' AND column_name = 'charged_days') OR (table_name = 'menus_shifts' AND column_name IN ('pattern_id', 'watch_notified_at')));

-- PART B - CHANGES
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

CALL add_column_if_missing('menus_days_off', 'charged_days', 'DECIMAL(5,1) NULL AFTER reason');
CALL add_column_if_missing('menus_shifts', 'pattern_id', 'BIGINT UNSIGNED NULL AFTER note');
CALL add_column_if_missing('menus_shifts', 'watch_notified_at', 'DATETIME NULL AFTER published_at');

DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS menus_rota_patterns (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    chef_id      BIGINT UNSIGNED NOT NULL,
    location_id  BIGINT UNSIGNED NOT NULL,
    station_id   BIGINT UNSIGNED NULL,
    weekday      TINYINT UNSIGNED NOT NULL,                    -- 1 Monday ... 7 Sunday
    starts_at    TIME NOT NULL,
    ends_at      TIME NOT NULL,
    valid_from   DATE NOT NULL,
    valid_to     DATE NULL,                                    -- empty = until it is stopped
    note         VARCHAR(200) NULL,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_rota_patterns_chef (chef_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_swaps (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    shift_id        BIGINT UNSIGNED NOT NULL,                  -- the shift being handed over
    from_chef_id    BIGINT UNSIGNED NOT NULL,
    to_chef_id      BIGINT UNSIGNED NOT NULL,
    return_shift_id BIGINT UNSIGNED NULL,                      -- a shift of the colleague's taken in exchange (empty = cover only)
    note            VARCHAR(300) NULL,
    status          VARCHAR(12) NOT NULL DEFAULT 'asked',      -- asked | agreed | approved | declined | cancelled | expired
    answered_at     DATETIME NULL,                             -- the colleague said yes or no
    decided_by      BIGINT UNSIGNED NULL,
    decided_at      DATETIME NULL,
    decision_note   VARCHAR(300) NULL,
    requested_by    BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_menus_swaps_status (status),
    KEY idx_menus_swaps_shift (shift_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_rota_patterns', 'menus_swaps');
