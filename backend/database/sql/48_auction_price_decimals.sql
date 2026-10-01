-- 48: auction prices keep up to 10 decimal places.
-- Run in MySQL Workbench against the TISL database. Safe to run more than once.
-- (Books still post at 2 decimals: an order made from an auction rounds each line's amount to the cent.)

-- ── 1. read-only: the columns as they are now ──
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'auctions' AND COLUMN_NAME IN ('start_price', 'current_price', 'reserve_price', 'bid_increment'))
    OR (TABLE_NAME = 'auction_bids' AND COLUMN_NAME IN ('amount', 'max_bid'))
    OR (TABLE_NAME = 'auction_charges' AND COLUMN_NAME IN ('amount', 'min_amount', 'max_amount')))
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- ── 2. widen them to DECIMAL(24,10), keeping each column's NULL / NOT NULL and default ──
DROP PROCEDURE IF EXISTS widen_decimal;
DELIMITER //
CREATE PROCEDURE widen_decimal(IN t VARCHAR(64), IN c VARCHAR(64))
BEGIN
  DECLARE nul VARCHAR(3);
  DECLARE def VARCHAR(64);
  DECLARE typ VARCHAR(64);
  SELECT IS_NULLABLE, COLUMN_DEFAULT, COLUMN_TYPE INTO nul, def, typ
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = t AND COLUMN_NAME = c;
  IF typ IS NOT NULL AND typ <> 'decimal(24,10)' THEN
    SET @sql = CONCAT('ALTER TABLE `', t, '` MODIFY `', c, '` DECIMAL(24,10) ', IF(nul = 'YES', 'NULL', 'NOT NULL'),
                      IF(def IS NOT NULL, CONCAT(' DEFAULT ', QUOTE(def)), IF(nul = 'YES', ' DEFAULT NULL', '')));
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END //
DELIMITER ;

CALL widen_decimal('auctions', 'start_price');
CALL widen_decimal('auctions', 'current_price');
CALL widen_decimal('auctions', 'reserve_price');
CALL widen_decimal('auctions', 'bid_increment');
CALL widen_decimal('auction_bids', 'amount');
CALL widen_decimal('auction_bids', 'max_bid');
CALL widen_decimal('auction_charges', 'amount');
CALL widen_decimal('auction_charges', 'min_amount');
CALL widen_decimal('auction_charges', 'max_amount');
DROP PROCEDURE widen_decimal;

-- ── 3. check: every column above should now read decimal(24,10) ──
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND ((TABLE_NAME = 'auctions' AND COLUMN_NAME IN ('start_price', 'current_price', 'reserve_price', 'bid_increment'))
    OR (TABLE_NAME = 'auction_bids' AND COLUMN_NAME IN ('amount', 'max_bid'))
    OR (TABLE_NAME = 'auction_charges' AND COLUMN_NAME IN ('amount', 'min_amount', 'max_amount')))
ORDER BY TABLE_NAME, ORDINAL_POSITION;
