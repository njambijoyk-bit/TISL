-- =====================================================================
-- 118_product_video.sql
-- Products: a video, either a pasted link (YouTube, Vimeo, TikTok, Facebook) or the path of an uploaded mp4/webm.
--   products.video_url   VARCHAR(500) NULL   (the same shape services.video_url has had since the services module)
-- Safe to re-run: skipped if the column is already there. Run in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (no row = not added yet)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'video_url';

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS product_video_column;
DELIMITER $$
CREATE PROCEDURE product_video_column()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'video_url') THEN
        ALTER TABLE products ADD COLUMN video_url VARCHAR(500) NULL;
    END IF;
END$$
DELIMITER ;
CALL product_video_column();
DROP PROCEDURE IF EXISTS product_video_column;

-- PART C - CHECK (one row = done)
SELECT table_name, column_name, column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'products' AND column_name = 'video_url';
