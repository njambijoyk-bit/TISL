-- =====================================================================
-- 134_menus_dishes.sql
-- Menus module, step 1.4 (docs/MENUS_PLAN.md): dishes, and the Menus settings.
--   menus_dishes     what a customer sees (name, photo, description, declared allergens). Every dish owns one hidden stock item (a product variant, made when the
--                    dish is made) so sales, cost of sales, refunds, batches and production work exactly as they do for any item; the shop does not list it.
--   menus_settings   one row: the sales account dishes are booked under, the category their hidden products sit in, the allergen wording, the receipt footer
-- Run 132 and 133 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the tables are absent on a first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_dishes', 'menus_settings');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_dishes (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    slug            VARCHAR(190) NOT NULL,
    description     TEXT NULL,
    photo           VARCHAR(255) NULL,
    product_id      BIGINT UNSIGNED NOT NULL,                     -- the hidden product behind it
    variant_id      BIGINT UNSIGNED NOT NULL,                     -- its hidden stock item (what vouchers, batches and recipes point at)
    prep_minutes    SMALLINT UNSIGNED NULL,
    allergens_override JSON NULL,                                 -- NULL = worked out from the ingredients; a list = exactly these are declared
    tags_override   JSON NULL,
    sold_out_on     DATE NULL,                                    -- "86": not available on this date, whatever the stock says
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    created_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_menus_dish_variant (variant_id),
    UNIQUE KEY uq_menus_dish_slug (slug),
    KEY idx_menus_dish_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_settings (
    id          TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    settings    JSON NULL,
    updated_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - READ-ONLY CHECK
SELECT COUNT(*) AS dishes FROM menus_dishes;
