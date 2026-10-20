-- =====================================================================
-- 223  Addenda, awards and pre-qualification checks (Extras module, tenders as a notice board, Phases 2 and 3)
--   tender_addenda                  Addendum 1, 2...: a title, a note, an optional new closing date, and its files
--   tender_documents.addendum_id    which addendum a file belongs to
--   tenders.show_award              whether the winners are shown on the public page once awarded
--   tender_awards                   who won what (per lot, or the whole tender), recorded after the offline decision
--   vendor_prequalifications.machine_flags   what the system could prove was wrong when the record was made (JSON text)
--   vendor_prequalifications.reminded_at     when the 30-day expiry reminder was sent
-- Run 221 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND ((table_name = 'tender_documents' AND column_name = 'addendum_id')
     OR (table_name = 'tenders' AND column_name = 'show_award')
     OR (table_name = 'vendor_prequalifications' AND column_name IN ('machine_flags', 'reminded_at')));
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name IN ('tender_addenda', 'tender_awards');

-- PART B - CHANGE
-- B1. new columns
DROP PROCEDURE IF EXISTS add_tender_phase2_columns;
DELIMITER $$
CREATE PROCEDURE add_tender_phase2_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tender_documents' AND column_name = 'addendum_id') THEN
        ALTER TABLE tender_documents ADD COLUMN addendum_id BIGINT UNSIGNED NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'show_award') THEN
        ALTER TABLE tenders ADD COLUMN show_award TINYINT(1) NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendor_prequalifications' AND column_name = 'machine_flags') THEN
        ALTER TABLE vendor_prequalifications ADD COLUMN machine_flags TEXT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendor_prequalifications' AND column_name = 'reminded_at') THEN
        ALTER TABLE vendor_prequalifications ADD COLUMN reminded_at DATETIME NULL;
    END IF;
END$$
DELIMITER ;
CALL add_tender_phase2_columns();
DROP PROCEDURE IF EXISTS add_tender_phase2_columns;

-- B2. addenda
CREATE TABLE IF NOT EXISTS tender_addenda (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_id         BIGINT UNSIGNED NOT NULL,
    number            INT UNSIGNED NOT NULL,
    title             VARCHAR(255) NOT NULL,
    note              TEXT NULL,
    previous_deadline DATETIME NULL,
    new_deadline      DATETIME NULL,
    created_by        BIGINT UNSIGNED NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    UNIQUE KEY uq_tender_addenda_number (tender_id, number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B3. awards (a lot_code of NULL = the whole tender)
CREATE TABLE IF NOT EXISTS tender_awards (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_id     BIGINT UNSIGNED NOT NULL,
    lot_code      VARCHAR(10) NULL,
    vendor_id     BIGINT UNSIGNED NULL,
    winner_name   VARCHAR(255) NOT NULL,
    amount        DECIMAL(15,2) NULL,
    currency      VARCHAR(3) NOT NULL DEFAULT 'KES',
    awarded_on    DATE NULL,
    notes         VARCHAR(255) NULL,
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_tender_awards_tender (tender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - RESULT CHECK. Expect 4 columns and 2 tables.
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND ((table_name = 'tender_documents' AND column_name = 'addendum_id')
     OR (table_name = 'tenders' AND column_name = 'show_award')
     OR (table_name = 'vendor_prequalifications' AND column_name IN ('machine_flags', 'reminded_at')));
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name IN ('tender_addenda', 'tender_awards');
