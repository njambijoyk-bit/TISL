-- =====================================================================
-- 212_menus_tips.sql
-- Menus tips, build step 6.1 (docs/MENUS_DISHES_PLAN.md section 7): the tips box.
--   menus_tips        one row per tip taken with an order. It is PENDING from the moment the order is paid until a person hands the money over (ISSUED). Tips never expire: they wait in the box.
--                     The row remembers who the tip is from (customer, number, kiosk), who rang it up, who served, which account holds it (tips payable), and, once handed over, to whom, by whom,
--                     when, from which cash or bank account, the journal that did it and the narration. One tip per order (the order's number is unique here).
--   menus_tip_events  the history of a tip: issued, reversed (with the reason and who did it) and issued again. Nothing here is ever edited or deleted.
-- Nothing reads these tables yet: the tip box at payment comes in 6.2, the posting in 6.3, the tips screen in 6.4, the issue window in 6.5, issuing your own tip in 6.6 and reversing in 6.7.
-- Run 136 (orders) and 138 (the till) first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. are the tables there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_tips', 'menus_tip_events');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_tips (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id           BIGINT UNSIGNED NOT NULL,                     -- menus_orders.id
    voucher_id         BIGINT UNSIGNED NULL,                         -- the sale in the books the tip was taken with
    location_id        BIGINT UNSIGNED NULL,
    amount             DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency_id        BIGINT UNSIGNED NULL,                         -- the currency it was taken in (empty: the books' own)
    ledger_id          BIGINT UNSIGNED NULL,                         -- the tips payable account that holds it, as it was then
    payment_method_id  BIGINT UNSIGNED NULL,                         -- how the tip was paid (cash, card, phone)
    customer_name      VARCHAR(160) NULL,                            -- who it is from, as on the order
    short_no           INT UNSIGNED NULL,                            -- the number called out
    kiosk_id           BIGINT UNSIGNED NULL,
    received_by        BIGINT UNSIGNED NULL,                         -- the cashier who took it
    served_by          BIGINT UNSIGNED NULL,                         -- the person who served the guest, when known
    status             VARCHAR(8) NOT NULL DEFAULT 'pending',        -- pending | issued
    issued_at          DATETIME NULL,
    issued_by          BIGINT UNSIGNED NULL,                         -- who handed it over
    issued_to          BIGINT UNSIGNED NULL,                         -- who it was handed to (a user); the same person as issued_by when it is their own
    issued_to_name     VARCHAR(160) NULL,                            -- or a name, for someone who is not a user
    issued_from_ledger_id BIGINT UNSIGNED NULL,                      -- the cash or bank account it was paid out of
    issue_voucher_id   BIGINT UNSIGNED NULL,                         -- the journal that handed it over
    issue_narration    VARCHAR(300) NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    UNIQUE KEY uq_menus_tips_order (order_id),
    KEY idx_menus_tips_status (status, created_at),
    KEY idx_menus_tips_location (location_id),
    KEY idx_menus_tips_issue_voucher (issue_voucher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_tip_events (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tip_id             BIGINT UNSIGNED NOT NULL,
    kind               VARCHAR(10) NOT NULL,                         -- issued | reversed
    amount             DECIMAL(12,2) NOT NULL DEFAULT 0,
    voucher_id         BIGINT UNSIGNED NULL,                         -- the journal made (when issued) or the journal undone (when reversed)
    reversal_voucher_id BIGINT UNSIGNED NULL,                        -- the journal that undid it, when reversed
    to_user_id         BIGINT UNSIGNED NULL,
    to_name            VARCHAR(160) NULL,
    narration          VARCHAR(300) NULL,                            -- the narration when issued, the reason when reversed
    done_by            BIGINT UNSIGNED NULL,
    done_at            DATETIME NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    KEY idx_menus_tip_events_tip (tip_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the tables are there and empty (1 row each, 0)
SELECT (SELECT COUNT(*) FROM menus_tips) AS tips, (SELECT COUNT(*) FROM menus_tip_events) AS tip_events;
