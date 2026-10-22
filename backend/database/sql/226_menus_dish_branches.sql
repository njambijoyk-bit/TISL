-- =====================================================================
-- 226_menus_dish_branches.sql
-- Menus: a dish may be switched off at a branch, and may have its own price there (menus_dish_branches).
--   no row for a dish at a branch   the dish is served there at the dish's own price (everything as it is now)
--   is_available = 0                the dish is not served at that branch: it is not on the menu there, the till and the kiosk refuse it
--   price                           the price (before tax) at that branch instead of the dish's own; empty keeps the dish's price
--   size_prices                     {"<serving id>": price}: the price of a size at that branch; a size not listed keeps its own price
-- Every dish keeps being served everywhere at its own price, so nothing changes until a row is added.
-- Run 134 first (and 202 for sizes). Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the table there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_dish_branches';
-- A2. how many dishes and branches there are (every dish stays served at every branch)
SELECT (SELECT COUNT(*) FROM menus_dishes) AS dishes, (SELECT COUNT(*) FROM locations WHERE is_active = 1) AS active_branches;

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS menus_dish_branches (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id       BIGINT UNSIGNED NOT NULL,
    location_id   BIGINT UNSIGNED NOT NULL,
    is_available  TINYINT(1) NOT NULL DEFAULT 1,
    price         DECIMAL(12,2) NULL,
    size_prices   JSON NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_menus_dish_branch (dish_id, location_id),
    KEY idx_menus_dish_branch_loc (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the table is there (1 row)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_dish_branches';
-- C2. nothing is switched off or priced differently yet (0)
SELECT COUNT(*) AS branch_rows FROM menus_dish_branches;
