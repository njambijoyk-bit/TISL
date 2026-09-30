-- =====================================================================
-- 25_stock_settings.sql                   (PLATFORM_PLAN §17–18, step 5)
-- Settings → Stock & expiry: what happens to expired goods.
--
--   stock_settings            ONE row (id = 1): the shop-wide rules
--   stock_setting_overrides   exceptions for one category or one product;
--                             a product's exception beats its category's,
--                             which beats the shop-wide rule. Only the
--                             settings named in the row are overridden.
--
-- Shop-wide defaults: expired stock hidden from customers; expiry badge on
-- (only ever shown for products that track expiry and a batch with a date);
-- selling expired stock never; no minimum shelf life; expired batches go to
-- the expired-stock list; warnings at 90 / 60 / 30 days; first-expiring first.
--
-- Run after 22, 23 and 24. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Tables already there? (expect 0 rows on first run)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('stock_settings', 'stock_setting_overrides');


-- ---------------------------------------------------------------------
-- PART B — TABLES (DDL, commits on its own)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_settings (
    id                    BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    expired_on_storefront VARCHAR(20)  NOT NULL DEFAULT 'hide',     -- hide | unavailable
    show_expiry_badge     TINYINT(1)   NOT NULL DEFAULT 1,
    sell_expired          VARCHAR(20)  NOT NULL DEFAULT 'never',    -- never | override | allowed
    override_roles        JSON         NULL,                        -- who may override, when sell_expired = override
    min_days_online       INT UNSIGNED NOT NULL DEFAULT 0,          -- shelf life a batch needs left to be sold online
    min_days_till         INT UNSIGNED NOT NULL DEFAULT 0,          -- ... and at the till
    expiry_action         VARCHAR(20)  NOT NULL DEFAULT 'list',     -- list | write_off
    write_off_after_days  INT UNSIGNED NOT NULL DEFAULT 30,         -- when expiry_action = write_off
    warning_days          JSON         NULL,                        -- e.g. [90,60,30]
    notify_roles          JSON         NULL,                        -- who is told, for their own branches
    pick_order            VARCHAR(20)  NOT NULL DEFAULT 'fefo',     -- fefo (first expiring first) | fifo (oldest first)
    updated_by            BIGINT UNSIGNED NULL,
    updated_at            TIMESTAMP    NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS stock_setting_overrides (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    scope      VARCHAR(10)     NOT NULL,           -- category | product
    scope_id   BIGINT UNSIGNED NOT NULL,
    settings   JSON            NOT NULL,           -- only the settings this exception changes
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP       NULL,
    updated_at TIMESTAMP       NULL,
    UNIQUE KEY uq_override_scope (scope, scope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ---------------------------------------------------------------------
-- PART C — THE ONE SETTINGS ROW (transaction; re-running changes nothing)
-- ---------------------------------------------------------------------

START TRANSACTION;

INSERT INTO stock_settings (id, override_roles, warning_days, notify_roles, updated_at)
SELECT 1, JSON_ARRAY('manager', 'admin', 'super_admin'), JSON_ARRAY(90, 60, 30), JSON_ARRAY('manager', 'admin'), NOW()
WHERE NOT EXISTS (SELECT 1 FROM stock_settings WHERE id = 1);

COMMIT;


-- ---------------------------------------------------------------------
-- PART D — RESULT CHECK. Expect one row with the defaults above.
-- ---------------------------------------------------------------------

SELECT * FROM stock_settings;
SELECT COUNT(*) AS exceptions FROM stock_setting_overrides;
