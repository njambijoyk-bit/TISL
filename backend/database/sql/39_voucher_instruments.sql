-- =====================================================================
-- 39_voucher_instruments.sql
-- How money moved through a bank: the transfer reference or cheque (number, date, the other
-- party's bank) on a receipt or payment, and the deposit / withdrawal slip on a contra.
-- One row per voucher. A cheque carries a status the cheque register (next step) works with:
--   received -> deposited -> cleared | bounced     (cheques we receive)
--   issued   -> cleared | cancelled | stale        (cheques we write)
-- Transfers, mobile money, card and slips are cleared at once. A cancelled voucher's row is cancelled.
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Does the table exist already? (expect 0 rows on first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'voucher_instruments';

-- A2. The tables it points at (expect 2 rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('vouchers', 'ledgers');

-- PART B — CREATE (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS voucher_instruments (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    voucher_id       BIGINT UNSIGNED NOT NULL,
    ledger_id        BIGINT UNSIGNED NOT NULL,              -- the bank ledger the money went through
    direction        VARCHAR(3)  NOT NULL,                  -- in | out
    type             VARCHAR(14) NOT NULL,                  -- eft | transfer | cheque | mobile | card | deposit_slip | withdrawal
    number           VARCHAR(60) NULL,                      -- cheque no., transfer reference, slip no.
    instrument_date  DATE        NULL,                      -- cheque date (may be after the voucher: post-dated) or slip date
    bank_name        VARCHAR(80) NULL,                      -- the other party's bank
    deposited_by     VARCHAR(80) NULL,                      -- on a deposit slip
    reference        VARCHAR(120) NULL,
    amount           DECIMAL(18,2) NOT NULL DEFAULT 0,
    status           VARCHAR(10) NOT NULL DEFAULT 'cleared',-- received | deposited | cleared | bounced | issued | cancelled | stale
    status_at        DATETIME    NULL,
    created_at       DATETIME    NULL,
    updated_at       DATETIME    NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_instrument_voucher (voucher_id),
    KEY idx_instrument_cheque (type, number),
    KEY idx_instrument_status (status, instrument_date),
    KEY idx_instrument_ledger (ledger_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- PART C — RESULT CHECK. Expect 1 row for the table and 15 columns.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'voucher_instruments';
SELECT COUNT(*) AS columns_found FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voucher_instruments';
