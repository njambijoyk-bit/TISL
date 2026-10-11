-- =====================================================================
-- 129_council_of_two.sql
-- Security, phase 3 (docs/SECURITY_PLAN.md): the Council of Two - for the most serious actions a second person, who is not the first and who could do the thing themselves, must approve too.
--   auth_pending_actions   gets the second approval: whether one is needed, who answered, how, when, and what they said
-- Safe to re-run. Run each part on its own in Workbench. Run 128_step_up.sql first.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the columns are absent on a first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'auth_pending_actions' AND column_name LIKE 'second\_%';

-- PART B - the new columns (each skips itself if already there)
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE stmt FROM @s;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('auth_pending_actions', 'second_required',      'TINYINT(1) NOT NULL DEFAULT 0 AFTER needs_second_person');   -- decided when the first person answered: this one waits for a second
CALL add_column_if_missing('auth_pending_actions', 'second_user_id',       'BIGINT UNSIGNED NULL AFTER second_required');                -- whoever answered: approved or declined
CALL add_column_if_missing('auth_pending_actions', 'second_approved_at',   'DATETIME NULL AFTER second_user_id');
CALL add_column_if_missing('auth_pending_actions', 'second_with',          'VARCHAR(10) NULL AFTER second_approved_at');                  -- passkey | password
CALL add_column_if_missing('auth_pending_actions', 'second_credential_id', 'BIGINT UNSIGNED NULL AFTER second_with');
CALL add_column_if_missing('auth_pending_actions', 'second_note',          'VARCHAR(300) NULL AFTER second_credential_id');               -- their reason, in their own words
CALL add_column_if_missing('auth_pending_actions', 'second_rejected_at',   'DATETIME NULL AFTER second_note');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART C - CHECK (expect: 7 columns)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'auth_pending_actions' AND column_name LIKE 'second\_%';
