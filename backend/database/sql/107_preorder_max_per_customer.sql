-- =====================================================================
-- 107_preorder_max_per_customer.sql
-- A preorder offer can limit how many ONE customer may take.
--   preorder_offers.max_per_customer   empty = no limit per customer (as before); otherwise the most one customer can hold under the offer.
-- What a customer holds is worked out from their preorders (never stored): their orders under the offer, less what was credited back. A guest is matched by
-- the email on the order. Counter staff may go over it. Existing offers keep NULL, so nothing changes until someone sets a number. Safe to re-run.
-- Run in Workbench. DDL commits on its own, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: 0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'preorder_offers' AND column_name = 'max_per_customer';

-- PART B — CHANGE (DDL, commits on its own)
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
CALL add_column_if_missing('preorder_offers', 'max_per_customer', 'INT UNSIGNED NULL AFTER limit_total');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — CHECK (expect: the column once; every existing offer has no per-customer limit)
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'preorder_offers' AND column_name = 'max_per_customer';
SELECT COUNT(*) AS offers_total, SUM(max_per_customer IS NULL) AS offers_without_a_customer_limit FROM preorder_offers;
