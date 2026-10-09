-- =====================================================================
-- 114_reminders.sql
-- Cart reminders and price-drop alerts for signed-in customers.
--   customer_reminder_prefs   one row per customer who was sent one: their choices (cart reminders, price alerts) and the token behind the "stop" link
--   cart_reminders            what was sent for the cart as it stands (count and time), so a cart is reminded about once or twice and never nagged
--   price_watch_marks         the price last seen for each product that is on someone's wishlist (a drop is measured against it)
--   price_drop_notices        who was told about which price, so nobody is told twice for the same drop
-- Existing data is not touched; nothing is sent until the company switches the reminders on (Settings -> Notifications -> General). Safe to run twice.
-- Run in Workbench. DDL commits on its own; nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: no rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('customer_reminder_prefs', 'cart_reminders', 'price_watch_marks', 'price_drop_notices');

-- PART B — CHANGE
CREATE TABLE IF NOT EXISTS customer_reminder_prefs (
    customer_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    cart TINYINT(1) NOT NULL DEFAULT 1,
    price TINYINT(1) NOT NULL DEFAULT 1,
    token CHAR(40) NOT NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_customer_reminder_prefs_token (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cart_reminders (
    customer_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    cart_updated_at DATETIME NOT NULL,                     -- the cart this count belongs to: a changed cart starts again
    sent_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
    last_sent_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_watch_marks (
    product_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    price DECIMAL(14,2) NOT NULL,
    updated_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_drop_notices (
    customer_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    price_told DECIMAL(14,2) NOT NULL,
    told_at DATETIME NOT NULL,
    PRIMARY KEY (customer_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C — CHECK (expect: 4 tables, all empty)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('customer_reminder_prefs', 'cart_reminders', 'price_watch_marks', 'price_drop_notices');
SELECT (SELECT COUNT(*) FROM customer_reminder_prefs) AS prefs, (SELECT COUNT(*) FROM cart_reminders) AS cart_reminders, (SELECT COUNT(*) FROM price_watch_marks) AS marks, (SELECT COUNT(*) FROM price_drop_notices) AS notices;
