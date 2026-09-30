-- =====================================================================
-- 26_expiry_engine.sql                    (PLATFORM_PLAN §17–18, step 6)
-- What the daily expiry check and the expired-stock list need:
--
--   stock_batches.last_warned_days   the warning band a batch was last warned
--                                    at (e.g. 30 = "within 30 days"), so each
--                                    band warns once
--   stock_movements.voucher_id       may now be empty: writing off a batch
--                                    that cost nothing has no journal to
--                                    point at
--
-- Run after 22–25. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

-- A1. Column already there? (expect 0 rows on first run)
SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'stock_batches' AND column_name = 'last_warned_days';

-- A2. Can stock_movements.voucher_id be empty yet? (IS_NULLABLE = NO means this script changes it)
SELECT column_name, column_type, is_nullable FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'stock_movements' AND column_name = 'voucher_id';

-- A3. What the daily check will act on right now
SELECT
  SUM(status = 'active' AND expiry_date < CURDATE()) AS to_mark_expired,
  SUM(status = 'expired')                            AS already_expired
FROM stock_batches;


-- ---------------------------------------------------------------------
-- PART B — CHANGES (DDL, commits on its own; each skips itself if not needed)
-- ---------------------------------------------------------------------

SET @has_col := (SELECT COUNT(*) FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'stock_batches' AND column_name = 'last_warned_days');
SET @sql := IF(@has_col = 0, 'ALTER TABLE stock_batches ADD COLUMN last_warned_days INT UNSIGNED NULL', 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;

SET @type := (SELECT column_type FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'stock_movements' AND column_name = 'voucher_id');
SET @nullable := (SELECT is_nullable FROM information_schema.columns
                  WHERE table_schema = DATABASE() AND table_name = 'stock_movements' AND column_name = 'voucher_id');
SET @sql := IF(@nullable = 'NO', CONCAT('ALTER TABLE stock_movements MODIFY voucher_id ', @type, ' NULL'), 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------------------------------------------------------------------
-- PART C — RESULT CHECK. Expect: the column exists and voucher_id is nullable (YES).
-- ---------------------------------------------------------------------

SELECT table_name, column_name, is_nullable FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'stock_batches' AND column_name = 'last_warned_days')
    OR (table_name = 'stock_movements' AND column_name = 'voucher_id'));
