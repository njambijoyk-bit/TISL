-- =====================================================================
-- 235_retire_affects_gross_profit.sql
-- Retires ledger_groups.affects_gross_profit (docs/BOOKS_REPORTS_PLAN.md, step 12). Since script 227 the profit and loss decides what is a direct income or cost from the
-- statement line a group is on (Revenue and Cost of sales are the trading section), and nothing reads this flag any more. The application no longer reads or writes it.
-- Run the application update first, then this. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Is the column still there? (1 row before, 0 after)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ledger_groups' AND column_name = 'affects_gross_profit';
-- A2. Does any view still use it? (0 rows expected; if any, change that view first)
SELECT table_name FROM information_schema.views WHERE table_schema = DATABASE() AND view_definition LIKE '%affects_gross_profit%';
-- A3. For the record: groups whose old flag disagrees with their statement line (the line wins; these are the groups whose trading/operating split the old flag would have drawn differently)
SELECT g.id, g.name, g.affects_gross_profit, s.code AS statement_line
FROM ledger_groups g JOIN statements s ON s.id = g.statement_id
WHERE g.nature IN ('income', 'expense')
  AND ((g.affects_gross_profit = 1 AND s.code NOT IN ('IS.REV', 'IS.COGS')) OR (g.affects_gross_profit = 0 AND s.code IN ('IS.REV', 'IS.COGS')));

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS drop_column_if_exists;
DELIMITER $$
CREATE PROCEDURE drop_column_if_exists(IN tbl VARCHAR(64), IN col VARCHAR(64))
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `', col, '`');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL drop_column_if_exists('ledger_groups', 'affects_gross_profit');
DROP PROCEDURE IF EXISTS drop_column_if_exists;

-- PART C - CHECK. Expect 0 rows.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ledger_groups' AND column_name = 'affects_gross_profit';
