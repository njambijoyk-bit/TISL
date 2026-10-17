-- =====================================================================
-- 190_menus_ingredient_kinds.sql
-- Menus: every ingredient has a KIND, and a kind says what the things of that kind may be used for. Kinds are rows an admin keeps (Menus, Ingredients, Kinds).
--   menus_ingredient_kinds   code (kept, never changed), name, and four yes/no uses:
--                              in_recipes   may be a line of a recipe (flour, beef, oil)
--                              sold_as_is   may be sold as it is, with no recipe (a bottle of soda)
--                              free_extra   may be given with a dish at no charge (a ketchup sachet, salt)
--                              packaging    may be used up by a takeaway order (boxes, bags)
--   menus_ingredients.kind_id   the kind of an ingredient (a real foreign key). Every ingredient that is there now becomes a "Cooking ingredient".
-- Four kinds are put in: Cooking ingredient, Ready to serve, Condiment or extra, Packaging.
-- Run 181 to 189 first. Safe to re-run (nothing is added twice). Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the table there already, and the column? (0 rows each on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_ingredient_kinds';
SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_ingredients' AND column_name = 'kind_id';
-- A2. how many ingredients there are now (all of them become Cooking ingredients)
SELECT COUNT(*) AS ingredients FROM menus_ingredients;

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_ingredient_kinds (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(40) NOT NULL,                             -- kept in the code (cooking is the kind a new ingredient gets); never changes once made
    name        VARCHAR(60) NOT NULL,                             -- what people read
    in_recipes  TINYINT(1) NOT NULL DEFAULT 0,                    -- may be a line of a recipe
    sold_as_is  TINYINT(1) NOT NULL DEFAULT 0,                    -- may be sold as it is, with no recipe
    free_extra  TINYINT(1) NOT NULL DEFAULT 0,                    -- may be given with a dish at no charge
    packaging   TINYINT(1) NOT NULL DEFAULT 0,                    -- may be used up by a takeaway order
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_ingredient_kind_code (code),
    UNIQUE KEY uq_menus_ingredient_kind_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- the four kinds (only the ones not there yet)
INSERT INTO menus_ingredient_kinds (code, name, in_recipes, sold_as_is, free_extra, packaging, sort_order, created_at, updated_at)
SELECT v.code, v.name, v.in_recipes, v.sold_as_is, v.free_extra, v.packaging, v.sort_order, NOW(), NOW() FROM (
SELECT 'cooking' AS code, 'Cooking ingredient' AS name, 1 AS in_recipes, 0 AS sold_as_is, 0 AS free_extra, 0 AS packaging, 1 AS sort_order
UNION ALL SELECT 'ready_to_serve', 'Ready to serve', 0, 1, 0, 0, 2
UNION ALL SELECT 'condiment', 'Condiment or extra', 1, 0, 1, 0, 3
UNION ALL SELECT 'packaging', 'Packaging', 0, 0, 0, 1, 4
) v WHERE NOT EXISTS (SELECT 1 FROM menus_ingredient_kinds k WHERE k.code = v.code);

-- the column on ingredients
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('menus_ingredients', 'kind_id', 'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- every ingredient that has no kind yet is a Cooking ingredient (the id test is for Workbench's safe-update mode)
UPDATE menus_ingredients SET kind_id = (SELECT id FROM menus_ingredient_kinds WHERE code = 'cooking') WHERE kind_id IS NULL AND id > 0;

-- the foreign key: a kind that ingredients have cannot be deleted
DROP PROCEDURE IF EXISTS add_kind_fk_if_missing;
DELIMITER $$
CREATE PROCEDURE add_kind_fk_if_missing()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'menus_ingredients' AND constraint_name = 'fk_menus_ingredients_kind') THEN
        ALTER TABLE menus_ingredients ADD CONSTRAINT fk_menus_ingredients_kind FOREIGN KEY (kind_id) REFERENCES menus_ingredient_kinds (id) ON DELETE RESTRICT;
    END IF;
END$$
DELIMITER ;

CALL add_kind_fk_if_missing();
DROP PROCEDURE IF EXISTS add_kind_fk_if_missing;

-- PART C - CHECK AFTER
-- C1. the four kinds
SELECT id, code, name, in_recipes, sold_as_is, free_extra, packaging FROM menus_ingredient_kinds ORDER BY sort_order;
-- C2. ingredients per kind (all Cooking ingredient; none with an empty kind)
SELECT k.name AS kind, COUNT(i.id) AS ingredients FROM menus_ingredient_kinds k LEFT JOIN menus_ingredients i ON i.kind_id = k.id GROUP BY k.id, k.name ORDER BY k.sort_order;
SELECT COUNT(*) AS without_a_kind FROM menus_ingredients WHERE kind_id IS NULL;
-- C3. the foreign key is there (1 row)
SELECT constraint_name FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'menus_ingredients' AND constraint_name = 'fk_menus_ingredients_kind';
