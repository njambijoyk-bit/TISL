-- =====================================================================
-- 85_campaign_access_log.sql
-- Campaigns: a record of every time a member of staff opens a customer's PRIVATE board. Staff with a Campaigns role can look at customers'
-- boards (read only); each look is written here and cannot be skipped: if this table is missing the board will not open.
-- Adds one table. Nothing else is changed. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 1 row = the table is already there; 0 rows = run part B.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'campaign_access_log';

-- PART B - CHANGE (creates the table)
CREATE TABLE IF NOT EXISTS campaign_access_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,              -- the staff member who looked
    board_id BIGINT UNSIGNED NOT NULL,             -- the customer's board
    owner_user_id BIGINT UNSIGNED NULL,            -- whose board it was
    action VARCHAR(20) NOT NULL DEFAULT 'view',
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_campaign_access_board (board_id, created_at),
    INDEX idx_campaign_access_user (user_id, created_at)
);

-- PART C - RESULT CHECK. Expect 1 row, then 0 log entries.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'campaign_access_log';
SELECT COUNT(*) AS entries FROM campaign_access_log;
