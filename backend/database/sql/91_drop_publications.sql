-- =====================================================================
-- 91_drop_publications.sql
-- Removes the old Publications feature (blog, news and brochures) from the database. The code for it has been deleted; Campaigns replace it.
-- Drops four tables and everything in them: publications, publication_blocks, publication_comments, publication_authors.
-- THIS DELETES DATA FOR GOOD. Run part A first and check the counts are what you expect (test data only). Take a backup first if unsure.
-- Safe to re-run: a table that is already gone is skipped.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Lists which of the four tables exist and roughly how many rows each holds.
SELECT table_name, table_rows AS approx_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('publications', 'publication_blocks', 'publication_comments', 'publication_authors')
ORDER BY table_name;

-- PART B - CHANGE (drops the tables)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS publication_comments;
DROP TABLE IF EXISTS publication_blocks;
DROP TABLE IF EXISTS publication_authors;
DROP TABLE IF EXISTS publications;
SET FOREIGN_KEY_CHECKS = 1;

-- PART C - RESULT CHECK. Expect no rows.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN ('publications', 'publication_blocks', 'publication_comments', 'publication_authors');
