-- =====================================================================
-- 52_job_line_prices.sql
-- A price for each material issued to a job: left empty, the invoice uses the item's price in the system; typed in, that price
-- (per base unit, base currency) is what the job's invoice charges — useful for an item with no price yet or a one-off price.
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'stock_job_lines' AND column_name = 'sale_price';

-- PART B — ADD THE COLUMN (DDL, commits on its own)
DROP PROCEDURE IF EXISTS add_column_if_missing;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('stock_job_lines', 'sale_price', 'DECIMAL(18,4) NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — RESULT CHECK (expect 1 row)
SELECT column_name, column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'stock_job_lines' AND column_name = 'sale_price';
