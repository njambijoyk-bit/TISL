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

-- PART C - CHECK (expect 7 tables)
SELECT COUNT(*) AS tables_made FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('project_type_settings', 'project_work_templates', 'project_template_items', 'project_opening_questions', 'project_opening_checks', 'project_date_rules', 'project_rule_dates');
