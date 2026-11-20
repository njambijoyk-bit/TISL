-- =====================================================================
-- 268_projects_industry.sql
-- Projects stage 11 (docs/PROJECTS_STAGE11_SPEC.md): industry finish.
--   project_type_settings         per kind of work: confidential to start with, opening check required
--   project_work_templates        work templates of a kind of work (one can be the default)
--   project_template_items        their phases, tasks (days after the start, estimate) and key dates (kind, days after, warnings)
--   project_opening_questions     opening check questions, for an industry or one kind of work
--   project_opening_checks        a work's opening check: answers, passed, who signed and when
--   project_date_rules            when a key date of one kind is set or done, or a stage is entered, make another so many days later
--   project_rule_dates            which key dates a rule made, and from which date
-- Then the starter content for all fifteen industries: rows in these tables and in the Stage 1 to 10 ones. Every row is the company's own to
-- change or remove; a later script never overwrites it (INSERT IGNORE on a fixed key).
-- Needs scripts 257 to 267. Safe to re-run. No permission seed is needed. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (the site tables of 267 are there), then what exists now (nothing on a first run).
SELECT COUNT(*) AS site_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_snags';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_type_settings', 'project_work_templates', 'project_template_items', 'project_opening_questions', 'project_opening_checks', 'project_date_rules', 'project_rule_dates');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_industry_guard;
DELIMITER $$
CREATE PROCEDURE projects_industry_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_snags') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Run scripts 257 to 267 first. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL projects_industry_guard();
DROP PROCEDURE IF EXISTS projects_industry_guard;

CREATE TABLE IF NOT EXISTS project_type_settings (
    type_id               BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    confidential_default  TINYINT(1) NOT NULL DEFAULT 0,                 -- new work of this kind starts confidential
    opening_required      TINYINT(1) NOT NULL DEFAULT 0,                 -- the opening check must pass before the work leaves its first stage
    updated_by            BIGINT UNSIGNED NULL,
    updated_at            TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_work_templates (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type_id     BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(120) NOT NULL,
    is_default  TINYINT(1) NOT NULL DEFAULT 0,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_project_work_templates (type_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_template_items (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    template_id       BIGINT UNSIGNED NOT NULL,
    kind              VARCHAR(8) NOT NULL,                               -- phase | task | date
    ref               VARCHAR(40) NULL,                                  -- a phase's own name in the template, for what sits under it
    parent_ref        VARCHAR(40) NULL,                                  -- the phase a phase, task or date sits under
    title             VARCHAR(200) NOT NULL,
    offset_days       INT NULL,                                          -- task: due so many days after the start; date: on that day
    estimate_minutes  INT NULL,
    date_kind         VARCHAR(40) NULL,                                  -- date: from the key date kinds
    warn_days         VARCHAR(40) NULL,
    sort_order        INT NOT NULL DEFAULT 0,
    UNIQUE KEY uq_project_template_items (template_id, kind, title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_opening_questions (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    industry_key  VARCHAR(40) NOT NULL DEFAULT '',                       -- the whole industry, or
    type_id       BIGINT UNSIGNED NOT NULL DEFAULT 0,                    -- one kind of work
    `key`         VARCHAR(60) NOT NULL,
    question      VARCHAR(300) NOT NULL,
    must_be_yes   TINYINT(1) NOT NULL DEFAULT 1,                         -- the check passes only when this is answered yes
    sort_order    INT NOT NULL DEFAULT 0,
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_project_opening_questions (industry_key, type_id, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_opening_checks (
    project_id   BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    answers      TEXT NULL,                                              -- [{key, question, answer: yes|no, note}]
    state        VARCHAR(8) NOT NULL DEFAULT 'draft',                    -- draft | done
    passed       TINYINT(1) NULL,
    signed_by    BIGINT UNSIGNED NULL,
    signed_name  VARCHAR(120) NULL,
    signed_at    TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_date_rules (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    industry_key   VARCHAR(40) NOT NULL,
    `key`          VARCHAR(60) NOT NULL,
    name           VARCHAR(160) NOT NULL,
    trigger_kind   VARCHAR(10) NOT NULL,                                 -- date_set | date_done | stage
    trigger_value  VARCHAR(80) NOT NULL,                                 -- a key date kind, or a stage's name
    make_kind      VARCHAR(40) NULL,                                     -- the kind of the key date made
    make_title     VARCHAR(200) NOT NULL,
    offset_days    INT NOT NULL,
    working_days   TINYINT(1) NOT NULL DEFAULT 0,                        -- count Monday to Friday only
    warn_days      VARCHAR(40) NULL,
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_project_date_rules (industry_key, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_rule_dates (
    key_date_id     BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    rule_id         BIGINT UNSIGNED NOT NULL,
    source_date_id  BIGINT UNSIGNED NULL,                                -- the key date it follows, when it was made from one
    touched         TINYINT(1) NOT NULL DEFAULT 0,                       -- moved or changed by hand: no longer moved with its source
    created_at      TIMESTAMP NULL,
    KEY idx_project_rule_dates_source (source_date_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===================================================================== STARTER CONTENT
-- (added build by build: 11.4 the common five, 11.5 the niche eight and the basic two)

-- ===================================================================== THE COMMON FIVE (build 11.4)

-- ---------------------------------------------------------------- Legal
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('key_date', 'service', 'Service of papers', 'legal', NULL, 1, 100), ('key_date', 'directions', 'Directions hearing', 'legal', NULL, 1, 110), ('key_date', 'completion', 'Completion date', 'legal', NULL, 1, 120);
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('legal_case_number', 'Case number', 'text', NULL, 'legal', NULL, 0, 0, 1, 100, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('legal_court', 'Court', 'pick_one', '["Supreme Court", "Court of Appeal", "High Court", "Employment and Labour Relations Court", "Environment and Land Court", "Magistrates'' Court", "Tribunal"]', 'legal', NULL, 0, 0, 1, 110, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('legal_judge', 'Judge or magistrate', 'text', NULL, 'legal', NULL, 0, 0, 1, 120, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('legal_fee_basis', 'Fee basis', 'pick_one', '["Hourly", "Fixed fee", "Scale fee", "Success fee", "Retainer"]', 'legal', NULL, 0, 0, 1, 130, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('legal_title_number', 'Title number', 'text', NULL, 'legal', NULL, 0, 0, 1, 140, NOW(), NOW());
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Engagement letter', 'legal', '{{company.name}}
{{today}}

{{client.name}}
Attention: {{contact.name}}

Dear {{contact.name}},

{{project.number}}: {{project.title}}

Thank you for asking us to act for you. This letter sets out the work we will do, who will do it and how we will work together.

The work: {{project.description}}
The lead on your work: {{lead.name}} ({{lead.email}})
The team: {{team}}
We expect to start on {{project.start_date}}.

Please sign and return a copy of this letter to confirm.

Yours faithfully,

{{me.name}}
For {{company.name}}', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'legal' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Engagement letter' AND industry_key = 'legal');
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Letter to the court', 'legal', '{{company.name}}
{{today}}

The Deputy Registrar
{{field.legal_court}}

Re: {{field.legal_case_number}}, {{project.title}}

We act for {{client.name}} in the above matter.



Yours faithfully,

{{me.name}}
For {{company.name}}', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'legal' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Letter to the court' AND industry_key = 'legal');
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('legal', 0, 'conflict', 'No conflict of interest with an existing client or party', 1, 10, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('legal', 0, 'kyc', 'The client''s identity documents are seen and kept (KYC)', 1, 20, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('legal', 0, 'engagement', 'The engagement letter is signed', 1, 30, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('legal', 0, 'retainer', 'A retainer or deposit is asked for', 0, 40, 1, NOW());
INSERT IGNORE INTO project_type_settings (type_id, confidential_default, opening_required, updated_at) SELECT id, 0, 1, NOW() FROM project_types WHERE industry_key = 'legal' AND name IN ('Litigation', 'Conveyancing', 'Corporate and commercial', 'Advisory');
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('legal', 'defence_after_service', 'Defence due', 'date_set', 'service', 'filing', 'Defence due', 15, 0, '7,3,1', 1, NOW());
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('legal', 'appeal_after_judgment', 'Last day to file a notice of appeal', 'date_done', 'judgment', 'deadline', 'Last day to file a notice of appeal', 14, 0, '7,3,1', 1, NOW());
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('legal', 'submissions_after_directions', 'Written submissions due', 'date_done', 'directions', 'filing', 'Written submissions due', 21, 0, '7,2', 1, NOW());
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Civil suit', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name = 'Litigation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Opening', NULL, 'Opening', NULL, NULL, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Opening', 'Take instructions and collect documents', 2, 120, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Opening', 'Send the engagement letter', 3, NULL, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Pleadings', NULL, 'Pleadings', NULL, NULL, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Pleadings', 'Draft the plaint or defence', 10, 480, NULL, NULL, 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Pleadings', 'File and serve', 14, 120, NULL, NULL, 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Discovery', NULL, 'Discovery', NULL, NULL, NULL, NULL, 70 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Discovery', 'List and exchange documents', 45, 240, NULL, NULL, 80 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Discovery', 'Witness statements', 60, 360, NULL, NULL, 90 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Hearing', NULL, 'Hearing', NULL, NULL, NULL, NULL, 100 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Hearing', 'Prepare the trial bundle', 90, 480, NULL, NULL, 110 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Mention', 30, NULL, 'mention', '7,1', 120 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Litigation' AND t.name = 'Civil suit';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Sale or purchase', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name = 'Conveyancing';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Searches', NULL, 'Searches', NULL, NULL, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Searches', 'Official search at the land registry', 3, 60, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Searches', 'Rates and rent clearance', 7, 60, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Agreement', NULL, 'Agreement', NULL, NULL, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Agreement', 'Draft the sale agreement', 7, 240, NULL, NULL, 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Agreement', 'Execution by both parties', 14, 60, NULL, NULL, 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Transfer', NULL, 'Transfer', NULL, NULL, NULL, NULL, 70 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Transfer', 'Transfer and stamp duty', 30, 120, NULL, NULL, 80 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Transfer', 'Registration', 60, 60, NULL, NULL, 90 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Completion', 90, NULL, 'completion', '14,7,1', 100 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Conveyancing' AND t.name = 'Sale or purchase';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Transaction', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name = 'Corporate and commercial';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Due diligence', NULL, 'Due diligence', NULL, NULL, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Corporate and commercial' AND t.name = 'Transaction';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Due diligence', 'Request list and data room', 5, 120, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Corporate and commercial' AND t.name = 'Transaction';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Due diligence', 'Due diligence report', 21, 960, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Corporate and commercial' AND t.name = 'Transaction';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Documents', NULL, 'Documents', NULL, NULL, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Corporate and commercial' AND t.name = 'Transaction';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Documents', 'Draft the agreements', 30, 960, NULL, NULL, 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Corporate and commercial' AND t.name = 'Transaction';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Documents', 'Negotiation', 45, 480, NULL, NULL, 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Corporate and commercial' AND t.name = 'Transaction';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Closing', NULL, 'Closing', NULL, NULL, NULL, NULL, 70 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Corporate and commercial' AND t.name = 'Transaction';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Closing', 'Closing checklist', 60, 240, NULL, NULL, 80 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Corporate and commercial' AND t.name = 'Transaction';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Legal opinion', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'legal' AND name = 'Advisory';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Take instructions', 1, 60, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Advisory' AND t.name = 'Legal opinion';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Research', 7, 480, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Advisory' AND t.name = 'Legal opinion';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Draft the opinion', 10, 360, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Advisory' AND t.name = 'Legal opinion';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Partner review', 12, 60, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'legal' AND y.name = 'Advisory' AND t.name = 'Legal opinion';
UPDATE project_stages SET required_fields = '["customer_id", "field:legal_case_number"]' WHERE required_fields IS NULL AND name = 'Pleadings' AND type_id IN (SELECT id FROM project_types WHERE industry_key = 'legal');

-- ---------------------------------------------------------------- Construction
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('key_date', 'commencement', 'Commencement', 'construction', NULL, 1, 100), ('key_date', 'valuation', 'Valuation date', 'construction', NULL, 1, 110), ('key_date', 'final_account', 'Final account due', 'construction', NULL, 1, 120);
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('con_site_address', 'Site address', 'text', NULL, 'construction', NULL, 0, 0, 1, 100, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('con_plot_number', 'Plot or LR number', 'text', NULL, 'construction', NULL, 0, 0, 1, 110, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('con_contract_form', 'Form of contract', 'pick_one', '["JBC", "FIDIC", "PPRA standard", "Design and build", "Other"]', 'construction', NULL, 0, 0, 1, 120, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('con_defects_months', 'Defects period (months)', 'number', NULL, 'construction', NULL, 0, 0, 1, 130, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('con_nca_number', 'NCA registration number', 'text', NULL, 'construction', NULL, 0, 0, 1, 140, NOW(), NOW());
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Letter of award', 'construction', '{{company.name}}
{{today}}

{{client.name}}

Re: {{project.title}} ({{project.number}})
Site: {{field.con_site_address}}

We are pleased to confirm the award of the above works on the terms of the {{field.con_contract_form}} form of contract.
Possession of the site: {{project.start_date}}. Expected completion: {{project.due_date}}.
Our site lead: {{lead.name}}.

Yours faithfully,

{{me.name}}', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'construction' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Letter of award' AND industry_key = 'construction');
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Practical completion notice', 'construction', '{{company.name}}
{{today}}

{{client.name}}

Re: {{project.title}} ({{project.number}})

We give notice that the works at {{field.con_site_address}} reached practical completion on ________.
The defects period of {{field.con_defects_months}} months runs from that day.

{{me.name}}', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'construction' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Practical completion notice' AND industry_key = 'construction');
INSERT IGNORE INTO project_inspection_kinds (`key`, name, questions, is_active, created_at) VALUES ('concrete_pour', 'Before a concrete pour', 'Formwork is true, braced and clean
Reinforcement is as the drawings: size, spacing and cover
Starter bars and cast-in items are in place
The engineer has approved the pour', 1, NOW());
INSERT IGNORE INTO project_inspection_kinds (`key`, name, questions, is_active, created_at) VALUES ('handover', 'Handover inspection', 'Finishes are complete and clean
Doors, windows and ironmongery work
Electrical and plumbing are tested
Manuals and keys are handed over', 1, NOW());
INSERT IGNORE INTO project_inspection_kinds (`key`, name, questions, is_active, created_at) VALUES ('safety_walk', 'Weekly safety walk', 'Everyone on site wears protective gear
Scaffolding is tagged and safe
Edges and openings are protected
First aid box and fire extinguishers are in place', 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('construction', 0, 'site_access', 'The site is handed over and can be reached', 1, 10, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('construction', 0, 'drawings', 'The approved drawings are received', 1, 20, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('construction', 0, 'insurance', 'Contractor''s all-risk insurance is in place', 1, 30, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('construction', 0, 'permits', 'Permits and NCA registration are in place', 1, 40, 1, NOW());
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('construction', 'defects_after_completion', 'End of the defects period', 'stage', 'Practical completion', 'defects_end', 'End of the defects period', 365, 0, '60,30,7', 1, NOW());
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('construction', 'valuation_monthly', 'First valuation', 'date_set', 'commencement', 'valuation', 'First valuation', 30, 0, '3', 1, NOW());
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('construction', 'final_account_after_defects', 'Final account due', 'date_done', 'defects_end', 'final_account', 'Final account due', 90, 0, '14,7', 1, NOW());
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Building', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'construction' AND name = 'Building works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Mobilisation', NULL, 'Mobilisation', NULL, NULL, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Mobilisation', 'Site set-up and hoarding', 7, 960, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Mobilisation', 'Setting out', 10, 480, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Commencement', 0, NULL, 'commencement', NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Substructure', NULL, 'Substructure', NULL, NULL, NULL, NULL, 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Substructure', 'Excavation', 21, NULL, NULL, NULL, 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Substructure', 'Foundations', 35, NULL, NULL, NULL, 70 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Superstructure', NULL, 'Superstructure', NULL, NULL, NULL, NULL, 80 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Superstructure', 'Frame and slabs', 90, NULL, NULL, NULL, 90 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Superstructure', 'Walling', 120, NULL, NULL, NULL, 100 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Finishes', NULL, 'Finishes', NULL, NULL, NULL, NULL, 110 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Finishes', 'Services first fix', 130, NULL, NULL, NULL, 120 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Finishes', 'Finishes', 170, NULL, NULL, NULL, 130 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Handover', NULL, 'Handover', NULL, NULL, NULL, NULL, 140 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Handover', 'Snagging', 185, NULL, NULL, NULL, 150 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Practical completion', 200, NULL, 'practical_completion', '14,7', 160 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Building works' AND t.name = 'Building';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Road or civil works', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'construction' AND name = 'Civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Mobilisation', NULL, 'Mobilisation', NULL, NULL, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Mobilisation', 'Camp and plant on site', 14, NULL, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Mobilisation', 'Survey and setting out', 21, NULL, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Earthworks', NULL, 'Earthworks', NULL, NULL, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Earthworks', 'Clearing and earthworks', 60, NULL, NULL, NULL, 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Pavement and drainage', NULL, 'Pavement and drainage', NULL, NULL, NULL, NULL, 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Pavement and drainage', 'Drainage', 90, NULL, NULL, NULL, 70 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Pavement and drainage', 'Sub-base and base', 120, NULL, NULL, NULL, 80 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Pavement and drainage', 'Surfacing', 150, NULL, NULL, NULL, 90 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Practical completion', 180, NULL, 'practical_completion', '14,7', 100 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Civil works' AND t.name = 'Road or civil works';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Renovation', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'construction' AND name = 'Renovation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Survey of the existing building', 3, 240, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Renovation' AND t.name = 'Renovation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Strip out', 10, NULL, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Renovation' AND t.name = 'Renovation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Repairs and alterations', 30, NULL, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Renovation' AND t.name = 'Renovation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Finishes', 45, NULL, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Renovation' AND t.name = 'Renovation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Snagging', 55, NULL, NULL, NULL, 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Renovation' AND t.name = 'Renovation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Handover', 60, NULL, 'handover', '7,1', 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'construction' AND y.name = 'Renovation' AND t.name = 'Renovation';
UPDATE project_stages SET required_fields = '["customer_id", "field:con_site_address"]' WHERE required_fields IS NULL AND name = 'Mobilisation' AND type_id IN (SELECT id FROM project_types WHERE industry_key = 'construction');

-- ---------------------------------------------------------------- Software and IT
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('key_date', 'kickoff', 'Kick-off', 'software', NULL, 1, 100), ('key_date', 'sprint_review', 'Sprint review', 'software', NULL, 1, 110), ('key_date', 'uat', 'User acceptance testing', 'software', NULL, 1, 120), ('key_date', 'go_live', 'Go-live', 'software', NULL, 1, 130), ('key_date', 'support_end', 'End of support period', 'software', NULL, 1, 140);
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('sw_repository', 'Code repository', 'text', NULL, 'software', NULL, 0, 0, 1, 100, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('sw_environments', 'Environments', 'pick_many', '["Development", "Staging", "Production"]', 'software', NULL, 0, 0, 1, 110, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('sw_method', 'Way of working', 'pick_one', '["Scrum", "Kanban", "Waterfall", "Fixed scope"]', 'software', NULL, 0, 0, 1, 120, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('sw_product_owner', 'Client''s product owner', 'text', NULL, 'software', NULL, 0, 0, 1, 130, NOW(), NOW());
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Statement of work', 'software', '{{company.name}}
Statement of work · {{today}}

Client: {{client.name}}
Work: {{project.number}} {{project.title}}

What we will build
{{project.description}}

How we will work: {{field.sw_method}}
Your product owner: {{field.sw_product_owner}}
Our lead: {{lead.name}}
Start: {{project.start_date}} · Expected go-live: {{project.due_date}}

Signed for {{company.name}}: ____________
Signed for {{client.name}}: ____________', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'software' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Statement of work' AND industry_key = 'software');
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Go-live sign-off', 'software', '{{project.number}} {{project.title}}

We confirm the system was accepted and went live on ________.
Open issues at go-live are listed in the attached register.

For {{client.name}}: ____________
For {{company.name}}: {{me.name}}', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'software' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Go-live sign-off' AND industry_key = 'software');
INSERT IGNORE INTO project_register_kinds (`key`, name, statuses, created_at) VALUES ('releases', 'Release register', 'Planned,In testing,Released,Rolled back', NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('software', 0, 'scope', 'The scope and what "done" means are agreed in writing', 1, 10, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('software', 0, 'owner', 'The client has named a product owner', 1, 20, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('software', 0, 'access', 'We have access to the systems and data we need', 1, 30, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('software', 0, 'security', 'Data protection terms are agreed', 1, 40, 1, NOW());
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('software', 'support_after_golive', 'End of warranty support', 'date_set', 'go_live', 'support_end', 'End of warranty support', 90, 0, '14,7', 1, NOW());
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('software', 'signoff_after_uat', 'UAT sign-off due', 'date_set', 'uat', 'deadline', 'UAT sign-off due', 10, 1, '3,1', 1, NOW());
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Build in sprints', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'software' AND name = 'Software build';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Discovery', NULL, 'Discovery', NULL, NULL, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Discovery', 'Workshops and requirements', 7, 960, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Discovery', 'Designs and prototype', 14, 960, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Kick-off', 0, NULL, 'kickoff', NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Build', NULL, 'Build', NULL, NULL, NULL, NULL, 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Build', 'Sprint 1', 28, NULL, NULL, NULL, 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Build', 'Sprint 2', 42, NULL, NULL, NULL, 70 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Build', 'Sprint 3', 56, NULL, NULL, NULL, 80 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'First sprint review', 28, NULL, 'sprint_review', '1', 90 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Testing', NULL, 'Testing', NULL, NULL, NULL, NULL, 100 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Testing', 'Test cases and test data', 60, 480, NULL, NULL, 110 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'User acceptance testing', 63, NULL, 'uat', '7,1', 120 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Go-live', NULL, 'Go-live', NULL, NULL, NULL, NULL, 130 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Go-live', 'Go-live checklist', 75, 240, NULL, NULL, 140 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Go-live', 77, NULL, 'go_live', '7,1', 150 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Software build' AND t.name = 'Build in sprints';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Implementation', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'software' AND name = 'Implementation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Kick-off and plan', 3, 240, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Implementation' AND t.name = 'Implementation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Configuration', 21, 1440, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Implementation' AND t.name = 'Implementation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Data migration', 28, 960, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Implementation' AND t.name = 'Implementation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Training', 35, 480, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Implementation' AND t.name = 'Implementation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'User acceptance testing', 38, NULL, 'uat', '7,1', 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Implementation' AND t.name = 'Implementation';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Go-live', 45, NULL, 'go_live', '7,1', 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Implementation' AND t.name = 'Implementation';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Monthly support', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'software' AND name = 'Support retainer';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Monthly report', 30, 60, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Support retainer' AND t.name = 'Monthly support';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Health check', 30, 120, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Support retainer' AND t.name = 'Monthly support';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Renewal', 365, NULL, 'renewal', '60,30', 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'software' AND y.name = 'Support retainer' AND t.name = 'Monthly support';
UPDATE project_stages SET required_fields = '["customer_id"]' WHERE required_fields IS NULL AND name = 'Build' AND type_id IN (SELECT id FROM project_types WHERE industry_key = 'software');

-- ---------------------------------------------------------------- Consulting and accounting
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('key_date', 'year_end', 'Client year end', 'consulting', NULL, 1, 100), ('key_date', 'fieldwork', 'Fieldwork', 'consulting', NULL, 1, 110), ('key_date', 'report_due', 'Report due', 'consulting', NULL, 1, 120), ('key_date', 'tax_due', 'Tax filing due', 'consulting', NULL, 1, 130);
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('co_year_end', 'Financial year end', 'date', NULL, 'consulting', NULL, 0, 0, 1, 100, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('co_tax_pin', 'Client''s tax PIN', 'text', NULL, 'consulting', NULL, 0, 1, 1, 110, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('co_engagement_type', 'Engagement', 'pick_one', '["Audit", "Review", "Compilation", "Tax compliance", "Advisory"]', 'consulting', NULL, 0, 0, 1, 120, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('co_partner', 'Engagement partner', 'person', NULL, 'consulting', NULL, 0, 0, 1, 130, NOW(), NOW());
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Engagement letter', 'consulting', '{{company.name}}
{{today}}

{{client.name}}
Attention: {{contact.name}}

Dear {{contact.name}},

{{project.number}}: {{project.title}}

Thank you for asking us to act for you. This letter sets out the work we will do, who will do it and how we will work together.

The work: {{project.description}}
The lead on your work: {{lead.name}} ({{lead.email}})
The team: {{team}}
We expect to start on {{project.start_date}}.

Please sign and return a copy of this letter to confirm.

Yours faithfully,

{{me.name}}
For {{company.name}}', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'consulting' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Engagement letter' AND industry_key = 'consulting');
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Management representation letter', 'consulting', '{{client.name}}
{{today}}

To: {{company.name}}

Re: {{project.title}}, year ended {{field.co_year_end}}

We confirm, to the best of our knowledge and belief, that the financial statements are complete and that all records were made available to you.

____________ Director
____________ Director', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'consulting' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Management representation letter' AND industry_key = 'consulting');
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('consulting', 0, 'independence', 'The team is independent of the client (no conflict)', 1, 10, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('consulting', 0, 'kyc', 'The client''s identity and ownership are checked (KYC)', 1, 20, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('consulting', 0, 'engagement', 'The engagement letter is signed', 1, 30, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('consulting', 0, 'predecessor', 'The previous accountant was contacted', 0, 40, 1, NOW());
INSERT IGNORE INTO project_type_settings (type_id, confidential_default, opening_required, updated_at) SELECT id, 0, 1, NOW() FROM project_types WHERE industry_key = 'consulting' AND name IN ('Audit');
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('consulting', 'tax_after_year_end', 'Tax return due', 'date_set', 'year_end', 'tax_due', 'Tax return due', 180, 0, '30,14,7', 1, NOW());
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('consulting', 'report_after_fieldwork', 'Report due', 'date_done', 'fieldwork', 'report_due', 'Report due', 21, 0, '7,2', 1, NOW());
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Statutory audit', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'consulting' AND name = 'Audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Planning', NULL, 'Planning', NULL, NULL, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Planning', 'Planning meeting and risk assessment', 7, 480, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Planning', 'Audit plan', 10, 240, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Fieldwork', NULL, 'Fieldwork', NULL, NULL, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Fieldwork', 'Testing of controls', 30, 1920, NULL, NULL, 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Fieldwork', 'Substantive testing', 40, 2880, NULL, NULL, 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Fieldwork', 30, NULL, 'fieldwork', '7', 70 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Reporting', NULL, 'Reporting', NULL, NULL, NULL, NULL, 80 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Reporting', 'Draft financial statements and report', 50, 960, NULL, NULL, 90 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Reporting', 'Management letter', 55, 240, NULL, NULL, 100 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Reporting', 'Signing meeting', 60, 120, NULL, NULL, 110 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Audit' AND t.name = 'Statutory audit';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Tax compliance', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'consulting' AND name = 'Tax';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Collect records', 7, 120, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Tax' AND t.name = 'Tax compliance';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Prepare computations', 14, 480, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Tax' AND t.name = 'Tax compliance';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Client review', 18, 60, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Tax' AND t.name = 'Tax compliance';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'File the return', 21, 60, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Tax' AND t.name = 'Tax compliance';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Advisory assignment', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'consulting' AND name = 'Advisory';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Terms of reference agreed', 3, 120, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Advisory' AND t.name = 'Advisory assignment';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Interviews and data gathering', 14, 960, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Advisory' AND t.name = 'Advisory assignment';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Analysis', 21, 960, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Advisory' AND t.name = 'Advisory assignment';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Draft report', 28, 720, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Advisory' AND t.name = 'Advisory assignment';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Report due', 35, NULL, 'report_due', '7,2', 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'consulting' AND y.name = 'Advisory' AND t.name = 'Advisory assignment';
UPDATE project_stages SET required_fields = '["customer_id", "field:co_year_end"]' WHERE required_fields IS NULL AND name = 'Fieldwork' AND type_id IN (SELECT id FROM project_types WHERE industry_key = 'consulting');

-- ---------------------------------------------------------------- Architecture and engineering
INSERT IGNORE INTO project_lists (list, `key`, name, industry_key, status_token, is_system, sort_order) VALUES ('key_date', 'submission', 'Approval submission', 'architecture', NULL, 1, 100), ('key_date', 'approval', 'Approval expected', 'architecture', NULL, 1, 110), ('key_date', 'tender_return', 'Tender return', 'architecture', NULL, 1, 120), ('key_date', 'site_visit', 'Site visit', 'architecture', NULL, 1, 130);
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('ar_site', 'Site', 'text', NULL, 'architecture', NULL, 0, 0, 1, 100, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('ar_floor_area', 'Floor area (m²)', 'number', NULL, 'architecture', NULL, 0, 0, 1, 110, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('ar_approval_ref', 'Approval reference', 'text', NULL, 'architecture', NULL, 0, 0, 1, 120, NOW(), NOW());
INSERT IGNORE INTO project_fields (`key`, label, kind, options, industry_key, type_id, is_required, is_sensitive, is_active, sort_order, created_at, updated_at) VALUES ('ar_use', 'Use of the building', 'pick_one', '["Residential", "Commercial", "Mixed use", "Institutional", "Industrial"]', 'architecture', NULL, 0, 0, 1, 130, NOW(), NOW());
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Fee proposal letter', 'architecture', '{{company.name}}
{{today}}

{{client.name}}

Re: {{project.title}} at {{field.ar_site}}

Thank you for asking us to propose. Our services cover the brief, concept and detailed design, approvals and supervision of the works.
The fee and its stages are set out in the attached quotation.
Our lead: {{lead.name}}.

Yours faithfully,

{{me.name}}', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'architecture' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Fee proposal letter' AND industry_key = 'architecture');
INSERT IGNORE INTO project_doc_templates (name, industry_key, body, is_active, created_at, updated_at) SELECT 'Site instruction', 'architecture', 'Site instruction · {{project.number}} {{project.title}}
Date: {{today}}
Site: {{field.ar_site}}

To the contractor:



Issued by {{me.name}} for {{company.name}}', 1, NOW(), NOW() FROM project_industries WHERE `key` = 'architecture' AND NOT EXISTS (SELECT 1 FROM project_doc_templates WHERE name = 'Site instruction' AND industry_key = 'architecture');
INSERT IGNORE INTO project_inspection_kinds (`key`, name, questions, is_active, created_at) VALUES ('site_supervision', 'Supervision visit', 'Work is to the latest drawings
Materials on site are as specified
Workmanship is acceptable
Instructions from the last visit are done', 1, NOW());
INSERT IGNORE INTO project_register_kinds (`key`, name, statuses, created_at) VALUES ('approvals', 'Approvals register', 'Not submitted,Submitted,Queried,Approved,Refused', NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('architecture', 0, 'brief', 'The client''s brief is received in writing', 1, 10, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('architecture', 0, 'site_survey', 'A survey of the site is available', 1, 20, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('architecture', 0, 'fee', 'The fee proposal is accepted', 1, 30, 1, NOW());
INSERT IGNORE INTO project_opening_questions (industry_key, type_id, `key`, question, must_be_yes, sort_order, is_active, created_at) VALUES ('architecture', 0, 'title', 'Ownership of the land is confirmed', 0, 40, 1, NOW());
INSERT IGNORE INTO project_date_rules (industry_key, `key`, name, trigger_kind, trigger_value, make_kind, make_title, offset_days, working_days, warn_days, is_active, created_at) VALUES ('architecture', 'approval_after_submission', 'Approval expected', 'date_set', 'submission', 'approval', 'Approval expected', 30, 1, '7', 1, NOW());
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Full design service', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'architecture' AND name = 'Building design';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Brief', NULL, 'Brief', NULL, NULL, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Brief', 'Brief and site visit', 7, 240, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Concept', NULL, 'Concept', NULL, NULL, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Concept', 'Concept options', 21, 1920, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Concept', 'Client presentation', 28, 120, NULL, NULL, 50 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Detailed design', NULL, 'Detailed design', NULL, NULL, NULL, NULL, 60 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Detailed design', 'Working drawings', 60, 4800, NULL, NULL, 70 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Detailed design', 'Consultants coordination', 60, 960, NULL, NULL, 80 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'phase', 'Approvals', NULL, 'Approvals', NULL, NULL, NULL, NULL, 90 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, 'Approvals', 'Approval drawings and forms', 70, 960, NULL, NULL, 100 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'Approval submission', 75, NULL, 'submission', '7', 110 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Building design' AND t.name = 'Full design service';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Engineering design', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'architecture' AND name = 'Engineering design';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Site investigation', 14, 960, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Engineering design' AND t.name = 'Engineering design';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Design calculations', 35, 2880, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Engineering design' AND t.name = 'Engineering design';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Drawings', 49, 2880, NULL, NULL, 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Engineering design' AND t.name = 'Engineering design';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Checking and sign-off', 56, 480, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Engineering design' AND t.name = 'Engineering design';
INSERT IGNORE INTO project_work_templates (type_id, name, is_default, is_active, created_at, updated_at) SELECT id, 'Supervision of works', 1, 1, NOW(), NOW() FROM project_types WHERE industry_key = 'architecture' AND name = 'Supervision';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Site handover to the contractor', 3, 120, NULL, NULL, 10 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Supervision' AND t.name = 'Supervision of works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Fortnightly site meetings', 14, 120, NULL, NULL, 20 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Supervision' AND t.name = 'Supervision of works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'date', NULL, NULL, 'First site visit', 7, NULL, 'site_visit', '1', 30 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Supervision' AND t.name = 'Supervision of works';
INSERT IGNORE INTO project_template_items (template_id, kind, ref, parent_ref, title, offset_days, estimate_minutes, date_kind, warn_days, sort_order) SELECT t.id, 'task', NULL, NULL, 'Practical completion inspection', 180, 240, NULL, NULL, 40 FROM project_work_templates t JOIN project_types y ON y.id = t.type_id WHERE y.industry_key = 'architecture' AND y.name = 'Supervision' AND t.name = 'Supervision of works';
UPDATE project_stages SET required_fields = '["customer_id", "field:ar_site"]' WHERE required_fields IS NULL AND name = 'Concept' AND type_id IN (SELECT id FROM project_types WHERE industry_key = 'architecture');


-- PART C - CHECK (expect 7 tables)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_type_settings', 'project_work_templates', 'project_template_items', 'project_opening_questions', 'project_opening_checks', 'project_date_rules', 'project_rule_dates');
