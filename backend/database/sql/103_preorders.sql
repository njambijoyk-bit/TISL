-- =====================================================================
-- 103_preorders.sql
-- Preorders (docs/PREORDER_PLAN.md): a campaign sells something before it is here.
--
-- A preorder is an ordinary Sales Order (numbered PRE-00001 from its own series) that becomes a Cash Sale / Invoice WITHOUT taking stock;
-- delivery notes later move the stock. This script adds only what is new:
--   variant_location_stock.preorder_enabled   this branch may take preorders for this variant
--   preorder_offers                           a campaign's offer on one variant: limit, closing date, expected dates, terms
--   preorder_lines                            which offer / promised date each preorder (Sales Order) was taken under
--   voucher series "Preorder" (PRE-)          on the Sales Order type, not the default
-- Safe to run twice. Part A looks, Part B changes, Part C checks.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART A — LOOK FIRST (changes nothing)
-- ---------------------------------------------------------------------
SELECT t.id AS sales_order_type_id, t.name, (SELECT COUNT(*) FROM voucher_series s WHERE s.voucher_type_id = t.id) AS series_count,
       (SELECT s.prefix FROM voucher_series s WHERE s.voucher_type_id = t.id ORDER BY s.is_default DESC, s.id LIMIT 1) AS default_prefix
FROM voucher_types t WHERE t.base_type = 'sales_order' ORDER BY t.id;
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('preorder_offers', 'preorder_lines');

-- ---------------------------------------------------------------------
-- PART B — CHANGE
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_column_if_missing('variant_location_stock', 'preorder_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
DROP PROCEDURE IF EXISTS add_column_if_missing;

CREATE TABLE IF NOT EXISTS preorder_offers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    campaign_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    limit_total INT UNSIGNED NULL,                      -- empty = no limit (all branches together)
    closes_at DATETIME NULL,                            -- empty = until the campaign ends
    expected_from DATE NULL,
    expected_until DATE NULL,
    terms VARCHAR(500) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_preorder_offer (campaign_id, variant_id),
    KEY idx_preorder_offer_variant (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS preorder_lines (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    voucher_id BIGINT UNSIGNED NOT NULL,                -- the Sales Order (PRE-…)
    offer_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    location_id BIGINT UNSIGNED NOT NULL,               -- the branch whose stock fills it
    promised_date DATE NULL,                            -- a snapshot of the offer's expected date at the time
    created_at TIMESTAMP NULL,
    KEY idx_preorder_lines_voucher (voucher_id),
    KEY idx_preorder_lines_offer (offer_id),
    KEY idx_preorder_lines_variant (variant_id, location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- the numbering: PRE-00001, one series for every branch, on the Sales Order type (copies the width and manual rule of its default series)
INSERT INTO voucher_series (voucher_type_id, name, prefix, suffix, number_width, start_number, next_number, reset_period, last_reset_key, location_id, allow_manual, is_default, is_active, created_at, updated_at)
SELECT t.id, 'Preorder', 'PRE-', NULL, COALESCE(ds.number_width, 5), 1, 1, 'never', NULL, NULL, 0, 0, 1, NOW(), NOW()
FROM voucher_types t
LEFT JOIN voucher_series ds ON ds.voucher_type_id = t.id AND ds.is_default = 1
WHERE t.base_type = 'sales_order'
  AND NOT EXISTS (SELECT 1 FROM voucher_series s WHERE s.voucher_type_id = t.id AND s.name = 'Preorder')
ORDER BY t.id
LIMIT 1;

-- ---------------------------------------------------------------------
-- PART C — CHECK THE RESULT
-- ---------------------------------------------------------------------
-- C1. The flag, the two tables and the series are there (expect 1, 2 and 1)
SELECT (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'variant_location_stock' AND column_name = 'preorder_enabled') AS flag_column,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('preorder_offers', 'preorder_lines')) AS tables_made,
       (SELECT COUNT(*) FROM voucher_series WHERE name = 'Preorder' AND prefix = 'PRE-') AS preorder_series;
-- C2. Nothing is switched on yet (expect 0)
SELECT COUNT(*) AS branches_taking_preorders FROM variant_location_stock WHERE preorder_enabled = 1;
