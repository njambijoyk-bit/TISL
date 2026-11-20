-- =====================================================================
-- 267_projects_site.sql
-- Projects stage 10 (docs/PROJECTS_STAGE10_SPEC.md): resources and site.
--   project_site                  per piece of work: its usual branch, whether it keeps a daily record
--   project_material_plans        materials the work needs (quantities, never money)
--   project_material_requests     materials asked for from a branch, and how much was issued
--   project_stock_jobs            the Stock job of a work at each branch (materials issued go through it)
--   project_plant_bookings        owned equipment (Inventory) booked for a work from a day to a day
--   project_plant_hires           plant hired in from a vendor (its cost is its vendor order)
--   project_subcontracts          a vendor's subcontract on a work: scope, its vendor order, retention %
--   project_sub_claims            claims and certificates as cumulative percentages (the bills are Books vouchers)
--   project_daily_records         one daily record a day per work
--   project_daily_lines           its lines: people, crews, plant hours, materials received, visitors, events, photos
--   project_inspection_kinds      inspection kinds and their questions
--   project_inspections           inspections on a work
--   project_inspection_answers    each question passed, failed or not applicable
--   project_snags                 snags: what, where, given to whom, by when, open / fixed / closed
-- Outside Projects: an optional cost centre on Stock jobs (stock_jobs.cost_centre_id), and, only if Inventory's assignee_type column is a fixed
-- list, it is widened so a work can hold equipment. No table here holds an amount.
-- Needs script 257 (and 266 for photos in Files). Safe to re-run: CREATE IF NOT EXISTS, INSERT IGNORE, guarded ALTERs. No permission seed is needed.
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (the foundation is there), then what exists now (nothing on a first run).
SELECT COUNT(*) AS foundation_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_site', 'project_material_plans', 'project_material_requests', 'project_stock_jobs', 'project_plant_bookings', 'project_plant_hires', 'project_subcontracts', 'project_sub_claims', 'project_daily_records', 'project_daily_lines', 'project_inspection_kinds', 'project_inspections', 'project_inspection_answers', 'project_snags');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'stock_jobs' AND column_name = 'cost_centre_id';
SELECT column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_assignments' AND column_name = 'assignee_type';

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_site_guard;
DELIMITER $$
CREATE PROCEDURE projects_site_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Projects foundation is not here. Run script 257 first. Nothing was changed.';
    END IF;
    -- a Stock job can sit on a cost centre, so its journals land on the work
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'stock_jobs')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'stock_jobs' AND column_name = 'cost_centre_id') THEN
        SET @s = CONCAT('ALTER TABLE stock_jobs ', 'ADD COLUMN cost_centre_id BIGINT UNSIGNED NULL AFTER location_id');   -- split so the test runner does not run it
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
    -- Inventory: a work can hold equipment. Only a fixed list (ENUM) is widened; a free text column is left as it is.
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_assignments' AND column_name = 'assignee_type' AND data_type = 'enum')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_assignments' AND column_name = 'assignee_type' AND column_type LIKE '%''project''%') THEN
        SET @s = CONCAT('ALTER TABLE inventory_assignments ', 'MODIFY assignee_type VARCHAR(30) NOT NULL');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_instances' AND column_name = 'current_assignee_type' AND data_type = 'enum')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'inventory_instances' AND column_name = 'current_assignee_type' AND column_type LIKE '%''project''%') THEN
        SET @s = CONCAT('ALTER TABLE inventory_instances ', 'MODIFY current_assignee_type VARCHAR(30) NULL');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL projects_site_guard();
DROP PROCEDURE IF EXISTS projects_site_guard;

CREATE TABLE IF NOT EXISTS project_site (
    project_id   BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    location_id  BIGINT UNSIGNED NULL,                                   -- the branch materials usually come from
    keeps_daily  TINYINT(1) NOT NULL DEFAULT 0,                          -- 1 = the lead is told on a working day with no daily record
    updated_by   BIGINT UNSIGNED NULL,
    updated_at   TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_material_plans (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT UNSIGNED NOT NULL,
    variant_id   BIGINT UNSIGNED NOT NULL,                               -- the product (catalogue)
    planned_qty  DECIMAL(14,4) NOT NULL DEFAULT 0,                       -- in the product's base unit
    note         VARCHAR(300) NULL,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_project_material_plans (project_id, variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_material_requests (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT UNSIGNED NOT NULL,
    variant_id   BIGINT UNSIGNED NOT NULL,
    quantity     DECIMAL(14,4) NOT NULL,
    issued_qty   DECIMAL(14,4) NOT NULL DEFAULT 0,
    location_id  BIGINT UNSIGNED NOT NULL,                               -- the branch it is asked from
    needed_on    DATE NULL,
    note         VARCHAR(300) NULL,
    state        VARCHAR(10) NOT NULL DEFAULT 'open',                    -- open | part | done | cancelled
    asked_by     BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_project_material_requests (project_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_stock_jobs (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id    BIGINT UNSIGNED NOT NULL,
    location_id   BIGINT UNSIGNED NOT NULL,
    stock_job_id  BIGINT UNSIGNED NOT NULL,
    created_at    TIMESTAMP NULL,
    UNIQUE KEY uq_project_stock_jobs_job (stock_job_id),
    KEY idx_project_stock_jobs (project_id, location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_plant_bookings (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT UNSIGNED NOT NULL,
    item_id      BIGINT UNSIGNED NOT NULL,                               -- Inventory item
    instance_id  BIGINT UNSIGNED NULL,                                   -- the exact piece, when it has a serial number
    quantity     DECIMAL(10,2) NOT NULL DEFAULT 1,
    starts_on    DATE NOT NULL,
    ends_on      DATE NOT NULL,
    state        VARCHAR(10) NOT NULL DEFAULT 'booked',                  -- booked | cancelled
    note         VARCHAR(300) NULL,
    booked_by    BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_project_plant_bookings_item (item_id, starts_on, ends_on),
    KEY idx_project_plant_bookings_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_plant_hires (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id       BIGINT UNSIGNED NOT NULL,
    vendor_id        BIGINT UNSIGNED NULL,
    what             VARCHAR(200) NOT NULL,
    starts_on        DATE NOT NULL,
    ends_on          DATE NULL,                                          -- empty = still on hire
    vendor_order_id  BIGINT UNSIGNED NULL,                               -- the hire's cost is this vendor order's
    state            VARCHAR(10) NOT NULL DEFAULT 'on_hire',             -- on_hire | off_hire | cancelled
    note             VARCHAR(300) NULL,
    created_by       BIGINT UNSIGNED NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_project_plant_hires_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_subcontracts (
    id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id             BIGINT UNSIGNED NOT NULL,
    vendor_id              BIGINT UNSIGNED NOT NULL,
    title                  VARCHAR(200) NOT NULL,
    scope                  TEXT NULL,
    vendor_order_id        BIGINT UNSIGNED NULL,                         -- holds the agreed value (read, never copied)
    retention_pct          DECIMAL(5,2) NOT NULL DEFAULT 0,
    starts_on              DATE NULL,
    ends_on                DATE NULL,
    state                  VARCHAR(10) NOT NULL DEFAULT 'active',        -- active | complete | ended
    released_voucher_id    BIGINT UNSIGNED NULL,                         -- the journal that released retention
    created_by             BIGINT UNSIGNED NULL,
    created_at             TIMESTAMP NULL,
    updated_at             TIMESTAMP NULL,
    deleted_at             TIMESTAMP NULL,
    KEY idx_project_subcontracts_project (project_id),
    KEY idx_project_subcontracts_vendor (vendor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_sub_claims (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subcontract_id        BIGINT UNSIGNED NOT NULL,
    number                INT UNSIGNED NOT NULL,
    period_to             DATE NULL,
    claimed_pct           DECIMAL(7,4) NOT NULL,                         -- cumulative, of the whole subcontract
    certified_pct         DECIMAL(7,4) NULL,                             -- cumulative
    state                 VARCHAR(10) NOT NULL DEFAULT 'submitted',      -- submitted | certified | rejected
    note                  VARCHAR(1000) NULL,
    answer_note           VARCHAR(1000) NULL,
    file_id               BIGINT UNSIGNED NULL,                          -- project_files
    by_user_id            BIGINT UNSIGNED NULL,
    by_vendor             TINYINT(1) NOT NULL DEFAULT 0,                 -- made by the subcontractor on their portal
    certified_by          BIGINT UNSIGNED NULL,
    certified_at          TIMESTAMP NULL,
    voucher_id            BIGINT UNSIGNED NULL,                          -- the supplier bill in Books
    retention_voucher_id  BIGINT UNSIGNED NULL,                          -- the journal that held retention back
    created_at            TIMESTAMP NULL,
    updated_at            TIMESTAMP NULL,
    UNIQUE KEY uq_project_sub_claims_number (subcontract_id, number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_daily_records (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT UNSIGNED NOT NULL,
    day          DATE NOT NULL,
    weather      VARCHAR(60) NULL,
    work_done    TEXT NULL,
    delays       TEXT NULL,
    notes        TEXT NULL,
    state        VARCHAR(10) NOT NULL DEFAULT 'draft',                   -- draft | signed
    signed_by    BIGINT UNSIGNED NULL,
    signed_name  VARCHAR(120) NULL,
    signed_at    TIMESTAMP NULL,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_project_daily_records_day (project_id, day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_daily_lines (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    record_id      BIGINT UNSIGNED NOT NULL,
    kind           VARCHAR(10) NOT NULL,                                 -- person | crew | plant | material | visitor | event | photo | note
    user_id        BIGINT UNSIGNED NULL,                                 -- person: someone on the work
    trade          VARCHAR(80) NULL,                                     -- crew: the trade
    head_count     INT UNSIGNED NULL,
    hours          DECIMAL(6,2) NULL,                                    -- person or plant
    instance_id    BIGINT UNSIGNED NULL,                                 -- plant: owned equipment
    hire_id        BIGINT UNSIGNED NULL,                                 -- plant: hired
    variant_id     BIGINT UNSIGNED NULL,                                 -- material received
    quantity       DECIMAL(14,4) NULL,
    text           VARCHAR(500) NULL,
    file_id        BIGINT UNSIGNED NULL,                                 -- photo: project_files
    after_signing  TINYINT(1) NOT NULL DEFAULT 0,
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    KEY idx_project_daily_lines_record (record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_inspection_kinds (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`       VARCHAR(40) NULL,
    name        VARCHAR(120) NOT NULL,
    questions   TEXT NOT NULL,                                           -- one question a line
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_project_inspection_kinds_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_inspections (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id      BIGINT UNSIGNED NOT NULL,
    kind_id         BIGINT UNSIGNED NOT NULL,
    area            VARCHAR(160) NULL,
    done_on         DATE NOT NULL,
    state           VARCHAR(10) NOT NULL DEFAULT 'draft',                -- draft | done
    outcome         VARCHAR(10) NULL,                                    -- passed | failed
    inspector_id    BIGINT UNSIGNED NULL,
    inspector_name  VARCHAR(120) NULL,                                   -- typed when it is finished
    finished_at     TIMESTAMP NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_project_inspections_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_inspection_answers (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    inspection_id  BIGINT UNSIGNED NOT NULL,
    question_no    INT UNSIGNED NOT NULL,
    question       VARCHAR(300) NOT NULL,
    answer         VARCHAR(4) NULL,                                      -- pass | fail | na
    note           VARCHAR(500) NULL,
    file_id        BIGINT UNSIGNED NULL,
    snag_id        BIGINT UNSIGNED NULL,
    UNIQUE KEY uq_project_inspection_answers (inspection_id, question_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_snags (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id      BIGINT UNSIGNED NOT NULL,
    number          INT UNSIGNED NOT NULL,
    title           VARCHAR(200) NOT NULL,
    area            VARCHAR(160) NULL,
    file_id         BIGINT UNSIGNED NULL,
    user_id         BIGINT UNSIGNED NULL,                                -- given to someone on the work, or
    subcontract_id  BIGINT UNSIGNED NULL,                                -- a subcontract
    due_on          DATE NULL,
    state           VARCHAR(10) NOT NULL DEFAULT 'open',                 -- open | fixed | closed
    shared          TINYINT(1) NOT NULL DEFAULT 0,                       -- 1 = the client sees it on the portal
    inspection_id   BIGINT UNSIGNED NULL,
    raised_by       BIGINT UNSIGNED NULL,
    fixed_note      VARCHAR(500) NULL,
    fixed_by_name   VARCHAR(120) NULL,
    fixed_at        TIMESTAMP NULL,
    closed_by       BIGINT UNSIGNED NULL,
    closed_at       TIMESTAMP NULL,
    reminded_on     DATE NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    deleted_at      TIMESTAMP NULL,
    UNIQUE KEY uq_project_snags_number (project_id, number),
    KEY idx_project_snags_subcontract (subcontract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- project roles: the Lead and Members work the site (materials, plant, daily record, inspections, snags)
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, 'site' FROM project_roles WHERE `key` IN ('lead', 'member');

-- an inspection kind to start with (changed or added to in Configuration)
INSERT IGNORE INTO project_inspection_kinds (`key`, name, questions, created_at) VALUES
    ('quality', 'Quality check', 'The work matches the drawings or the brief\nThe finish is clean and complete\nThe area is safe and tidy', NOW());

-- PART C - CHECK (expect 14 tables, then 1 for the Stock job column when Stock is here)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_site', 'project_material_plans', 'project_material_requests', 'project_stock_jobs', 'project_plant_bookings', 'project_plant_hires', 'project_subcontracts', 'project_sub_claims', 'project_daily_records', 'project_daily_lines', 'project_inspection_kinds', 'project_inspections', 'project_inspection_answers', 'project_snags');
SELECT COUNT(*) AS stock_job_cost_centre FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'stock_jobs' AND column_name = 'cost_centre_id';
