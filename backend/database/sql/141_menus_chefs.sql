-- =====================================================================
-- 141_menus_chefs.sql
-- Menus module, step 8 (docs/MENUS_PLAN.md): chefs and cooking staff.
--   menus_chefs       a member of staff with a kitchen profile: the name and title shown to guests, a short bio and photo, the stations they work, whether they teach
--                     (so Courses can use them as an instructor later), and whether they are shown on the public chefs page
--   menus_chef_certs  their certificates (food handler, medical, first aid, HACCP...) with an expiry date; the system warns before one runs out
--   menus_dishes      gets chef_id: "a dish by Chef Wanjiru", shown on the menu
-- Run 132 to 140 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_chefs', 'menus_chef_certs');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_dishes' AND column_name = 'chef_id';

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

CALL add_column_if_missing('menus_dishes', 'chef_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS menus_chefs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NOT NULL,                     -- the staff member
    display_name  VARCHAR(80) NOT NULL,                         -- "Chef Wanjiru"
    title         VARCHAR(80) NULL,                             -- "Head chef", "Pastry chef"
    bio           TEXT NULL,
    photo         VARCHAR(255) NULL,
    station_ids   JSON NULL,                                    -- the stations they work
    is_instructor TINYINT(1) NOT NULL DEFAULT 0,                -- may teach (used by Courses later)
    is_public     TINYINT(1) NOT NULL DEFAULT 0,                -- shown on the public chefs page
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_menus_chef_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_chef_certs (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    chef_id          BIGINT UNSIGNED NOT NULL,
    kind             VARCHAR(20) NOT NULL DEFAULT 'food_handler',   -- food_handler | medical | first_aid | haccp | other
    name             VARCHAR(120) NOT NULL,
    number           VARCHAR(60) NULL,
    issued_on        DATE NULL,
    expires_on       DATE NULL,                                      -- empty = never runs out
    warned_at        DATETIME NULL,                                  -- told "runs out soon"
    expired_told_at  DATETIME NULL,                                  -- told "has run out"
    notes            VARCHAR(255) NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_menus_cert_chef (chef_id),
    KEY idx_menus_cert_expiry (expires_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
