-- =====================================================================
-- 136_menus_orders.sql
-- Menus module, step 3 (docs/MENUS_PLAN.md): taking orders. The first two ways in (channels): online pickup and online delivery.
--   voucher_items.menu_uses   what a dish line's choices change in the recipe (extra cheese, "no onion"), kept with the line so an order that becomes an invoice still takes the right stock
--   products                  the hidden product behind each dish must be "for sale" (it stays out of the shop: it is not visible); dishes made before this step are corrected here
--   menus_channels            a way in: online pickup, online delivery (later the till, tables, kiosk). Its rules: preparation time, time slots, how it may be paid, which menus it shows
--   menus_orders              one customer order: who, how it is fetched, when, where it stands, what it came to; it points at the Sales Order in the books
--   menus_order_lines         the dishes ordered, with the name, price and choices as they were when ordered (later edits never change an old order)
-- Run 132 to 135 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_channels', 'menus_orders', 'menus_order_lines');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voucher_items' AND column_name = 'menu_uses';

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

CALL add_column_if_missing('voucher_items', 'menu_uses', 'JSON NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- the product behind a dish can be sold on a voucher (it is still not shown in the shop: is_visible stays 0)
UPDATE products SET is_for_sale = 1 WHERE id IN (SELECT product_id FROM menus_dishes);

CREATE TABLE IF NOT EXISTS menus_channels (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code            VARCHAR(30) NOT NULL,                        -- online_pickup | online_delivery | (later) counter, table, kiosk
    name            VARCHAR(80) NOT NULL,
    order_type      VARCHAR(12) NOT NULL,                        -- pickup | delivery | dine_in | counter | kiosk
    is_active       TINYINT(1) NOT NULL DEFAULT 0,
    prep_minutes    SMALLINT UNSIGNED NOT NULL DEFAULT 20,       -- how long the kitchen needs, so the earliest time is now + this
    slot_minutes    SMALLINT UNSIGNED NOT NULL DEFAULT 15,       -- the gap between times a customer can choose
    max_days_ahead  TINYINT UNSIGNED NOT NULL DEFAULT 2,
    allow_asap      TINYINT(1) NOT NULL DEFAULT 1,
    payment_modes   JSON NULL,                                   -- ["online","later"]: pay now, or when it is collected / delivered
    menu_ids        JSON NULL,                                   -- NULL = every menu; else only these
    shipping_option_ids JSON NULL,                               -- delivery: the delivery methods a customer may choose (NULL = every active one)
    min_order       DECIMAL(12,2) NOT NULL DEFAULT 0,            -- before tax
    note            VARCHAR(300) NULL,                           -- shown at checkout ("Delivery within 5 km")
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_menus_channel_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_orders (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number           VARCHAR(20) NOT NULL,
    track_token      CHAR(40) NOT NULL,                          -- lets a guest follow their order without signing in
    channel_id       BIGINT UNSIGNED NOT NULL,
    order_type       VARCHAR(12) NOT NULL,
    location_id      BIGINT UNSIGNED NOT NULL,
    voucher_id       BIGINT UNSIGNED NULL,                       -- the Sales Order in the books
    sale_id          BIGINT UNSIGNED NULL,                       -- the sale it became when paid
    customer_id      BIGINT UNSIGNED NULL,
    user_id          BIGINT UNSIGNED NULL,
    name             VARCHAR(160) NOT NULL,
    email            VARCHAR(190) NULL,
    phone            VARCHAR(40) NOT NULL,
    status           VARCHAR(12) NOT NULL DEFAULT 'placed',      -- placed | accepted | preparing | ready | out | completed | cancelled
    payment          VARCHAR(10) NOT NULL DEFAULT 'pending',     -- pending (waiting for the money) | paid | later (pays on collection / delivery) | failed
    payment_method_id BIGINT UNSIGNED NULL,
    asap             TINYINT(1) NOT NULL DEFAULT 1,
    fulfil_at        DATETIME NOT NULL,                          -- when it is wanted: ready to collect, or at the door
    delivery_address TEXT NULL,
    shipping_option_id BIGINT UNSIGNED NULL,
    delivery_fee     DECIMAL(12,2) NOT NULL DEFAULT 0,
    subtotal         DECIMAL(12,2) NOT NULL DEFAULT 0,           -- before tax
    tax_total        DECIMAL(12,2) NOT NULL DEFAULT 0,
    total            DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency_id      BIGINT UNSIGNED NULL,
    notes            VARCHAR(500) NULL,
    cancel_reason    VARCHAR(300) NULL,
    placed_at        DATETIME NULL,
    accepted_at      DATETIME NULL,
    ready_at         DATETIME NULL,
    completed_at     DATETIME NULL,
    cancelled_at     DATETIME NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_menus_order_number (number),
    UNIQUE KEY uq_menus_order_token (track_token),
    KEY idx_menus_order_status (status, fulfil_at),
    KEY idx_menus_order_location (location_id, status),
    KEY idx_menus_order_voucher (voucher_id),
    KEY idx_menus_order_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_order_lines (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id     BIGINT UNSIGNED NOT NULL,
    dish_id      BIGINT UNSIGNED NOT NULL,
    variant_id   BIGINT UNSIGNED NOT NULL,
    name         VARCHAR(150) NOT NULL,
    quantity     DECIMAL(10,2) NOT NULL DEFAULT 1,
    base_price   DECIMAL(12,2) NOT NULL DEFAULT 0,               -- before tax, before choices
    unit_price   DECIMAL(12,2) NOT NULL DEFAULT 0,               -- before tax, with the choices
    options      JSON NULL,                                      -- [{id, group, name, price_delta}] as chosen
    note         VARCHAR(300) NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_order_line_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO menus_channels (code, name, order_type, is_active, prep_minutes, slot_minutes, max_days_ahead, allow_asap, payment_modes, sort_order, created_at, updated_at)
SELECT 'online_pickup', 'Online pickup', 'pickup', 0, 20, 15, 2, 1, JSON_ARRAY('online', 'later'), 1, NOW(), NOW() FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM menus_channels WHERE code = 'online_pickup');
INSERT INTO menus_channels (code, name, order_type, is_active, prep_minutes, slot_minutes, max_days_ahead, allow_asap, payment_modes, sort_order, created_at, updated_at)
SELECT 'online_delivery', 'Online delivery', 'delivery', 0, 30, 15, 2, 1, JSON_ARRAY('online', 'later'), 2, NOW(), NOW() FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM menus_channels WHERE code = 'online_delivery');

-- PART C - READ-ONLY CHECK (both channels start switched off: you switch them on in Menus -> Settings)
SELECT code, name, is_active FROM menus_channels;
