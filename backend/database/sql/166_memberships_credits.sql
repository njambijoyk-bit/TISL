-- =====================================================================
-- 166_memberships_credits.sql
-- Memberships step 5 (docs/MEMBERSHIPS_PLAN.md): credits (class passes).
--   membership_credits           the ledger: credits granted to a member, spent, expired, given back or adjusted by staff
--   course_offerings.credit_cost  what an offering costs in credits (empty = it cannot be taken with credits)
--   course_enrolments.credits_spent  credits an enrolment was paid with (they are given back if it is cancelled)
-- A plan gives credits with the "Credits" benefit: a number each paid period, which either expire at the end of that period or roll over.
-- Run 153 and 163 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'membership_credits';
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'course_offerings' AND column_name = 'credit_cost') OR (table_name = 'course_enrolments' AND column_name = 'credits_spent'));

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS membership_credits (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    membership_id  BIGINT UNSIGNED NULL,
    user_id        BIGINT UNSIGNED NOT NULL,
    kind           VARCHAR(8) NOT NULL,                              -- grant | spend | expire | refund | adjust
    delta          INT NOT NULL,                                     -- + into the balance, - out of it
    remaining      INT NULL,                                         -- on a grant: how many are still unspent
    expires_at     DATETIME NULL,                                    -- on a grant: when what is left expires (empty = never)
    period_key     VARCHAR(60) NULL,                                 -- a plan's grant for one paid period is made once
    allocations    JSON NULL,                                        -- on a spend: which grants it came out of
    source_type    VARCHAR(30) NULL,                                 -- what it was spent on (course_enrolment)
    source_id      BIGINT UNSIGNED NULL,
    note           VARCHAR(200) NULL,
    by_user_id     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    KEY idx_membership_credits_user (user_id, kind, expires_at),
    KEY idx_membership_credits_membership (membership_id, period_key),
    KEY idx_membership_credits_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_credit_columns;
DELIMITER $$
CREATE PROCEDURE add_credit_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'credit_cost') THEN
        ALTER TABLE course_offerings ADD COLUMN credit_cost SMALLINT UNSIGNED NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_enrolments' AND column_name = 'credits_spent') THEN
        ALTER TABLE course_enrolments ADD COLUMN credits_spent SMALLINT UNSIGNED NULL;
    END IF;
END$$
DELIMITER ;
CALL add_credit_columns();
DROP PROCEDURE IF EXISTS add_credit_columns;

-- PART C - CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'membership_credits';
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND ((table_name = 'course_offerings' AND column_name = 'credit_cost') OR (table_name = 'course_enrolments' AND column_name = 'credits_spent'));
