-- =====================================================================
-- 159_courses_certificates.sql
-- Courses module, step 8 (docs/COURSES_PLAN.md): certificates.
--   course_certificates       one certificate for a student who completed an offering: a number (CERT-2026-000123), a private reference that the signed QR holds,
--                             the name and course as they were on the day, when it expires (if it does), and whether it was revoked
--   course_offerings.cert_valid_months   how long a certificate stays valid (empty = for ever); renewal makes a new certificate
-- A certificate is issued when an enrolment is completed (all lessons done, attendance met, fees paid) on an offering with "Gives a certificate" ticked.
-- Run 132 to 158 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'course_certificates';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS course_certificates (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number           VARCHAR(24) NOT NULL,                          -- CERT-2026-000123
    ref              VARCHAR(16) NOT NULL,                          -- private reference inside the signed QR
    offering_id      BIGINT UNSIGNED NOT NULL,
    enrolment_id     BIGINT UNSIGNED NULL,
    user_id          BIGINT UNSIGNED NOT NULL,
    holder_name      VARCHAR(160) NOT NULL,
    course_title     VARCHAR(200) NOT NULL,
    issued_at        DATETIME NOT NULL,
    expires_at       DATETIME NULL,
    status           VARCHAR(10) NOT NULL DEFAULT 'issued',         -- issued | revoked
    revoked_at       DATETIME NULL,
    revoked_reason   VARCHAR(300) NULL,
    revoked_by       BIGINT UNSIGNED NULL,
    renewed_from_id  BIGINT UNSIGNED NULL,
    issued_by        BIGINT UNSIGNED NULL,                          -- empty = issued automatically on completion
    note             VARCHAR(300) NULL,
    reminded_at      DATETIME NULL,                                 -- the expiry reminder was sent
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    UNIQUE KEY uq_course_certificates_number (number),
    UNIQUE KEY uq_course_certificates_ref (ref),
    KEY idx_course_certificates_user (user_id),
    KEY idx_course_certificates_offering (offering_id),
    KEY idx_course_certificates_enrolment (enrolment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_course_cert_columns;
DELIMITER $$
CREATE PROCEDURE add_course_cert_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'course_offerings' AND column_name = 'cert_valid_months') THEN
        ALTER TABLE course_offerings ADD COLUMN cert_valid_months SMALLINT UNSIGNED NULL;
    END IF;
END$$
DELIMITER ;
CALL add_course_cert_columns();
DROP PROCEDURE IF EXISTS add_course_cert_columns;

-- PART C - VERIFY
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'course_certificates';
