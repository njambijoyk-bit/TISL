-- =====================================================================
-- 227_statements.sql
-- Books reports rebuild, step 1: which financial statement a ledger belongs to.
--   statements                     a tree: Balance sheet / Income statement > sections > lines. Ledgers and groups attach to a LINE.
--   ledger_groups.statement_id     the line a group's ledgers go to (a subgroup takes its parent's unless it has its own)
--   ledgers.statement_id           the line this ledger goes to; copied from its group, and can be changed per ledger
-- Nothing in today's reports reads these columns yet, so nothing on screen changes when this runs.
-- Plan: docs/BOOKS_REPORTS_PLAN.md (sections 3.1 to 3.3). Safe to re-run: it never overwrites a line that is already set.
-- Run each part on its own in Workbench. PART D (foreign keys) is optional: read it first.
-- Collation: the new table and the work tables use utf8mb4_unicode_ci (what the ledger tables use), and every text comparison against a
-- ledger or group column says so, so it runs the same on a server whose default collation is different (for example MySQL 8's utf8mb4_0900_ai_ci).
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Are the table and the columns there already? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'statements'
UNION ALL SELECT CONCAT(table_name, '.', column_name) FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name IN ('ledger_groups', 'ledgers') AND column_name = 'statement_id';

-- A2. The id types we will point at (PART D needs both to say bigint unsigned)
SELECT table_name, column_name, column_type FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name IN ('ledger_groups', 'ledgers') AND column_name = 'id';

-- A3. Your groups today, with their parent and nature (compare with the mapping in PART B)
SELECT g.id, g.parent_id, g.name, g.nature, g.is_system, g.affects_gross_profit, (SELECT COUNT(*) FROM ledgers l WHERE l.group_id = g.id) AS ledgers
FROM ledger_groups g ORDER BY COALESCE(g.parent_id, g.id), g.parent_id IS NOT NULL, g.sort_order, g.name;

-- A4. Group names that appear more than once (expect 0 rows: the mapping below goes by name)
SELECT name, COUNT(*) AS groups_with_this_name FROM ledger_groups GROUP BY name HAVING COUNT(*) > 1;

-- A5. How many ledgers there are (each will get a line)
SELECT COUNT(*) AS ledgers FROM ledgers;

-- PART B - CHANGE. Run B1 to B5 one after the other.

-- B1. The statements table
CREATE TABLE IF NOT EXISTS statements (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    parent_id           BIGINT UNSIGNED NULL,
    code                VARCHAR(40) NOT NULL,
    name                VARCHAR(120) NOT NULL,
    kind                VARCHAR(10) NOT NULL DEFAULT 'line',      -- heading: groups other rows, takes no ledgers | line: ledgers post to it
    nature              VARCHAR(10) NULL,                        -- the one nature a line accepts: asset | liability | income | expense (equity lines use liability)
    normal_side         CHAR(1) NULL,                            -- D or C, for showing signs
    cash_flow_category  VARCHAR(12) NULL,                        -- filled in when the cash flow statement is built (step 8)
    sort_order          INT NOT NULL DEFAULT 0,
    is_system           TINYINT(1) NOT NULL DEFAULT 0,           -- a system row can be renamed but not deleted
    is_active           TINYINT(1) NOT NULL DEFAULT 1,
    created_at          TIMESTAMP NULL,
    updated_at          TIMESTAMP NULL,
    UNIQUE KEY uq_statements_code (code),
    KEY idx_statements_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- B1b. If the table was made earlier with the server's default collation (a first run that stopped part-way), bring it in line.
-- Safe to repeat; the table is small.
ALTER TABLE statements CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- B2. The default tree. Level 1 is the two statements, level 2 their sections, then sub-sections and lines.
DROP TEMPORARY TABLE IF EXISTS tmp_stmt_seed;
CREATE TEMPORARY TABLE tmp_stmt_seed (
    lvl INT NOT NULL, code VARCHAR(40) NOT NULL, parent_code VARCHAR(40) NULL, name VARCHAR(120) NOT NULL,
    kind VARCHAR(10) NOT NULL, nature VARCHAR(10) NULL, side CHAR(1) NULL, sort_order INT NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO tmp_stmt_seed (lvl, code, parent_code, name, kind, nature, side, sort_order) VALUES
 (1, 'BS',            NULL,        'Balance sheet',                  'heading', NULL,        NULL, 1),
 (1, 'IS',            NULL,        'Income statement',               'heading', NULL,        NULL, 2),
 (2, 'BS.A',          'BS',        'Assets',                         'heading', NULL,        NULL, 1),
 (2, 'BS.E',          'BS',        'Equity',                         'heading', NULL,        NULL, 2),
 (2, 'BS.L',          'BS',        'Liabilities',                    'heading', NULL,        NULL, 3),
 (3, 'BS.A.NC',       'BS.A',      'Non-current assets',             'heading', NULL,        NULL, 1),
 (3, 'BS.A.C',        'BS.A',      'Current assets',                 'heading', NULL,        NULL, 2),
 (3, 'BS.E.CAP',      'BS.E',      'Owner or share capital',         'line',    'liability', 'C',  1),
 (3, 'BS.E.RES',      'BS.E',      'Reserves and retained earnings', 'line',    'liability', 'C',  2),
 (3, 'BS.L.NC',       'BS.L',      'Non-current liabilities',        'heading', NULL,        NULL, 1),
 (3, 'BS.L.C',        'BS.L',      'Current liabilities',            'heading', NULL,        NULL, 2),
 (4, 'BS.A.NC.PPE',   'BS.A.NC',   'Property and equipment',         'line',    'asset',     'D',  1),
 (4, 'BS.A.NC.INV',   'BS.A.NC',   'Investments',                    'line',    'asset',     'D',  2),
 (4, 'BS.A.NC.OTH',   'BS.A.NC',   'Other non-current assets',       'line',    'asset',     'D',  3),
 (4, 'BS.A.C.STOCK',  'BS.A.C',    'Inventory',                      'line',    'asset',     'D',  1),
 (4, 'BS.A.C.REC',    'BS.A.C',    'Trade receivables',              'line',    'asset',     'D',  2),
 (4, 'BS.A.C.CASH',   'BS.A.C',    'Cash and bank',                  'line',    'asset',     'D',  3),
 (4, 'BS.A.C.OTH',    'BS.A.C',    'Other current assets',           'line',    'asset',     'D',  4),
 (4, 'BS.L.NC.LOAN',  'BS.L.NC',   'Long-term loans',                'line',    'liability', 'C',  1),
 (4, 'BS.L.C.PAY',    'BS.L.C',    'Trade payables',                 'line',    'liability', 'C',  1),
 (4, 'BS.L.C.BORR',   'BS.L.C',    'Short-term borrowings',          'line',    'liability', 'C',  2),
 (4, 'BS.L.C.TAX',    'BS.L.C',    'Taxes payable',                  'line',    'liability', 'C',  3),
 (4, 'BS.L.C.PROV',   'BS.L.C',    'Provisions and other',           'line',    'liability', 'C',  4),
 (4, 'BS.L.C.OTH',    'BS.L.C',    'Other current liabilities',      'line',    'liability', 'C',  5),
 (4, 'BS.L.C.SUSP',   'BS.L.C',    'Suspense (to be cleared)',       'line',    'liability', 'C',  6),
 (2, 'IS.REV',        'IS',        'Revenue',                        'line',    'income',    'C',  1),
 (2, 'IS.COGS',       'IS',        'Cost of sales',                  'line',    'expense',   'D',  2),
 (2, 'IS.OTHINC',     'IS',        'Other income',                   'line',    'income',    'C',  3),
 (2, 'IS.OPEX',       'IS',        'Operating expenses',             'line',    'expense',   'D',  4),
 (2, 'IS.FININC',     'IS',        'Finance income',                 'line',    'income',    'C',  5),
 (2, 'IS.FINCOST',    'IS',        'Finance costs',                  'line',    'expense',   'D',  6),
 (2, 'IS.TAX',        'IS',        'Income tax',                     'line',    'expense',   'D',  7);

-- parents first, one level at a time; a row that is there already is left as it is
INSERT IGNORE INTO statements (parent_id, code, name, kind, nature, normal_side, sort_order, is_system, is_active, created_at, updated_at)
SELECT p.id, s.code, s.name, s.kind, s.nature, s.side, s.sort_order, 1, 1, NOW(), NOW()
FROM tmp_stmt_seed s LEFT JOIN statements p ON p.code = s.parent_code WHERE s.lvl = 1;
INSERT IGNORE INTO statements (parent_id, code, name, kind, nature, normal_side, sort_order, is_system, is_active, created_at, updated_at)
SELECT p.id, s.code, s.name, s.kind, s.nature, s.side, s.sort_order, 1, 1, NOW(), NOW()
FROM tmp_stmt_seed s LEFT JOIN statements p ON p.code = s.parent_code WHERE s.lvl = 2;
INSERT IGNORE INTO statements (parent_id, code, name, kind, nature, normal_side, sort_order, is_system, is_active, created_at, updated_at)
SELECT p.id, s.code, s.name, s.kind, s.nature, s.side, s.sort_order, 1, 1, NOW(), NOW()
FROM tmp_stmt_seed s LEFT JOIN statements p ON p.code = s.parent_code WHERE s.lvl = 3;
INSERT IGNORE INTO statements (parent_id, code, name, kind, nature, normal_side, sort_order, is_system, is_active, created_at, updated_at)
SELECT p.id, s.code, s.name, s.kind, s.nature, s.side, s.sort_order, 1, 1, NOW(), NOW()
FROM tmp_stmt_seed s LEFT JOIN statements p ON p.code = s.parent_code WHERE s.lvl = 4;
DROP TEMPORARY TABLE IF EXISTS tmp_stmt_seed;

-- B3. The two columns, and an index on each
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
CREATE PROCEDURE add_index_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(255))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics
                   WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_column_if_missing('ledger_groups', 'statement_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('ledgers',       'statement_id', 'BIGINT UNSIGNED NULL');
CALL add_index_if_missing('ledger_groups', 'idx_ledger_groups_statement', 'statement_id');
CALL add_index_if_missing('ledgers',       'idx_ledgers_statement',       'statement_id');
DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS add_index_if_missing;

-- Workbench's safe-update mode refuses updates that do not name a key; B4 and B5 are deliberate bulk updates, so it is switched off for them
-- and put back after B5 (the same way script 22 does it).
SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

-- B4. Put each group on a line. Only groups with no line yet are touched, and only when the line accepts the group's nature
-- (a group whose nature does not fit is left empty and shows up in PART C). Groups not listed here take their parent's line.
DROP TEMPORARY TABLE IF EXISTS tmp_group_map;
CREATE TEMPORARY TABLE tmp_group_map (group_name VARCHAR(120) NOT NULL, code VARCHAR(40) NOT NULL) DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO tmp_group_map (group_name, code) VALUES
 ('Capital Account',                      'BS.E.CAP'),
 ('Reserves & Surplus',                   'BS.E.RES'),
 ('Loans (Liability)',                    'BS.L.NC.LOAN'),
 ('Secured Loans',                        'BS.L.NC.LOAN'),
 ('Unsecured Loans',                      'BS.L.NC.LOAN'),
 ('Bank OD Accounts',                     'BS.L.C.BORR'),
 ('Current Liabilities',                  'BS.L.C.OTH'),
 ('Duties & Taxes',                       'BS.L.C.TAX'),
 ('Provisions',                           'BS.L.C.PROV'),
 ('Sundry Creditors',                     'BS.L.C.PAY'),
 ('Suspense A/c',                         'BS.L.C.SUSP'),
 ('Fixed Assets',                         'BS.A.NC.PPE'),
 ('Investments',                          'BS.A.NC.INV'),
 ('Misc. Expenses (Asset)',               'BS.A.NC.OTH'),
 ('Current Assets',                       'BS.A.C.OTH'),
 ('Bank Accounts',                        'BS.A.C.CASH'),
 ('Cash-in-hand',                         'BS.A.C.CASH'),
 ('Stock-in-hand',                        'BS.A.C.STOCK'),
 ('Sundry Debtors',                       'BS.A.C.REC'),
 ('Sales Accounts',                       'IS.REV'),
 ('Service Income',                       'IS.REV'),
 ('Direct Incomes',                       'IS.REV'),
 ('Purchase Accounts',                    'IS.COGS'),
 ('Direct Expenses',                      'IS.COGS'),
 ('Indirect Incomes',                     'IS.OTHINC'),
 ('Indirect Expenses',                    'IS.OPEX');

UPDATE ledger_groups g
JOIN tmp_group_map m ON m.group_name = g.name COLLATE utf8mb4_unicode_ci
JOIN statements s ON s.code = m.code AND s.kind = 'line' AND s.nature = g.nature COLLATE utf8mb4_unicode_ci
SET g.statement_id = s.id
WHERE g.statement_id IS NULL;
DROP TEMPORARY TABLE IF EXISTS tmp_group_map;

-- subgroups not listed (Value Added Tax, Withholding tax, Service Fees, Shipping & Delivery, Auction Charges, Auction Deposits, Employee
-- Benefits, Deposits (Asset), and so on) take the line of their parent. Five passes reach any depth the chart has.
UPDATE ledger_groups c JOIN ledger_groups p ON p.id = c.parent_id JOIN statements s ON s.id = p.statement_id AND s.nature = c.nature COLLATE utf8mb4_unicode_ci
SET c.statement_id = p.statement_id WHERE c.statement_id IS NULL AND p.statement_id IS NOT NULL;
UPDATE ledger_groups c JOIN ledger_groups p ON p.id = c.parent_id JOIN statements s ON s.id = p.statement_id AND s.nature = c.nature COLLATE utf8mb4_unicode_ci
SET c.statement_id = p.statement_id WHERE c.statement_id IS NULL AND p.statement_id IS NOT NULL;
UPDATE ledger_groups c JOIN ledger_groups p ON p.id = c.parent_id JOIN statements s ON s.id = p.statement_id AND s.nature = c.nature COLLATE utf8mb4_unicode_ci
SET c.statement_id = p.statement_id WHERE c.statement_id IS NULL AND p.statement_id IS NOT NULL;
UPDATE ledger_groups c JOIN ledger_groups p ON p.id = c.parent_id JOIN statements s ON s.id = p.statement_id AND s.nature = c.nature COLLATE utf8mb4_unicode_ci
SET c.statement_id = p.statement_id WHERE c.statement_id IS NULL AND p.statement_id IS NOT NULL;
UPDATE ledger_groups c JOIN ledger_groups p ON p.id = c.parent_id JOIN statements s ON s.id = p.statement_id AND s.nature = c.nature COLLATE utf8mb4_unicode_ci
SET c.statement_id = p.statement_id WHERE c.statement_id IS NULL AND p.statement_id IS NOT NULL;

-- B5. Put each ledger on its group's line (only ledgers with no line yet), then the four ledgers that belong on a finance line.
UPDATE ledgers l JOIN ledger_groups g ON g.id = l.group_id
SET l.statement_id = g.statement_id
WHERE l.statement_id IS NULL AND g.statement_id IS NOT NULL;

-- Bank charges and exchange losses are finance costs; interest income and exchange gains are finance income. They sit in Indirect Expenses
-- and Indirect Incomes today, so they are moved only while they are still on their group's default line (a line you set yourself is kept).
UPDATE ledgers l
JOIN statements fin ON fin.code = 'IS.FINCOST'
JOIN statements opex ON opex.code = 'IS.OPEX'
SET l.statement_id = fin.id
WHERE l.name IN ('Bank Charges', 'Exchange Loss') AND l.statement_id = opex.id;
UPDATE ledgers l
JOIN statements fin ON fin.code = 'IS.FININC'
JOIN statements oth ON oth.code = 'IS.OTHINC'
SET l.statement_id = fin.id
WHERE l.name IN ('Interest Income', 'Exchange Gain') AND l.statement_id = oth.id;

SET SQL_SAFE_UPDATES = @old_safe;

-- PART C - RESULT CHECKS. Run on their own.
-- C1. The tree. Expect 32 rows in total: 9 headings and 23 lines.
SELECT COUNT(*) AS statement_rows, SUM(kind = 'heading') AS headings, SUM(kind = 'line') AS line_rows FROM statements;

-- C2. Groups with no line. Expect 0 rows. A group listed here has a nature that no line accepts, or a name that was not in the mapping.
SELECT g.id, g.name, g.nature, p.name AS parent FROM ledger_groups g LEFT JOIN ledger_groups p ON p.id = g.parent_id WHERE g.statement_id IS NULL;

-- C3. Ledgers with no line. Expect 0 rows.
SELECT l.id, l.name, g.name AS `group` FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE l.statement_id IS NULL;

-- C4. A line that does not accept the nature of the group it holds. Expect 0 rows from each.
SELECT 'group' AS what, g.id, g.name, g.nature AS group_nature, s.code, s.nature AS line_nature
FROM ledger_groups g JOIN statements s ON s.id = g.statement_id WHERE s.nature IS NULL OR s.nature <> g.nature COLLATE utf8mb4_unicode_ci
UNION ALL
SELECT 'ledger', l.id, l.name, g.nature, s.code, s.nature
FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id JOIN statements s ON s.id = l.statement_id WHERE s.nature IS NULL OR s.nature <> g.nature COLLATE utf8mb4_unicode_ci;

-- C5. A ledger or group sitting on a heading instead of a line. Expect 0 rows.
SELECT 'group' AS what, g.id, g.name FROM ledger_groups g JOIN statements s ON s.id = g.statement_id WHERE s.kind <> 'line'
UNION ALL SELECT 'ledger', l.id, l.name FROM ledgers l JOIN statements s ON s.id = l.statement_id WHERE s.kind <> 'line';

-- C6. What lands where: every line, how many groups and ledgers it holds. Read this against the mapping in the plan.
SELECT s.code, s.name, COUNT(DISTINCT g.id) AS groups_on_line, COUNT(DISTINCT l.id) AS ledgers_on_line
FROM statements s LEFT JOIN ledger_groups g ON g.statement_id = s.id LEFT JOIN ledgers l ON l.statement_id = s.id
WHERE s.kind = 'line' GROUP BY s.id, s.code, s.name, s.sort_order ORDER BY s.code;

-- C7. Ledgers whose line differs from their group's (the four finance ledgers on this chart; any others are yours).
SELECT l.id, l.name, g.name AS `group`, gs.code AS group_line, ls.code AS ledger_line
FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id
LEFT JOIN statements gs ON gs.id = g.statement_id LEFT JOIN statements ls ON ls.id = l.statement_id
WHERE l.statement_id <> g.statement_id OR (l.statement_id IS NULL) <> (g.statement_id IS NULL);

-- C8. The profit the old and the new classification would give must be the same except for the finance lines. Direct (gross-profit) groups
-- must all sit on Revenue or Cost of sales. Expect 0 rows.
SELECT g.id, g.name, g.affects_gross_profit, s.code FROM ledger_groups g JOIN statements s ON s.id = g.statement_id
WHERE g.nature IN ('income', 'expense') AND g.affects_gross_profit = 1 AND s.code NOT IN ('IS.REV', 'IS.COGS');
SELECT g.id, g.name, g.affects_gross_profit, s.code FROM ledger_groups g JOIN statements s ON s.id = g.statement_id
WHERE g.nature IN ('income', 'expense') AND g.affects_gross_profit = 0 AND s.code IN ('IS.REV', 'IS.COGS');

-- PART D - OPTIONAL: FOREIGN KEYS. Recent scripts here use indexes only, so this is left to you.
-- Run it only if A2 showed ledger_groups.id, ledgers.id (and so statements.id) all as bigint unsigned. With a delete restricted, a line that
-- still holds a group or ledger cannot be deleted by accident. If the types differ, skip it: the application checks the same rule.
--
-- ALTER TABLE ledger_groups ADD CONSTRAINT fk_ledger_groups_statement FOREIGN KEY (statement_id) REFERENCES statements (id) ON DELETE RESTRICT;
-- ALTER TABLE ledgers       ADD CONSTRAINT fk_ledgers_statement       FOREIGN KEY (statement_id) REFERENCES statements (id) ON DELETE RESTRICT;
-- ALTER TABLE statements    ADD CONSTRAINT fk_statements_parent       FOREIGN KEY (parent_id)    REFERENCES statements (id) ON DELETE RESTRICT;
