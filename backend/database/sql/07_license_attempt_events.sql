-- =====================================================================
-- 07_license_attempt_events.sql
-- Adds the non-paste events the app logs to license_attempts:
--   ownership_accepted / ownership_rejected  (setup)
--   switched_on / switched_off               (Module Center toggle)
-- Extends the ENUM created in 06; keeps the existing values.
-- Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Confirm the table and the current ENUM definition
SELECT column_type
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'license_attempts'
  AND column_name = 'result';
-- Expect: enum('typo','fake','other_client','already_active','accepted','locked_out')


-- ---------------------------------------------------------------------
-- PART B — WIDEN THE ENUM
-- (DDL, so it commits on its own; no transaction needed.)
-- ---------------------------------------------------------------------

ALTER TABLE license_attempts
    MODIFY COLUMN result ENUM(
        'typo',
        'fake',
        'other_client',
        'already_active',
        'accepted',
        'locked_out',
        'ownership_accepted',
        'ownership_rejected',
        'switched_on',
        'switched_off'
    ) NOT NULL;


-- ---------------------------------------------------------------------
-- PART C — RESULT CHECK
-- ---------------------------------------------------------------------

-- C1. The ENUM now lists all 10 values
SELECT column_type
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'license_attempts'
  AND column_name = 'result';
