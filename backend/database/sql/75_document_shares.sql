-- =====================================================================
-- 75_document_shares.sql
-- A record of every customer document sent from Books: by e-mail or opened in WhatsApp,
-- by whom, to whom, when, and whether it went. The Books > Mail tab reads it.
-- Run in Workbench. Safe to re-run: it only creates the table if it is missing.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Run first, on its own.
-- (1 row = the table exists already, nothing more to do; 0 rows = run part B)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'document_shares';

-- PART B - CHANGE (creates a table, commits on its own)
CREATE TABLE IF NOT EXISTS document_shares (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    voucher_id BIGINT UNSIGNED NOT NULL,
    channel VARCHAR(20) NOT NULL,                 -- email | whatsapp
    to_address VARCHAR(190) NULL,                 -- the e-mail address or phone number it went to
    subject VARCHAR(255) NULL,
    note TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'sent',   -- sent | failed | opened (a WhatsApp chat was opened)
    error VARCHAR(500) NULL,
    sent_by BIGINT UNSIGNED NULL,                 -- the staff user
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_document_shares_voucher (voucher_id),
    INDEX idx_document_shares_created (created_at)
);

-- PART C - RESULT CHECK. Expect 1 row from the first query and 0 rows here until something is sent.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'document_shares';
SELECT COUNT(*) AS shares FROM document_shares;
