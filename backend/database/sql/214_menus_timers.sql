-- =====================================================================
-- 214_menus_timers.sql
-- Menus timers, build steps 8.2 and 8.3 (docs/MENUS_DISHES_PLAN.md, Step 8): a clock on the batch, and a clock on the ticket.
--   menus_prep_timers      a batch on the stove: the recipe, the size, how long it should take (from the recipe's time by batch size, or typed), when it started and when it is ready. The production screen
--                          shows "simmer 90 min, ready 12:40" and counts down; when the batch is made (Make a batch) the timer is finished with it, and the batch is timed from the moment the timer started.
--   menus_sides.task_minutes  the short task at the pass for a side: plating, reheating. The longest one on a ticket is the ticket's own timer, shown against the station's target.
-- Nothing is taken off the shelf by a timer: only Make a batch does that. Run 198 (prepared food) and 200 (sides) first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. is the table, or the column, there already? (0 rows on the first run)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_prep_timers'
UNION ALL
SELECT CONCAT(table_name, '.', column_name) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_sides' AND column_name = 'task_minutes';

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS menus_prep_timers (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    recipe_id        BIGINT UNSIGNED NOT NULL,
    location_id      BIGINT UNSIGNED NOT NULL,
    planned_qty      DECIMAL(18,4) NOT NULL,                          -- the batch size, in the recipe's unit (or portions)
    expected_minutes SMALLINT UNSIGNED NOT NULL,                      -- how long it should take
    started_at       DATETIME NOT NULL,
    ready_at         DATETIME NOT NULL,                               -- started_at plus the minutes
    chef_id          BIGINT UNSIGNED NULL,
    status           VARCHAR(10) NOT NULL DEFAULT 'running',          -- running | done | cancelled
    run_id           BIGINT UNSIGNED NULL,                            -- the batch made from it (menus_prep_runs)
    note             VARCHAR(120) NULL,                               -- "simmer", "proof the dough"
    started_by       BIGINT UNSIGNED NULL,
    finished_at      DATETIME NULL,
    created_at       TIMESTAMP NULL,
    updated_at       TIMESTAMP NULL,
    KEY idx_menus_prep_timers_status (status, location_id),
    KEY idx_menus_prep_timers_recipe (recipe_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_side_task_minutes;
DELIMITER $$
CREATE PROCEDURE add_side_task_minutes()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_sides' AND column_name = 'task_minutes') THEN
        ALTER TABLE menus_sides ADD COLUMN task_minutes SMALLINT UNSIGNED NULL;
    END IF;
END$$
DELIMITER ;
CALL add_side_task_minutes();
DROP PROCEDURE IF EXISTS add_side_task_minutes;

-- PART C - CHECK AFTER
-- C1. the table and the column are there (2 rows)
SELECT table_name AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_prep_timers'
UNION ALL
SELECT CONCAT(table_name, '.', column_name) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'menus_sides' AND column_name = 'task_minutes';
-- C2. no timer is running and no side has a task time yet (0, 0)
SELECT (SELECT COUNT(*) FROM menus_prep_timers) AS timers, (SELECT COUNT(*) FROM menus_sides WHERE task_minutes IS NOT NULL) AS sides_with_a_task;
