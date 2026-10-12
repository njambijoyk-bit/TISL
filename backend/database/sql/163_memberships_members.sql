-- =====================================================================
-- 163_memberships_members.sql
-- Memberships module, step 2 (docs/MEMBERSHIPS_PLAN.md): joining and billing.
--   memberships          a person (the member) holding a plan, optionally paid for by someone else (the payer); paid_until is how far the money has covered
--   membership_periods   every invoice: the joining fee with the first period, each renewal, an upgrade; the Sales Order / invoice ids point at the books
--   membership_events    a log of what happened to a membership and who did it
-- Money is in the books (Sales Order, invoice, receipts, credit notes); these tables keep only ids and a copy of the amounts.
-- Run 132 to 162 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('memberships', 'membership_periods', 'membership_events');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS memberships (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number            VARCHAR(20) NOT NULL,                        -- MB-000123
    plan_id           BIGINT UNSIGNED NOT NULL,
    member_user_id    BIGINT UNSIGNED NOT NULL,
    payer_user_id     BIGINT UNSIGNED NULL,                        -- empty = the member pays
    customer_id       BIGINT UNSIGNED NULL,                        -- the payer's customer account
    status            VARCHAR(10) NOT NULL DEFAULT 'pending',      -- pending | trial | active | past_due | paused | lapsed | cancelled | ended
    billing           VARCHAR(8) NOT NULL DEFAULT 'invoice',       -- invoice | none (given by staff without billing)
    channel           VARCHAR(8) NOT NULL DEFAULT 'online',        -- counter | online
    started_on        DATE NULL,
    trial_ends_on     DATE NULL,
    period_from       DATE NULL,                                   -- the start of the period paid for now
    paid_until        DATE NULL,                                   -- covered up to (not including) this day
    cancel_at_end     TINYINT(1) NOT NULL DEFAULT 0,
    cancelled_at      DATETIME NULL,
    cancel_reason     VARCHAR(300) NULL,
    paused_from       DATE NULL,
    paused_until      DATE NULL,
    pause_days_used   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    pause_year        SMALLINT UNSIGNED NULL,
    change_to_plan_id BIGINT UNSIGNED NULL,                        -- a downgrade waiting for the next renewal
    expires_at        DATETIME NULL,                               -- an unpaid new membership lets go at this time
    notes             VARCHAR(500) NULL,
    created_by        BIGINT UNSIGNED NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    UNIQUE KEY uq_memberships_number (number),
    KEY idx_memberships_member (member_user_id, status),
    KEY idx_memberships_plan (plan_id, status),
    KEY idx_memberships_paid_until (status, paid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS membership_periods (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    membership_id      BIGINT UNSIGNED NOT NULL,
    seq                SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    kind               VARCHAR(8) NOT NULL DEFAULT 'period',       -- first (joining fee and first period) | joining | period | upgrade
    label              VARCHAR(160) NOT NULL,
    plan_id            BIGINT UNSIGNED NOT NULL,                   -- the plan this was billed under
    period_from        DATE NULL,
    period_to          DATE NULL,                                  -- not including
    due_date           DATE NULL,
    amount             DECIMAL(14,2) NOT NULL DEFAULT 0,           -- the invoice total, tax included
    paid_amount        DECIMAL(14,2) NOT NULL DEFAULT 0,
    status             VARCHAR(8) NOT NULL DEFAULT 'open',         -- open | paid | void | refunded
    voucher_id         BIGINT UNSIGNED NULL,
    invoice_id         BIGINT UNSIGNED NULL,
    credit_note_id     BIGINT UNSIGNED NULL,
    invoiced_at        DATETIME NULL,
    paid_at            DATETIME NULL,
    reminded_before_at DATETIME NULL,
    reminded_after_at  DATETIME NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    KEY idx_membership_periods_membership (membership_id, seq),
    KEY idx_membership_periods_invoice (invoice_id),
    KEY idx_membership_periods_open (status, due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS membership_events (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    membership_id  BIGINT UNSIGNED NOT NULL,
    type           VARCHAR(24) NOT NULL,
    note           VARCHAR(300) NULL,
    by_user_id     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    KEY idx_membership_events_membership (membership_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK. Expect three tables.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('memberships', 'membership_periods', 'membership_events');
