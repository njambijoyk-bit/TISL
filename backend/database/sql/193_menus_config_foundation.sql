-- =====================================================================
-- 193_menus_config_foundation.sql
-- Menus: the lists the configuration page keeps, and the account prepared food is carried on.
--   menus_servings           the sizes a dish can be served in (Jumbo, Medium, Kids...): the restaurant's own list, none is put in
--   menus_audiences          who a dish is for (Adults, Kids...): the restaurant's own list, none is put in
--   menus_modifier_policies  how removing or adding something is priced: free, a fixed fee, or a percentage of the dish price; "Free" is put in as the default
--   a new account "Prepared Food Inventory" under Stock-in-hand (only if there is none): cooked food waiting to be sold
-- Run 181 to 192 first. Safe to re-run (nothing is added twice). Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_servings', 'menus_audiences', 'menus_modifier_policies');
SELECT id, name, group_id FROM ledgers WHERE name = 'Prepared Food Inventory';
SELECT id, name FROM ledger_groups WHERE name = 'Stock-in-hand';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_servings (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(60) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_serving_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_audiences (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(60) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_audience_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_modifier_policies (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(60) NOT NULL,
    kind        VARCHAR(8) NOT NULL DEFAULT 'free',               -- free | fixed | percent
    amount      DECIMAL(12,2) NOT NULL DEFAULT 0,                 -- the fee (fixed) or the percentage of the dish price (percent)
    is_default  TINYINT(1) NOT NULL DEFAULT 0,                    -- the one a dish uses until it chooses another (exactly one)
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_modifier_policy_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO menus_modifier_policies (name, kind, amount, is_default, sort_order, is_active, created_at, updated_at)
SELECT 'Free', 'free', 0, 1, 1, 1, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM menus_modifier_policies);

-- the account cooked food waiting to be sold is carried on
SET @grp_stock := (SELECT id FROM ledger_groups WHERE name = 'Stock-in-hand' ORDER BY id LIMIT 1);
INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_stock, 'Prepared Food Inventory', 0, 0, 1, NOW(), NOW()
WHERE @grp_stock IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Prepared Food Inventory');

-- PART C - CHECK AFTER
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_servings', 'menus_audiences', 'menus_modifier_policies');
SELECT id, name, kind, amount, is_default FROM menus_modifier_policies;
SELECT l.id, l.name, g.name AS under FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE l.name = 'Prepared Food Inventory';
