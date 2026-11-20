-- =====================================================================
-- 269_projects_insights.sql
-- Projects stage 12 (docs/PROJECTS_STAGE12_SPEC.md): insights and rules.
--   project_kpis             KPIs: a measure the code works out, its green and amber targets, where it applies, whether the client sees it
--   project_kpi_snapshots    each Monday, per KPI and subject (a piece of work, a person): the status and the figure (never money)
--   project_pipeline_odds    a pipeline stage's chance of winning, when set by hand
--   project_rules            rules: when something happens, if it matches, then do these things
--   project_rule_runs        every run of a rule and what it did
--   project_updates          Mimi's weekly update drafts and what became of them
-- Then starter KPIs for every industry and starter rules (switched off). No table holds an amount: targets are percentages, counts,
-- days or hours, and money measures are read from Books when they are shown.
-- Needs scripts 257 to 268. Safe to re-run. No permission seed is needed. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Expect 1 (the industry tables of 268 are there), then what exists now (nothing on a first run).
SELECT COUNT(*) AS industry_is_there FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_date_rules';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_kpis', 'project_kpi_snapshots', 'project_pipeline_odds', 'project_rules', 'project_rule_runs', 'project_updates');

-- PART B - CREATE
DROP PROCEDURE IF EXISTS projects_insights_guard;
DELIMITER $$
CREATE PROCEDURE projects_insights_guard()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_date_rules') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Run scripts 257 to 268 first. Nothing was changed.';
    END IF;
END$$
DELIMITER ;
CALL projects_insights_guard();
DROP PROCEDURE IF EXISTS projects_insights_guard;

CREATE TABLE IF NOT EXISTS project_kpis (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`         VARCHAR(60) NOT NULL,
    measure       VARCHAR(40) NOT NULL,                                  -- from the measure library (code)
    name          VARCHAR(120) NOT NULL,
    industry_key  VARCHAR(40) NULL,                                      -- empty = every industry
    type_id       BIGINT UNSIGNED NULL,                                  -- or only one kind of work
    target_good   DECIMAL(12,2) NOT NULL,                                -- green from here (a percentage, count, days or hours; never money)
    target_warn   DECIMAL(12,2) NOT NULL,                                -- amber from here; past it is red
    client_sees   TINYINT(1) NOT NULL DEFAULT 0,                         -- shown on the client portal for their work
    is_active     TINYINT(1) NOT NULL DEFAULT 1,
    sort_order    INT NOT NULL DEFAULT 0,
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_project_kpis_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_kpi_snapshots (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kpi_id        BIGINT UNSIGNED NOT NULL,
    subject_type  VARCHAR(8) NOT NULL,                                   -- work | person
    subject_id    BIGINT UNSIGNED NOT NULL,
    week          DATE NOT NULL,                                         -- the Monday
    status        VARCHAR(5) NOT NULL,                                   -- good | warn | bad | none
    value         DECIMAL(14,2) NULL,                                    -- empty for a money measure: only its status is kept
    created_at    TIMESTAMP NULL,
    UNIQUE KEY uq_project_kpi_snapshots (kpi_id, subject_type, subject_id, week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_pipeline_odds (
    stage_id    BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    chance_pct  DECIMAL(5,2) NOT NULL,
    updated_by  BIGINT UNSIGNED NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_rules (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `key`          VARCHAR(60) NULL,
    name           VARCHAR(160) NOT NULL,
    trigger_event  VARCHAR(30) NOT NULL,                                 -- what starts it (see ProjectRules::EVENTS)
    trigger_value  VARCHAR(120) NULL,                                    -- a stage's name, a key date kind... when the event needs one
    conditions     TEXT NULL,                                            -- JSON: industry, type_id, priority, lead_id, field
    actions        TEXT NOT NULL,                                        -- JSON: [{do: tell|task|date|follow|tag|flag, ...}]
    is_active      TINYINT(1) NOT NULL DEFAULT 0,
    max_per_day    INT NOT NULL DEFAULT 50,
    created_by     BIGINT UNSIGNED NULL,
    last_run_at    TIMESTAMP NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    UNIQUE KEY uq_project_rules_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_rule_runs (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    rule_id      BIGINT UNSIGNED NOT NULL,
    project_id   BIGINT UNSIGNED NULL,
    event        VARCHAR(30) NOT NULL,
    subject      VARCHAR(200) NULL,                                      -- what it was about, in words
    done         TEXT NULL,                                              -- JSON: what each action did
    outcome      VARCHAR(8) NOT NULL,                                    -- done | skipped | failed
    note         VARCHAR(300) NULL,
    created_at   TIMESTAMP NULL,
    KEY idx_project_rule_runs_rule (rule_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_updates (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    project_id   BIGINT UNSIGNED NOT NULL,
    week         DATE NOT NULL,                                          -- the Monday of the week it is about
    body         TEXT NOT NULL,
    state        VARCHAR(9) NOT NULL DEFAULT 'draft',                    -- draft | sent | discarded
    by_ai        TINYINT(1) NOT NULL DEFAULT 1,                          -- 0 = written from the facts without the AI
    decided_by   BIGINT UNSIGNED NULL,
    decided_at   TIMESTAMP NULL,
    message_id   BIGINT UNSIGNED NULL,                                   -- the message it was sent as
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_project_updates_week (project_id, week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===================================================================== STARTER KPIs (the company's own: change, switch off or remove)
-- every industry
INSERT IGNORE INTO project_kpis (`key`, measure, name, industry_key, target_good, target_warn, client_sees, is_active, sort_order, created_at) VALUES
    ('all_tasks_on_time', 'tasks_on_time', 'Tasks done on time', NULL, 90, 75, 0, 1, 10, NOW()),
    ('all_dates_met', 'dates_met', 'Key dates met', NULL, 100, 90, 1, 1, 20, NOW()),
    ('all_days_behind', 'days_behind', 'Days behind the expected end', NULL, 0, 14, 1, 1, 30, NOW()),
    ('all_person_utilisation', 'utilisation', 'Utilisation', NULL, 75, 60, 0, 1, 100, NOW()),
    ('all_person_tasks_on_time', 'person_tasks_on_time', 'My tasks done on time', NULL, 85, 70, 0, 1, 110, NOW()),
    ('all_person_timesheets', 'timesheets_on_time', 'Timesheets in on time', NULL, 90, 75, 0, 1, 120, NOW()),
    ('all_win_rate', 'win_rate', 'Win rate', NULL, 40, 25, 0, 1, 200, NOW()),
    ('all_days_to_win', 'days_to_win', 'Days from lead to win', NULL, 30, 60, 0, 1, 210, NOW());
-- by industry
INSERT IGNORE INTO project_kpis (`key`, measure, name, industry_key, target_good, target_warn, client_sees, is_active, sort_order, created_at) VALUES
    ('legal_billable', 'billable_pct', 'Billable hours', 'legal', 80, 65, 0, 1, 40, NOW()),
    ('legal_reply', 'client_reply_hours', 'First reply to the client (hours)', 'legal', 24, 48, 0, 1, 50, NOW()),
    ('construction_inspections', 'inspections_passed', 'Inspections passed', 'construction', 90, 75, 1, 1, 40, NOW()),
    ('construction_snags', 'snags_on_time', 'Snags closed on time', 'construction', 85, 70, 1, 1, 50, NOW()),
    ('construction_diary', 'daily_signed', 'Site diary signed', 'construction', 95, 80, 0, 1, 60, NOW()),
    ('construction_budget', 'budget_used', 'Budget used', 'construction', 100, 110, 0, 1, 70, NOW()),
    ('software_overdue', 'tasks_overdue', 'Tasks overdue', 'software', 0, 5, 0, 1, 40, NOW()),
    ('software_reply', 'client_reply_hours', 'First reply to the client (hours)', 'software', 8, 24, 0, 1, 60, NOW()),
    ('consulting_billable', 'billable_pct', 'Billable hours', 'consulting', 75, 60, 0, 1, 40, NOW()),
    ('consulting_budget', 'budget_used', 'Budget used', 'consulting', 100, 110, 0, 1, 50, NOW()),
    ('architecture_requests', 'requests_on_time', 'Requests answered on time', 'architecture', 90, 75, 0, 1, 40, NOW()),
    ('architecture_margin', 'margin_pct', 'Margin', 'architecture', 30, 15, 0, 1, 50, NOW()),
    ('catering_reply', 'client_reply_hours', 'First reply to the client (hours)', 'catering', 4, 12, 0, 1, 40, NOW()),
    ('photography_reply', 'client_reply_hours', 'First reply to the client (hours)', 'photography', 12, 24, 0, 1, 40, NOW()),
    ('marketing_reply', 'client_reply_hours', 'First reply to the client (hours)', 'marketing', 8, 24, 0, 1, 40, NOW()),
    ('marketing_margin', 'margin_pct', 'Margin', 'marketing', 35, 20, 0, 1, 50, NOW()),
    ('interiors_snags', 'snags_on_time', 'Snags closed on time', 'interiors', 85, 70, 1, 1, 40, NOW()),
    ('interiors_budget', 'budget_used', 'Budget used', 'interiors', 100, 110, 0, 1, 50, NOW()),
    ('ngo_requests', 'requests_on_time', 'Requests answered on time', 'ngo', 90, 75, 0, 1, 40, NOW()),
    ('ngo_budget', 'budget_used', 'Budget used', 'ngo', 100, 105, 0, 1, 50, NOW()),
    ('events_reply', 'client_reply_hours', 'First reply to the client (hours)', 'events', 4, 12, 0, 1, 40, NOW()),
    ('fashion_overdue', 'tasks_overdue', 'Tasks overdue', 'fashion', 0, 3, 0, 1, 40, NOW()),
    ('healthcare_reviews', 'dates_met', 'Care reviews held on time', 'healthcare', 100, 95, 0, 1, 40, NOW()),
    ('field_service_reply', 'client_reply_hours', 'First reply to the client (hours)', 'field_service', 4, 12, 0, 1, 40, NOW()),
    ('field_service_overdue', 'tasks_overdue', 'Jobs overdue', 'field_service', 0, 2, 0, 1, 50, NOW());

-- ===================================================================== STARTER RULES (switched off until someone tries and switches them on)
INSERT IGNORE INTO project_rules (`key`, name, trigger_event, trigger_value, conditions, actions, is_active, max_per_day, created_at) VALUES
    ('red_tell_manager', 'A work turns red: tell the lead''s manager', 'kpi_red', NULL, '{}', '[{"do":"tell","who":"lead_manager"}]', 0, 50, NOW()),
    ('missed_filing', 'A filing deadline is missed: tell the lead and make a task', 'date_missed', 'filing', '{"industry":"legal"}', '[{"do":"tell","who":"lead"},{"do":"task","title":"Explain the missed filing date","who":"lead","days":1}]', 0, 50, NOW()),
    ('late_snag', 'A snag is 7 days late: tell the lead', 'snag_late', '7', '{}', '[{"do":"tell","who":"lead"}]', 0, 50, NOW()),
    ('new_work_follow', 'A work starts: the lead''s manager follows it', 'work_started', NULL, '{}', '[{"do":"follow","who":"lead_manager"}]', 0, 50, NOW());

-- PART C - CHECK (expect 6 tables)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_kpis', 'project_kpi_snapshots', 'project_pipeline_odds', 'project_rules', 'project_rule_runs', 'project_updates');
