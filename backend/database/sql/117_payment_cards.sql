-- =====================================================================
-- 117_payment_cards.sql
-- Card payments: Stripe, Paystack, Flutterwave, Pesapal and DPO, set up on Settings -> Payment keys (script 116 made that screen).
--   payment_settings            a column for each provider's keys (encrypted with the application key, like M-Pesa's)
--   payment_attempts.gateway    wide enough for the provider names ("flutterwave" is 11 letters)
--   payment_methods.gateway     the same
-- Nothing is switched on: a provider is offered at checkout only once its keys are saved and "offer at checkout" is ticked on the screen. Safe to run twice.
-- Run in Workbench (needs 116 first). DDL commits on its own; nothing to COMMIT.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect: no rows on the first run; then the width of the two gateway columns)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_settings' AND column_name IN ('stripe_enc', 'paystack_enc', 'flutterwave_enc', 'pesapal_enc', 'dpo_enc');
SELECT table_name, column_name, column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'gateway' AND table_name IN ('payment_attempts', 'payment_methods');

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
CALL add_column_if_missing('payment_settings', 'stripe_enc', 'LONGTEXT NULL');
CALL add_column_if_missing('payment_settings', 'paystack_enc', 'LONGTEXT NULL');
CALL add_column_if_missing('payment_settings', 'flutterwave_enc', 'LONGTEXT NULL');
CALL add_column_if_missing('payment_settings', 'pesapal_enc', 'LONGTEXT NULL');
CALL add_column_if_missing('payment_settings', 'dpo_enc', 'LONGTEXT NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- the gateway name columns: only widened when they are shorter than 30 characters (a plain text column), never narrowed
SET @w1 = (SELECT character_maximum_length FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_attempts' AND column_name = 'gateway' AND data_type = 'varchar');
SET @s1 = IF(@w1 IS NOT NULL AND @w1 < 30, 'ALTER TABLE payment_attempts MODIFY gateway VARCHAR(30) NULL', 'SELECT 1');
PREPARE p1 FROM @s1; EXECUTE p1; DEALLOCATE PREPARE p1;
SET @w2 = (SELECT character_maximum_length FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_methods' AND column_name = 'gateway' AND data_type = 'varchar');
SET @s2 = IF(@w2 IS NOT NULL AND @w2 < 30, 'ALTER TABLE payment_methods MODIFY gateway VARCHAR(30) NULL', 'SELECT 1');
PREPARE p2 FROM @s2; EXECUTE p2; DEALLOCATE PREPARE p2;

-- PART C — CHECK (expect: the 5 columns; both gateway columns 30 or wider, or a type that was already wide enough)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'payment_settings' AND column_name IN ('stripe_enc', 'paystack_enc', 'flutterwave_enc', 'pesapal_enc', 'dpo_enc');
SELECT table_name, column_name, column_type FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'gateway' AND table_name IN ('payment_attempts', 'payment_methods');
