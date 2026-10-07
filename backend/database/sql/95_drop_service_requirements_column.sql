-- =====================================================================
-- 95_drop_service_requirements_column.sql
-- Services: drops the old services.requirements column (a plain list of text lines that no screen could edit and no customer page showed).
-- The service_requirements TABLE (the questions "What we need from the customer") is NOT touched. The brochure now lists only those questions.
-- Test data only: whatever was in the column is lost.
-- Safe to re-run: the column is only dropped if it is there.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 1 row = the column is still there. Then the services that hold something in it (these values are lost by part B).
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'requirements';

SELECT id, name, requirements FROM services
WHERE id > 0 AND requirements IS NOT NULL AND JSON_LENGTH(requirements) > 0;

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS drop_service_requirements_column;
DELIMITER $$
CREATE PROCEDURE drop_service_requirements_column()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'requirements') THEN
        ALTER TABLE services DROP COLUMN requirements;
    END IF;
END$$
DELIMITER ;
CALL drop_service_requirements_column();
DROP PROCEDURE IF EXISTS drop_service_requirements_column;

-- PART C - RESULT CHECK. Expect 0 rows from the first query (the column is gone) and 1 row from the second (the questions table is still there).
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'services' AND column_name = 'requirements';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'service_requirements';
