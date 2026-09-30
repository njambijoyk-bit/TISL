-- =====================================================================
-- 31_work_in_progress_jobs.sql
-- Work in progress on long jobs (a fabrication that takes weeks).
--
-- Materials issued to a job leave stock and sit in a "Work in Progress" asset
-- ledger (Dr Work in Progress, Cr Stock) instead of being expensed straight
-- away. When the job is completed, its cost moves to Cost of Services
-- (Dr Cost of Services, Cr Work in Progress). Cancelling an open job returns
-- the materials to stock.
--
--   accounting_settings.wip_ledger_id   the Work in Progress ledger (seeded below)
--   stock_jobs                          one row per job (JB-000001 ...)
--   stock_job_lines                     materials issued to it, by batch
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Already there? (expect 0 rows on first run)
SELECT table_name AS found FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('stock_jobs', 'stock_job_lines')
UNION ALL
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'accounting_settings' AND column_name = 'wip_ledger_id';

-- A2. The group the ledger goes under (expect 1 row)
SELECT id, name, nature FROM ledger_groups WHERE name = 'Stock-in-hand';

-- A3. A ledger with this name already? (expect 0 rows on first run)
SELECT id, name, group_id FROM ledgers WHERE name = 'Work in Progress';

-- PART B — CREATE TABLES / ADD COLUMN (DDL commits on its own)
CREATE TABLE IF NOT EXISTS stock_jobs (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number               VARCHAR(20) NULL,
    title                VARCHAR(160) NOT NULL,
    customer_id          BIGINT UNSIGNED NULL,
    location_id          BIGINT UNSIGNED NOT NULL,          -- the branch materials come from
    status               VARCHAR(10) NOT NULL DEFAULT 'open',   -- open | completed | cancelled
    note                 VARCHAR(255) NULL,
    invoice_voucher_id   BIGINT UNSIGNED NULL,              -- the invoice raised for it, when known
    created_by           BIGINT UNSIGNED NULL,
    completed_at         DATETIME NULL,
    created_at           TIMESTAMP NULL,
    updated_at           TIMESTAMP NULL,
    KEY idx_job_status (status),
    KEY idx_job_customer (customer_id)
);

CREATE TABLE IF NOT EXISTS stock_job_lines (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    job_id       BIGINT UNSIGNED NOT NULL,
    variant_id   BIGINT UNSIGNED NOT NULL,
    batch_id     BIGINT UNSIGNED NOT NULL,
    quantity     DECIMAL(18,4) NOT NULL,                    -- issued, base units (less anything returned)
    unit_cost    DECIMAL(18,4) NOT NULL DEFAULT 0,
    voucher_id   BIGINT UNSIGNED NULL,                      -- the journal that moved it into Work in Progress
    issued_at    DATETIME NULL,
    KEY idx_jline_job (job_id)
);

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

CALL add_column_if_missing('accounting_settings', 'wip_ledger_id', 'BIGINT UNSIGNED NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C — SEED THE LEDGER AND POINT THE SETTING AT IT (transaction; re-runnable)
SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

SET @grp_stock := (SELECT id FROM ledger_groups WHERE name = 'Stock-in-hand' ORDER BY id LIMIT 1);

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_stock, 'Work in Progress', 0, 1, 1, NOW(), NOW()
WHERE @grp_stock IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Work in Progress');

INSERT INTO accounting_settings (id, edit_window_days)
SELECT 1, 30 WHERE NOT EXISTS (SELECT 1 FROM accounting_settings WHERE id = 1);

UPDATE accounting_settings
SET wip_ledger_id = (SELECT id FROM ledgers WHERE name = 'Work in Progress' ORDER BY id LIMIT 1)
WHERE id = 1 AND wip_ledger_id IS NULL;

COMMIT;

SET SQL_SAFE_UPDATES = @old_safe;

-- PART D — RESULT CHECK. Expect: both tables, one ledger, the setting filled in.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('stock_jobs', 'stock_job_lines');
SELECT l.id, l.name, g.name AS `group` FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE l.name = 'Work in Progress';
SELECT wip_ledger_id FROM accounting_settings WHERE id = 1;
