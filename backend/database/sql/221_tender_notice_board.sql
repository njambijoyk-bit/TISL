-- =====================================================================
-- 221_tender_notice_board.sql
-- Tenders as a notice board (Extras): the website publishes tenders and pre-qualification calls and controls who sees them;
-- bidding, evaluation and awards happen offline. This script only ADDS things (script 222 removes the old online-bidding tables).
--   tenders.visibility            gains 'public' (everyone, customers too); the column default becomes 'public'
--   tenders.notice_type           tender | prequalification | expression_of_interest
--   tenders.procuring_entity      who is buying (blank = the company)
--   tenders.reservation_scheme    now one of: youth | women | pwd | sme (blank = open to everyone; shown only when set)
--   tender_lots                   the parts of a tender (A cups, B plates, C spoons), each optionally reserved to one group
--   tender_documents.document_type becomes: tender_document | tender_notice | advertisement | addendum | clarification | award_notice | other
--   vendors.special_group         the vendor's people category: youth | women | pwd | sme (blank = none, not shown) with its certificate and expiry
--   vendor_prequalifications      who is pre-qualified, for which category and until when (recorded by staff from the documents a vendor sent in)
--   tender_mailings               a record of each time a tender or addendum was emailed to vendors
-- Run 216 and 217 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. which of the new columns and tables exist already? (0 rows on the first run)
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND ((table_name = 'tenders' AND column_name IN ('notice_type', 'procuring_entity'))
     OR (table_name = 'vendors' AND column_name IN ('special_group', 'special_group_certificate', 'special_group_valid_until')));
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name IN ('tender_lots', 'vendor_prequalifications', 'tender_mailings');
-- A2. what the old reservation text says today (part B turns it into a code)
SELECT reservation_scheme, COUNT(*) AS tenders FROM tenders GROUP BY reservation_scheme;
SELECT document_type, COUNT(*) AS documents FROM tender_documents GROUP BY document_type;

-- PART B - CHANGE
-- B1. new columns on tenders and vendors
DROP PROCEDURE IF EXISTS add_tender_notice_board_columns;
DELIMITER $$
CREATE PROCEDURE add_tender_notice_board_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'notice_type') THEN
        ALTER TABLE tenders ADD COLUMN notice_type VARCHAR(30) NOT NULL DEFAULT 'tender' AFTER tender_number;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'tenders' AND column_name = 'procuring_entity') THEN
        ALTER TABLE tenders ADD COLUMN procuring_entity VARCHAR(255) NULL AFTER notice_type;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'special_group') THEN
        ALTER TABLE vendors ADD COLUMN special_group VARCHAR(20) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'special_group_certificate') THEN
        ALTER TABLE vendors ADD COLUMN special_group_certificate VARCHAR(100) NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendors' AND column_name = 'special_group_valid_until') THEN
        ALTER TABLE vendors ADD COLUMN special_group_valid_until DATE NULL;
    END IF;
END$$
DELIMITER ;
CALL add_tender_notice_board_columns();
DROP PROCEDURE IF EXISTS add_tender_notice_board_columns;

-- B2. a new tender is Public unless the form says otherwise (existing tenders keep their setting)
ALTER TABLE tenders ALTER COLUMN visibility SET DEFAULT 'public';

-- B3. the old free-text reservation becomes a code (anything not recognised becomes blank = open to everyone)
UPDATE tenders SET reservation_scheme = CASE
    WHEN reservation_scheme IS NULL OR TRIM(reservation_scheme) = '' THEN NULL
    WHEN LOWER(reservation_scheme) LIKE '%youth%' THEN 'youth'
    WHEN LOWER(reservation_scheme) LIKE '%women%' THEN 'women'
    WHEN LOWER(reservation_scheme) LIKE '%pwd%' OR LOWER(reservation_scheme) LIKE '%disab%' THEN 'pwd'
    WHEN LOWER(reservation_scheme) LIKE '%sme%' OR LOWER(reservation_scheme) LIKE '%small%' THEN 'sme'
    ELSE NULL END
 WHERE reservation_scheme IS NOT NULL AND reservation_scheme NOT IN ('youth', 'women', 'pwd', 'sme');

-- B4. old document types become the new ones
UPDATE tender_documents SET document_type = 'tender_document' WHERE document_type IN ('specification', 'terms', 'boq', 'drawing');

-- B5. lots
CREATE TABLE IF NOT EXISTS tender_lots (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_id          BIGINT UNSIGNED NOT NULL,
    code               VARCHAR(10) NOT NULL,                              -- A, B, C or 1, 2, 3
    title              VARCHAR(255) NOT NULL,
    description        TEXT NULL,
    reservation_group  VARCHAR(20) NULL,                                  -- youth | women | pwd | sme; blank = open to everyone
    sort_order         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    UNIQUE KEY uq_tender_lot_code (tender_id, code),
    KEY idx_tender_lots_group (reservation_group)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B6. pre-qualification as staff record it
CREATE TABLE IF NOT EXISTS vendor_prequalifications (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    vendor_id       BIGINT UNSIGNED NOT NULL,
    category        VARCHAR(20) NOT NULL DEFAULT 'goods',                 -- goods | services | works
    status          VARCHAR(20) NOT NULL DEFAULT 'qualified',             -- qualified | refused | revoked
    qualified_from  DATE NULL,
    valid_until     DATE NULL,
    reason          TEXT NOT NULL,                                        -- why it was approved, refused or revoked (always written)
    notes           TEXT NULL,
    recorded_by     BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_vendor_pq_vendor (vendor_id),
    KEY idx_vendor_pq_valid (status, valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B7. each time a tender or addendum is emailed to vendors
CREATE TABLE IF NOT EXISTS tender_mailings (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_id        BIGINT UNSIGNED NOT NULL,
    kind             VARCHAR(20) NOT NULL DEFAULT 'notice',               -- notice | addendum
    note             VARCHAR(255) NULL,
    recipient_count  INT UNSIGNED NOT NULL DEFAULT 0,
    sent_by          BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_tender_mailings_tender (tender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - RESULT CHECK. Expect the 5 new columns, the 3 new tables, and reservation codes only youth / women / pwd / sme / blank.
SELECT table_name, column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND ((table_name = 'tenders' AND column_name IN ('notice_type', 'procuring_entity'))
     OR (table_name = 'vendors' AND column_name IN ('special_group', 'special_group_certificate', 'special_group_valid_until')));
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE() AND table_name IN ('tender_lots', 'vendor_prequalifications', 'tender_mailings');
SELECT reservation_scheme, COUNT(*) AS tenders FROM tenders GROUP BY reservation_scheme;
SELECT document_type, COUNT(*) AS documents FROM tender_documents GROUP BY document_type;
