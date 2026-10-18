-- =====================================================================
-- 202_menus_dish_makeup.sql
-- Menus dishes and recipes, build steps 3.1 and 3.2 (docs/MENUS_DISHES_PLAN.md): what a dish is made of, the sizes it is sold in, and who it is for.
--   menus_dish_slots          the places in a dish that are filled with sides: always included, choose one, choose any, free extra, paid extra (steak with egg and cheese:
--                             a slot for the bread, a slot "choose one": choma or wet fry, a slot for free sauces, a slot for paid extras)
--   menus_dish_slot_choices   the sides a slot may be filled with, with what choosing it adds to the price and whether it is chosen to begin with
--   menus_dish_servings       the sizes a dish is sold in and the price of each (a dish with none is sold at its own price, in one size)
--   menus_dish_audiences      who a dish is for (Adults, Kids; none means everyone)
-- Nothing is sold through them yet: dishes and the till work as before. Run 193 and 200 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. are the tables there already? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_dish_slots', 'menus_dish_slot_choices', 'menus_dish_servings', 'menus_dish_audiences');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_dish_slots (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id      BIGINT UNSIGNED NOT NULL,
    name         VARCHAR(60) NOT NULL,                             -- "Bread", "Choose a protein", "Sauces"
    kind         VARCHAR(12) NOT NULL,                             -- fixed | choose_one | choose_any | free_extra | paid_extra
    min_choices  SMALLINT UNSIGNED NOT NULL DEFAULT 0,             -- fewest that must be chosen (choose one: 1)
    max_choices  SMALLINT UNSIGNED NULL,                           -- most that may be chosen (choose one: 1); empty: as many as there are
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_dish_slot (dish_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_dish_slot_choices (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slot_id     BIGINT UNSIGNED NOT NULL,
    side_id     BIGINT UNSIGNED NOT NULL,                          -- menus_sides
    upcharge    DECIMAL(18,2) NOT NULL DEFAULT 0,                  -- added to the price when chosen (a paid extra: its price); a fixed or free choice has none
    is_default  TINYINT(1) NOT NULL DEFAULT 0,                     -- chosen to begin with
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_menus_dish_choice (slot_id, sort_order),
    KEY idx_menus_dish_choice_side (side_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_dish_servings (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id     BIGINT UNSIGNED NOT NULL,
    serving_id  BIGINT UNSIGNED NOT NULL,                          -- menus_servings
    price       DECIMAL(18,2) NOT NULL,                            -- the dish's price in this size (not the sum of its parts)
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_dish_serving (dish_id, serving_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_dish_audiences (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id      BIGINT UNSIGNED NOT NULL,
    audience_id  BIGINT UNSIGNED NOT NULL,                         -- menus_audiences
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_menus_dish_audience (dish_id, audience_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK AFTER
-- C1. the four tables are there (4 rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_dish_slots', 'menus_dish_slot_choices', 'menus_dish_servings', 'menus_dish_audiences');
-- C2. nothing in them yet (0, 0, 0 and 0)
SELECT (SELECT COUNT(*) FROM menus_dish_slots) AS slots, (SELECT COUNT(*) FROM menus_dish_slot_choices) AS choices, (SELECT COUNT(*) FROM menus_dish_servings) AS servings, (SELECT COUNT(*) FROM menus_dish_audiences) AS audiences;
