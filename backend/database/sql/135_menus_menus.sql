-- =====================================================================
-- 135_menus_menus.sql
-- Menus module, step 2 (docs/MENUS_PLAN.md): menus (Breakfast, Lunch, Bar), their sections, which dishes are in them, and the options on a dish.
--   menus_menus            a named card with the days and hours it is served
--   menus_sections         the headings inside a menu (Starters, Mains...)
--   menus_section_dishes   which dishes are under a heading (a dish can be in several), in order
--   menus_option_groups    "Choose a side", "Size", "Extras" on one dish: pick one or several, required or not
--   menus_options          the choices in a group, each with a price change; a choice can be a whole other dish (a set meal)
--   menus_option_uses      what a choice uses or leaves out of the recipe: extra cheese adds cheese, "no onion" leaves the onion out
-- Run 132, 133 and 134 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the tables are absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('menus_menus', 'menus_sections', 'menus_section_dishes', 'menus_option_groups', 'menus_options', 'menus_option_uses');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_menus (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name         VARCHAR(120) NOT NULL,
    slug         VARCHAR(150) NOT NULL,
    description  VARCHAR(500) NULL,
    days         JSON NULL,                                       -- [1,2,3,4,5] (0 = Sunday); NULL = every day
    starts_at    TIME NULL,                                       -- NULL = all day; an end before the start means past midnight
    ends_at      TIME NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_menus_menu_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_sections (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    menu_id      BIGINT UNSIGNED NOT NULL,
    name         VARCHAR(120) NOT NULL,
    description  VARCHAR(300) NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_section_menu (menu_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_section_dishes (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    section_id   BIGINT UNSIGNED NOT NULL,
    dish_id      BIGINT UNSIGNED NOT NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_menus_section_dish (section_id, dish_id),
    KEY idx_menus_section_dish_dish (dish_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_option_groups (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    dish_id      BIGINT UNSIGNED NOT NULL,
    name         VARCHAR(120) NOT NULL,
    kind         VARCHAR(8) NOT NULL DEFAULT 'single',            -- single (pick one) | multiple (pick several)
    min_choices  TINYINT UNSIGNED NOT NULL DEFAULT 0,             -- 0 = may be skipped
    max_choices  TINYINT UNSIGNED NULL,                           -- NULL = as many as there are (multiple only)
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_group_dish (dish_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_options (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    group_id        BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(120) NOT NULL,
    price_delta     DECIMAL(12,2) NOT NULL DEFAULT 0,             -- before tax; a removal costs nothing unless charge_removal is on
    is_default      TINYINT(1) NOT NULL DEFAULT 0,
    charge_removal  TINYINT(1) NOT NULL DEFAULT 0,
    linked_dish_id  BIGINT UNSIGNED NULL,                         -- the choice is a whole other dish (a side in a set meal)
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_menus_option_group (group_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_option_uses (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    option_id    BIGINT UNSIGNED NOT NULL,
    mode         VARCHAR(8) NOT NULL DEFAULT 'add',               -- add (uses more) | remove (leaves a recipe line out)
    family_id    BIGINT UNSIGNED NULL,                            -- an ingredient (script 132), or
    variant_id   BIGINT UNSIGNED NULL,                            -- one exact stock item
    quantity     DECIMAL(18,4) NULL,                              -- for add: how much, in unit_id (empty = the ingredient's unit / the item's stock unit)
    unit_id      BIGINT UNSIGNED NULL,
    KEY idx_menus_use_option (option_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - READ-ONLY CHECK
SELECT COUNT(*) AS menus FROM menus_menus;
