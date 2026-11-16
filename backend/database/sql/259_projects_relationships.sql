-- =====================================================================
-- 259_projects_relationships.sql
-- Projects, stage 3: relationships (docs/PROJECTS_STAGE3_SPEC.md). Run scripts 257 and 258 first.
-- It only ADDS: twelve tables, their starter rows, and three columns on `customers`. Nothing is changed or deleted.
--   project_lists             the lists an owner manages: sources, lost reasons, contact roles, party roles, flags, trades
--   project_leads             people and companies that are not clients yet. They stay out of `customers` (and so out of Books) until won
--   project_pipeline_stages   the columns of the pipeline
--   project_opportunities     a possible piece of work for a lead or a client
--   project_contacts          people under a client, a lead or a party
--   project_contact_links     a client's contact who is the person to call on one project
--   project_parties           anyone on a project who is neither the client nor staff
--   project_party_links       a party's role on a project
--   project_interactions      the history: calls, meetings, visits, emails, notes
--   project_follow_ups        the next action on a lead, a client or an opportunity
--   project_client_flags      flags on a client
--   project_directory         per directory entry: its trades and who may see it
-- One column here holds a figure: project_opportunities.estimate. It is a guess at what the work is worth before there is a quotation.
-- It is never posted, and once a Books quotation is linked the quotation's total is used instead. Money is still only ever a voucher in the books.
-- The customer record stays the one identity: `customers` gains projects_account_manager_id, projects_lead_id and projects_client_since.
-- Safe to re-run: every table is CREATE IF NOT EXISTS, every starter row is INSERT IGNORE, and a column is added only if it is not there.
-- No permission seed is needed: the permissions were added with script 257 (catalogue version 26).
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (the foundation is there), then the new tables and columns that exist now (none on a first run).
SELECT COUNT(*) AS foundation_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_lists', 'project_leads', 'project_pipeline_stages', 'project_opportunities', 'project_contacts', 'project_contact_links', 'project_parties', 'project_party_links', 'project_interactions', 'project_follow_ups', 'project_client_flags', 'project_directory');
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name IN ('projects_account_manager_id', 'projects_lead_id', 'projects_client_since');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_relationships_guard;
DELIMITER $$
CREATE PROCEDURE projects_relationships_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_members') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The Projects foundation is not here. Run script 257 first. Nothing was changed.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'projects_account_manager_id') THEN
        ALTER TABLE customers ADD COLUMN projects_account_manager_id BIGINT UNSIGNED NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'projects_lead_id') THEN
        ALTER TABLE customers ADD COLUMN projects_lead_id BIGINT UNSIGNED NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'projects_client_since') THEN
        ALTER TABLE customers ADD COLUMN projects_client_since DATE NULL;
    END IF;
END$$
DELIMITER ;
CALL projects_relationships_guard();
DROP PROCEDURE IF EXISTS projects_relationships_guard;

CREATE TABLE IF NOT EXISTS project_lists (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    list         VARCHAR(20) NOT NULL,                                   -- source | lost_reason | contact_role | party_role | flag | trade
    `key`        VARCHAR(60) NOT NULL,
    name         VARCHAR(80) NOT NULL,
    industry_key VARCHAR(40) NULL,                                       -- party roles: the industry they belong to (null = every industry)
    status_token VARCHAR(10) NULL,                                       -- flags: how it is shown (info | good | warning | problem)
    is_system    TINYINT(1) NOT NULL DEFAULT 0,                          -- shipped with the app: can be renamed and switched off
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    sort_order   INT NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_project_lists (list, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_leads (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name                    VARCHAR(160) NOT NULL,                       -- the company, or the person when there is no company
    contact_name            VARCHAR(120) NULL,                           -- who to talk to there
    email                   VARCHAR(160) NULL,
    phone                   VARCHAR(40) NULL,
    industry_key            VARCHAR(40) NULL,
    source_id               BIGINT UNSIGNED NULL,                        -- project_lists (source)
    referred_by_customer_id BIGINT UNSIGNED NULL,                        -- the client who sent them
    owner_id                BIGINT UNSIGNED NOT NULL,
    status                  VARCHAR(10) NOT NULL DEFAULT 'new',          -- new | working | won | lost
    lost_reason_id          BIGINT UNSIGNED NULL,                        -- project_lists (lost_reason)
    lost_note               VARCHAR(200) NULL,
    notes                   TEXT NULL,
    customer_id             BIGINT UNSIGNED NULL,                        -- the customer this lead became when it was won
    won_at                  DATETIME NULL,
    created_by              BIGINT UNSIGNED NULL,
    created_at              TIMESTAMP NULL,
    updated_at              TIMESTAMP NULL,
    deleted_at              DATETIME NULL,
    deleted_by              BIGINT UNSIGNED NULL,
    KEY idx_project_leads_owner (owner_id, status),
    KEY idx_project_leads_status (status, deleted_at),
    KEY idx_project_leads_email (email),
    KEY idx_project_leads_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_pipeline_stages (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`      VARCHAR(40) NOT NULL,
    name       VARCHAR(80) NOT NULL,
    kind       VARCHAR(6) NOT NULL DEFAULT 'open',                       -- open | won | lost (exactly one won and one lost)
    is_active  TINYINT(1) NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_pipeline_stages (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_opportunities (
    id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title                VARCHAR(160) NOT NULL,
    lead_id              BIGINT UNSIGNED NULL,                           -- for a lead, or
    customer_id          BIGINT UNSIGNED NULL,                           -- for an existing client
    type_id              BIGINT UNSIGNED NULL,                           -- the kind of work it would be (project_types)
    stage_id             BIGINT UNSIGNED NOT NULL,
    owner_id             BIGINT UNSIGNED NOT NULL,
    expected_on          DATE NULL,
    estimate             DECIMAL(15,2) NULL,                             -- a GUESS at what it is worth, before there is a quotation. Never posted anywhere.
    estimate_currency    VARCHAR(3) NULL,
    quotation_voucher_id BIGINT UNSIGNED NULL,                           -- the Books quotation: once set, its total is the value and the estimate is ignored
    project_id           BIGINT UNSIGNED NULL,                           -- the project it became
    lost_reason_id       BIGINT UNSIGNED NULL,
    notes                TEXT NULL,
    closed_at            DATETIME NULL,
    created_by           BIGINT UNSIGNED NULL,
    created_at           TIMESTAMP NULL,
    updated_at           TIMESTAMP NULL,
    deleted_at           DATETIME NULL,
    deleted_by           BIGINT UNSIGNED NULL,
    KEY idx_project_opportunities_stage (stage_id, deleted_at),
    KEY idx_project_opportunities_owner (owner_id),
    KEY idx_project_opportunities_lead (lead_id),
    KEY idx_project_opportunities_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_contacts (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_type VARCHAR(10) NOT NULL,                                     -- customer | lead | party
    owner_id   BIGINT UNSIGNED NOT NULL,
    name       VARCHAR(120) NOT NULL,
    job_title  VARCHAR(120) NULL,
    email      VARCHAR(160) NULL,
    phone      VARCHAR(40) NULL,
    roles      JSON NULL,                                                -- keys from project_lists (contact_role)
    is_main    TINYINT(1) NOT NULL DEFAULT 0,
    notes      VARCHAR(300) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at DATETIME NULL,
    KEY idx_project_contacts_owner (owner_type, owner_id),
    KEY idx_project_contacts_email (email),
    KEY idx_project_contacts_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_contact_links (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    contact_id BIGINT UNSIGNED NOT NULL,                                 -- a client's contact who is the person to call for this project
    note       VARCHAR(200) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_contact_links (project_id, contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_parties (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(160) NOT NULL,
    kind       VARCHAR(12) NOT NULL DEFAULT 'organisation',              -- organisation | person
    email      VARCHAR(160) NULL,
    phone      VARCHAR(40) NULL,
    address    VARCHAR(200) NULL,
    notes      VARCHAR(300) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at DATETIME NULL,
    KEY idx_project_parties_name (name),
    KEY idx_project_parties_email (email),
    KEY idx_project_parties_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_party_links (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    party_id   BIGINT UNSIGNED NOT NULL,
    role_id    BIGINT UNSIGNED NOT NULL,                                 -- project_lists (party_role): what they are on THIS project
    contact_id BIGINT UNSIGNED NULL,                                     -- who to talk to there, for this project
    note       VARCHAR(200) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_party_links (project_id, party_id, role_id),
    KEY idx_project_party_links_party (party_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_interactions (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kind           VARCHAR(10) NOT NULL,                                 -- call | meeting | visit | email | note
    subject_type   VARCHAR(10) NOT NULL,                                 -- lead | customer | party
    subject_id     BIGINT UNSIGNED NOT NULL,
    contact_id     BIGINT UNSIGNED NULL,                                 -- who it was with
    project_id     BIGINT UNSIGNED NULL,                                 -- what it was about
    opportunity_id BIGINT UNSIGNED NULL,
    happened_at    DATETIME NOT NULL,
    summary        TEXT NOT NULL,
    team_only      TINYINT(1) NOT NULL DEFAULT 0,                        -- never shown to the client, whatever a later stage shares
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    deleted_at     DATETIME NULL,
    KEY idx_project_interactions_subject (subject_type, subject_id, happened_at),
    KEY idx_project_interactions_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_follow_ups (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    subject_type   VARCHAR(12) NOT NULL,                                 -- lead | customer | opportunity
    subject_id     BIGINT UNSIGNED NOT NULL,
    what           VARCHAR(200) NOT NULL,
    due_on         DATE NOT NULL,
    owner_id       BIGINT UNSIGNED NOT NULL,
    done_at        DATETIME NULL,
    done_by        BIGINT UNSIGNED NULL,
    interaction_id BIGINT UNSIGNED NULL,                                 -- what was written down when it was done
    reminded_on    DATE NULL,                                            -- the owner is reminded once a day at most
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_project_follow_ups_owner (owner_id, done_at, due_on),
    KEY idx_project_follow_ups_subject (subject_type, subject_id, done_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_client_flags (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_id BIGINT UNSIGNED NOT NULL,
    flag_id     BIGINT UNSIGNED NOT NULL,                                -- project_lists (flag)
    reason      VARCHAR(300) NOT NULL,
    set_by      BIGINT UNSIGNED NULL,
    set_at      DATETIME NOT NULL,
    removed_by  BIGINT UNSIGNED NULL,
    removed_at  DATETIME NULL,
    remove_note VARCHAR(300) NULL,
    KEY idx_project_client_flags (customer_id, removed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_directory (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entry_type VARCHAR(10) NOT NULL,                                     -- customer | contact | party | vendor | employee
    entry_id   BIGINT UNSIGNED NOT NULL,
    trades     JSON NULL,                                                -- keys from project_lists (trade)
    visibility VARCHAR(8) NOT NULL DEFAULT 'staff',                      -- staff | clients (those who share a project with the entry) | public
    updated_by BIGINT UNSIGNED NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_directory (entry_type, entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- the lists as shipped: an owner renames, switches off and adds to them in Projects configuration
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('source', 'referral', 'Referral', NULL, NULL, 1, 10), ('source', 'website', 'Website', NULL, NULL, 1, 20), ('source', 'walk_in', 'Walk-in', NULL, NULL, 1, 30), ('source', 'tender', 'Tender or bid notice', NULL, NULL, 1, 40), ('source', 'event', 'Event or exhibition', NULL, NULL, 1, 50), ('source', 'social', 'Social media', NULL, NULL, 1, 60), ('source', 'advert', 'Advertisement', NULL, NULL, 1, 70), ('source', 'returning', 'Returning client', NULL, NULL, 1, 80), ('source', 'other', 'Other', NULL, NULL, 1, 90);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('lost_reason', 'price', 'Price', NULL, NULL, 1, 10), ('lost_reason', 'competitor', 'Went with someone else', NULL, NULL, 1, 20), ('lost_reason', 'no_reply', 'Stopped replying', NULL, NULL, 1, 30), ('lost_reason', 'timing', 'Not the right time', NULL, NULL, 1, 40), ('lost_reason', 'not_a_fit', 'Not work we do', NULL, NULL, 1, 50), ('lost_reason', 'conflict', 'Conflict of interest', NULL, NULL, 1, 60), ('lost_reason', 'other', 'Other', NULL, NULL, 1, 70);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('contact_role', 'decision_maker', 'Decision maker', NULL, NULL, 1, 10), ('contact_role', 'billing', 'Billing', NULL, NULL, 1, 20), ('contact_role', 'day_to_day', 'Day to day', NULL, NULL, 1, 30), ('contact_role', 'technical', 'Technical', NULL, NULL, 1, 40), ('contact_role', 'site', 'On site', NULL, NULL, 1, 50), ('contact_role', 'legal', 'Legal', NULL, NULL, 1, 60), ('contact_role', 'signatory', 'Signs for them', NULL, NULL, 1, 70);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('trade', 'architect', 'Architects', NULL, NULL, 1, 10), ('trade', 'quantity_surveyor', 'Quantity surveyors', NULL, NULL, 1, 20), ('trade', 'structural_engineer', 'Structural engineers', NULL, NULL, 1, 30), ('trade', 'electrical', 'Electrical', NULL, NULL, 1, 40), ('trade', 'plumbing', 'Plumbing', NULL, NULL, 1, 50), ('trade', 'valuer', 'Valuers', NULL, NULL, 1, 60), ('trade', 'surveyor', 'Land surveyors', NULL, NULL, 1, 70), ('trade', 'process_server', 'Court process servers', NULL, NULL, 1, 80), ('trade', 'auditor', 'Auditors', NULL, NULL, 1, 90), ('trade', 'printer', 'Printers', NULL, NULL, 1, 100), ('trade', 'caterer', 'Caterers', NULL, NULL, 1, 110), ('trade', 'photographer', 'Photographers', NULL, NULL, 1, 120), ('trade', 'transport', 'Transport', NULL, NULL, 1, 130);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('flag', 'vip', 'Key client', NULL, 'good', 1, 10), ('flag', 'credit_hold', 'Credit hold', NULL, 'problem', 1, 20), ('flag', 'difficult', 'Needs careful handling', NULL, 'warning', 1, 30), ('flag', 'slow_payer', 'Slow payer', NULL, 'warning', 1, 40), ('flag', 'do_not_contact', 'Do not contact', NULL, 'problem', 1, 50);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('party_role', 'consultant', 'Consultant', NULL, NULL, 1, 10), ('party_role', 'supplier', 'Supplier', NULL, NULL, 1, 20), ('party_role', 'authority', 'Authority or regulator', NULL, NULL, 1, 30), ('party_role', 'referee', 'Referee', NULL, NULL, 1, 40), ('party_role', 'other', 'Other party', NULL, NULL, 1, 50);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('party_role', 'opponent', 'Opposing party', 'legal', NULL, 1, 60), ('party_role', 'opposing_counsel', 'Opposing counsel', 'legal', NULL, 1, 70), ('party_role', 'court', 'Court or tribunal', 'legal', NULL, 1, 80), ('party_role', 'witness', 'Witness', 'legal', NULL, 1, 90), ('party_role', 'co_counsel', 'Co-counsel', 'legal', NULL, 1, 100), ('party_role', 'expert', 'Expert', 'legal', NULL, 1, 110);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('party_role', 'architect', 'Architect', 'construction', NULL, 1, 120), ('party_role', 'quantity_surveyor', 'Quantity surveyor', 'construction', NULL, 1, 130), ('party_role', 'engineer', 'Engineer', 'construction', NULL, 1, 140), ('party_role', 'subcontractor', 'Subcontractor', 'construction', NULL, 1, 150), ('party_role', 'clerk_of_works', 'Clerk of works', 'construction', NULL, 1, 160), ('party_role', 'county', 'County or approving authority', 'construction', NULL, 1, 170);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('party_role', 'contractor', 'Contractor', 'architecture', NULL, 1, 180), ('party_role', 'quantity_surveyor_ae', 'Quantity surveyor', 'architecture', NULL, 1, 190), ('party_role', 'planning', 'Planning authority', 'architecture', NULL, 1, 200);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('party_role', 'referring_doctor', 'Referring doctor', 'healthcare', NULL, 1, 210), ('party_role', 'insurer', 'Insurer', 'healthcare', NULL, 1, 220), ('party_role', 'next_of_kin', 'Next of kin', 'healthcare', NULL, 1, 230);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('party_role', 'donor', 'Donor', 'ngo', NULL, 1, 240), ('party_role', 'implementing_partner', 'Implementing partner', 'ngo', NULL, 1, 250), ('party_role', 'government', 'Government office', 'ngo', NULL, 1, 260);
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('party_role', 'venue', 'Venue', 'events', NULL, 1, 270), ('party_role', 'performer', 'Performer or speaker', 'events', NULL, 1, 280), ('party_role', 'sponsor', 'Sponsor', 'events', NULL, 1, 290);
INSERT IGNORE INTO project_pipeline_stages (`key`, name, kind, sort_order) VALUES ('new', 'New', 'open', 10), ('qualified', 'Qualified', 'open', 20), ('proposal', 'Proposal sent', 'open', 30), ('negotiation', 'Negotiation', 'open', 40), ('won', 'Won', 'won', 50), ('lost', 'Lost', 'lost', 60);

-- PART C - CHECK (expect 12 tables, 3 columns, 70 list rows, 6 pipeline stages)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_lists', 'project_leads', 'project_pipeline_stages', 'project_opportunities', 'project_contacts', 'project_contact_links', 'project_parties', 'project_party_links', 'project_interactions', 'project_follow_ups', 'project_client_flags', 'project_directory');
SELECT COUNT(*) AS customer_columns FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name IN ('projects_account_manager_id', 'projects_lead_id', 'projects_client_since');
SELECT COUNT(*) AS list_rows FROM project_lists WHERE is_system = 1;
SELECT COUNT(*) AS pipeline_stages FROM project_pipeline_stages;
