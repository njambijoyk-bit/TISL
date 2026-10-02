-- =====================================================================
-- 62_petty_cash.sql
-- Petty cash. The money is a cash ledger marked "petty" (script 38); topping it up is a Contra from the bank, spending it is a Journal
-- (Dr the expense, Cr petty cash). These two tables hold what the ledger cannot:
--   petty_cash_floats   how much the box should hold (the float) and who looks after it (the custodian)
--   petty_cash_spends   one row per spend: who was paid, what for, which expense, the receipt, and the journal that booked it
-- Run in Workbench. Safe to re-run. It only creates tables, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('petty_cash_floats', 'petty_cash_spends');

-- PART B — CREATE (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS petty_cash_floats (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ledger_id          BIGINT UNSIGNED NOT NULL,
    float_amount       DECIMAL(15,2) NOT NULL DEFAULT 0,
    custodian_user_id  BIGINT UNSIGNED NULL,
    updated_by         BIGINT UNSIGNED NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    UNIQUE KEY petty_float_ledger (ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS petty_cash_spends (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number             VARCHAR(20) NULL,                       -- PCV-000001
    ledger_id          BIGINT UNSIGNED NOT NULL,               -- the petty cash ledger it came out of
    expense_ledger_id  BIGINT UNSIGNED NOT NULL,
    voucher_id         BIGINT UNSIGNED NULL,                   -- the journal that booked it
    spent_on           DATE NOT NULL,
    payee              VARCHAR(120) NOT NULL,
    purpose            VARCHAR(255) NOT NULL,
    amount             DECIMAL(15,2) NOT NULL,
    receipt_path       VARCHAR(255) NULL,
    spent_by           BIGINT UNSIGNED NULL,
    cancelled_at       DATETIME NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    KEY petty_spend_ledger (ledger_id, spent_on),
    KEY petty_spend_voucher (voucher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C — CHECK (expect two rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('petty_cash_floats', 'petty_cash_spends');
