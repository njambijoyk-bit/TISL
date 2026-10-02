-- =====================================================================
-- 61_bookings.sql
-- Bookings, new and polymorphic: a booking is of "something" (bookable_type + bookable_id — a service now, a room or stay later),
-- for a customer, taking a resource (a staff member, room, table…) for a stretch of time. The money lives in vouchers:
--   order_voucher_id     the Sales Order that records what was booked (service + the fees known up front)
--   upfront_voucher_id   the invoice raised at booking for the deposit and booking fee (the deposit is held as a liability)
--   invoice_voucher_id   the Sales invoice raised when the service is done
--   fee_voucher_id       the invoice for a late cancellation / no-show / late move fee
--   deposit_release_voucher_id   the journal that gives the held deposit to the customer's account
-- Run in Workbench. Safe to re-run. It only creates a table, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'bookings';

-- PART B — CREATE (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS bookings (
    id                         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number                     VARCHAR(20) NULL,
    bookable_type              VARCHAR(40) NOT NULL DEFAULT 'service',
    bookable_id                BIGINT UNSIGNED NOT NULL,
    service_variant_id         BIGINT UNSIGNED NULL,
    customer_id                BIGINT UNSIGNED NOT NULL,
    resource_id                BIGINT UNSIGNED NULL,
    location_id                BIGINT UNSIGNED NULL,
    starts_at                  DATETIME NOT NULL,
    ends_at                    DATETIME NOT NULL,
    people                     INT NOT NULL DEFAULT 1,
    on_site                    TINYINT(1) NOT NULL DEFAULT 0,
    address                    VARCHAR(255) NULL,
    notes                      TEXT NULL,
    status                     VARCHAR(20) NOT NULL DEFAULT 'confirmed',   -- confirmed | completed | cancelled | no_show
    source                     VARCHAR(20) NOT NULL DEFAULT 'admin',       -- admin | portal
    currency_id                BIGINT UNSIGNED NULL,
    price                      DECIMAL(15,2) NOT NULL DEFAULT 0,           -- the service price agreed (before tax and fees)
    fees                       JSON NULL,                                  -- the fees worked out at booking (what, how much, when due)
    deposit_amount             DECIMAL(15,2) NOT NULL DEFAULT 0,
    deposit_ledger_id          BIGINT UNSIGNED NULL,
    deposit_status             VARCHAR(20) NOT NULL DEFAULT 'none',        -- none | held | released
    order_voucher_id           BIGINT UNSIGNED NULL,
    upfront_voucher_id         BIGINT UNSIGNED NULL,
    invoice_voucher_id         BIGINT UNSIGNED NULL,
    fee_voucher_id             BIGINT UNSIGNED NULL,
    deposit_release_voucher_id BIGINT UNSIGNED NULL,
    completed_at               DATETIME NULL,
    cancelled_at               DATETIME NULL,
    cancel_reason              VARCHAR(255) NULL,
    cancelled_late             TINYINT(1) NOT NULL DEFAULT 0,
    moved_count                INT NOT NULL DEFAULT 0,
    created_by                 BIGINT UNSIGNED NULL,
    created_at                 TIMESTAMP NULL,
    updated_at                 TIMESTAMP NULL,
    KEY bookings_customer (customer_id),
    KEY bookings_resource_time (resource_id, starts_at),
    KEY bookings_bookable (bookable_type, bookable_id),
    KEY bookings_status_time (status, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C — CHECK (expect one row: bookings)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'bookings';
