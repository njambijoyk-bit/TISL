-- =====================================================================
-- 115_preorder_deposits.sql
-- A preorder offer can take a deposit instead of the full price at checkout.
--   preorder_offers.deposit_percent   empty = full payment at checkout (as before); otherwise the share (1-90) of the order a signed-in customer may pay now,
--                                     the rest being due on delivery (staff collect it) or online from My orders.
-- A deposit order is an ordinary Sales Order that becomes an Invoice at once (no stock), with the deposit received against it; the balance is whatever the
-- invoice still has outstanding. Nothing else is stored. Existing offers keep NULL, so nothing changes until someone sets a percentage. Safe to re-run.
-- Run in Workbench. DDL commits on its own, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: 0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'preorder_offers' AND column_name = 'deposit_percent';

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
CALL add_column_if_missing('preorder_offers', 'deposit_percent', 'TINYINT UNSIGNED NULL AFTER max_per_customer');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — CHECK (expect: the column once; every existing offer is full payment)
SELECT column_name, is_nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'preorder_offers' AND column_name = 'deposit_percent';
SELECT COUNT(*) AS offers_total, SUM(deposit_percent IS NULL) AS offers_full_payment_only FROM preorder_offers;
