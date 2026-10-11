-- =====================================================================
-- 140_menus_kiosk.sql
-- Menus module, step 7 (docs/MENUS_PLAN.md): the self-order kiosk.
--   menus_kiosks     a self-order screen in the venue: its branch, whether guests may pay at the screen (M-Pesa) or at the counter, how long before it resets, and the secret
--                    in its address (the screen is opened at /kiosk/<secret>: nobody signs in on it)
--   menus_orders     gets kiosk_id and session_code (printed on the receipt as "Kiosk Session")
--   menus_channels   the "Kiosk" way in (switched on; which menus it shows is set under Menus → Settings → Ways to order)
-- Run 132 to 139 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_kiosks';
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_orders' AND column_name IN ('kiosk_id', 'session_code');
SELECT code FROM menus_channels WHERE code = 'kiosk';

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

CALL add_column_if_missing('menus_orders', 'kiosk_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('menus_orders', 'session_code', 'VARCHAR(12) NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS menus_kiosks (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(60) NOT NULL,
    location_id    BIGINT UNSIGNED NOT NULL,
    token          CHAR(32) NOT NULL,                           -- the secret in the screen's address
    pay_at_screen  TINYINT(1) NOT NULL DEFAULT 1,               -- M-Pesa prompt on the guest's phone
    pay_at_counter TINYINT(1) NOT NULL DEFAULT 1,               -- the guest takes a number and pays the cashier
    idle_seconds   SMALLINT UNSIGNED NOT NULL DEFAULT 60,       -- no touch for this long: back to the welcome screen and the basket is emptied
    welcome        VARCHAR(160) NULL,                           -- the line on the welcome screen
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_menus_kiosk_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO menus_channels (code, name, order_type, is_active, prep_minutes, slot_minutes, max_days_ahead, allow_asap, payment_modes, sort_order, created_at, updated_at)
SELECT 'kiosk', 'Kiosk', 'kiosk', 1, 0, 15, 0, 1, JSON_ARRAY('online', 'later'), 20, NOW(), NOW() FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM menus_channels WHERE code = 'kiosk');
