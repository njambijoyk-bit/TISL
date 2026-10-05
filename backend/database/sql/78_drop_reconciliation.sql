-- =====================================================================
-- 78_drop_reconciliation.sql
-- Removes the old Reconciliation sessions feature: its two tables (and the old financial notes table,
-- if script 77 has not already dropped it). Nothing else uses them: the Books "Reconciliation" report
-- and stock counts have their own code and are not touched. Safe to re-run.
-- Run script 77 first if you have not (it moves the notes link off reconciliation_lines).
-- =====================================================================

-- PART A - READ-ONLY CHECK. Run first, on its own.
-- Which of the tables exist now, and how many rows each holds (all of it is test data).
SELECT 'reconciliation_lines' AS table_name, COUNT(*) AS rows_now FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'reconciliation_lines'
UNION ALL SELECT 'reconciliation_sessions', COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'reconciliation_sessions'
UNION ALL SELECT 'financial_notes', COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'financial_notes';
-- (1 = the table exists, 0 = already gone)

-- PART B - CHANGE (drops tables; cannot be undone). Lines first, because they point at sessions.
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS reconciliation_lines;
DROP TABLE IF EXISTS reconciliation_sessions;
DROP TABLE IF EXISTS financial_notes;
SET FOREIGN_KEY_CHECKS = 1;

-- PART C - RESULT CHECK. Expect 0 rows.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('reconciliation_lines', 'reconciliation_sessions', 'financial_notes');
