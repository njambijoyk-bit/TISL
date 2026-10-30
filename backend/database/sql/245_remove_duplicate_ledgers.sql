-- =====================================================================
-- 245_remove_duplicate_ledgers.sql
-- Two ledgers were made twice: "Rounding" (id 211) beside "Rounding Off" (id 13), and "Discount Allowed" (id 207) beside "Discounts Allowed" (id 12). The ones kept are the
-- older, seeded ones: "Rounding Off" (in use) and "Discounts Allowed". This script removes "Rounding" and "Discount Allowed", but ONLY when nothing at all points at them.
--   - If a setting (Default ledgers) still points at one of the two, it is pointed at the one that stays first.
--   - If any voucher entry, voucher line, bill, tax rule, budget row or other record still uses one, NOTHING is deleted and the script says so; run Part A to see what.
-- Scripts 35 and 37 no longer make these two again on a fresh install. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. The four ledgers (expect 4 rows: both pairs; the two to remove have no postings)
SELECT l.id, l.name, g.name AS `group`, l.is_system, l.is_active, l.opening_balance
FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id
WHERE l.name IN ('Rounding', 'Rounding Off', 'Discount Allowed', 'Discounts Allowed') ORDER BY l.name;

-- A2. Everything that points at the two to be removed (expect 0 rows; anything shown here blocks the removal in Part B, which also checks budgets and the Reports settings)
SET @dups := (SELECT GROUP_CONCAT(id) FROM ledgers WHERE (name = 'Rounding' AND id = 211) OR (name = 'Discount Allowed' AND id = 207));
SET SESSION group_concat_max_len = 1000000;
SELECT GROUP_CONCAT(CONCAT('SELECT ''', c.table_name, '.', c.column_name, ''' AS pointer, COUNT(*) AS rows_pointing FROM `', c.table_name, '` WHERE `', c.column_name, '` IN (', IFNULL(@dups, '0'), ') HAVING COUNT(*) > 0') SEPARATOR ' UNION ALL ')
INTO @q
FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
WHERE c.table_schema = DATABASE() AND c.column_name REGEXP 'ledger_id$' AND c.table_name <> 'accounting_settings';
SET @q := IFNULL(@q, 'SELECT 1 AS pointer, 0 AS rows_pointing FROM DUAL WHERE 1 = 0');
PREPARE st FROM @q; EXECUTE st; DEALLOCATE PREPARE st;

-- A3. Which Default ledgers settings point at them (these are moved to the ones that stay in Part B)
SELECT 'accounting_settings' AS setting_table, rounding_ledger_id, discount_ledger_id, discount_allowed_ledger_id FROM accounting_settings WHERE id = 1;

-- PART B - CHANGE
DROP PROCEDURE IF EXISTS remove_duplicate_ledgers_245;
DELIMITER $$
CREATE PROCEDURE remove_duplicate_ledgers_245()
BEGIN
    DECLARE r_dup BIGINT DEFAULT NULL;   -- Rounding (to remove)
    DECLARE r_keep BIGINT DEFAULT NULL;  -- Rounding Off (stays)
    DECLARE d_dup BIGINT DEFAULT NULL;   -- Discount Allowed (to remove)
    DECLARE d_keep BIGINT DEFAULT NULL;  -- Discounts Allowed (stays)
    DECLARE cols TEXT DEFAULT NULL;
    DECLARE ids TEXT DEFAULT NULL;
    SELECT id INTO r_dup  FROM ledgers WHERE name = 'Rounding'          ORDER BY id LIMIT 1;
    SELECT id INTO r_keep FROM ledgers WHERE name = 'Rounding Off'      ORDER BY id LIMIT 1;
    SELECT id INTO d_dup  FROM ledgers WHERE name = 'Discount Allowed'  ORDER BY id LIMIT 1;
    SELECT id INTO d_keep FROM ledgers WHERE name = 'Discounts Allowed' ORDER BY id LIMIT 1;

    -- the settings point at the ledgers that stay (only the ones that pointed at a duplicate change)
    IF r_dup IS NOT NULL AND r_keep IS NOT NULL THEN
        SELECT GROUP_CONCAT(CONCAT('`', column_name, '` = IF(`', column_name, '` = ', r_dup, ', ', r_keep, ', `', column_name, '`)')) INTO cols
        FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'accounting_settings' AND column_name REGEXP 'ledger_id$';
        IF cols IS NOT NULL THEN
            SET @u := CONCAT('UPDATE accounting_settings SET ', cols, ' WHERE id > 0');
            PREPARE st FROM @u; EXECUTE st; DEALLOCATE PREPARE st;
        END IF;
    END IF;
    IF d_dup IS NOT NULL AND d_keep IS NOT NULL THEN
        SET cols = NULL;
        SELECT GROUP_CONCAT(CONCAT('`', column_name, '` = IF(`', column_name, '` = ', d_dup, ', ', d_keep, ', `', column_name, '`)')) INTO cols
        FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'accounting_settings' AND column_name REGEXP 'ledger_id$';
        IF cols IS NOT NULL THEN
            SET @u := CONCAT('UPDATE accounting_settings SET ', cols, ' WHERE id > 0');
            PREPARE st FROM @u; EXECUTE st; DEALLOCATE PREPARE st;
        END IF;
    END IF;

    -- is anything still pointing at a duplicate? (every column named ...ledger_id in every table, the settings included now)
    SET ids = CONCAT_WS(',', IF(r_keep IS NOT NULL, r_dup, NULL), IF(d_keep IS NOT NULL, d_dup, NULL));
    IF ids IS NOT NULL AND ids <> '' THEN
        SELECT GROUP_CONCAT(CONCAT('SELECT COUNT(*) AS c FROM `', c.table_name, '` WHERE `', c.column_name, '` IN (', ids, ')') SEPARATOR ' UNION ALL ')
        INTO @q2
        FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
        WHERE c.table_schema = DATABASE() AND c.column_name REGEXP 'ledger_id$';
        -- budgets name a ledger by target_id, and the Reports settings keep ledger ids inside a list: check those too, when the tables are there
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'budget_rows') THEN
            SET @q2 = CONCAT(@q2, ' UNION ALL SELECT COUNT(*) FROM budget_rows WHERE target_type = ''ledger'' AND target_id IN (', ids, ')');
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'budget_template_lines') THEN
            SET @q2 = CONCAT(@q2, ' UNION ALL SELECT COUNT(*) FROM budget_template_lines WHERE target_type = ''ledger'' AND target_id IN (', ids, ')');
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'report_settings') THEN
            SET @q2 = CONCAT(@q2, ' UNION ALL SELECT COUNT(*) FROM report_settings WHERE value REGEXP ''(^|[^0-9])(', REPLACE(ids, ',', '|'), ')([^0-9]|$)''');
        END IF;
        SET @q3 := CONCAT('SELECT IFNULL(SUM(c), 0) INTO @still_used FROM (', @q2, ') x');
        PREPARE st FROM @q3; EXECUTE st; DEALLOCATE PREPARE st;
        IF @still_used > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Something still uses Rounding or Discount Allowed, so nothing was deleted. Run Part A2 to see what.';
        END IF;
        IF r_dup IS NOT NULL AND r_keep IS NOT NULL THEN
            DELETE FROM ledgers WHERE id = r_dup AND name = 'Rounding' AND id > 0;
        END IF;
        IF d_dup IS NOT NULL AND d_keep IS NOT NULL THEN
            DELETE FROM ledgers WHERE id = d_dup AND name = 'Discount Allowed' AND id > 0;
        END IF;
    END IF;
END$$
DELIMITER ;
CALL remove_duplicate_ledgers_245();
DROP PROCEDURE IF EXISTS remove_duplicate_ledgers_245;

-- PART C - CHECK. Expect "Rounding Off" and "Discounts Allowed" only, then the settings pointing at them.
SELECT l.id, l.name, g.name AS `group` FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE l.name IN ('Rounding', 'Rounding Off', 'Discount Allowed', 'Discounts Allowed') ORDER BY l.name;
SELECT rounding_ledger_id, discount_ledger_id, discount_allowed_ledger_id FROM accounting_settings WHERE id = 1;
