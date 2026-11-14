-- =====================================================================
-- 256_projects_drop_old.sql
-- Projects is rebuilt from nothing (docs/PROJECTS_CRM_PLAN.md, docs/PROJECTS_STAGE1_SPEC.md). This removes the OLD module's eight tables and
-- everything that pointed at them. The data in them is not kept: it is deleted for good. TAKE A BACKUP FIRST.
--   dropped:  projects, project_participants, project_links, project_items, project_tasks, project_milestones, project_messages, project_activities
--   cleared:  calendar entries made from old tasks, milestones and project end dates
--             the link from a budget initiative to an old project (the initiative itself stays)
--             the two retired permissions projects.manage and projects.moderate
--   switched off: the vault archiver's job for the old project activity table
-- RUN THIS ONCE, BEFORE script 257. The new module also has tables called `projects` and `project_links`, so Part B refuses to run when the
-- new structure is already there (it would delete the new data). Run each part on its own in Workbench: A, then B, then C.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Which old tables exist, and whether the new structure is already here (new_structure must be 0 to go on).
SELECT table_name AS old_table FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('projects', 'project_participants', 'project_links', 'project_items', 'project_tasks', 'project_milestones', 'project_messages', 'project_activities');
SELECT COUNT(*) AS new_structure FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_industries';

-- PART B - CHANGE (drops 8 tables and clears what pointed at them)
DROP PROCEDURE IF EXISTS drop_old_projects;
DELIMITER $$
CREATE PROCEDURE drop_old_projects()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_industries') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The new Projects tables are already here. This script would delete them, so it has stopped. Nothing was changed.';
    END IF;

    SET FOREIGN_KEY_CHECKS = 0;
    DROP TABLE IF EXISTS project_activities;
    DROP TABLE IF EXISTS project_messages;
    DROP TABLE IF EXISTS project_milestones;
    DROP TABLE IF EXISTS project_tasks;
    DROP TABLE IF EXISTS project_items;
    DROP TABLE IF EXISTS project_links;
    DROP TABLE IF EXISTS project_participants;
    DROP TABLE IF EXISTS projects;
    SET FOREIGN_KEY_CHECKS = 1;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'calendar_entries') THEN
        DELETE FROM calendar_entries WHERE source_type IN ('task', 'milestone', 'project') AND id > 0;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'budget_initiatives' AND column_name = 'project_id') THEN
        UPDATE budget_initiatives SET project_id = NULL WHERE project_id IS NOT NULL AND id > 0;
    END IF;
    -- the vault's archiver had a job that copied old project activity out: switched off, or it would look for a table that is gone
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'vault_archiver_configs') THEN
        UPDATE vault_archiver_configs SET is_enabled = 0 WHERE table_name = 'project_activities' AND id > 0;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'role_permissions') THEN
        DELETE FROM role_permissions WHERE permission_key IN ('projects.manage', 'projects.moderate');
        DELETE FROM permissions WHERE `key` IN ('projects.manage', 'projects.moderate');
    END IF;
END$$
DELIMITER ;
CALL drop_old_projects();
DROP PROCEDURE IF EXISTS drop_old_projects;

-- PART C - RESULT CHECK. Expect no rows from the first query and 0 from each count.
SELECT table_name AS still_here FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('projects', 'project_participants', 'project_links', 'project_items', 'project_tasks', 'project_milestones', 'project_messages', 'project_activities');
SELECT (SELECT COUNT(*) FROM calendar_entries WHERE source_type IN ('task', 'milestone', 'project')) AS old_calendar_entries,
       (SELECT COUNT(*) FROM permissions WHERE `key` IN ('projects.manage', 'projects.moderate')) AS retired_permissions;
