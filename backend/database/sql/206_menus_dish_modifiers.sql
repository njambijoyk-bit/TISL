-- =====================================================================
-- 206_menus_dish_modifiers.sql
-- Menus modifiers, build step 4.2 (docs/MENUS_DISHES_PLAN.md): what it costs when a customer leaves an ingredient out or asks for extra.
--   menus_dish_modifiers  one row per dish, ingredient and kind (remove | extra) that has its own policy: which named policy (script 193: free, a fixed fee, a percentage of the dish price)
--                         prices it. An item with no row uses the default policy, which is Free to begin with. The ingredients on offer come from the recipe lines ticked in script 205.
-- Nothing is charged or changed on an order yet: choosing them on an order comes in 4.3. The Menus setting "modifier fees carry VAT" needs no script (it is kept with the other settings).
-- Run 193 and 205 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the table there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_dish_modifiers';
-- A2. the policies there are (at least "Free", the default)
SELECT id, name, kind, amount, is_default FROM menus_modifier_policies ORDER BY sort_order, id;

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_dish_modifiers (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id       BIGINT UNSIGNED NOT NULL,
    ingredient_id BIGINT UNSIGNED NOT NULL,
    kind          VARCHAR(6) NOT NULL,                             -- remove | extra
    policy_id     BIGINT UNSIGNED NOT NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_menus_dish_modifier (dish_id, ingredient_id, kind),
    KEY idx_menus_dish_modifier_policy (policy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the table is there and empty (1 row, 0 modifiers)
SELECT COUNT(*) AS modifiers FROM menus_dish_modifiers;
