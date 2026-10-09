-- =====================================================================
-- 109_notify_essential_tristate.sql
-- customers.notify_essential_only becomes "yes / no / use the company default" (1 / 0 / NULL), so a customer can choose to get everything even when the company
-- default is "essential messages only". An earlier copy of 108_notifications.sql made it NOT NULL DEFAULT 0 (which could only say yes or no).
-- Rows that are 0 because nobody ever chose are set back to NULL (the company default), so nothing changes for anyone. Safe to run twice.
-- Run in Workbench. DDL commits on its own; the UPDATE needs the COMMIT at the end.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: is_nullable NO on an old copy, YES on a new one)
SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'notify_essential_only';
SELECT notify_essential_only, COUNT(*) AS customers FROM customers GROUP BY notify_essential_only;

-- PART B — CHANGE
DROP PROCEDURE IF EXISTS notify_essential_tristate_up;
DELIMITER $$
CREATE PROCEDURE notify_essential_tristate_up()
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'notify_essential_only' AND is_nullable = 'NO') THEN
        ALTER TABLE customers MODIFY COLUMN notify_essential_only TINYINT(1) NULL DEFAULT NULL;
        UPDATE customers SET notify_essential_only = NULL WHERE notify_essential_only = 0;   -- nobody chose "everything"; 0 was only the old default
    END IF;
END$$
DELIMITER ;
CALL notify_essential_tristate_up();
DROP PROCEDURE IF EXISTS notify_essential_tristate_up;
COMMIT;

-- PART C — CHECK (expect: is_nullable YES; no customer left with 0 unless they chose it later)
SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'notify_essential_only';
SELECT notify_essential_only, COUNT(*) AS customers FROM customers GROUP BY notify_essential_only;
