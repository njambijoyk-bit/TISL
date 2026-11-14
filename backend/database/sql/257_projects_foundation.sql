-- =====================================================================
-- 257_projects_foundation.sql
-- Projects, rebuilt: the foundation (docs/PROJECTS_STAGE1_SPEC.md). Run script 256 first: it removes the old module's tables.
-- One structure serves every industry. An industry changes what things are CALLED, never which tables or columns exist.
-- No table here holds an amount of money: money is always a voucher in the books, and a project only points at it.
--   Names
--     project_industries        the fifteen industries that ship (an owner can switch one off)
--     project_terms             the things that can be renamed: project, reference, authority, scope line...
--     project_term_names        what each term is called in each industry, as shipped
--     project_term_overrides    the company's own name for a term, where it differs
--   Shape
--     project_types             kinds of work inside an industry (Litigation, Building works...), each with a number prefix
--     project_stages            the stages a kind of work moves through; each sits on one of four fixed states
--     project_fields            extra fields an owner defines
--     project_field_values      their values on each project
--     project_series            the next number for each prefix
--   The work
--     projects                  the project
--     project_phases            its parts, as a tree; a phase may have its own cost centre
--     project_links             records from other modules attached to it
--   People and control
--     project_roles             Lead, Member, Finance, Reviewer, Client, Guest and the owner's own
--     project_role_permissions  what each project role may do on a project
--     project_members           who is on which project, in which role
--     project_log               every action and every refusal; rows are only ever added
--   Settings
--     project_settings          the current settings, in parts
--     project_setting_versions  every saved version, for roll back
--     project_setting_logs      who changed which part and when (never a value)
--     project_user_prefs        per person: own naming, own shortcut keys, pinned projects
-- Safe to re-run: every table is CREATE IF NOT EXISTS and every starter row is INSERT IGNORE, so a name or stage an owner changed is left alone.
-- Afterwards run `php artisan access:seed` once: it loads the Projects permissions (catalogue version 26).
-- Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. The old tables must be gone (expect no rows), and which new tables exist now (none on a first run).
SELECT table_name AS old_table_still_here FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('project_participants', 'project_items', 'project_tasks', 'project_milestones', 'project_messages', 'project_activities');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_industries', 'project_terms', 'project_term_names', 'project_term_overrides', 'project_types', 'project_stages', 'project_fields', 'project_field_values', 'project_series', 'projects', 'project_phases', 'project_links', 'project_roles', 'project_role_permissions', 'project_members', 'project_log', 'project_settings', 'project_setting_versions', 'project_setting_logs', 'project_user_prefs');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_foundation_guard;
DELIMITER $$
CREATE PROCEDURE projects_foundation_guard()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_participants', 'project_items', 'project_tasks', 'project_milestones', 'project_messages', 'project_activities')) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The old Projects tables are still here. Run script 256 first. Nothing was changed.';
    END IF;
    -- an old `projects` table on its own (it has no industry column) would be mistaken for the new one and left in place
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'projects')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'projects' AND column_name = 'industry_key') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'An old projects table is still here. Run script 256 first. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL projects_foundation_guard();
DROP PROCEDURE IF EXISTS projects_foundation_guard;

CREATE TABLE IF NOT EXISTS project_industries (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`       VARCHAR(40) NOT NULL,
    name        VARCHAR(80) NOT NULL,
    grp         VARCHAR(10) NOT NULL DEFAULT 'niche',                    -- common | niche | basic
    sort_order  INT NOT NULL DEFAULT 0,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_project_industries_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_terms (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`       VARCHAR(40) NOT NULL,
    description VARCHAR(200) NOT NULL,                                   -- shown on the Names page so an owner knows what they are renaming
    sort_order  INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_project_terms_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_term_names (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    industry_key VARCHAR(40) NOT NULL,
    term_key     VARCHAR(40) NOT NULL,
    name         VARCHAR(80) NOT NULL,
    name_plural  VARCHAR(80) NOT NULL,
    UNIQUE KEY uq_project_term_names (industry_key, term_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_term_overrides (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    industry_key VARCHAR(40) NOT NULL,
    term_key     VARCHAR(40) NOT NULL,
    name         VARCHAR(80) NOT NULL,
    name_plural  VARCHAR(80) NOT NULL,
    changed_by   BIGINT UNSIGNED NULL,
    changed_at   TIMESTAMP NULL,
    UNIQUE KEY uq_project_term_overrides (industry_key, term_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_types (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    industry_key  VARCHAR(40) NOT NULL,
    name          VARCHAR(80) NOT NULL,
    number_prefix VARCHAR(8) NOT NULL,                                   -- M gives M-0001, M-0002...
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    sort_order    INT NOT NULL DEFAULT 0,
    deleted_at    TIMESTAMP NULL,
    deleted_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_project_types (industry_key, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_stages (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type_id         BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(80) NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0,
    state           VARCHAR(10) NOT NULL DEFAULT 'open',                 -- the fixed state this stage sits on: open | on_hold | closed | cancelled
    required_fields JSON NULL,                                           -- the fields that must be filled before a project may enter this stage
    status_token    VARCHAR(10) NOT NULL DEFAULT 'info',                 -- which of the theme's status colours shows it: info | good | warning | problem (a name, never a colour)
    deleted_at      TIMESTAMP NULL,
    deleted_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_project_stages (type_id, name),
    KEY idx_project_stages_order (type_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_fields (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`        VARCHAR(60) NOT NULL,
    label        VARCHAR(80) NOT NULL,
    kind         VARCHAR(12) NOT NULL DEFAULT 'text',                    -- text | number | date | yes_no | pick_one | pick_many | person. A number is a count or a measure, never money.
    options      JSON NULL,                                              -- the choices of a pick_one / pick_many
    industry_key VARCHAR(40) NULL,                                       -- shows on every project of this industry (null with a null type = every project)
    type_id      BIGINT UNSIGNED NULL,                                   -- or only on this kind of work
    is_required  TINYINT(1) NOT NULL DEFAULT 0,
    is_sensitive TINYINT(1) NOT NULL DEFAULT 0,                          -- shown and exported only to people who hold projects.fields.sensitive
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    sort_order   INT NOT NULL DEFAULT 0,
    deleted_at   TIMESTAMP NULL,
    deleted_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_project_fields_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_field_values (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    field_id   BIGINT UNSIGNED NOT NULL,
    value      TEXT NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_field_values (project_id, field_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_series (
    prefix      VARCHAR(8) NOT NULL PRIMARY KEY,
    next_number INT UNSIGNED NOT NULL DEFAULT 1,
    width       TINYINT UNSIGNED NOT NULL DEFAULT 4                      -- digits, padded with zeros
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    number              VARCHAR(20) NOT NULL,                            -- from the type's series: M-0413
    industry_key        VARCHAR(40) NOT NULL,
    type_id             BIGINT UNSIGNED NOT NULL,
    title               VARCHAR(200) NOT NULL,
    description         TEXT NULL,
    customer_id         BIGINT UNSIGNED NULL,                            -- the client: the customer record, which is also their ledger in the books
    lead_user_id        BIGINT UNSIGNED NOT NULL,
    location_id         BIGINT UNSIGNED NULL,                            -- the branch that runs it
    cost_centre_id      BIGINT UNSIGNED NULL,                            -- made in the books with the project; everything it costs and earns carries it
    stage_id            BIGINT UNSIGNED NULL,
    state               VARCHAR(10) NOT NULL DEFAULT 'open',             -- open | on_hold | closed | cancelled (follows the stage)
    priority            VARCHAR(8) NOT NULL DEFAULT 'medium',            -- low | medium | high | urgent
    reference           VARCHAR(120) NULL,                               -- the term `reference`: case number, contract number, booking reference...
    authority           VARCHAR(160) NULL,                               -- the term `authority`: court, approving authority, venue, donor's regulator...
    place               VARCHAR(300) NULL,                               -- the term `place`: site, venue address, facility...
    start_date          DATE NULL,
    due_date            DATE NULL,
    closed_at           DATETIME NULL,
    closing_period_ends DATE NULL,                                       -- the term `closing_period`: defects period, appeal period, warranty...
    confidential        TINYINT(1) NOT NULL DEFAULT 0,                   -- only the people on it can find it
    frozen_at           DATETIME NULL,                                   -- finished and locked: nothing on it changes until it is unfrozen
    frozen_by           BIGINT UNSIGNED NULL,
    parent_id           BIGINT UNSIGNED NULL,                            -- the programme it belongs to (another project)
    created_by          BIGINT UNSIGNED NULL,
    updated_by          BIGINT UNSIGNED NULL,
    deleted_at          TIMESTAMP NULL,                                  -- in the trash
    deleted_by          BIGINT UNSIGNED NULL,
    created_at          TIMESTAMP NULL,
    updated_at          TIMESTAMP NULL,
    UNIQUE KEY uq_projects_number (number),
    KEY idx_projects_state (state, deleted_at),
    KEY idx_projects_customer (customer_id),
    KEY idx_projects_lead (lead_user_id),
    KEY idx_projects_type (type_id, stage_id),
    KEY idx_projects_cost_centre (cost_centre_id),
    KEY idx_projects_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_phases (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id     BIGINT UNSIGNED NOT NULL,
    parent_id      BIGINT UNSIGNED NULL,                                 -- nested to any depth
    code           VARCHAR(30) NULL,                                     -- 1, 1.1, A, B2...
    name           VARCHAR(160) NOT NULL,
    sort_order     INT NOT NULL DEFAULT 0,
    cost_centre_id BIGINT UNSIGNED NULL,                                 -- its own cost centre in the books; null = it uses its parent's (in the end the project's)
    start_date     DATE NULL,
    due_date       DATE NULL,
    state          VARCHAR(10) NOT NULL DEFAULT 'open',                  -- open | done
    created_by     BIGINT UNSIGNED NULL,
    deleted_at     TIMESTAMP NULL,
    deleted_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    KEY idx_project_phases_tree (project_id, parent_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_links (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT UNSIGNED NOT NULL,
    module     VARCHAR(30) NOT NULL,                                     -- the module the record lives in: books, ecommerce, events...
    link_type  VARCHAR(40) NOT NULL,                                     -- what it is there: voucher, order, event...
    linked_id  BIGINT UNSIGNED NOT NULL,
    note       VARCHAR(200) NULL,
    added_by   BIGINT UNSIGNED NULL,
    deleted_at TIMESTAMP NULL,
    deleted_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_links (project_id, module, link_type, linked_id),
    KEY idx_project_links_reverse (module, link_type, linked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_roles (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`       VARCHAR(40) NOT NULL,
    name        VARCHAR(80) NOT NULL,
    description VARCHAR(200) NULL,
    is_system   TINYINT(1) NOT NULL DEFAULT 0,                           -- shipped with the app: can be renamed and changed, not deleted
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_project_roles_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_role_permissions (
    project_role_id BIGINT UNSIGNED NOT NULL,
    ability         VARCHAR(60) NOT NULL,                                -- open | open_shared | edit | stage | phases | members | links | log (more arrive with later stages)
    PRIMARY KEY (project_role_id, ability)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_members (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id      BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NOT NULL,
    project_role_id BIGINT UNSIGNED NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'active',               -- invited | active | declined | removed
    invited_by      BIGINT UNSIGNED NULL,
    invited_at      DATETIME NULL,
    answered_at     DATETIME NULL,
    starts_at       DATETIME NULL,                                       -- access from (null = now)
    ends_at         DATETIME NULL,                                       -- access until (null = no end)
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_project_members (project_id, user_id),
    KEY idx_project_members_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_log (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT UNSIGNED NULL,                                   -- null for things that are not about one project (settings, the trash)
    actor_id     BIGINT UNSIGNED NULL,                                   -- null = the system
    action       VARCHAR(60) NOT NULL,                                   -- project.created, project.opened, member.added, stage.moved...
    subject_type VARCHAR(40) NULL,
    subject_id   BIGINT UNSIGNED NULL,
    old_values   JSON NULL,
    new_values   JSON NULL,
    result       VARCHAR(8) NOT NULL DEFAULT 'done',                     -- done | refused
    reason       VARCHAR(200) NULL,                                      -- why it was refused, in words
    ip           VARCHAR(45) NULL,
    created_at   TIMESTAMP NULL,
    KEY idx_project_log_project (project_id, created_at),
    KEY idx_project_log_actor (actor_id, created_at),
    KEY idx_project_log_at (created_at),
    KEY idx_project_log_result (result, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_settings (
    part       VARCHAR(40) NOT NULL PRIMARY KEY,                         -- general, shortcuts...
    value      JSON NULL,
    version    INT UNSIGNED NOT NULL DEFAULT 1,
    updated_by BIGINT UNSIGNED NULL,
    updated_at TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_setting_versions (
    id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    part     VARCHAR(40) NOT NULL,
    version  INT UNSIGNED NOT NULL,
    value    JSON NULL,
    note     VARCHAR(200) NULL,
    saved_by BIGINT UNSIGNED NULL,
    saved_at TIMESTAMP NULL,
    UNIQUE KEY uq_project_setting_versions (part, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_setting_logs (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    part       VARCHAR(40) NOT NULL,
    action     VARCHAR(30) NOT NULL,                                     -- saved | rolled_back
    version    INT UNSIGNED NULL,
    user_id    BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    KEY idx_project_setting_logs (part, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_user_prefs (
    user_id             BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    naming_industry_key VARCHAR(40) NULL,                                -- the industry whose names this person sees (needs projects.naming.personal); null = the company's
    shortcuts           JSON NULL,
    pinned              JSON NULL,
    updated_at          TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- STARTER ROWS (INSERT IGNORE: a row that is already there is left exactly as it is)
-- industries (15)
INSERT IGNORE INTO project_industries (`key`, name, grp, sort_order, is_active, created_at, updated_at) VALUES
    ('legal', 'Legal', 'common', 10, 1, NOW(), NOW()),
    ('construction', 'Construction', 'common', 20, 1, NOW(), NOW()),
    ('software', 'Software and IT', 'common', 30, 1, NOW(), NOW()),
    ('consulting', 'Consulting and accounting', 'common', 40, 1, NOW(), NOW()),
    ('architecture', 'Architecture and engineering', 'common', 50, 1, NOW(), NOW()),
    ('catering', 'Food and catering', 'niche', 60, 1, NOW(), NOW()),
    ('photography', 'Photography and film', 'niche', 70, 1, NOW(), NOW()),
    ('marketing', 'Marketing and creative', 'niche', 80, 1, NOW(), NOW()),
    ('interiors', 'Interiors and fit-out', 'niche', 90, 1, NOW(), NOW()),
    ('ngo', 'NGO programmes and grants', 'niche', 100, 1, NOW(), NOW()),
    ('events', 'Events', 'niche', 110, 1, NOW(), NOW()),
    ('fashion', 'Fashion', 'niche', 120, 1, NOW(), NOW()),
    ('healthcare', 'Healthcare', 'niche', 130, 1, NOW(), NOW()),
    ('general', 'General projects', 'basic', 140, 1, NOW(), NOW()),
    ('field_service', 'Jobs and field service', 'basic', 150, 1, NOW(), NOW());

-- the things that can be renamed (30)
INSERT IGNORE INTO project_terms (`key`, description, sort_order) VALUES
    ('project', 'The piece of work itself', 10),
    ('client', 'Who the work is for', 20),
    ('lead', 'The person responsible for it', 30),
    ('reference', 'An outside number that identifies it', 40),
    ('authority', 'The outside body it answers to', 50),
    ('place', 'Where the work happens', 60),
    ('opening_check', 'What must be cleared before work starts', 70),
    ('phase', 'A part of the work', 80),
    ('scope_line', 'One line of what was agreed', 90),
    ('key_date', 'A date that must not slip', 100),
    ('task', 'Something a person has to do', 110),
    ('change', 'A change to what was agreed', 120),
    ('daily_record', 'The day-to-day record', 130),
    ('progress_bill', 'A bill raised while the work is going on', 140),
    ('final_bill', 'The last bill', 150),
    ('money_held', 'Money held for the client', 160),
    ('party', 'Someone involved who is not the client', 170),
    ('closing_period', 'The period after the work is finished', 180),
    ('team_member', 'A person working on it', 190),
    ('meeting', 'A meeting', 200),
    ('file', 'A stored document', 210),
    ('cost', 'Money spent on the work', 220),
    ('time_entry', 'Time recorded against it', 230),
    ('subcontractor', 'An outside firm or person doing part of it', 240),
    ('material', 'Something used up by the work', 250),
    ('inspection', 'A check of the work', 260),
    ('snag', 'Something found wrong', 270),
    ('risk', 'Something that could go wrong', 280),
    ('programme', 'A group of related pieces of work', 290),
    ('signoff', 'The client agreeing to something', 300);

-- names in Legal
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('legal', 'project', 'Matter', 'Matters'),
    ('legal', 'client', 'Client', 'Clients'),
    ('legal', 'lead', 'Responsible advocate', 'Responsible advocates'),
    ('legal', 'reference', 'Case number', 'Case numbers'),
    ('legal', 'authority', 'Court', 'Courts'),
    ('legal', 'place', 'Registry', 'Registries'),
    ('legal', 'opening_check', 'Conflict check', 'Conflict checks'),
    ('legal', 'phase', 'Phase', 'Phases'),
    ('legal', 'scope_line', 'Fee item', 'Fee schedule'),
    ('legal', 'key_date', 'Court date', 'Court dates'),
    ('legal', 'task', 'Task', 'Tasks'),
    ('legal', 'change', 'Change of instructions', 'Changes of instructions'),
    ('legal', 'daily_record', 'File note', 'File notes'),
    ('legal', 'progress_bill', 'Interim fee note', 'Interim fee notes'),
    ('legal', 'final_bill', 'Final fee note', 'Final fee notes'),
    ('legal', 'money_held', 'Client account', 'Client accounts'),
    ('legal', 'party', 'Party', 'Parties'),
    ('legal', 'closing_period', 'Appeal period', 'Appeal periods'),
    ('legal', 'team_member', 'Fee earner', 'Fee earners'),
    ('legal', 'meeting', 'Meeting', 'Meetings'),
    ('legal', 'file', 'Document', 'Documents'),
    ('legal', 'cost', 'Disbursement', 'Disbursements'),
    ('legal', 'time_entry', 'Time entry', 'Time entries'),
    ('legal', 'subcontractor', 'Counsel or agent', 'Counsel and agents'),
    ('legal', 'material', 'Material', 'Materials'),
    ('legal', 'inspection', 'Review', 'Reviews'),
    ('legal', 'snag', 'Issue', 'Issues'),
    ('legal', 'risk', 'Risk', 'Risks'),
    ('legal', 'programme', 'Portfolio', 'Portfolios'),
    ('legal', 'signoff', 'Client instruction', 'Client instructions');

-- names in Construction
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('construction', 'project', 'Contract', 'Contracts'),
    ('construction', 'client', 'Client', 'Clients'),
    ('construction', 'lead', 'Contracts manager', 'Contracts managers'),
    ('construction', 'reference', 'Contract number', 'Contract numbers'),
    ('construction', 'authority', 'Approving authority', 'Approving authorities'),
    ('construction', 'place', 'Site', 'Sites'),
    ('construction', 'opening_check', 'Pre-qualification', 'Pre-qualifications'),
    ('construction', 'phase', 'Section', 'Sections'),
    ('construction', 'scope_line', 'Bill item', 'Bill of quantities'),
    ('construction', 'key_date', 'Programme date', 'Programme dates'),
    ('construction', 'task', 'Task', 'Tasks'),
    ('construction', 'change', 'Variation order', 'Variation orders'),
    ('construction', 'daily_record', 'Site diary entry', 'Site diary'),
    ('construction', 'progress_bill', 'Payment certificate', 'Payment certificates'),
    ('construction', 'final_bill', 'Final account', 'Final accounts'),
    ('construction', 'money_held', 'Advance and retention', 'Advances and retention'),
    ('construction', 'party', 'Consultant', 'Consultants'),
    ('construction', 'closing_period', 'Defects liability period', 'Defects liability periods'),
    ('construction', 'team_member', 'Site staff member', 'Site staff'),
    ('construction', 'meeting', 'Meeting', 'Meetings'),
    ('construction', 'file', 'Drawing or document', 'Drawings and documents'),
    ('construction', 'cost', 'Cost', 'Costs'),
    ('construction', 'time_entry', 'Time entry', 'Time entries'),
    ('construction', 'subcontractor', 'Subcontractor', 'Subcontractors'),
    ('construction', 'material', 'Material', 'Materials'),
    ('construction', 'inspection', 'Inspection', 'Inspections'),
    ('construction', 'snag', 'Snag', 'Snags'),
    ('construction', 'risk', 'Risk', 'Risks'),
    ('construction', 'programme', 'Programme', 'Programmes'),
    ('construction', 'signoff', 'Certificate', 'Certificates');

-- names in Software and IT
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('software', 'project', 'Project', 'Projects'),
    ('software', 'client', 'Client', 'Clients'),
    ('software', 'lead', 'Project manager', 'Project managers'),
    ('software', 'reference', 'Project code', 'Project codes'),
    ('software', 'authority', 'Product owner', 'Product owners'),
    ('software', 'place', 'Environment', 'Environments'),
    ('software', 'opening_check', 'Discovery sign-off', 'Discovery sign-offs'),
    ('software', 'phase', 'Release', 'Releases'),
    ('software', 'scope_line', 'Deliverable', 'Deliverables'),
    ('software', 'key_date', 'Release date', 'Release dates'),
    ('software', 'task', 'Task', 'Tasks'),
    ('software', 'change', 'Change request', 'Change requests'),
    ('software', 'daily_record', 'Stand-up note', 'Stand-up notes'),
    ('software', 'progress_bill', 'Milestone invoice', 'Milestone invoices'),
    ('software', 'final_bill', 'Final invoice', 'Final invoices'),
    ('software', 'money_held', 'Deposit', 'Deposits'),
    ('software', 'party', 'Vendor', 'Vendors'),
    ('software', 'closing_period', 'Warranty period', 'Warranty periods'),
    ('software', 'team_member', 'Team member', 'Team members'),
    ('software', 'meeting', 'Meeting', 'Meetings'),
    ('software', 'file', 'File', 'Files'),
    ('software', 'cost', 'Cost', 'Costs'),
    ('software', 'time_entry', 'Time entry', 'Time entries'),
    ('software', 'subcontractor', 'Contractor', 'Contractors'),
    ('software', 'material', 'Material', 'Materials'),
    ('software', 'inspection', 'Test round', 'Test rounds'),
    ('software', 'snag', 'Bug', 'Bugs'),
    ('software', 'risk', 'Risk', 'Risks'),
    ('software', 'programme', 'Programme', 'Programmes'),
    ('software', 'signoff', 'Acceptance', 'Acceptances');

-- names in Consulting and accounting
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('consulting', 'project', 'Engagement', 'Engagements'),
    ('consulting', 'client', 'Client', 'Clients'),
    ('consulting', 'lead', 'Engagement lead', 'Engagement leads'),
    ('consulting', 'reference', 'Engagement number', 'Engagement numbers'),
    ('consulting', 'authority', 'Regulator', 'Regulators'),
    ('consulting', 'place', 'Client office', 'Client offices'),
    ('consulting', 'opening_check', 'Independence check', 'Independence checks'),
    ('consulting', 'phase', 'Phase', 'Phases'),
    ('consulting', 'scope_line', 'Work programme item', 'Work programme'),
    ('consulting', 'key_date', 'Filing deadline', 'Filing deadlines'),
    ('consulting', 'task', 'Task', 'Tasks'),
    ('consulting', 'change', 'Scope change', 'Scope changes'),
    ('consulting', 'daily_record', 'Working paper note', 'Working paper notes'),
    ('consulting', 'progress_bill', 'Progress bill', 'Progress bills'),
    ('consulting', 'final_bill', 'Final bill', 'Final bills'),
    ('consulting', 'money_held', 'Client funds', 'Client funds'),
    ('consulting', 'party', 'Partner', 'Partners'),
    ('consulting', 'closing_period', 'Review period', 'Review periods'),
    ('consulting', 'team_member', 'Consultant', 'Consultants'),
    ('consulting', 'meeting', 'Meeting', 'Meetings'),
    ('consulting', 'file', 'Working paper', 'Working papers'),
    ('consulting', 'cost', 'Expense', 'Expenses'),
    ('consulting', 'time_entry', 'Time entry', 'Time entries'),
    ('consulting', 'subcontractor', 'Associate', 'Associates'),
    ('consulting', 'material', 'Material', 'Materials'),
    ('consulting', 'inspection', 'Quality review', 'Quality reviews'),
    ('consulting', 'snag', 'Finding', 'Findings'),
    ('consulting', 'risk', 'Risk', 'Risks'),
    ('consulting', 'programme', 'Programme', 'Programmes'),
    ('consulting', 'signoff', 'Client approval', 'Client approvals');

-- names in Architecture and engineering
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('architecture', 'project', 'Commission', 'Commissions'),
    ('architecture', 'client', 'Client', 'Clients'),
    ('architecture', 'lead', 'Project architect', 'Project architects'),
    ('architecture', 'reference', 'Job number', 'Job numbers'),
    ('architecture', 'authority', 'Planning authority', 'Planning authorities'),
    ('architecture', 'place', 'Site', 'Sites'),
    ('architecture', 'opening_check', 'Appointment check', 'Appointment checks'),
    ('architecture', 'phase', 'Design stage', 'Design stages'),
    ('architecture', 'scope_line', 'Stage deliverable', 'Stage deliverables'),
    ('architecture', 'key_date', 'Submission date', 'Submission dates'),
    ('architecture', 'task', 'Task', 'Tasks'),
    ('architecture', 'change', 'Design change', 'Design changes'),
    ('architecture', 'daily_record', 'Design log entry', 'Design log'),
    ('architecture', 'progress_bill', 'Stage invoice', 'Stage invoices'),
    ('architecture', 'final_bill', 'Final invoice', 'Final invoices'),
    ('architecture', 'money_held', 'Deposit', 'Deposits'),
    ('architecture', 'party', 'Consultant', 'Consultants'),
    ('architecture', 'closing_period', 'Defects period', 'Defects periods'),
    ('architecture', 'team_member', 'Team member', 'Team members'),
    ('architecture', 'meeting', 'Meeting', 'Meetings'),
    ('architecture', 'file', 'Drawing', 'Drawings'),
    ('architecture', 'cost', 'Cost', 'Costs'),
    ('architecture', 'time_entry', 'Time entry', 'Time entries'),
    ('architecture', 'subcontractor', 'Sub-consultant', 'Sub-consultants'),
    ('architecture', 'material', 'Material', 'Materials'),
    ('architecture', 'inspection', 'Site inspection', 'Site inspections'),
    ('architecture', 'snag', 'Snag', 'Snags'),
    ('architecture', 'risk', 'Risk', 'Risks'),
    ('architecture', 'programme', 'Programme', 'Programmes'),
    ('architecture', 'signoff', 'Approval', 'Approvals');

-- names in Food and catering
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('catering', 'project', 'Function', 'Functions'),
    ('catering', 'client', 'Client', 'Clients'),
    ('catering', 'lead', 'Function manager', 'Function managers'),
    ('catering', 'reference', 'Booking reference', 'Booking references'),
    ('catering', 'authority', 'Venue', 'Venues'),
    ('catering', 'place', 'Venue address', 'Venue addresses'),
    ('catering', 'opening_check', 'Tasting and menu sign-off', 'Tasting and menu sign-offs'),
    ('catering', 'phase', 'Phase', 'Phases'),
    ('catering', 'scope_line', 'Menu line', 'Menu and service lines'),
    ('catering', 'key_date', 'Function date', 'Function dates'),
    ('catering', 'task', 'Task', 'Tasks'),
    ('catering', 'change', 'Menu change', 'Menu changes'),
    ('catering', 'daily_record', 'Kitchen log entry', 'Kitchen log'),
    ('catering', 'progress_bill', 'Deposit invoice', 'Deposit invoices'),
    ('catering', 'final_bill', 'Balance invoice', 'Balance invoices'),
    ('catering', 'money_held', 'Booking deposit', 'Booking deposits'),
    ('catering', 'party', 'Venue contact', 'Venue contacts'),
    ('catering', 'closing_period', 'Feedback period', 'Feedback periods'),
    ('catering', 'team_member', 'Crew member', 'Crew'),
    ('catering', 'meeting', 'Meeting', 'Meetings'),
    ('catering', 'file', 'File', 'Files'),
    ('catering', 'cost', 'Cost', 'Costs'),
    ('catering', 'time_entry', 'Time entry', 'Time entries'),
    ('catering', 'subcontractor', 'Supplier', 'Suppliers'),
    ('catering', 'material', 'Ingredient', 'Ingredients'),
    ('catering', 'inspection', 'Tasting', 'Tastings'),
    ('catering', 'snag', 'Complaint', 'Complaints'),
    ('catering', 'risk', 'Risk', 'Risks'),
    ('catering', 'programme', 'Programme', 'Programmes'),
    ('catering', 'signoff', 'Menu approval', 'Menu approvals');

-- names in Photography and film
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('photography', 'project', 'Shoot', 'Shoots'),
    ('photography', 'client', 'Client', 'Clients'),
    ('photography', 'lead', 'Lead photographer', 'Lead photographers'),
    ('photography', 'reference', 'Booking reference', 'Booking references'),
    ('photography', 'authority', 'Location owner', 'Location owners'),
    ('photography', 'place', 'Shoot location', 'Shoot locations'),
    ('photography', 'opening_check', 'Brief and release forms', 'Briefs and release forms'),
    ('photography', 'phase', 'Session', 'Sessions'),
    ('photography', 'scope_line', 'Shot', 'Shot list'),
    ('photography', 'key_date', 'Shoot date', 'Shoot dates'),
    ('photography', 'task', 'Task', 'Tasks'),
    ('photography', 'change', 'Brief change', 'Brief changes'),
    ('photography', 'daily_record', 'Shoot log entry', 'Shoot log'),
    ('photography', 'progress_bill', 'Stage invoice', 'Stage invoices'),
    ('photography', 'final_bill', 'Final invoice', 'Final invoices'),
    ('photography', 'money_held', 'Booking deposit', 'Booking deposits'),
    ('photography', 'party', 'Talent or agent', 'Talent and agents'),
    ('photography', 'closing_period', 'Revision period', 'Revision periods'),
    ('photography', 'team_member', 'Crew member', 'Crew'),
    ('photography', 'meeting', 'Meeting', 'Meetings'),
    ('photography', 'file', 'Image or clip', 'Images and clips'),
    ('photography', 'cost', 'Cost', 'Costs'),
    ('photography', 'time_entry', 'Time entry', 'Time entries'),
    ('photography', 'subcontractor', 'Freelancer', 'Freelancers'),
    ('photography', 'material', 'Equipment item', 'Equipment'),
    ('photography', 'inspection', 'Proof review', 'Proof reviews'),
    ('photography', 'snag', 'Retouch request', 'Retouch requests'),
    ('photography', 'risk', 'Risk', 'Risks'),
    ('photography', 'programme', 'Programme', 'Programmes'),
    ('photography', 'signoff', 'Final selection', 'Final selections');

-- names in Marketing and creative
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('marketing', 'project', 'Campaign job', 'Campaign jobs'),
    ('marketing', 'client', 'Client', 'Clients'),
    ('marketing', 'lead', 'Account director', 'Account directors'),
    ('marketing', 'reference', 'Job number', 'Job numbers'),
    ('marketing', 'authority', 'Brand owner', 'Brand owners'),
    ('marketing', 'place', 'Market', 'Markets'),
    ('marketing', 'opening_check', 'Brief sign-off', 'Brief sign-offs'),
    ('marketing', 'phase', 'Phase', 'Phases'),
    ('marketing', 'scope_line', 'Deliverable', 'Deliverables'),
    ('marketing', 'key_date', 'Go-live date', 'Go-live dates'),
    ('marketing', 'task', 'Task', 'Tasks'),
    ('marketing', 'change', 'Brief change', 'Brief changes'),
    ('marketing', 'daily_record', 'Status note', 'Status notes'),
    ('marketing', 'progress_bill', 'Retainer invoice', 'Retainer invoices'),
    ('marketing', 'final_bill', 'Final invoice', 'Final invoices'),
    ('marketing', 'money_held', 'Media budget held', 'Media budgets held'),
    ('marketing', 'party', 'Media partner', 'Media partners'),
    ('marketing', 'closing_period', 'Reporting period', 'Reporting periods'),
    ('marketing', 'team_member', 'Team member', 'Team members'),
    ('marketing', 'meeting', 'Meeting', 'Meetings'),
    ('marketing', 'file', 'Asset', 'Assets'),
    ('marketing', 'cost', 'Cost', 'Costs'),
    ('marketing', 'time_entry', 'Time entry', 'Time entries'),
    ('marketing', 'subcontractor', 'Freelancer', 'Freelancers'),
    ('marketing', 'material', 'Material', 'Materials'),
    ('marketing', 'inspection', 'Creative review', 'Creative reviews'),
    ('marketing', 'snag', 'Amend', 'Amends'),
    ('marketing', 'risk', 'Risk', 'Risks'),
    ('marketing', 'programme', 'Programme', 'Programmes'),
    ('marketing', 'signoff', 'Client approval', 'Client approvals');

-- names in Interiors and fit-out
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('interiors', 'project', 'Fit-out', 'Fit-outs'),
    ('interiors', 'client', 'Client', 'Clients'),
    ('interiors', 'lead', 'Project designer', 'Project designers'),
    ('interiors', 'reference', 'Job number', 'Job numbers'),
    ('interiors', 'authority', 'Landlord or building manager', 'Landlords and building managers'),
    ('interiors', 'place', 'Site', 'Sites'),
    ('interiors', 'opening_check', 'Site measure', 'Site measures'),
    ('interiors', 'phase', 'Area', 'Areas'),
    ('interiors', 'scope_line', 'Work item', 'Schedule of works'),
    ('interiors', 'key_date', 'Handover date', 'Handover dates'),
    ('interiors', 'task', 'Task', 'Tasks'),
    ('interiors', 'change', 'Variation', 'Variations'),
    ('interiors', 'daily_record', 'Site diary entry', 'Site diary'),
    ('interiors', 'progress_bill', 'Stage certificate', 'Stage certificates'),
    ('interiors', 'final_bill', 'Final account', 'Final accounts'),
    ('interiors', 'money_held', 'Deposit', 'Deposits'),
    ('interiors', 'party', 'Consultant', 'Consultants'),
    ('interiors', 'closing_period', 'Defects period', 'Defects periods'),
    ('interiors', 'team_member', 'Site staff member', 'Site staff'),
    ('interiors', 'meeting', 'Meeting', 'Meetings'),
    ('interiors', 'file', 'Drawing or sample', 'Drawings and samples'),
    ('interiors', 'cost', 'Cost', 'Costs'),
    ('interiors', 'time_entry', 'Time entry', 'Time entries'),
    ('interiors', 'subcontractor', 'Subcontractor', 'Subcontractors'),
    ('interiors', 'material', 'Material', 'Materials'),
    ('interiors', 'inspection', 'Inspection', 'Inspections'),
    ('interiors', 'snag', 'Snag', 'Snags'),
    ('interiors', 'risk', 'Risk', 'Risks'),
    ('interiors', 'programme', 'Programme', 'Programmes'),
    ('interiors', 'signoff', 'Client approval', 'Client approvals');

-- names in NGO programmes and grants
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('ngo', 'project', 'Programme', 'Programmes'),
    ('ngo', 'client', 'Donor', 'Donors'),
    ('ngo', 'lead', 'Programme manager', 'Programme managers'),
    ('ngo', 'reference', 'Grant number', 'Grant numbers'),
    ('ngo', 'authority', 'Regulator', 'Regulators'),
    ('ngo', 'place', 'Project area', 'Project areas'),
    ('ngo', 'opening_check', 'Due diligence check', 'Due diligence checks'),
    ('ngo', 'phase', 'Component', 'Components'),
    ('ngo', 'scope_line', 'Activity', 'Activities and outputs'),
    ('ngo', 'key_date', 'Reporting deadline', 'Reporting deadlines'),
    ('ngo', 'task', 'Task', 'Tasks'),
    ('ngo', 'change', 'Budget revision', 'Budget revisions'),
    ('ngo', 'daily_record', 'Field report', 'Field reports'),
    ('ngo', 'progress_bill', 'Funding request', 'Funding requests'),
    ('ngo', 'final_bill', 'Final financial report', 'Final financial reports'),
    ('ngo', 'money_held', 'Donor funds', 'Donor funds'),
    ('ngo', 'party', 'Implementing partner', 'Implementing partners'),
    ('ngo', 'closing_period', 'Close-out period', 'Close-out periods'),
    ('ngo', 'team_member', 'Programme staff member', 'Programme staff'),
    ('ngo', 'meeting', 'Meeting', 'Meetings'),
    ('ngo', 'file', 'File', 'Files'),
    ('ngo', 'cost', 'Cost', 'Costs'),
    ('ngo', 'time_entry', 'Time entry', 'Time entries'),
    ('ngo', 'subcontractor', 'Contractor', 'Contractors'),
    ('ngo', 'material', 'Material', 'Materials'),
    ('ngo', 'inspection', 'Monitoring visit', 'Monitoring visits'),
    ('ngo', 'snag', 'Finding', 'Findings'),
    ('ngo', 'risk', 'Risk', 'Risks'),
    ('ngo', 'programme', 'Portfolio', 'Portfolios'),
    ('ngo', 'signoff', 'Donor approval', 'Donor approvals');

-- names in Events
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('events', 'project', 'Event', 'Events'),
    ('events', 'client', 'Client', 'Clients'),
    ('events', 'lead', 'Event manager', 'Event managers'),
    ('events', 'reference', 'Booking reference', 'Booking references'),
    ('events', 'authority', 'Venue', 'Venues'),
    ('events', 'place', 'Venue address', 'Venue addresses'),
    ('events', 'opening_check', 'Venue and date hold', 'Venue and date holds'),
    ('events', 'phase', 'Segment', 'Segments'),
    ('events', 'scope_line', 'Run sheet item', 'Run sheet'),
    ('events', 'key_date', 'Event date', 'Event dates'),
    ('events', 'task', 'Task', 'Tasks'),
    ('events', 'change', 'Change request', 'Change requests'),
    ('events', 'daily_record', 'Event log entry', 'Event log'),
    ('events', 'progress_bill', 'Deposit invoice', 'Deposit invoices'),
    ('events', 'final_bill', 'Balance invoice', 'Balance invoices'),
    ('events', 'money_held', 'Booking deposit', 'Booking deposits'),
    ('events', 'party', 'Supplier or performer', 'Suppliers and performers'),
    ('events', 'closing_period', 'Wrap-up period', 'Wrap-up periods'),
    ('events', 'team_member', 'Crew member', 'Crew'),
    ('events', 'meeting', 'Meeting', 'Meetings'),
    ('events', 'file', 'File', 'Files'),
    ('events', 'cost', 'Cost', 'Costs'),
    ('events', 'time_entry', 'Time entry', 'Time entries'),
    ('events', 'subcontractor', 'Supplier', 'Suppliers'),
    ('events', 'material', 'Equipment and decor item', 'Equipment and decor'),
    ('events', 'inspection', 'Site visit', 'Site visits'),
    ('events', 'snag', 'Issue', 'Issues'),
    ('events', 'risk', 'Risk', 'Risks'),
    ('events', 'programme', 'Programme', 'Programmes'),
    ('events', 'signoff', 'Client approval', 'Client approvals');

-- names in Fashion
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('fashion', 'project', 'Collection or order', 'Collections and orders'),
    ('fashion', 'client', 'Client', 'Clients'),
    ('fashion', 'lead', 'Lead designer', 'Lead designers'),
    ('fashion', 'reference', 'Order number', 'Order numbers'),
    ('fashion', 'authority', 'Buyer', 'Buyers'),
    ('fashion', 'place', 'Workroom', 'Workrooms'),
    ('fashion', 'opening_check', 'Design and fitting sign-off', 'Design and fitting sign-offs'),
    ('fashion', 'phase', 'Production stage', 'Production stages'),
    ('fashion', 'scope_line', 'Piece', 'Pieces and sizes'),
    ('fashion', 'key_date', 'Fitting date', 'Fitting dates'),
    ('fashion', 'task', 'Task', 'Tasks'),
    ('fashion', 'change', 'Alteration', 'Alterations'),
    ('fashion', 'daily_record', 'Workroom log entry', 'Workroom log'),
    ('fashion', 'progress_bill', 'Stage invoice', 'Stage invoices'),
    ('fashion', 'final_bill', 'Final invoice', 'Final invoices'),
    ('fashion', 'money_held', 'Order deposit', 'Order deposits'),
    ('fashion', 'party', 'Supplier or model', 'Suppliers and models'),
    ('fashion', 'closing_period', 'Alteration period', 'Alteration periods'),
    ('fashion', 'team_member', 'Workroom staff member', 'Workroom staff'),
    ('fashion', 'meeting', 'Meeting', 'Meetings'),
    ('fashion', 'file', 'Sketch or pattern', 'Sketches and patterns'),
    ('fashion', 'cost', 'Cost', 'Costs'),
    ('fashion', 'time_entry', 'Time entry', 'Time entries'),
    ('fashion', 'subcontractor', 'Outworker', 'Outworkers'),
    ('fashion', 'material', 'Fabric and trim', 'Fabrics and trims'),
    ('fashion', 'inspection', 'Fitting', 'Fittings'),
    ('fashion', 'snag', 'Defect', 'Defects'),
    ('fashion', 'risk', 'Risk', 'Risks'),
    ('fashion', 'programme', 'Programme', 'Programmes'),
    ('fashion', 'signoff', 'Client approval', 'Client approvals');

-- names in Healthcare
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('healthcare', 'project', 'Care plan', 'Care plans'),
    ('healthcare', 'client', 'Patient', 'Patients'),
    ('healthcare', 'lead', 'Lead clinician', 'Lead clinicians'),
    ('healthcare', 'reference', 'Patient file number', 'Patient file numbers'),
    ('healthcare', 'authority', 'Insurer or payer', 'Insurers and payers'),
    ('healthcare', 'place', 'Facility', 'Facilities'),
    ('healthcare', 'opening_check', 'Consent and eligibility check', 'Consent and eligibility checks'),
    ('healthcare', 'phase', 'Episode of care', 'Episodes of care'),
    ('healthcare', 'scope_line', 'Treatment item', 'Treatment plan'),
    ('healthcare', 'key_date', 'Appointment', 'Appointments'),
    ('healthcare', 'task', 'Task', 'Tasks'),
    ('healthcare', 'change', 'Plan change', 'Plan changes'),
    ('healthcare', 'daily_record', 'Clinical note', 'Clinical notes'),
    ('healthcare', 'progress_bill', 'Interim bill', 'Interim bills'),
    ('healthcare', 'final_bill', 'Final bill', 'Final bills'),
    ('healthcare', 'money_held', 'Patient deposit', 'Patient deposits'),
    ('healthcare', 'party', 'Referring provider', 'Referring providers'),
    ('healthcare', 'closing_period', 'Follow-up period', 'Follow-up periods'),
    ('healthcare', 'team_member', 'Care team member', 'Care team'),
    ('healthcare', 'meeting', 'Consultation', 'Consultations'),
    ('healthcare', 'file', 'Record', 'Records'),
    ('healthcare', 'cost', 'Cost', 'Costs'),
    ('healthcare', 'time_entry', 'Time entry', 'Time entries'),
    ('healthcare', 'subcontractor', 'External provider', 'External providers'),
    ('healthcare', 'material', 'Supply', 'Supplies'),
    ('healthcare', 'inspection', 'Review', 'Reviews'),
    ('healthcare', 'snag', 'Incident', 'Incidents'),
    ('healthcare', 'risk', 'Risk', 'Risks'),
    ('healthcare', 'programme', 'Programme', 'Programmes'),
    ('healthcare', 'signoff', 'Consent', 'Consents');

-- names in General projects
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('general', 'project', 'Project', 'Projects'),
    ('general', 'client', 'Client', 'Clients'),
    ('general', 'lead', 'Project lead', 'Project leads'),
    ('general', 'reference', 'Reference', 'References'),
    ('general', 'authority', 'Authority', 'Authorities'),
    ('general', 'place', 'Location', 'Locations'),
    ('general', 'opening_check', 'Approval to start', 'Approvals to start'),
    ('general', 'phase', 'Phase', 'Phases'),
    ('general', 'scope_line', 'Deliverable', 'Deliverables'),
    ('general', 'key_date', 'Deadline', 'Deadlines'),
    ('general', 'task', 'Task', 'Tasks'),
    ('general', 'change', 'Change', 'Changes'),
    ('general', 'daily_record', 'Note', 'Notes'),
    ('general', 'progress_bill', 'Invoice', 'Invoices'),
    ('general', 'final_bill', 'Final invoice', 'Final invoices'),
    ('general', 'money_held', 'Deposit', 'Deposits'),
    ('general', 'party', 'Partner', 'Partners'),
    ('general', 'closing_period', 'Follow-up period', 'Follow-up periods'),
    ('general', 'team_member', 'Team member', 'Team members'),
    ('general', 'meeting', 'Meeting', 'Meetings'),
    ('general', 'file', 'File', 'Files'),
    ('general', 'cost', 'Cost', 'Costs'),
    ('general', 'time_entry', 'Time entry', 'Time entries'),
    ('general', 'subcontractor', 'Supplier', 'Suppliers'),
    ('general', 'material', 'Material', 'Materials'),
    ('general', 'inspection', 'Review', 'Reviews'),
    ('general', 'snag', 'Issue', 'Issues'),
    ('general', 'risk', 'Risk', 'Risks'),
    ('general', 'programme', 'Programme', 'Programmes'),
    ('general', 'signoff', 'Sign-off', 'Sign-offs');

-- names in Jobs and field service
INSERT IGNORE INTO project_term_names (industry_key, term_key, name, name_plural) VALUES
    ('field_service', 'project', 'Job', 'Jobs'),
    ('field_service', 'client', 'Client', 'Clients'),
    ('field_service', 'lead', 'Job supervisor', 'Job supervisors'),
    ('field_service', 'reference', 'Job number', 'Job numbers'),
    ('field_service', 'authority', 'Site contact', 'Site contacts'),
    ('field_service', 'place', 'Site', 'Sites'),
    ('field_service', 'opening_check', 'Site survey', 'Site surveys'),
    ('field_service', 'phase', 'Visit', 'Visits'),
    ('field_service', 'scope_line', 'Job card item', 'Job card'),
    ('field_service', 'key_date', 'Visit date', 'Visit dates'),
    ('field_service', 'task', 'Task', 'Tasks'),
    ('field_service', 'change', 'Extra work item', 'Extra work'),
    ('field_service', 'daily_record', 'Job report', 'Job reports'),
    ('field_service', 'progress_bill', 'Job invoice', 'Job invoices'),
    ('field_service', 'final_bill', 'Final invoice', 'Final invoices'),
    ('field_service', 'money_held', 'Deposit', 'Deposits'),
    ('field_service', 'party', 'Supplier', 'Suppliers'),
    ('field_service', 'closing_period', 'Guarantee period', 'Guarantee periods'),
    ('field_service', 'team_member', 'Technician', 'Technicians'),
    ('field_service', 'meeting', 'Meeting', 'Meetings'),
    ('field_service', 'file', 'File', 'Files'),
    ('field_service', 'cost', 'Cost', 'Costs'),
    ('field_service', 'time_entry', 'Time entry', 'Time entries'),
    ('field_service', 'subcontractor', 'Subcontractor', 'Subcontractors'),
    ('field_service', 'material', 'Part', 'Parts'),
    ('field_service', 'inspection', 'Inspection', 'Inspections'),
    ('field_service', 'snag', 'Call-back', 'Call-backs'),
    ('field_service', 'risk', 'Risk', 'Risks'),
    ('field_service', 'programme', 'Programme', 'Programmes'),
    ('field_service', 'signoff', 'Customer sign-off', 'Customer sign-offs');

-- starter kinds of work (40), each with its own number prefix
INSERT IGNORE INTO project_types (industry_key, name, number_prefix, is_active, sort_order, created_at, updated_at) VALUES
    ('legal', 'Litigation', 'M', 1, 10, NOW(), NOW()),
    ('legal', 'Conveyancing', 'CV', 1, 20, NOW(), NOW()),
    ('legal', 'Corporate and commercial', 'CO', 1, 30, NOW(), NOW()),
    ('legal', 'Advisory', 'AD', 1, 40, NOW(), NOW()),
    ('construction', 'Building works', 'BW', 1, 10, NOW(), NOW()),
    ('construction', 'Civil works', 'CW', 1, 20, NOW(), NOW()),
    ('construction', 'Renovation', 'RN', 1, 30, NOW(), NOW()),
    ('software', 'Software build', 'SW', 1, 10, NOW(), NOW()),
    ('software', 'Implementation', 'IM', 1, 20, NOW(), NOW()),
    ('software', 'Support retainer', 'SR', 1, 30, NOW(), NOW()),
    ('consulting', 'Audit', 'AU', 1, 10, NOW(), NOW()),
    ('consulting', 'Tax', 'TX', 1, 20, NOW(), NOW()),
    ('consulting', 'Advisory', 'CA', 1, 30, NOW(), NOW()),
    ('architecture', 'Building design', 'BD', 1, 10, NOW(), NOW()),
    ('architecture', 'Engineering design', 'ED', 1, 20, NOW(), NOW()),
    ('architecture', 'Supervision', 'SV', 1, 30, NOW(), NOW()),
    ('catering', 'Function', 'FN', 1, 10, NOW(), NOW()),
    ('catering', 'Contract catering', 'CC', 1, 20, NOW(), NOW()),
    ('photography', 'Photo shoot', 'PS', 1, 10, NOW(), NOW()),
    ('photography', 'Film production', 'FP', 1, 20, NOW(), NOW()),
    ('marketing', 'Campaign', 'CJ', 1, 10, NOW(), NOW()),
    ('marketing', 'Retainer', 'RT', 1, 20, NOW(), NOW()),
    ('marketing', 'Brand project', 'BR', 1, 30, NOW(), NOW()),
    ('interiors', 'Fit-out', 'FO', 1, 10, NOW(), NOW()),
    ('interiors', 'Design only', 'DO', 1, 20, NOW(), NOW()),
    ('ngo', 'Grant-funded programme', 'GP', 1, 10, NOW(), NOW()),
    ('ngo', 'Core programme', 'CP', 1, 20, NOW(), NOW()),
    ('events', 'Private event', 'EV', 1, 10, NOW(), NOW()),
    ('events', 'Corporate event', 'CE', 1, 20, NOW(), NOW()),
    ('events', 'Wedding', 'WD', 1, 30, NOW(), NOW()),
    ('fashion', 'Bespoke order', 'BO', 1, 10, NOW(), NOW()),
    ('fashion', 'Collection', 'CL', 1, 20, NOW(), NOW()),
    ('fashion', 'Production run', 'PR', 1, 30, NOW(), NOW()),
    ('healthcare', 'Treatment plan', 'TP', 1, 10, NOW(), NOW()),
    ('healthcare', 'Home care', 'HC', 1, 20, NOW(), NOW()),
    ('general', 'Client project', 'P', 1, 10, NOW(), NOW()),
    ('general', 'Internal project', 'IN', 1, 20, NOW(), NOW()),
    ('field_service', 'Installation', 'IS', 1, 10, NOW(), NOW()),
    ('field_service', 'Repair', 'RP', 1, 20, NOW(), NOW()),
    ('field_service', 'Maintenance', 'MT', 1, 30, NOW(), NOW());

INSERT IGNORE INTO project_series (prefix, next_number, width) SELECT number_prefix, 1, 4 FROM project_types;

-- starter stages. The last stage of each kind of work is its closed one; the rest are open.
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Opening', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Litigation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Pleadings', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Litigation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Discovery', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Litigation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Hearing', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Litigation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Judgment', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Litigation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Litigation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Opening', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Conveyancing', 'Corporate and commercial', 'Advisory');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'In progress', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Conveyancing', 'Corporate and commercial', 'Advisory');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Completion', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Conveyancing', 'Corporate and commercial', 'Advisory');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 40, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Conveyancing', 'Corporate and commercial', 'Advisory');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Tender', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'construction' AND name IN ('Building works', 'Civil works', 'Renovation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Mobilisation', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'construction' AND name IN ('Building works', 'Civil works', 'Renovation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Works', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'construction' AND name IN ('Building works', 'Civil works', 'Renovation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Practical completion', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'construction' AND name IN ('Building works', 'Civil works', 'Renovation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Defects period', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'construction' AND name IN ('Building works', 'Civil works', 'Renovation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'construction' AND name IN ('Building works', 'Civil works', 'Renovation');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Discovery', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'software' AND name IN ('Software build', 'Implementation', 'Support retainer');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Build', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'software' AND name IN ('Software build', 'Implementation', 'Support retainer');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Testing', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'software' AND name IN ('Software build', 'Implementation', 'Support retainer');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Go-live', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'software' AND name IN ('Software build', 'Implementation', 'Support retainer');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Support', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'software' AND name IN ('Software build', 'Implementation', 'Support retainer');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'software' AND name IN ('Software build', 'Implementation', 'Support retainer');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Planning', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'consulting' AND name IN ('Audit', 'Tax', 'Advisory');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Fieldwork', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'consulting' AND name IN ('Audit', 'Tax', 'Advisory');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Reporting', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'consulting' AND name IN ('Audit', 'Tax', 'Advisory');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 40, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'consulting' AND name IN ('Audit', 'Tax', 'Advisory');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Brief', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'architecture' AND name IN ('Building design', 'Engineering design', 'Supervision');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Concept', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'architecture' AND name IN ('Building design', 'Engineering design', 'Supervision');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Detailed design', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'architecture' AND name IN ('Building design', 'Engineering design', 'Supervision');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Approvals', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'architecture' AND name IN ('Building design', 'Engineering design', 'Supervision');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Construction stage', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'architecture' AND name IN ('Building design', 'Engineering design', 'Supervision');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'architecture' AND name IN ('Building design', 'Engineering design', 'Supervision');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Enquiry', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'catering' AND name IN ('Function', 'Contract catering');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Menu agreed', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'catering' AND name IN ('Function', 'Contract catering');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Preparation', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'catering' AND name IN ('Function', 'Contract catering');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Function day', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'catering' AND name IN ('Function', 'Contract catering');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 50, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'catering' AND name IN ('Function', 'Contract catering');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Brief', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'photography' AND name IN ('Photo shoot', 'Film production');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Pre-production', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'photography' AND name IN ('Photo shoot', 'Film production');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Shoot', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'photography' AND name IN ('Photo shoot', 'Film production');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Editing', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'photography' AND name IN ('Photo shoot', 'Film production');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Delivered', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'photography' AND name IN ('Photo shoot', 'Film production');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'photography' AND name IN ('Photo shoot', 'Film production');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Brief', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'marketing' AND name IN ('Campaign', 'Retainer', 'Brand project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Creative', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'marketing' AND name IN ('Campaign', 'Retainer', 'Brand project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Production', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'marketing' AND name IN ('Campaign', 'Retainer', 'Brand project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Live', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'marketing' AND name IN ('Campaign', 'Retainer', 'Brand project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Reporting', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'marketing' AND name IN ('Campaign', 'Retainer', 'Brand project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'marketing' AND name IN ('Campaign', 'Retainer', 'Brand project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Survey', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'interiors' AND name IN ('Fit-out', 'Design only');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Design', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'interiors' AND name IN ('Fit-out', 'Design only');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Procurement', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'interiors' AND name IN ('Fit-out', 'Design only');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Works', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'interiors' AND name IN ('Fit-out', 'Design only');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Handover', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'interiors' AND name IN ('Fit-out', 'Design only');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'interiors' AND name IN ('Fit-out', 'Design only');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Design', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'ngo' AND name IN ('Grant-funded programme', 'Core programme');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Approved', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'ngo' AND name IN ('Grant-funded programme', 'Core programme');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Implementation', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'ngo' AND name IN ('Grant-funded programme', 'Core programme');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Evaluation', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'ngo' AND name IN ('Grant-funded programme', 'Core programme');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Close-out', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'ngo' AND name IN ('Grant-funded programme', 'Core programme');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'ngo' AND name IN ('Grant-funded programme', 'Core programme');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Enquiry', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'events' AND name IN ('Private event', 'Corporate event', 'Wedding');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Planning', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'events' AND name IN ('Private event', 'Corporate event', 'Wedding');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Confirmed', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'events' AND name IN ('Private event', 'Corporate event', 'Wedding');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Event day', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'events' AND name IN ('Private event', 'Corporate event', 'Wedding');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Wrap-up', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'events' AND name IN ('Private event', 'Corporate event', 'Wedding');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'events' AND name IN ('Private event', 'Corporate event', 'Wedding');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Design', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'fashion' AND name IN ('Bespoke order', 'Collection', 'Production run');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Sampling', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'fashion' AND name IN ('Bespoke order', 'Collection', 'Production run');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Fitting', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'fashion' AND name IN ('Bespoke order', 'Collection', 'Production run');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Production', 40, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'fashion' AND name IN ('Bespoke order', 'Collection', 'Production run');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Delivered', 50, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'fashion' AND name IN ('Bespoke order', 'Collection', 'Production run');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 60, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'fashion' AND name IN ('Bespoke order', 'Collection', 'Production run');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Assessment', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'healthcare' AND name IN ('Treatment plan', 'Home care');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Active care', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'healthcare' AND name IN ('Treatment plan', 'Home care');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Review', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'healthcare' AND name IN ('Treatment plan', 'Home care');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Discharged', 40, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'healthcare' AND name IN ('Treatment plan', 'Home care');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Planning', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'general' AND name IN ('Client project', 'Internal project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Active', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'general' AND name IN ('Client project', 'Internal project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closing', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'general' AND name IN ('Client project', 'Internal project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Closed', 40, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'general' AND name IN ('Client project', 'Internal project');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Booked', 10, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'field_service' AND name IN ('Installation', 'Repair', 'Maintenance');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Survey', 20, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'field_service' AND name IN ('Installation', 'Repair', 'Maintenance');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'On site', 30, 'open', 'info', NOW(), NOW() FROM project_types WHERE industry_key = 'field_service' AND name IN ('Installation', 'Repair', 'Maintenance');
INSERT IGNORE INTO project_stages (type_id, name, sort_order, state, status_token, created_at, updated_at) SELECT id, 'Completed', 40, 'closed', 'good', NOW(), NOW() FROM project_types WHERE industry_key = 'field_service' AND name IN ('Installation', 'Repair', 'Maintenance');

-- project roles as they ship (rows an owner can rename, change or add to)
INSERT IGNORE INTO project_roles (`key`, name, description, is_system, is_active, sort_order, created_at, updated_at) VALUES
    ('lead', 'Lead', 'Runs the project: changes it, moves it on and decides who is on it.', 1, 1, 10, NOW(), NOW()),
    ('member', 'Member', 'Works on the project.', 1, 1, 20, NOW(), NOW()),
    ('finance', 'Finance', 'Looks after the money side of the project.', 1, 1, 30, NOW(), NOW()),
    ('reviewer', 'Reviewer', 'Reads the project and its history, changes nothing.', 1, 1, 40, NOW(), NOW()),
    ('client', 'Client', 'The client''s own people: they see what is shared with them.', 1, 1, 50, NOW(), NOW()),
    ('guest', 'Guest', 'An outsider let in for a time: they see what is shared with them.', 1, 1, 60, NOW(), NOW());

INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, a.ability FROM project_roles JOIN (SELECT 'open' AS ability UNION ALL SELECT 'edit' AS ability UNION ALL SELECT 'stage' AS ability UNION ALL SELECT 'phases' AS ability UNION ALL SELECT 'members' AS ability UNION ALL SELECT 'links' AS ability UNION ALL SELECT 'log' AS ability) a WHERE `key` = 'lead';
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, a.ability FROM project_roles JOIN (SELECT 'open' AS ability UNION ALL SELECT 'phases' AS ability UNION ALL SELECT 'links' AS ability) a WHERE `key` = 'member';
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, a.ability FROM project_roles JOIN (SELECT 'open' AS ability UNION ALL SELECT 'links' AS ability) a WHERE `key` = 'finance';
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, a.ability FROM project_roles JOIN (SELECT 'open' AS ability UNION ALL SELECT 'log' AS ability) a WHERE `key` = 'reviewer';
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, a.ability FROM project_roles JOIN (SELECT 'open_shared' AS ability) a WHERE `key` = 'client';
INSERT IGNORE INTO project_role_permissions (project_role_id, ability) SELECT id, a.ability FROM project_roles JOIN (SELECT 'open_shared' AS ability) a WHERE `key` = 'guest';

-- settings: the company starts on General projects; trash is kept 30 days; a project may use an industry other than the default
INSERT IGNORE INTO project_settings (part, value, version, updated_at) VALUES
    ('general', JSON_OBJECT('default_industry', 'general', 'project_may_use_other_industry', TRUE, 'trash_days', 30), 1, NOW());
INSERT IGNORE INTO project_setting_versions (part, version, value, note, saved_at) VALUES
    ('general', 1, JSON_OBJECT('default_industry', 'general', 'project_may_use_other_industry', TRUE, 'trash_days', 30), 'As shipped', NOW());

-- PART C - CHECK (expect 20 tables, then 15 industries, 30 terms, 450 names, 40 kinds of work, 212 stages, 6 project roles)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_industries', 'project_terms', 'project_term_names', 'project_term_overrides', 'project_types', 'project_stages', 'project_fields', 'project_field_values', 'project_series', 'projects', 'project_phases', 'project_links', 'project_roles', 'project_role_permissions', 'project_members', 'project_log', 'project_settings', 'project_setting_versions', 'project_setting_logs', 'project_user_prefs');
SELECT (SELECT COUNT(*) FROM project_industries) AS industries, (SELECT COUNT(*) FROM project_terms) AS terms, (SELECT COUNT(*) FROM project_term_names) AS names,
       (SELECT COUNT(*) FROM project_types) AS kinds_of_work, (SELECT COUNT(*) FROM project_stages) AS stages, (SELECT COUNT(*) FROM project_roles) AS project_roles;
