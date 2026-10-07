-- =====================================================================
-- 93_pricelists_brochures.sql
-- E-commerce: price lists (products and services), brochures / catalogues, and their settings.
--   products.brochure_meta        JSON: this product's own brochure choices (the ONLY change to the products table)
--   brochure_item_meta            the same choices for services, hampers and auctions (one row per item)
--   price_lists                   a dated list: draft -> waiting for activation -> published, with an Active-from date
--   price_list_items              the frozen priced lines of a list (later price changes never alter it)
--   price_list_archives           zips (PDF + CSV + JSON) of lists that were taken off the server
--   brochures                     a brochure (one item) or catalogue (several); its ordered entries are one JSON column
--   catalogue_settings            one row: the most price lists kept, the earlier-price rule, customer switches, section defaults per item type
-- Nothing existing is changed apart from the one products column. Safe to re-run: every step is skipped if already done.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Lists what already exists (7 rows once everything is in place; fewer = run part B).
SELECT 'products.brochure_meta' AS thing FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'brochure_meta'
UNION ALL
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('brochure_item_meta', 'price_lists', 'price_list_items', 'price_list_archives', 'brochures', 'catalogue_settings');

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS pricelist_product_column;
DELIMITER $$
CREATE PROCEDURE pricelist_product_column()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'brochure_meta') THEN
        ALTER TABLE products ADD COLUMN brochure_meta JSON NULL;
    END IF;
END$$
DELIMITER ;
CALL pricelist_product_column();
DROP PROCEDURE IF EXISTS pricelist_product_column;

CREATE TABLE IF NOT EXISTS brochure_item_meta (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    item_type VARCHAR(20) NOT NULL,                  -- service | hamper | auction
    item_id BIGINT UNSIGNED NOT NULL,
    meta JSON NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_brochure_item_meta (item_type, item_id)
);

CREATE TABLE IF NOT EXISTS price_lists (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    description VARCHAR(500) NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'draft',            -- draft | pending | published
    active_from DATETIME NULL,                              -- a published list shows to customers from this moment (NULL = at once)
    access VARCHAR(12) NOT NULL DEFAULT 'staff',            -- staff | everyone | customers | types
    customer_types JSON NULL,                               -- slugs from customer_type_discounts, when access = types
    earlier_price VARCHAR(12) NOT NULL DEFAULT 'discounts', -- discounts | both | never
    as_at DATETIME NOT NULL,                                -- when the prices were taken
    picks JSON NULL,                                        -- how the items were chosen (for editing the picks later)
    item_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    submitted_at DATETIME NULL,
    published_by BIGINT UNSIGNED NULL,
    published_at DATETIME NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_price_lists_status (status, deleted_at)
);

CREATE TABLE IF NOT EXISTS price_list_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    price_list_id BIGINT UNSIGNED NOT NULL,
    position INT UNSIGNED NOT NULL DEFAULT 0,
    item_type VARCHAR(12) NOT NULL,                         -- product | service
    item_id BIGINT UNSIGNED NOT NULL,
    code VARCHAR(80) NULL,
    name VARCHAR(255) NOT NULL,
    variant VARCHAR(255) NULL,
    unit VARCHAR(60) NULL,
    category VARCHAR(160) NULL,
    currency_code VARCHAR(10) NOT NULL DEFAULT '',
    currency_symbol VARCHAR(10) NULL,
    price DECIMAL(20,4) NOT NULL DEFAULT 0,                 -- excluding tax
    original_price DECIMAL(20,4) NULL,
    tax_account VARCHAR(160) NULL,                          -- the sales account the tax comes from
    tax_name VARCHAR(160) NULL,                             -- duty / tax name and rate, e.g. "VAT 16%"
    tax_percent DECIMAL(10,4) NULL,
    tax_amount DECIMAL(20,4) NOT NULL DEFAULT 0,
    total DECIMAL(20,4) NOT NULL DEFAULT 0,
    INDEX idx_pli_list (price_list_id, position),
    INDEX idx_pli_item (item_type, item_id)
);

CREATE TABLE IF NOT EXISTS price_list_archives (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    file_name VARCHAR(160) NULL,
    size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
    list_name VARCHAR(160) NULL,
    list_as_at DATETIME NULL,
    access VARCHAR(12) NOT NULL DEFAULT 'staff',
    customer_types JSON NULL,
    uploaded_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS brochures (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    subtitle VARCHAR(255) NULL,
    size VARCHAR(8) NOT NULL DEFAULT 'full',                -- the size entries use unless they say otherwise: full | half | card
    status VARCHAR(12) NOT NULL DEFAULT 'draft',            -- draft | published
    access VARCHAR(12) NOT NULL DEFAULT 'staff',            -- staff | everyone | customers | types
    customer_types JSON NULL,
    settings JSON NULL,                                     -- cover and contents switches
    entries JSON NULL,                                      -- ordered: [{type, id, size?, sections?}]
    created_by BIGINT UNSIGNED NULL,
    published_at DATETIME NULL,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_brochures_status (status, deleted_at)
);

CREATE TABLE IF NOT EXISTS catalogue_settings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    max_price_lists INT UNSIGNED NOT NULL DEFAULT 10,       -- the most price lists kept (1 to 1000)
    earlier_price VARCHAR(12) NOT NULL DEFAULT 'discounts', -- the starting choice for a new list
    customer_item_brochure TINYINT(1) NOT NULL DEFAULT 1,   -- customers may download a one-item brochure
    customer_catalogue_link TINYINT(1) NOT NULL DEFAULT 1,  -- the "look at these brochures" link on the products page
    brochure_defaults JSON NULL,                            -- the sections and theme per item type
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL
);

INSERT INTO catalogue_settings (max_price_lists, earlier_price, customer_item_brochure, customer_catalogue_link, created_at, updated_at)
SELECT 10, 'discounts', 1, 1, NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM catalogue_settings);

-- PART C - RESULT CHECK. Expect 7 rows from the first query, then 1 settings row (limit 10, discounts, 1, 1).
SELECT 'products.brochure_meta' AS thing FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'brochure_meta'
UNION ALL
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('brochure_item_meta', 'price_lists', 'price_list_items', 'price_list_archives', 'brochures', 'catalogue_settings');
SELECT id, max_price_lists, earlier_price, customer_item_brochure, customer_catalogue_link FROM catalogue_settings;
