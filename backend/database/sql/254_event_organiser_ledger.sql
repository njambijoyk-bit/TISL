-- 254: what TISL owes each outside organiser (events phase 1: ticket money is collected by TISL and paid out).
-- One row per movement: a ticket sold (owed goes up by the organiser's share), a ticket refunded (down), a payout (down), an adjustment.
-- The books hold the matching journal (voucher_id): Dr the event's income account / Cr "owed to organisers". Safe to run twice.

CREATE TABLE IF NOT EXISTS event_organiser_ledger (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    organiser_id  BIGINT UNSIGNED NOT NULL,
    event_id      BIGINT UNSIGNED NULL,
    ticket_id     BIGINT UNSIGNED NULL,
    kind          VARCHAR(12) NOT NULL,                     -- sale | refund | payout | adjustment
    gross         DECIMAL(14,2) NOT NULL DEFAULT 0,         -- what the buyer paid for the ticket (sale / refund rows)
    commission_percent DECIMAL(5,2) NULL,                   -- the rate in force when it was sold
    commission    DECIMAL(14,2) NOT NULL DEFAULT 0,         -- what TISL keeps
    amount        DECIMAL(14,2) NOT NULL,                   -- the change in what is owed to the organiser (+ owed, - paid or given back)
    voucher_id    BIGINT UNSIGNED NULL,                     -- the journal in Books; empty until it could be posted
    reference     VARCHAR(120) NULL,                        -- payout reference (bank or M-Pesa code)
    note          VARCHAR(300) NULL,
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_eol_ticket_kind (ticket_id, kind),
    KEY idx_eol_org (organiser_id, created_at),
    KEY idx_eol_unposted (voucher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- C1. Expect 1 row.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'event_organiser_ledger';
