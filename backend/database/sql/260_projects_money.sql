-- =====================================================================
-- 260_projects_money.sql
-- Projects, stage 4: money through Books (docs/PROJECTS_STAGE4_SPEC.md). Run scripts 257 to 259 first.
-- It only ADDS. Nothing is changed or deleted. Existing vouchers, ledgers and balances are untouched.
--   project_client_accounts        client money accounts: a Books bank ledger, pooled or dedicated, its guard on or off
--   project_client_holdings        a balance inside an account, and the work it is held for
--   project_client_holding_owners  who a balance belongs to (several clients = a joint balance)
--   project_billing_stages         a project's billing plan, as shares of the agreed value
--   project_money_terms            per project: retention percentage and ledger, advance ledger
--   project_ledgers                ledgers created in Books from a project
-- And one column in Books: voucher_entries.project_holding_id, which client balance a line belongs to. Empty for every existing line.
-- No table here holds an amount of money: shares and percentages only. Money is always a voucher in the books.
-- Safe to re-run: every table is CREATE IF NOT EXISTS and the column is added only if it is not there.
-- No permission seed is needed: the permissions came with script 257.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 and 1 (the foundation and Books are there), then what exists now (nothing on a first run).
SELECT COUNT(*) AS foundation_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members';
SELECT COUNT(*) AS books_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'voucher_entries';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_client_accounts', 'project_client_holdings', 'project_client_holding_owners', 'project_billing_stages', 'project_money_terms', 'project_ledgers');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voucher_entries' AND column_name = 'project_holding_id';

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_money_guard;
DELIMITER $$
CREATE PROCEDURE projects_money_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Projects foundation is not here. Run script 257 first. Nothing was changed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'voucher_entries') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Books tables are not here. Nothing was changed.';
    END IF;
    -- which client balance a Books line belongs to (empty for every line already there)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voucher_entries' AND column_name = 'project_holding_id') THEN
        SET @s = CONCAT('ALTER TABLE `voucher_entries` ', 'ADD COLUMN `project_holding_id` BIGINT UNSIGNED NULL');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
        SET @s = CONCAT('ALTER TABLE `voucher_entries` ', 'ADD INDEX `voucher_entries_project_holding_idx` (`project_holding_id`)');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL projects_money_guard();
DROP PROCEDURE IF EXISTS projects_money_guard;

CREATE TABLE IF NOT EXISTS project_client_accounts (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ledger_id  BIGINT UNSIGNED NOT NULL,                                -- the Books bank ledger the money sits in (Books owns it)
    liability_ledger_id BIGINT UNSIGNED NULL,                           -- the Books liability ledger that says the money is owed to the clients, not the firm's
    name       VARCHAR(120) NOT NULL,
    kind       VARCHAR(10) NOT NULL DEFAULT 'pooled',                   -- pooled (a balance per client inside one ledger) | dedicated (one ledger, usually one balance)
    guard_on   TINYINT(1) NOT NULL DEFAULT 0,                           -- 1 = Books refuses a line that takes any balance below zero
    is_active  TINYINT(1) NOT NULL DEFAULT 1,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_client_accounts_ledger (ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_client_holdings (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NULL,                                    -- the work it is held for (optional)
    label      VARCHAR(160) NOT NULL,                                   -- how it reads: "Grace and Peter Wambua"
    is_closed  TINYINT(1) NOT NULL DEFAULT 0,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    KEY idx_project_client_holdings_account (account_id),
    KEY idx_project_client_holdings_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_client_holding_owners (
    holding_id  BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,                               -- several owners = a joint balance
    PRIMARY KEY (holding_id, customer_id),
    KEY idx_project_client_holding_owners_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_billing_stages (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id  BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(120) NOT NULL,
    share       DECIMAL(7,4) NOT NULL,                                  -- a percentage of the agreed value (the linked quotation or sales order), never an amount
    due_kind    VARCHAR(8) NOT NULL DEFAULT 'manual',                   -- manual | date | phase | stage
    due_on      DATE NULL,
    phase_id    BIGINT UNSIGNED NULL,
    stage_id    BIGINT UNSIGNED NULL,
    voucher_id  BIGINT UNSIGNED NULL,                                   -- the Books invoice (posted or draft) it became
    sort_order  INT NOT NULL DEFAULT 0,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_project_billing_stages_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_money_terms (
    project_id          BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    retention_percent   DECIMAL(6,3) NULL,                              -- held back on each bill
    retention_ledger_id BIGINT UNSIGNED NULL,                           -- overrides the company's choice for this project
    advance_ledger_id   BIGINT UNSIGNED NULL,
    income_ledger_id    BIGINT UNSIGNED NULL,                           -- the income ledger bills from the billing plan go to (empty: the one the agreed quotation or order mostly uses)
    updated_by          BIGINT UNSIGNED NULL,
    updated_at          TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_ledgers (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    ledger_id  BIGINT UNSIGNED NOT NULL,                                -- created in Books from this project; Books owns it
    purpose    VARCHAR(20) NOT NULL DEFAULT 'general',                  -- general | bank | client_money | retention | advance
    note       VARCHAR(200) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_ledgers (project_id, ledger_id),
    KEY idx_project_ledgers_ledger (ledger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- the Lead and Finance project roles see a project's money (each still needs the permission projects.money.view)
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, 'money' FROM project_roles WHERE `key` IN ('lead', 'finance');

-- PART C - CHECK (expect 6 tables and 1 column)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_client_accounts', 'project_client_holdings', 'project_client_holding_owners', 'project_billing_stages', 'project_money_terms', 'project_ledgers');
SELECT COUNT(*) AS books_column FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'voucher_entries' AND column_name = 'project_holding_id';
