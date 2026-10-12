-- =====================================================================
-- 153_courses_fees.sql
-- Courses module, step 2 (docs/COURSES_PLAN.md): fees and enrolment through the books.
--   course_fees              the fee lines of an offering: registration, tuition, materials, exam, certificate, late, other. Each names the sales account it is booked under (the account decides the tax)
--   course_enrolments        a student enrolled in an offering: who pays, the Sales Order and invoice in the books, what has been paid, and whether access is on
--   course_enrolment_lines   what was charged (a copy of the fee lines at the time, so later changes to fees never rewrite an old invoice)
--   course_instalments       the payment schedule: a deposit and/or instalments, each with a due date; receipts against the invoice are allocated to them in order
--   course_offerings gets: deposit_pct, instalments, instalment_days, grant_on, grace_days, refund_days, capacity
-- Courses holds no money of its own: totals and receipts live in vouchers and ledgers; the enrolment keeps only ids and a copy of what was paid.
-- Run 132 to 152 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_fees', 'course_enrolments', 'course_enrolment_lines', 'course_instalments');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name IN ('deposit_pct', 'instalments', 'instalment_days', 'grant_on', 'grace_days', 'refund_days', 'capacity');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS course_fees (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    offering_id      BIGINT UNSIGNED NOT NULL,
    kind             VARCHAR(12) NOT NULL DEFAULT 'tuition',      -- registration | tuition | materials | exam | certificate | late | other
    name             VARCHAR(120) NOT NULL,
    ledger_id        BIGINT UNSIGNED NOT NULL,                    -- the sales account it is booked under (it decides the tax)
    amount           DECIMAL(12,2) NOT NULL DEFAULT 0,
    is_optional      TINYINT(1) NOT NULL DEFAULT 0,               -- the student chooses it (a kit, an exam)
    once_per_student TINYINT(1) NOT NULL DEFAULT 0,               -- charged on the first enrolment only (a registration fee)
    refundable       TINYINT(1) NOT NULL DEFAULT 1,
    is_active        TINYINT(1) NOT NULL DEFAULT 1,
    sort_order       INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_course_fees_offering (offering_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_enrolments (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number           VARCHAR(20) NOT NULL,                        -- EN-000123
    offering_id      BIGINT UNSIGNED NOT NULL,
    student_user_id  BIGINT UNSIGNED NOT NULL,
    payer_user_id    BIGINT UNSIGNED NULL,                        -- who is invoiced when it is not the student (a parent, an employer)
    customer_id      BIGINT UNSIGNED NULL,                        -- the customer account the invoice is on
    status           VARCHAR(10) NOT NULL DEFAULT 'pending',      -- pending (waiting for the first payment) | active | completed | cancelled | refunded
    channel          VARCHAR(8) NOT NULL DEFAULT 'online',        -- counter | online
    voucher_id       BIGINT UNSIGNED NULL,                        -- the Sales Order
    invoice_id       BIGINT UNSIGNED NULL,                        -- the invoice
    credit_note_id   BIGINT UNSIGNED NULL,                        -- the credit note of a refund
    total            DECIMAL(14,2) NOT NULL DEFAULT 0,            -- the invoice total, tax included
    paid_total       DECIMAL(14,2) NOT NULL DEFAULT 0,
    discount_pct     DECIMAL(5,2) NOT NULL DEFAULT 0,
    discount_note    VARCHAR(200) NULL,
    access_paused    TINYINT(1) NOT NULL DEFAULT 0,               -- an instalment is overdue: access is held back until it is paid
    expires_at       DATETIME NULL,                               -- an unpaid enrolment lets the place go at this time
    activated_at     DATETIME NULL,
    cancelled_at     DATETIME NULL,
    cancel_reason    VARCHAR(300) NULL,
    refunded_at      DATETIME NULL,
    created_by       BIGINT UNSIGNED NULL,
    notes            VARCHAR(500) NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_course_enrolments_number (number),
    KEY idx_course_enrolments_offering (offering_id, status),
    KEY idx_course_enrolments_student (student_user_id),
    KEY idx_course_enrolments_invoice (invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_enrolment_lines (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    enrolment_id     BIGINT UNSIGNED NOT NULL,
    fee_id           BIGINT UNSIGNED NULL,
    kind             VARCHAR(12) NOT NULL,
    name             VARCHAR(120) NOT NULL,
    ledger_id        BIGINT UNSIGNED NOT NULL,
    amount           DECIMAL(12,2) NOT NULL DEFAULT 0,
    once_per_student TINYINT(1) NOT NULL DEFAULT 0,
    refundable       TINYINT(1) NOT NULL DEFAULT 1,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_course_enrolment_lines (enrolment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS course_instalments (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    enrolment_id     BIGINT UNSIGNED NOT NULL,
    seq              TINYINT UNSIGNED NOT NULL,
    label            VARCHAR(60) NOT NULL,                        -- Deposit, Instalment 2 of 3, Payment
    due_date         DATE NOT NULL,
    amount           DECIMAL(14,2) NOT NULL,
    paid_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
    reminded_at      DATETIME NULL,
    lapsed_told_at   DATETIME NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_course_instalments (enrolment_id, seq),
    KEY idx_course_instalments_due (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_course_fee_columns;
DELIMITER $$
CREATE PROCEDURE add_course_fee_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'deposit_pct') THEN
        ALTER TABLE course_offerings ADD COLUMN deposit_pct DECIMAL(5,2) NULL;                                  -- share of the total paid to hold the place
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'instalments') THEN
        ALTER TABLE course_offerings ADD COLUMN instalments TINYINT UNSIGNED NULL;                              -- the balance is split into this many payments
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'instalment_days') THEN
        ALTER TABLE course_offerings ADD COLUMN instalment_days SMALLINT UNSIGNED NOT NULL DEFAULT 30;         -- days between payments
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'grant_on') THEN
        ALTER TABLE course_offerings ADD COLUMN grant_on VARCHAR(8) NOT NULL DEFAULT 'paid';                    -- access begins when 'paid' in full or at the 'deposit'
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'grace_days') THEN
        ALTER TABLE course_offerings ADD COLUMN grace_days TINYINT UNSIGNED NOT NULL DEFAULT 7;                -- days an instalment may be late before access is held back
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'refund_days') THEN
        ALTER TABLE course_offerings ADD COLUMN refund_days SMALLINT UNSIGNED NULL;                             -- a refund is open this many days after enrolling (empty = always open to staff)
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'capacity') THEN
        ALTER TABLE course_offerings ADD COLUMN capacity SMALLINT UNSIGNED NULL;                                -- the most students (empty = no limit)
    END IF;
END$$
DELIMITER ;
CALL add_course_fee_columns();
DROP PROCEDURE IF EXISTS add_course_fee_columns;

-- PART C - CHECK. Expect four tables and seven columns.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('course_fees', 'course_enrolments', 'course_enrolment_lines', 'course_instalments');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name IN ('deposit_pct', 'instalments', 'instalment_days', 'grant_on', 'grace_days', 'refund_days', 'capacity');
