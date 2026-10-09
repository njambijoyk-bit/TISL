-- =====================================================================
-- 105_mimi_local_layer.sql
-- Mimi's local layer (docs/MIMI_LOCAL_LAYER_GUIDE.html): the knowledge it answers from, the owner's switches, and what the log records about each answer.
--   mimi_kb_entries     one row per knowledge entry (the <article class="kb"> of resources/mimi/knowledge.html). answer_md is markdown, as the chat renders it.
--   mimi_kb_questions   the ways people ask it (3 or more per entry; lang en | sw ...). {order} {payment} {customer} {email} mark where a reference goes.
--   mimi_routing        per kind of account: mode (off | shadow | on) and what may happen when the local layer is not confident
--                       (local_only | ai_public | ai_scoped). No row = the server's .env / config/mimi.php setting applies.
--   mimi_query_logs     + answered_by (local | ai | none | guard), local_outcome (what the local layer decided, even in shadow mode), kb_entry, confidence, resolver
-- With no rows in mimi_kb_entries Mimi reads the knowledge file instead, so this script can be run before or after the code is deployed.
-- Run in Workbench. Safe to re-run. DDL commits on its own, so there is nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run; 5 once done)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'mimi_query_logs'
  AND column_name IN ('answered_by', 'local_outcome', 'kb_entry', 'confidence', 'resolver');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('mimi_kb_entries', 'mimi_kb_questions', 'mimi_routing');

-- PART B — ADD (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS mimi_kb_entries (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entry_key    VARCHAR(80)  NOT NULL,                       -- area.topic, never reused: it is the label a trained NLP predicts
    title        VARCHAR(200) NOT NULL,
    audience     VARCHAR(120) NOT NULL,                       -- account kinds, space separated: guest customer vendor applicant driver staff | any
    requires     VARCHAR(400) NULL,                           -- permission keys, space separated, all required
    sensitivity  VARCHAR(12)  NOT NULL DEFAULT 'public',      -- public | own | restricted
    resolver     VARCHAR(60)  NULL,
    keywords     TEXT NULL,
    follow       VARCHAR(400) NULL,                           -- entry keys to offer as "you might also ask"
    answer_md    MEDIUMTEXT NOT NULL,
    more_md      MEDIUMTEXT NULL,
    denied_text  VARCHAR(400) NULL,                           -- what to say to someone who may not see it; safe for anyone to read
    empty_text   VARCHAR(400) NULL,
    status       VARCHAR(10)  NOT NULL DEFAULT 'draft',       -- draft | live | retired
    reviewed_at  DATETIME NULL,
    reviewed_by  BIGINT UNSIGNED NULL,
    version      INT NOT NULL DEFAULT 1,
    updated_by   BIGINT UNSIGNED NULL,
    created_at   DATETIME NULL,
    updated_at   DATETIME NULL,
    UNIQUE KEY uq_mimi_kb_entry_key (entry_key),
    KEY idx_mimi_kb_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mimi_kb_questions (
    id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    entry_id  BIGINT UNSIGNED NOT NULL,
    lang      VARCHAR(5)   NOT NULL DEFAULT 'en',
    question  VARCHAR(300) NOT NULL,
    sort      INT NOT NULL DEFAULT 0,
    KEY idx_mimi_kb_q_entry (entry_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS mimi_routing (
    audience    VARCHAR(12) NOT NULL PRIMARY KEY,             -- guest | customer | staff | other
    mode        VARCHAR(8)  NOT NULL DEFAULT 'shadow',        -- off | shadow | on
    fallback    VARCHAR(12) NOT NULL DEFAULT 'local_only',    -- local_only | ai_public | ai_scoped
    updated_by  BIGINT UNSIGNED NULL,
    updated_at  DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('mimi_query_logs', 'answered_by',   'VARCHAR(8) NULL');
CALL add_column_if_missing('mimi_query_logs', 'local_outcome', 'VARCHAR(16) NULL');
CALL add_column_if_missing('mimi_query_logs', 'kb_entry',      'VARCHAR(80) NULL');
CALL add_column_if_missing('mimi_query_logs', 'confidence',    'DECIMAL(4,3) NULL');
CALL add_column_if_missing('mimi_query_logs', 'resolver',      'VARCHAR(60) NULL');

DROP PROCEDURE IF EXISTS add_column_if_missing;

-- the routing rows start in shadow mode: nothing changes for anyone until the owner switches an audience to On
INSERT IGNORE INTO mimi_routing (audience, mode, fallback, updated_at) VALUES
    ('guest', 'shadow', 'ai_public', NOW()), ('customer', 'shadow', 'ai_public', NOW()), ('staff', 'shadow', 'local_only', NOW()), ('other', 'shadow', 'local_only', NOW());

-- PART C — CHECK (expect 5 columns, 3 tables, 4 routing rows)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'mimi_query_logs'
  AND column_name IN ('answered_by', 'local_outcome', 'kb_entry', 'confidence', 'resolver');
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('mimi_kb_entries', 'mimi_kb_questions', 'mimi_routing');
SELECT * FROM mimi_routing;
