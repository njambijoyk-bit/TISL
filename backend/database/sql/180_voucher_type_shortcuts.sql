-- =====================================================================
-- 180_voucher_type_shortcuts.sql
-- Books: a shortcut letter for each voucher type. Shift+V on any Books page lists the types; pressing a type's letter opens a new voucher of that type.
--   voucher_types.shortcut   one letter A-Z (NULL = none). Each letter belongs to one type. Editable in Books > Configuration > Numbering.
-- Part B also gives the first type of each kind a starting letter (only where the type has none and the letter is free), so the picker is useful at once:
--   Sales S, Cash sale C, Sales order O, Quotation Q, Delivery note D, Credit note N, Receipt R, Purchase P, Purchase order W, Goods received G,
--   Debit note B, Payment Y, Journal J, Contra T, Memorandum M, Opening stock K.
-- Run 77 first (it adds the Memorandum type). Safe to re-run: letters you changed are never overwritten. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK: does the column exist, and what letters are set now?
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voucher_types' AND column_name = 'shortcut';
SELECT id, name, base_type, is_active, shortcut FROM voucher_types ORDER BY id;

-- PART B - CREATE THE COLUMN
DROP PROCEDURE IF EXISTS add_voucher_type_shortcut;
DELIMITER $$
CREATE PROCEDURE add_voucher_type_shortcut()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voucher_types' AND column_name = 'shortcut') THEN
        ALTER TABLE voucher_types ADD COLUMN shortcut CHAR(1) NULL;
    END IF;
END$$
DELIMITER ;
CALL add_voucher_type_shortcut();
DROP PROCEDURE IF EXISTS add_voucher_type_shortcut;

-- PART B2 - STARTING LETTERS (the first type of each kind, only if it has no letter and the letter is not taken)
UPDATE voucher_types SET shortcut = 'S' WHERE base_type = 'sales'          AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'S') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'C' WHERE base_type = 'cash_sale'      AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'C') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'O' WHERE base_type = 'sales_order'    AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'O') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'Q' WHERE base_type = 'quotation'      AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'Q') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'D' WHERE base_type = 'delivery_note'  AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'D') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'N' WHERE base_type = 'credit_note'    AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'N') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'R' WHERE base_type = 'receipt'        AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'R') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'P' WHERE base_type = 'purchase'       AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'P') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'W' WHERE base_type = 'purchase_order' AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'W') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'G' WHERE base_type = 'receipt_note'   AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'G') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'B' WHERE base_type = 'debit_note'     AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'B') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'Y' WHERE base_type = 'payment'        AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'Y') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'J' WHERE base_type = 'journal'        AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'J') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'T' WHERE base_type = 'contra'         AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'T') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'M' WHERE base_type = 'memorandum'     AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'M') ORDER BY id LIMIT 1;
UPDATE voucher_types SET shortcut = 'K' WHERE base_type = 'opening_stock'  AND shortcut IS NULL AND NOT EXISTS (SELECT 1 FROM (SELECT shortcut FROM voucher_types) x WHERE x.shortcut = 'K') ORDER BY id LIMIT 1;

-- PART C - CHECK AFTER (every type that should have a letter now has one; no letter appears twice)
SELECT id, name, base_type, is_active, shortcut FROM voucher_types ORDER BY id;
SELECT shortcut, COUNT(*) AS used_by FROM voucher_types WHERE shortcut IS NOT NULL GROUP BY shortcut HAVING COUNT(*) > 1;
