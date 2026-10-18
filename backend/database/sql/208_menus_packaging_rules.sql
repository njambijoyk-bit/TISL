-- =====================================================================
-- 208_menus_packaging_rules.sql
-- Menus packaging, build step 5.2 (docs/MENUS_DISHES_PLAN.md section 6): the rules that say what packaging goes with what.
--   menus_packaging_rules  one row per rule. A rule belongs to a side or to a dish (a dish's rule for an item replaces the rule of its sides for that item). It names the packaging item
--                          (script 207's kind), the scope (per dish: once for each dish sold; per order: once for the whole order, the largest quantity winning), the quantity, whether it
--                          is compulsory, whether it is charged (priced from the price list) or free, and whether it shows on the receipt (auto: when charged, always, never).
-- Nothing is added to an order yet: the checkout works the rules out in 5.3 and 5.4.
-- Run 200 and 207 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the table there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_packaging_rules';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_packaging_rules (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    side_id     BIGINT UNSIGNED NULL,                              -- the side the rule belongs to, or
    dish_id     BIGINT UNSIGNED NULL,                              -- the dish (one of the two)
    item_id     BIGINT UNSIGNED NOT NULL,                          -- menus_ingredient_items.id, an item of the packaging kind
    scope       VARCHAR(9) NOT NULL DEFAULT 'per_dish',            -- per_dish | per_order
    quantity    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    compulsory  TINYINT(1) NOT NULL DEFAULT 0,
    charged     TINYINT(1) NOT NULL DEFAULT 0,                     -- 1: priced from the packaging price list; 0: free (only a cost)
    receipt     VARCHAR(6) NOT NULL DEFAULT 'auto',                -- auto | always | never
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_menus_packaging_rule_side (side_id),
    KEY idx_menus_packaging_rule_dish (dish_id),
    KEY idx_menus_packaging_rule_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the table is there and empty (1 row, 0 rules)
SELECT COUNT(*) AS rules FROM menus_packaging_rules;
