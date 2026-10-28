-- =====================================================================
-- 228_report_settings.sql
-- Books reports rebuild, step 3: the Reports settings (Books -> Configuration -> Reports).
--   report_settings        one row per setting that has been saved or seeded: its key and its value (JSON)
--   report_settings_log    every change: which setting, the old and the new value, who, when
-- A setting with no row uses the default written in the application, so only the settings that name your groups need a starting row.
-- Those are seeded below from your chart of accounts, looked up by name this once and kept as ids from then on:
--   money_account_groups   the groups whose ledgers count as cash and bank in the money reports   (Cash-in-hand, Bank Accounts)
--   reconcilable_groups    the groups whose ledgers can be reconciled                              (Cash-in-hand, Bank Accounts)
--   ratio_inputs           which groups or statement lines each ratio-analysis figure adds up
-- A group that is not in your chart is skipped and shown in PART C, to be chosen on the screen. A row that is already there is never changed.
-- Plan: docs/BOOKS_REPORTS_PLAN.md (sections 9 and 12, step 3). Run 227 first. Safe to re-run. Run each part on its own in Workbench.
-- Collation: the tables use utf8mb4_unicode_ci and every text comparison against a group column says so (as in 227).
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Are the tables there already? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('report_settings', 'report_settings_log');

-- A2. Is 227 done? (expect 1 row: statements)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'statements';

-- A3. The groups the starting values are taken from. Expect the 10 rows below; a name missing here is skipped.
SELECT g.id, g.name, g.nature FROM ledger_groups g
WHERE g.name COLLATE utf8mb4_unicode_ci IN ('Cash-in-hand', 'Bank Accounts', 'Bank OD Accounts', 'Sundry Debtors', 'Sundry Creditors', 'Stock-in-hand', 'Capital Account', 'Loans (Liability)', 'Purchase Accounts')
ORDER BY g.name;

-- PART B - CHANGE
-- B1. The tables
CREATE TABLE IF NOT EXISTS report_settings (
    setting_key  VARCHAR(80) NOT NULL PRIMARY KEY,
    value        JSON NOT NULL,
    updated_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_settings_log (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    setting_key   VARCHAR(80) NOT NULL,
    old_value     JSON NULL,                       -- what it was before the change (its default, if it had never been saved)
    new_value     JSON NOT NULL,
    changed_by    BIGINT UNSIGNED NULL,
    changed_by_name VARCHAR(120) NULL,             -- kept as text so the log still reads right if the person is removed later
    created_at    TIMESTAMP NULL,
    KEY idx_report_settings_log_key (setting_key, id),
    KEY idx_report_settings_log_when (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- If either table was made earlier with the server's default collation, bring it in line (small tables; safe to repeat).
ALTER TABLE report_settings     CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE report_settings_log CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- B2. The starting values. Each group's id is looked up by name once; INSERT IGNORE leaves any row that exists.
SET @cash   := (SELECT id FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Cash-in-hand'      ORDER BY id LIMIT 1);
SET @bank   := (SELECT id FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Bank Accounts'     ORDER BY id LIMIT 1);
SET @bankod := (SELECT id FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Bank OD Accounts'  ORDER BY id LIMIT 1);
SET @debt   := (SELECT id FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Sundry Debtors'    ORDER BY id LIMIT 1);
SET @cred   := (SELECT id FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Sundry Creditors'  ORDER BY id LIMIT 1);
SET @stock  := (SELECT id FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Stock-in-hand'     ORDER BY id LIMIT 1);
SET @cap    := (SELECT id FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Capital Account'   ORDER BY id LIMIT 1);
SET @loans  := (SELECT id FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Loans (Liability)' ORDER BY id LIMIT 1);
SET @purch  := (SELECT id FROM ledger_groups WHERE name COLLATE utf8mb4_unicode_ci = 'Purchase Accounts' ORDER BY id LIMIT 1);

-- the two money lists: each group that exists, once (a chart with only one of the two gets that one)
SET @money := CASE WHEN @cash IS NOT NULL AND @bank IS NOT NULL THEN JSON_ARRAY(@cash, @bank)
                   WHEN @cash IS NOT NULL THEN JSON_ARRAY(@cash)
                   WHEN @bank IS NOT NULL THEN JSON_ARRAY(@bank)
                   ELSE JSON_ARRAY() END;
INSERT IGNORE INTO report_settings (setting_key, value, created_at, updated_at) VALUES
 ('money_account_groups', @money, NOW(), NOW()),
 ('reconcilable_groups',  @money, NOW(), NOW());

INSERT IGNORE INTO report_settings (setting_key, value, created_at, updated_at) VALUES
 ('ratio_inputs', JSON_OBJECT(
    'current_assets',      JSON_OBJECT('groups', JSON_ARRAY(), 'statements', JSON_ARRAY('BS.A.C')),
    'current_liabilities', JSON_OBJECT('groups', JSON_ARRAY(), 'statements', JSON_ARRAY('BS.L.C')),
    'cash',                JSON_OBJECT('groups', IF(@cash   IS NULL, JSON_ARRAY(), JSON_ARRAY(@cash)),   'statements', JSON_ARRAY()),
    'bank',                JSON_OBJECT('groups', IF(@bank   IS NULL, JSON_ARRAY(), JSON_ARRAY(@bank)),   'statements', JSON_ARRAY()),
    'bank_overdraft',      JSON_OBJECT('groups', IF(@bankod IS NULL, JSON_ARRAY(), JSON_ARRAY(@bankod)), 'statements', JSON_ARRAY()),
    'debtors',             JSON_OBJECT('groups', IF(@debt   IS NULL, JSON_ARRAY(), JSON_ARRAY(@debt)),   'statements', JSON_ARRAY()),
    'creditors',           JSON_OBJECT('groups', IF(@cred   IS NULL, JSON_ARRAY(), JSON_ARRAY(@cred)),   'statements', JSON_ARRAY()),
    'stock',               JSON_OBJECT('groups', IF(@stock  IS NULL, JSON_ARRAY(), JSON_ARRAY(@stock)),  'statements', JSON_ARRAY()),
    'capital',             JSON_OBJECT('groups', IF(@cap    IS NULL, JSON_ARRAY(), JSON_ARRAY(@cap)),    'statements', JSON_ARRAY()),
    'loans',               JSON_OBJECT('groups', IF(@loans  IS NULL, JSON_ARRAY(), JSON_ARRAY(@loans)),  'statements', JSON_ARRAY()),
    'sales',               JSON_OBJECT('groups', JSON_ARRAY(), 'statements', JSON_ARRAY('IS.REV')),
    'purchases',           JSON_OBJECT('groups', IF(@purch  IS NULL, JSON_ARRAY(), JSON_ARRAY(@purch)),  'statements', JSON_ARRAY())
  ), NOW(), NOW());

-- PART C - RESULT CHECKS. Run on their own.
-- C1. The tables are there (2 rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('report_settings', 'report_settings_log');

-- C2. The starting rows: expect 3 (money_account_groups, reconcilable_groups, ratio_inputs). The first two list the group ids, e.g. [24, 23].
SELECT setting_key, value FROM report_settings ORDER BY setting_key;

-- C3. The groups those ids stand for. Expect Cash-in-hand and Bank Accounts. If a group is missing, choose it on the Reports settings screen.
SELECT g.id, g.name FROM ledger_groups g
WHERE JSON_CONTAINS((SELECT value FROM report_settings WHERE setting_key = 'reconcilable_groups'), CAST(g.id AS CHAR));

-- C4. Ratio figures that have no group or statement line yet (a group that was not in your chart). Expect 0 rows on this chart.
SELECT j.input_name FROM report_settings s
JOIN JSON_TABLE(JSON_KEYS(s.value), '$[*]' COLUMNS (input_name VARCHAR(40) PATH '$')) j
WHERE s.setting_key = 'ratio_inputs'
  AND JSON_LENGTH(JSON_EXTRACT(s.value, CONCAT('$.', j.input_name, '.groups'))) + JSON_LENGTH(JSON_EXTRACT(s.value, CONCAT('$.', j.input_name, '.statements'))) = 0;

-- C5. The log is empty (0)
SELECT COUNT(*) AS log_rows FROM report_settings_log;
