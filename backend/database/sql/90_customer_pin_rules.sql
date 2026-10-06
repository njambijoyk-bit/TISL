-- =====================================================================
-- 90_customer_pin_rules.sql
-- Campaigns: lets staff switch off customers adding their own pins, and cap how many a customer can add per month.
--   campaign_settings      one row: customer_pins_enabled (1 = on), customer_pins_per_month (0 = no limit)
--   campaign_pin_uploads   one row each time a customer adds a pin, so the monthly count still holds if they delete it afterwards
-- Nothing existing is changed. Safe to re-run: tables are only made if missing, and the settings row only added if there is none.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 2 rows = both tables are already there (nothing to do); fewer = run part B.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('campaign_settings', 'campaign_pin_uploads');

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS campaign_settings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_pins_enabled TINYINT(1) NOT NULL DEFAULT 1,
    customer_pins_per_month INT UNSIGNED NOT NULL DEFAULT 0,       -- 0 = no limit
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);

INSERT INTO campaign_settings (customer_pins_enabled, customer_pins_per_month, created_at, updated_at)
SELECT 1, 0, NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM campaign_settings);

CREATE TABLE IF NOT EXISTS campaign_pin_uploads (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    pin_id BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_campaign_pin_uploads_user (user_id, created_at)
);

-- PART C - RESULT CHECK. Expect 2 table rows, then 1 settings row (enabled 1, limit 0).
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('campaign_settings', 'campaign_pin_uploads');
SELECT id, customer_pins_enabled, customer_pins_per_month FROM campaign_settings;
