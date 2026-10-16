-- =====================================================================
-- 186_menus_food_tags.sql
-- Menus: the allergens a dish can declare and the "what it is" tags (meat, dairy, caffeine...) are rows an admin keeps (Menus, Allergens), no longer a fixed list.
--   menus_food_tags   kind (allergen | tag), a code (kept on ingredients and dishes, never changed), the label shown, and which diet badges it rules out
--                     (vegetarian, vegan, halal_friendly, gluten_free, dairy_free, nut_free). The 14 allergens and 11 tags Menus always had are put in.
-- Run 181 to 185 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_food_tags';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_food_tags (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kind        VARCHAR(8) NOT NULL,                              -- allergen | tag
    code        VARCHAR(40) NOT NULL,                             -- what ingredients and dishes keep; never changes once made
    label       VARCHAR(60) NOT NULL,                             -- what people read
    rules_out   JSON NULL,                                        -- diet badges this rules out: vegetarian, vegan, halal_friendly, gluten_free, dairy_free, nut_free
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_food_tag (kind, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- the lists Menus always had (only the ones not there yet)
INSERT INTO menus_food_tags (kind, code, label, rules_out, sort_order, created_at, updated_at)
SELECT v.kind, v.code, v.label, v.rules_out, v.sort_order, NOW(), NOW() FROM (
SELECT 'allergen' AS kind, 'milk' AS code, 'Milk' AS label, JSON_ARRAY('vegan', 'dairy_free') AS rules_out, 1 AS sort_order
UNION ALL SELECT 'allergen', 'eggs', 'Eggs', JSON_ARRAY('vegan'), 2
UNION ALL SELECT 'allergen', 'fish', 'Fish', JSON_ARRAY('vegetarian', 'vegan'), 3
UNION ALL SELECT 'allergen', 'shellfish', 'Crustaceans', JSON_ARRAY('vegetarian', 'vegan'), 4
UNION ALL SELECT 'allergen', 'molluscs', 'Molluscs', JSON_ARRAY('vegetarian', 'vegan'), 5
UNION ALL SELECT 'allergen', 'peanuts', 'Peanuts', JSON_ARRAY('nut_free'), 6
UNION ALL SELECT 'allergen', 'tree_nuts', 'Tree nuts', JSON_ARRAY('nut_free'), 7
UNION ALL SELECT 'allergen', 'wheat', 'Wheat / gluten', JSON_ARRAY('gluten_free'), 8
UNION ALL SELECT 'allergen', 'soy', 'Soya', NULL, 9
UNION ALL SELECT 'allergen', 'sesame', 'Sesame', NULL, 10
UNION ALL SELECT 'allergen', 'celery', 'Celery', NULL, 11
UNION ALL SELECT 'allergen', 'mustard', 'Mustard', NULL, 12
UNION ALL SELECT 'allergen', 'lupin', 'Lupin', NULL, 13
UNION ALL SELECT 'allergen', 'sulphites', 'Sulphites', NULL, 14
UNION ALL SELECT 'tag', 'meat', 'Meat', JSON_ARRAY('vegetarian', 'vegan'), 15
UNION ALL SELECT 'tag', 'poultry', 'Poultry', JSON_ARRAY('vegetarian', 'vegan'), 16
UNION ALL SELECT 'tag', 'fish', 'Fish', JSON_ARRAY('vegetarian', 'vegan'), 17
UNION ALL SELECT 'tag', 'pork', 'Pork', JSON_ARRAY('halal_friendly'), 18
UNION ALL SELECT 'tag', 'alcohol', 'Alcohol', JSON_ARRAY('halal_friendly'), 19
UNION ALL SELECT 'tag', 'dairy', 'Dairy', JSON_ARRAY('vegan', 'dairy_free'), 20
UNION ALL SELECT 'tag', 'egg', 'Egg', JSON_ARRAY('vegan'), 21
UNION ALL SELECT 'tag', 'honey', 'Honey', JSON_ARRAY('vegan'), 22
UNION ALL SELECT 'tag', 'gluten', 'Gluten', JSON_ARRAY('gluten_free'), 23
UNION ALL SELECT 'tag', 'caffeine', 'Caffeine', NULL, 24
UNION ALL SELECT 'tag', 'spicy', 'Spicy', NULL, 25
) v
WHERE NOT EXISTS (SELECT 1 FROM menus_food_tags t WHERE t.kind = v.kind AND t.code = v.code);

-- PART C - CHECK AFTER
SELECT kind, COUNT(*) AS how_many FROM menus_food_tags GROUP BY kind;
SELECT kind, code, label, rules_out FROM menus_food_tags ORDER BY kind, sort_order;
