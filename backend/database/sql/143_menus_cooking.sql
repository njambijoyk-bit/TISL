-- =====================================================================
-- 143_menus_cooking.sql
-- Menus module, step 10 (docs/MENUS_PLAN.md section 5): cooking services, first slice = custom cakes (made to order) and catering.
--   menus_dishes.lead_hours   how many hours ahead a made-to-order dish (a cake) must be ordered; empty = an ordinary dish
--   menus_requests            a customer's request for a cake or a catering job: who, when, where, how many, the quote, the deposit and where it stands
--   menus_request_lines       what is quoted: a dish (with its choices) or a free line staff typed, with quantity and price
-- Run 132 to 142 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_requests', 'menus_request_lines');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_dishes' AND column_name = 'lead_hours';

-- PART B - A LEAD TIME ON A DISH
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

CALL add_column_if_missing('menus_dishes', 'lead_hours', 'SMALLINT UNSIGNED NULL AFTER prep_minutes');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C - CREATE
CREATE TABLE IF NOT EXISTS menus_requests (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number           VARCHAR(20) NOT NULL,                       -- CR-000123
    track_token      VARCHAR(40) NOT NULL,                       -- the secret in the customer's link (no sign-in)
    kind             VARCHAR(10) NOT NULL,                       -- cake | catering
    location_id      BIGINT UNSIGNED NOT NULL,                   -- the branch that makes it
    customer_id      BIGINT UNSIGNED NULL,
    user_id          BIGINT UNSIGNED NULL,
    name             VARCHAR(160) NOT NULL,
    email            VARCHAR(190) NULL,
    phone            VARCHAR(40) NOT NULL,
    event_at         DATETIME NOT NULL,                          -- when it must be ready / served
    fulfil           VARCHAR(10) NOT NULL DEFAULT 'pickup',      -- pickup | delivery | serve (served at the venue)
    address          TEXT NULL,                                  -- delivery address or venue
    headcount        SMALLINT UNSIGNED NULL,
    details          JSON NULL,                                  -- cake: message on it; catering: the occasion and wishes
    notes            VARCHAR(1000) NULL,
    status           VARCHAR(12) NOT NULL DEFAULT 'requested',   -- requested | quoted | accepted | confirmed | preparing | ready | completed | declined | expired | cancelled
    quoted_at        DATETIME NULL,
    valid_until      DATE NULL,                                  -- the quote can be accepted up to here
    subtotal         DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_total        DECIMAL(14,2) NOT NULL DEFAULT 0,
    total            DECIMAL(14,2) NOT NULL DEFAULT 0,
    deposit_pct      DECIMAL(5,2) NOT NULL DEFAULT 0,
    deposit_amount   DECIMAL(14,2) NOT NULL DEFAULT 0,
    paid_total       DECIMAL(14,2) NOT NULL DEFAULT 0,           -- what has come in so far (deposit, then balance)
    voucher_id       BIGINT UNSIGNED NULL,                       -- the Sales Order in the books
    invoice_id       BIGINT UNSIGNED NULL,                       -- the invoice it becomes when the quote is accepted (payments are received against it)
    currency_id      BIGINT UNSIGNED NULL,
    accepted_at      DATETIME NULL,
    confirmed_at     DATETIME NULL,                              -- the deposit arrived
    completed_at     DATETIME NULL,
    cancelled_at     DATETIME NULL,
    cancel_reason    VARCHAR(300) NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_menus_requests_token (track_token),
    KEY idx_menus_requests_day (location_id, event_at),
    KEY idx_menus_requests_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_request_lines (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    request_id   BIGINT UNSIGNED NOT NULL,
    dish_id      BIGINT UNSIGNED NULL,                           -- empty = a free line staff typed (hire of equipment, a waiter...)
    name         VARCHAR(200) NOT NULL,
    quantity     DECIMAL(10,2) NOT NULL DEFAULT 1,
    per_head     TINYINT(1) NOT NULL DEFAULT 0,                  -- the quantity follows the headcount
    unit_price   DECIMAL(14,2) NOT NULL DEFAULT 0,
    options      JSON NULL,                                      -- the choices made, copied so later edits never change an old quote
    note         VARCHAR(300) NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_request_lines_req (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART D - CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_requests', 'menus_request_lines');
