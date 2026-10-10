-- =====================================================================
-- 119_codes.sql
-- Codes (core): QR codes and barcodes, the Codes page.
--   code_settings      one row: the company's choices (internal code prefix, kinds, label defaults)
--   code_sequences     counters that hand out internal codes (never reused)
--   code_aliases       codes an item used to have: old labels still scan and are found, marked as retired
--   code_prints        a log of every label print (who, how many, what)
--   product_variant_units.barcode   a code for a pack / carton of a variant (a scan of it can receive or sell N units)
-- Safe to re-run: every step is skipped if already done. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (which of the new things exist now)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('code_settings', 'code_sequences', 'code_aliases', 'code_prints');
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'product_variant_units' AND column_name = 'barcode';

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS code_settings (
    id          TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    settings    JSON NULL,
    updated_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS code_sequences (
    name        VARCHAR(40) NOT NULL PRIMARY KEY,
    next_value  BIGINT UNSIGNED NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS code_aliases (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    item_type   VARCHAR(20) NOT NULL,
    item_id     BIGINT UNSIGNED NOT NULL,
    code        VARCHAR(80) NOT NULL,
    reason      VARCHAR(200) NULL,
    retired_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_code_aliases_code (code),
    KEY idx_code_aliases_item (item_type, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS code_prints (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT UNSIGNED NULL,
    template     VARCHAR(40) NULL,
    size         VARCHAR(40) NULL,
    label_count  INT UNSIGNED NOT NULL DEFAULT 0,
    items        JSON NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_code_prints_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS codes_pack_barcode;
DELIMITER $$
CREATE PROCEDURE codes_pack_barcode()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'product_variant_units' AND column_name = 'barcode') THEN
        ALTER TABLE product_variant_units ADD COLUMN barcode VARCHAR(64) NULL, ADD INDEX idx_pvu_barcode (barcode);
    END IF;
END$$
DELIMITER ;
CALL codes_pack_barcode();
DROP PROCEDURE IF EXISTS codes_pack_barcode;

-- PART C - CHECK (expect 4 tables and 1 column)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('code_settings', 'code_sequences', 'code_aliases', 'code_prints');
SELECT table_name, column_name, column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'product_variant_units' AND column_name = 'barcode';
