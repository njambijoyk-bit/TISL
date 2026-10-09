-- =====================================================================
-- 106_campaign_item_variants.sql
-- A campaign can feature one VARIANT of a product (one size or colour), not only the whole product.
--   campaign_items.variant_id   0 = the whole item (as before); otherwise the product_variants id of the one option featured.
--   The unique key becomes (campaign_id, item_type, item_id, variant_id), so a campaign can feature several options of one product, each with its own
--   "coming soon until" date and label. The app refuses a campaign that features a product whole AND by option.
-- Existing rows keep variant_id = 0, so nothing changes until someone features an option. Safe to re-run.
-- Run in Workbench. DDL commits on its own, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: 0 rows for the column, and the old unique key listed, on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'campaign_items' AND column_name = 'variant_id';
SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_in_key FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 'campaign_items' AND non_unique = 0 GROUP BY index_name;

-- PART B — CHANGE (DDL, commits on its own)
DROP PROCEDURE IF EXISTS campaign_item_variants_up;
DELIMITER $$
CREATE PROCEDURE campaign_item_variants_up()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'campaign_items' AND column_name = 'variant_id') THEN
        ALTER TABLE campaign_items ADD COLUMN variant_id BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER item_id;
    END IF;
    -- the new key first, so there is never a moment without one; then the old one goes
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'campaign_items' AND index_name = 'uq_campaign_items_v') THEN
        ALTER TABLE campaign_items ADD UNIQUE KEY uq_campaign_items_v (campaign_id, item_type, item_id, variant_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'campaign_items' AND index_name = 'uq_campaign_items') THEN
        ALTER TABLE campaign_items DROP INDEX uq_campaign_items;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'campaign_items' AND index_name = 'idx_campaign_items_variant') THEN
        ALTER TABLE campaign_items ADD INDEX idx_campaign_items_variant (item_type, item_id, variant_id);
    END IF;
END$$
DELIMITER ;
CALL campaign_item_variants_up();
DROP PROCEDURE IF EXISTS campaign_item_variants_up;

-- PART C — CHECK (expect: the column once; uq_campaign_items_v on 4 columns and no uq_campaign_items; every existing row has variant_id 0)
SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'campaign_items' AND column_name = 'variant_id';
SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_in_key FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 'campaign_items' AND non_unique = 0 GROUP BY index_name;
SELECT COUNT(*) AS rows_total, SUM(variant_id = 0) AS whole_item_rows FROM campaign_items;
