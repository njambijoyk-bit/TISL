-- =====================================================================
-- 168_align_collations.sql
-- Tables made by the numbered scripts name no collation, so on MySQL 8 they get the server's (utf8mb4_0900_ai_ci), while the tables
-- Laravel makes use utf8mb4_unicode_ci. Comparing a column of one with a column of the other then fails with
-- "Illegal mix of collations" (error 1267): the Users page and its statistics were the first to show it.
-- This converts every table that is not utf8mb4_unicode_ci to it (the text in them stays exactly as it is).
-- Safe to re-run (also after it stopped half way: tables already converted are left alone). It only touches tables that are different.
-- A word that differed only by trailing spaces or accents would now count as the same word: if two such rows are in a column with a unique key, that table stops with a "duplicate entry" error and is left as it was. It locks each table while it is converted, so run it when the system is quiet.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. The tables that will be converted (none = nothing to do).
SELECT table_name, table_collation FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_collation IS NOT NULL AND table_collation <> 'utf8mb4_unicode_ci'
ORDER BY table_name;

-- PART B - CONVERT
DROP PROCEDURE IF EXISTS align_table_collations;
DELIMITER $$
CREATE PROCEDURE align_table_collations()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE t VARCHAR(128);
    DECLARE cur CURSOR FOR
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_collation IS NOT NULL AND table_collation <> 'utf8mb4_unicode_ci';
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        SET FOREIGN_KEY_CHECKS = 1;   -- never leave it off, whatever went wrong
        RESIGNAL;
    END;
    SET FOREIGN_KEY_CHECKS = 0;   -- a table and the table its key points to are converted one after the other: while only one of them is done the key columns differ, which MySQL refuses (error 3780) unless the check is off
    OPEN cur;
    loop_tables: LOOP
        FETCH cur INTO t;
        IF done = 1 THEN LEAVE loop_tables; END IF;
        SET @sql = CONCAT('ALTER TABLE `', REPLACE(t, '`', '``'), '` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END LOOP;
    CLOSE cur;
    SET FOREIGN_KEY_CHECKS = 1;
END $$
DELIMITER ;
CALL align_table_collations();
DROP PROCEDURE IF EXISTS align_table_collations;

-- PART C - CHECK. Expect no rows.
SELECT table_name, table_collation FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' AND table_collation IS NOT NULL AND table_collation <> 'utf8mb4_unicode_ci'
ORDER BY table_name;
