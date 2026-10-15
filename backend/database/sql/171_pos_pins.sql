-- =====================================================================
-- 171_pos_pins.sql
-- Point of sale, step 4 (docs/POS_PLAN.md): the supervisor PIN.
--   pos_pins  one PIN per supervisor (a person holding pos.supervise), stored hashed. 5 wrong tries lock it for 15 minutes.
-- Run 169 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pos_pins';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS pos_pins (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id       BIGINT UNSIGNED NOT NULL,
    pin_hash      VARCHAR(255) NOT NULL,
    failed_count  INT UNSIGNED NOT NULL DEFAULT 0,
    locked_until  DATETIME NULL,
    set_at        DATETIME NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_pos_pins_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK AFTER
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pos_pins';
