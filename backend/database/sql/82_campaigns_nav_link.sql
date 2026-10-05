-- =====================================================================
-- 82_campaigns_nav_link.sql
-- Gives the storefront menu a "Campaigns" link that the Settings > Navigation page can show or hide.
-- Each module's links are rows in nav_links; Campaigns had none. The link only appears to customers while the Campaigns module is
-- licensed and switched on, and while it is set to visible. Safe to re-run: it adds the row only if it is missing.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. The links you have now (look for one with key 'campaigns'; none = run part B)
SELECT * FROM nav_links ORDER BY sort_order, id;

-- PART B - CHANGE (adds one row)
DROP PROCEDURE IF EXISTS add_campaigns_nav_link;
DELIMITER $$
CREATE PROCEDURE add_campaigns_nav_link()
BEGIN
    DECLARE next_sort INT DEFAULT 0;
    DECLARE has_stamps INT DEFAULT 0;
    IF NOT EXISTS (SELECT 1 FROM nav_links WHERE `key` = 'campaigns') THEN
        SELECT COALESCE(MAX(sort_order), 0) + 10 INTO next_sort FROM nav_links;
        SELECT COUNT(*) INTO has_stamps FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'nav_links' AND column_name IN ('created_at', 'updated_at');
        IF has_stamps = 2 THEN
            INSERT INTO nav_links (`key`, label, path, module_key, visible, sort_order, created_at, updated_at)
            VALUES ('campaigns', 'Campaigns', '/campaigns', 'campaigns', 1, next_sort, NOW(), NOW());
        ELSE
            INSERT INTO nav_links (`key`, label, path, module_key, visible, sort_order)
            VALUES ('campaigns', 'Campaigns', '/campaigns', 'campaigns', 1, next_sort);
        END IF;
    END IF;
END$$
DELIMITER ;
CALL add_campaigns_nav_link();
DROP PROCEDURE IF EXISTS add_campaigns_nav_link;

-- PART C - RESULT CHECK. Expect exactly one row, module_key campaigns, visible 1.
SELECT * FROM nav_links WHERE `key` = 'campaigns';
