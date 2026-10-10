-- =====================================================================
-- 122_event_reminders.sql
-- Events: remembers which ticket holder has already been reminded about which date, so a reminder is sent once.
-- (Reminders are switched on in Admin -> Events -> Settings, and need the scheduler running: `events:remind` every 15 minutes.)
-- Safe to re-run: CREATE IF NOT EXISTS. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (the table is there already, or not)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'event_reminders';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS event_reminders (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_id  BIGINT UNSIGNED NOT NULL,
    buyer_key   VARCHAR(220) NOT NULL,                                   -- 'c' + customer id, or 'e' + the email address
    sent_at     DATETIME NOT NULL,
    UNIQUE KEY uq_event_reminders (session_id, buyer_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK (expect 1 row)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'event_reminders';
