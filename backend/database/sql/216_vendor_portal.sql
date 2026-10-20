-- =====================================================================
-- 216_vendor_portal.sql
-- Vendor portal, tendering and pre-qualification (Extras module).
--   vendor_orders.tender_bid_id    links an awarded tender bid to the vendor order raised from it
--   tenders                        a request for proposal/quotation that vendors bid on
--   tender_documents               attachments on a tender (specs, terms, BOQs)
--   tender_invitations             which vendors may see an 'invited' tender
--   tender_bids                    a vendor's bid on a tender
--   tender_bid_items               line-by-line pricing in a bid
--   tender_bid_documents           supporting documents a vendor attaches to a bid
--   prequalification_templates     what a PQ form asks (staff-configured)
--   prequalifications              a vendor's submission against a template
--   prequalification_documents     typed file uploads on a PQ submission
-- Run 215 first (the vendor order rename). Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. which of the new tables already exist? (0 rows on the first run)
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name IN (
       'tenders', 'tender_documents', 'tender_invitations',
       'tender_bids', 'tender_bid_items', 'tender_bid_documents',
       'prequalification_templates', 'prequalifications', 'prequalification_documents'
   );

-- A2. does vendor_orders.tender_bid_id exist already? (0 rows on first run)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name = 'vendor_orders'
   AND column_name = 'tender_bid_id';

-- PART B - CHANGE

-- B1. Add tender_bid_id to vendor_orders (nullable FK to the bid that was awarded)
DROP PROCEDURE IF EXISTS add_vendor_order_tender_bid;
DELIMITER $$
CREATE PROCEDURE add_vendor_order_tender_bid()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'vendor_orders' AND column_name = 'tender_bid_id') THEN
        ALTER TABLE vendor_orders ADD COLUMN tender_bid_id BIGINT UNSIGNED NULL AFTER metadata;
    END IF;
END$$
DELIMITER ;
CALL add_vendor_order_tender_bid();
DROP PROCEDURE IF EXISTS add_vendor_order_tender_bid;

-- B2. Tenders
CREATE TABLE IF NOT EXISTS tenders (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_number         VARCHAR(20) NOT NULL,
    title                 VARCHAR(255) NOT NULL,
    description           TEXT NULL,
    category              VARCHAR(20) NOT NULL DEFAULT 'goods',          -- goods | services | works
    branch_id             BIGINT UNSIGNED NULL,
    budget_min            DECIMAL(18,2) NULL,
    budget_max            DECIMAL(18,2) NULL,
    currency              CHAR(3) NOT NULL DEFAULT 'KES',
    requirements          JSON NULL,                                     -- [{label, description}]
    evaluation_criteria   JSON NULL,                                     -- [{criterion, weight, description}]
    status                VARCHAR(20) NOT NULL DEFAULT 'draft',          -- draft | published | closed | evaluating | awarded | cancelled
    visibility            VARCHAR(20) NOT NULL DEFAULT 'all_vendors',    -- all_vendors | prequalified | invited
    published_at          DATETIME NULL,
    submission_deadline   DATETIME NULL,
    opening_date          DATETIME NULL,
    created_by            BIGINT UNSIGNED NOT NULL,
    approved_by           BIGINT UNSIGNED NULL,
    awarded_vendor_id     BIGINT UNSIGNED NULL,
    awarded_at            DATETIME NULL,
    metadata              JSON NULL,
    created_at            TIMESTAMP NULL,
    updated_at            TIMESTAMP NULL,
    deleted_at            TIMESTAMP NULL,
    UNIQUE KEY uq_tender_number (tender_number),
    KEY idx_tenders_status (status),
    KEY idx_tenders_category (category),
    KEY idx_tenders_deadline (submission_deadline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B3. Tender documents
CREATE TABLE IF NOT EXISTS tender_documents (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_id         BIGINT UNSIGNED NOT NULL,
    name              VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(100) NULL,
    extension         VARCHAR(10) NULL,
    file_path         VARCHAR(500) NOT NULL,
    file_size         BIGINT UNSIGNED NOT NULL DEFAULT 0,
    document_type     VARCHAR(30) NOT NULL DEFAULT 'other',              -- specification | terms | boq | drawing | other
    uploaded_by       BIGINT UNSIGNED NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_tender_docs_tender (tender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B4. Tender invitations (for visibility = 'invited')
CREATE TABLE IF NOT EXISTS tender_invitations (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_id       BIGINT UNSIGNED NOT NULL,
    vendor_id       BIGINT UNSIGNED NOT NULL,
    invited_by      BIGINT UNSIGNED NULL,
    responded       TINYINT(1) NOT NULL DEFAULT 0,
    declined_reason VARCHAR(500) NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_tender_invitation (tender_id, vendor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B5. Tender bids
CREATE TABLE IF NOT EXISTS tender_bids (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_id            BIGINT UNSIGNED NOT NULL,
    vendor_id            BIGINT UNSIGNED NOT NULL,
    bid_number           VARCHAR(20) NOT NULL,
    total_amount         DECIMAL(18,2) NOT NULL DEFAULT 0,
    currency             CHAR(3) NOT NULL DEFAULT 'KES',
    delivery_timeline_days INT NULL,
    cover_letter         TEXT NULL,
    technical_proposal   TEXT NULL,
    status               VARCHAR(20) NOT NULL DEFAULT 'draft',           -- draft | submitted | withdrawn | under_review | shortlisted | awarded | rejected
    submitted_at         DATETIME NULL,
    evaluation_score     DECIMAL(8,2) NULL,
    evaluation_notes     TEXT NULL,
    metadata             JSON NULL,
    created_at           TIMESTAMP NULL,
    updated_at           TIMESTAMP NULL,
    deleted_at           TIMESTAMP NULL,
    UNIQUE KEY uq_tender_bid (tender_id, vendor_id),
    KEY idx_tender_bids_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B6. Tender bid items (line-by-line pricing)
CREATE TABLE IF NOT EXISTS tender_bid_items (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_bid_id   BIGINT UNSIGNED NOT NULL,
    description     VARCHAR(500) NOT NULL,
    quantity        DECIMAL(18,4) NOT NULL DEFAULT 1,
    unit_price      DECIMAL(18,2) NOT NULL DEFAULT 0,
    line_total      DECIMAL(18,2) NOT NULL DEFAULT 0,
    notes           VARCHAR(500) NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_tender_bid_items_bid (tender_bid_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B7. Tender bid documents
CREATE TABLE IF NOT EXISTS tender_bid_documents (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tender_bid_id     BIGINT UNSIGNED NOT NULL,
    name              VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type         VARCHAR(100) NULL,
    extension         VARCHAR(10) NULL,
    file_path         VARCHAR(500) NOT NULL,
    file_size         BIGINT UNSIGNED NOT NULL DEFAULT 0,
    document_type     VARCHAR(30) NOT NULL DEFAULT 'other',              -- proposal | certificate | reference | sample | other
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_tender_bid_docs_bid (tender_bid_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B8. Pre-qualification templates (staff-configured PQ forms)
CREATE TABLE IF NOT EXISTS prequalification_templates (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(255) NOT NULL,
    category            VARCHAR(20) NOT NULL DEFAULT 'goods',            -- goods | services | works
    description         TEXT NULL,
    sections            JSON NULL,                                       -- [{title, description, fields: [{key, label, type, required, options}]}]
    required_documents  JSON NULL,                                       -- ['tax_compliance', 'registration', ...]
    validity_months     SMALLINT UNSIGNED NOT NULL DEFAULT 12,
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_by          BIGINT UNSIGNED NULL,
    created_at          TIMESTAMP NULL,
    updated_at          TIMESTAMP NULL,
    KEY idx_pq_templates_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B9. Pre-qualifications (a vendor's submission)
CREATE TABLE IF NOT EXISTS prequalifications (
    id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    template_id            BIGINT UNSIGNED NOT NULL,
    vendor_id              BIGINT UNSIGNED NOT NULL,
    pq_number              VARCHAR(20) NOT NULL,
    responses              JSON NULL,                                    -- answers keyed by section.field.key
    status                 VARCHAR(20) NOT NULL DEFAULT 'draft',         -- draft | submitted | under_review | qualified | rejected | expired | suspended
    submitted_at           DATETIME NULL,
    reviewed_by            BIGINT UNSIGNED NULL,
    reviewed_at            DATETIME NULL,
    qualified_at           DATETIME NULL,
    expires_at             DATE NULL,
    score                  DECIMAL(8,2) NULL,
    review_notes           TEXT NULL,
    rejection_reason       TEXT NULL,
    categories_qualified   JSON NULL,                                    -- can qualify for multiple categories
    created_at             TIMESTAMP NULL,
    updated_at             TIMESTAMP NULL,
    deleted_at             TIMESTAMP NULL,
    UNIQUE KEY uq_pq_number (pq_number),
    KEY idx_pq_vendor (vendor_id),
    KEY idx_pq_status (status),
    KEY idx_pq_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- B10. Pre-qualification documents (typed file uploads)
CREATE TABLE IF NOT EXISTS prequalification_documents (
    id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    prequalification_id    BIGINT UNSIGNED NOT NULL,
    document_type          VARCHAR(30) NOT NULL DEFAULT 'other',         -- tax_compliance | registration | insurance | financial_statement | reference_letter | bank_reference | past_work | other
    original_filename      VARCHAR(255) NOT NULL,
    disk                   VARCHAR(20) NOT NULL DEFAULT 'local',
    path                   VARCHAR(500) NOT NULL,
    mime_type              VARCHAR(100) NULL,
    size_bytes             BIGINT UNSIGNED NOT NULL DEFAULT 0,
    verified               TINYINT(1) NOT NULL DEFAULT 0,
    verified_by            BIGINT UNSIGNED NULL,
    verified_at            DATETIME NULL,
    created_at             TIMESTAMP NULL,
    updated_at             TIMESTAMP NULL,
    KEY idx_pq_docs_pq (prequalification_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. all 9 new tables exist
SELECT table_name FROM information_schema.tables
 WHERE table_schema = DATABASE()
   AND table_name IN (
       'tenders', 'tender_documents', 'tender_invitations',
       'tender_bids', 'tender_bid_items', 'tender_bid_documents',
       'prequalification_templates', 'prequalifications', 'prequalification_documents'
   );

-- C2. vendor_orders.tender_bid_id exists (1 row)
SELECT column_name FROM information_schema.columns
 WHERE table_schema = DATABASE()
   AND table_name = 'vendor_orders'
   AND column_name = 'tender_bid_id';

-- C3. nothing in them yet
SELECT
  (SELECT COUNT(*) FROM tenders) AS tenders,
  (SELECT COUNT(*) FROM tender_bids) AS bids,
  (SELECT COUNT(*) FROM prequalification_templates) AS pq_templates,
  (SELECT COUNT(*) FROM prequalifications) AS pq_submissions;
