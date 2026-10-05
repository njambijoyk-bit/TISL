-- =====================================================================
-- 87_drop_old_reviews.sql
-- Removes the old product review tables. Reviews now live in the Engagement Engine (script 86). The old ones were test data and pointed at the
-- retired orders table, so they are dropped, not copied. Also zeroes the review counts kept on products and services so they start clean.
-- Run each part on its own in Workbench: Part A (read-only), then B, then C.
-- =====================================================================

-- PART A - READ-ONLY CHECK. How many old reviews and helpful votes there are (this is what will be deleted), and which tables exist.
SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'product_reviews') AS has_product_reviews,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'review_helpful_votes') AS has_helpful_votes;
SELECT COUNT(*) AS old_reviews FROM product_reviews;

-- PART B - CHANGE (drops 2 tables, clears the review numbers on products and services)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS review_helpful_votes;
DROP TABLE IF EXISTS product_reviews;
SET FOREIGN_KEY_CHECKS = 1;
UPDATE products SET rating = 0, reviews = 0 WHERE id > 0;
UPDATE services SET rating = 0, review_count = 0 WHERE id > 0;

-- PART C - RESULT CHECK. Expect 0 rows from the first query, and 0 from the second.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('product_reviews', 'review_helpful_votes');
SELECT (SELECT COUNT(*) FROM products WHERE reviews <> 0 OR rating <> 0) + (SELECT COUNT(*) FROM services WHERE review_count <> 0 OR rating <> 0) AS rows_with_old_numbers;
