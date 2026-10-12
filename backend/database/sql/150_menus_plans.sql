-- =====================================================================
-- 150_menus_plans.sql
-- Menus module, step 17: meal plans (docs/MENUS_PLAN.md section 5). A customer subscribes to a plan: a rotating weekly menu delivered on the days they choose, paid a week ahead.
--   menus_plans           a plan: its price for each delivery day, the days it delivers, how long its menu takes to repeat (1 to 4 weeks), how late a day may be skipped
--   menus_plan_days       the dishes of the plan on a weekday of a week of its rotation
--   menus_subscriptions   a customer on a plan: where to deliver, which of the plan's days, from when, active / paused / cancelled
--   menus_sub_periods     one week billed ahead: its Sales Order in the books and whether it was paid
--   menus_sub_deliveries  one delivery day of a week: its dishes, whether it was skipped, and the kitchen order made for it
-- Run 132 to 149 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_plans', 'menus_plan_days', 'menus_subscriptions', 'menus_sub_periods', 'menus_sub_deliveries');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_plans (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(120) NOT NULL,
    slug             VARCHAR(140) NOT NULL,
    description      TEXT NULL,
    photo            VARCHAR(255) NULL,
    location_id      BIGINT UNSIGNED NOT NULL,                   -- the kitchen that cooks it
    cycle_weeks      TINYINT UNSIGNED NOT NULL DEFAULT 1,        -- the menu repeats after this many weeks (1 to 4)
    day_price        DECIMAL(12,2) NOT NULL DEFAULT 0,           -- for each delivery day, before tax: all of that day's dishes together
    delivery_weekdays VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5',  -- the days it delivers: 1 Monday ... 7 Sunday
    min_days         TINYINT UNSIGNED NOT NULL DEFAULT 1,        -- the fewest delivery days a week a customer must choose
    cutoff_hours     SMALLINT UNSIGNED NOT NULL DEFAULT 24,      -- a day can be skipped or changed up to this long before it
    slot_from        TIME NOT NULL DEFAULT '12:00:00',           -- the delivery window
    slot_to          TIME NOT NULL DEFAULT '14:00:00',
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    sort_order       INT NOT NULL DEFAULT 0,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_menus_plans_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_plan_days (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    plan_id     BIGINT UNSIGNED NOT NULL,
    week_no     TINYINT UNSIGNED NOT NULL,                       -- 1 to the plan's cycle
    weekday     TINYINT UNSIGNED NOT NULL,                       -- 1 Monday ... 7 Sunday
    dish_id     BIGINT UNSIGNED NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_menus_plan_days (plan_id, week_no, weekday)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_subscriptions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number          VARCHAR(20) NOT NULL,                        -- SB-000123
    manage_token    VARCHAR(40) NOT NULL,                        -- the secret in the customer's link (no sign-in)
    plan_id         BIGINT UNSIGNED NOT NULL,
    customer_id     BIGINT UNSIGNED NULL,
    user_id         BIGINT UNSIGNED NULL,
    name            VARCHAR(160) NOT NULL,
    email           VARCHAR(190) NULL,
    phone           VARCHAR(40) NOT NULL,
    address         TEXT NOT NULL,
    weekdays        VARCHAR(20) NOT NULL,                        -- the plan's days this customer chose
    start_date      DATE NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'pending',      -- pending (first week not paid yet) | active | paused | cancelled
    paused_from     DATE NULL,                                   -- no deliveries from here...
    paused_until    DATE NULL,                                   -- ...to here (empty = until they resume)
    credit_days     SMALLINT UNSIGNED NOT NULL DEFAULT 0,        -- paid days skipped: that many delivery days of the next weeks are free
    lapsed          TINYINT UNSIGNED NOT NULL DEFAULT 0,         -- weeks in a row that were not paid
    notes           VARCHAR(500) NULL,
    cancelled_at    DATETIME NULL,
    cancel_reason   VARCHAR(300) NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_menus_subscriptions_number (number),
    UNIQUE KEY uq_menus_subscriptions_token (manage_token),
    KEY idx_menus_subscriptions_status (status, plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_sub_periods (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subscription_id  BIGINT UNSIGNED NOT NULL,
    week_start       DATE NOT NULL,                              -- the Monday
    week_no          TINYINT UNSIGNED NOT NULL,                  -- which week of the plan's menu this is
    subtotal         DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_total        DECIMAL(14,2) NOT NULL DEFAULT 0,
    total            DECIMAL(14,2) NOT NULL DEFAULT 0,
    voucher_id       BIGINT UNSIGNED NULL,                       -- the Sales Order in the books
    sale_id          BIGINT UNSIGNED NULL,                       -- the sale it became when paid
    status           VARCHAR(8) NOT NULL DEFAULT 'due',          -- due | paid | lapsed | void
    pay_by           DATETIME NULL,                              -- unpaid by here, the week's deliveries are not made
    paid_at          DATETIME NULL,
    reminded_at      DATETIME NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_menus_sub_periods (subscription_id, week_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_sub_deliveries (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subscription_id  BIGINT UNSIGNED NOT NULL,
    period_id        BIGINT UNSIGNED NOT NULL,
    delivery_date    DATE NOT NULL,
    status           VARCHAR(10) NOT NULL DEFAULT 'scheduled',   -- scheduled | skipped | ordered | missed | cancelled
    free             TINYINT(1) NOT NULL DEFAULT 0,              -- a day owed from an earlier skip: not charged
    lines            JSON NULL,                                  -- [{dish_id, name, price}] as billed
    item_ids         JSON NULL,                                  -- the lines on the Sales Order, so stock can be taken when it is made
    order_id         BIGINT UNSIGNED NULL,                       -- the kitchen order made for it
    skipped_at       DATETIME NULL,
    stock_note       VARCHAR(300) NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_menus_sub_deliveries (subscription_id, delivery_date),
    KEY idx_menus_sub_deliveries_day (delivery_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_plans', 'menus_plan_days', 'menus_subscriptions', 'menus_sub_periods', 'menus_sub_deliveries');
