-- =====================================================================
-- 133_menus_recipe_lines.sql
-- Menus module, step 1.2 (docs/MENUS_PLAN.md): recipe lines that can name an ingredient family, be written in a recipe unit (g, ml, each) and lose some to waste;
-- a recipe's method (steps with time and a photo) and whether it may be shown outside the kitchen.
--   recipe_items.family_id    an ingredient family (script 132) instead of one exact stock item (variant_id is then empty)
--   recipe_items.unit_id      the unit the quantity is written in (empty = the stock unit, as before)
--   recipe_items.waste_pct    what is lost in preparing it (peeling loses 15): the kitchen takes quantity / (1 - waste)
--   recipes.visibility        internal (kitchen only) | publishable (may be shown on the website and in courses; never with cost or supplier)
--   recipes.prep_minutes, recipes.cook_minutes
--   recipe_steps              the method, in order
-- Every existing recipe keeps working exactly as it did. Run 132 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (expect 0 rows on a first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND ((table_name = 'recipe_items' AND column_name IN ('family_id', 'unit_id', 'waste_pct')) OR (table_name = 'recipes' AND column_name IN ('visibility', 'prep_minutes', 'cook_minutes')));

-- PART B - ADD THE COLUMNS AND THE STEPS TABLE
DROP PROCEDURE IF EXISTS add_column_if_missing;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('recipe_items', 'family_id',  'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('recipe_items', 'unit_id',    'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('recipe_items', 'waste_pct',  'DECIMAL(5,2) NOT NULL DEFAULT 0');
CALL add_column_if_missing('recipes', 'visibility',      "VARCHAR(12) NOT NULL DEFAULT 'internal'");
CALL add_column_if_missing('recipes', 'prep_minutes',    'SMALLINT UNSIGNED NULL');
CALL add_column_if_missing('recipes', 'cook_minutes',    'SMALLINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- a line names either an exact stock item or a family
ALTER TABLE recipe_items MODIFY variant_id BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS recipe_steps (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipe_id   BIGINT UNSIGNED NOT NULL,
    position    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    body        TEXT NOT NULL,
    minutes     SMALLINT UNSIGNED NULL,
    image       VARCHAR(255) NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_recipe_steps (recipe_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - READ-ONLY CHECK (expect 6 rows)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND ((table_name = 'recipe_items' AND column_name IN ('family_id', 'unit_id', 'waste_pct')) OR (table_name = 'recipes' AND column_name IN ('visibility', 'prep_minutes', 'cook_minutes')));
