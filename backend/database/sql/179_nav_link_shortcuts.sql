-- =====================================================================
-- 179_nav_link_shortcuts.sql
-- Storefront navigation: a keyboard shortcut an admin can set on each link (Settings > Navigation).
--   nav_links.shortcut   one letter A-Z, used with Shift on the storefront (NULL = no shortcut). Left blank for every link until an admin sets it.
-- The admin menu's own shortcuts are fixed in the app and are not stored here.
-- Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'nav_links' AND column_name = 'shortcut';

-- PART B - CREATE
DROP PROCEDURE IF EXISTS add_nav_link_shortcut;
DELIMITER $$
CREATE PROCEDURE add_nav_link_shortcut()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'nav_links' AND column_name = 'shortcut') THEN
        ALTER TABLE nav_links ADD COLUMN shortcut CHAR(1) NULL;
    END IF;
END$$
DELIMITER ;
CALL add_nav_link_shortcut();
DROP PROCEDURE IF EXISTS add_nav_link_shortcut;

-- PART C - CHECK AFTER
SELECT `key`, label, path, shortcut FROM nav_links ORDER BY sort_order, id;
