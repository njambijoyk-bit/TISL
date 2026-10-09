-- =====================================================================
-- 110_notification_delivery_payload.sql
-- Automatic WhatsApp sending (Twilio / Meta). A delivery that goes through the WhatsApp API remembers what it sent:
--   notification_deliveries.payload   JSON: provider, template, language and the values filled into it
-- Existing rows keep NULL. Safe to run twice. Run in Workbench. DDL commits on its own; nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: no rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notification_deliveries' AND column_name = 'payload';

-- PART B — CHANGE
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
CALL add_column_if_missing('notification_deliveries', 'payload', 'JSON NULL AFTER wa_url');
DROP PROCEDURE IF EXISTS add_column_if_missing;
-- the provider's message id is looked up when a delivery status comes back
SET @has := (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'notification_deliveries' AND index_name = 'idx_notification_deliveries_external');
SET @ddl := IF(@has = 0, 'ALTER TABLE notification_deliveries ADD INDEX idx_notification_deliveries_external (external_id)', 'SELECT 1');
PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;

-- PART C — CHECK (expect: the column once and the index once)
SELECT column_name, column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notification_deliveries' AND column_name = 'payload';
SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'notification_deliveries' AND index_name = 'idx_notification_deliveries_external';
