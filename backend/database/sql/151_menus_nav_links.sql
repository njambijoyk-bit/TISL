-- =====================================================================
-- 151_menus_nav_links.sql
-- Gives the storefront menu three Menus links that Settings > Navigation can show or hide: the menu ("/menu"), meal plans ("/menu/plans") and the chefs page ("/chefs").
-- Each module's links are rows in nav_links. They appear to customers only while the Menus module is licensed and switched on, and while a link is set to visible.
-- Safe to re-run: a row is added only if its key is missing. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (look for keys menu, menu_plans, chefs; none = run part B)
SELECT * FROM nav_links ORDER BY sort_order, id;

-- PART B - CHANGE (adds up to three rows)
DROP PROCEDURE IF EXISTS add_menus_nav_links;
DELIMITER $$
CREATE PROCEDURE add_menus_nav_links()
BEGIN
    DECLARE next_sort INT DEFAULT 0;
    DECLARE has_stamps INT DEFAULT 0;
    SELECT COUNT(*) INTO has_stamps FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'nav_links' AND column_name IN ('created_at', 'updated_at');

    IF NOT EXISTS (SELECT 1 FROM nav_links WHERE `key` = 'menu') THEN
        SELECT COALESCE(MAX(sort_order), 0) + 10 INTO next_sort FROM nav_links;
        IF has_stamps = 2 THEN
            INSERT INTO nav_links (`key`, label, path, module_key, visible, sort_order, created_at, updated_at) VALUES ('menu', 'Menu', '/menu', 'menus', 1, next_sort, NOW(), NOW());
        ELSE
            INSERT INTO nav_links (`key`, label, path, module_key, visible, sort_order) VALUES ('menu', 'Menu', '/menu', 'menus', 1, next_sort);
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM nav_links WHERE `key` = 'menu_plans') THEN
        SELECT COALESCE(MAX(sort_order), 0) + 10 INTO next_sort FROM nav_links;
        IF has_stamps = 2 THEN
            INSERT INTO nav_links (`key`, label, path, module_key, visible, sort_order, created_at, updated_at) VALUES ('menu_plans', 'Meal plans', '/menu/plans', 'menus', 1, next_sort, NOW(), NOW());
        ELSE
            INSERT INTO nav_links (`key`, label, path, module_key, visible, sort_order) VALUES ('menu_plans', 'Meal plans', '/menu/plans', 'menus', 1, next_sort);
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM nav_links WHERE `key` = 'chefs') THEN
        SELECT COALESCE(MAX(sort_order), 0) + 10 INTO next_sort FROM nav_links;
        IF has_stamps = 2 THEN
            INSERT INTO nav_links (`key`, label, path, module_key, visible, sort_order, created_at, updated_at) VALUES ('chefs', 'Our chefs', '/chefs', 'menus', 1, next_sort, NOW(), NOW());
        ELSE
            INSERT INTO nav_links (`key`, label, path, module_key, visible, sort_order) VALUES ('chefs', 'Our chefs', '/chefs', 'menus', 1, next_sort);
        END IF;
    END IF;
END$$
DELIMITER ;
CALL add_menus_nav_links();
DROP PROCEDURE IF EXISTS add_menus_nav_links;

-- PART C - RESULT CHECK. Expect three rows, module_key menus, visible 1.
SELECT * FROM nav_links WHERE `key` IN ('menu', 'menu_plans', 'chefs');
