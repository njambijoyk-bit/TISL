-- =====================================================================
-- 66_payroll_gratuity.sql
-- Gratuity (service pay) settings for the payroll Gratuity report:
--   gratuity_days_per_year   days of pay for each completed year of service (15 to start — the usual statutory service pay)
--   gratuity_min_years       completed years before any is due (1 to start)
--   gratuity_divisor         monthly basic ÷ this = one day's pay (30 to start; use 26 if you count working days)
--   gratuity_prorate         1 = the report's main figure includes part-years; 0 = completed years only
-- Needs script 64. Only adds columns, so there is nothing to COMMIT. Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run; 4 once done)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payroll_settings'
  AND column_name IN ('gratuity_days_per_year', 'gratuity_min_years', 'gratuity_divisor', 'gratuity_prorate');

-- PART B — ADD (DDL, commits on its own)
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

CALL add_column_if_missing('payroll_settings', 'gratuity_days_per_year', 'DECIMAL(6,2) NOT NULL DEFAULT 15');
CALL add_column_if_missing('payroll_settings', 'gratuity_min_years',     'INT NOT NULL DEFAULT 1');
CALL add_column_if_missing('payroll_settings', 'gratuity_divisor',       'INT NOT NULL DEFAULT 30');
CALL add_column_if_missing('payroll_settings', 'gratuity_prorate',       'TINYINT(1) NOT NULL DEFAULT 0');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — CHECK (expect 4 rows)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payroll_settings'
  AND column_name IN ('gratuity_days_per_year', 'gratuity_min_years', 'gratuity_divisor', 'gratuity_prorate');
