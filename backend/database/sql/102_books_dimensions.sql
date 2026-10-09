-- =====================================================================
-- 102_books_dimensions.sql
-- Cost centres, step 3: the books carry a cost centre and a location on every entry. Run scripts 100 and 101 first.
--
-- vouchers.cost_centre_id          what the whole voucher belongs to (the entry form's cost centre)
-- voucher_entries.cost_centre_id   what this line belongs to (the voucher's, unless "A line may take a different cost centre" is on)
-- voucher_entries.location_id      the branch of this line (the voucher's)
--
-- Existing entries are given their branch's cost centre when the voucher has a branch, else General. New ones are filled by the app on
-- posting. The columns stay nullable in the database as a safety net (the app never leaves them empty; Part C proves nothing is empty now).
-- Safe to run twice. Part B backfills in batches of 20 000 so it never holds a long lock.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART A — LOOK FIRST (changes nothing)
-- ---------------------------------------------------------------------
SELECT (SELECT COUNT(*) FROM vouchers) AS vouchers, (SELECT COUNT(*) FROM voucher_entries) AS entries,
       (SELECT COUNT(*) FROM vouchers WHERE location_id IS NULL) AS vouchers_without_branch;

-- ---------------------------------------------------------------------
-- PART B — CHANGE
-- ---------------------------------------------------------------------
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

CALL add_column_if_missing('vouchers', 'cost_centre_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('voucher_entries', 'cost_centre_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('voucher_entries', 'location_id', 'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- indexes (reports filter and group by these)
DROP PROCEDURE IF EXISTS add_index_if_missing;
DELIMITER $$
CREATE PROCEDURE add_index_if_missing(IN tbl VARCHAR(64), IN idx VARCHAR(64), IN cols VARCHAR(200))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = tbl AND index_name = idx) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `', idx, '` (', cols, ')');
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_index_if_missing('vouchers', 'vouchers_cost_centre_idx', 'cost_centre_id');
CALL add_index_if_missing('voucher_entries', 'voucher_entries_cost_centre_idx', 'cost_centre_id');
CALL add_index_if_missing('voucher_entries', 'voucher_entries_location_idx', 'location_id');
DROP PROCEDURE IF EXISTS add_index_if_missing;

-- vouchers: the branch's cost centre, else General
UPDATE vouchers v
LEFT JOIN locations l ON l.id = v.location_id
SET v.cost_centre_id = COALESCE(l.cost_centre_id, (SELECT value FROM cost_centre_settings WHERE `key` = 'general'))
WHERE v.id > 0 AND v.cost_centre_id IS NULL;

-- entries, in batches: the voucher's cost centre and branch
DROP PROCEDURE IF EXISTS backfill_entry_dimensions;
DELIMITER $$
CREATE PROCEDURE backfill_entry_dimensions()
BEGIN
    DECLARE lo BIGINT DEFAULT 0;
    DECLARE hi BIGINT DEFAULT 0;
    DECLARE mx BIGINT DEFAULT 0;
    SELECT COALESCE(MAX(id), 0) INTO mx FROM voucher_entries;
    WHILE lo < mx DO
        SET hi = lo + 20000;
        UPDATE voucher_entries e JOIN vouchers v ON v.id = e.voucher_id
        SET e.cost_centre_id = v.cost_centre_id, e.location_id = v.location_id
        WHERE e.id > lo AND e.id <= hi AND (e.cost_centre_id IS NULL OR e.location_id IS NULL);
        SET lo = hi;
    END WHILE;
END$$
DELIMITER ;
CALL backfill_entry_dimensions();
DROP PROCEDURE IF EXISTS backfill_entry_dimensions;

-- ---------------------------------------------------------------------
-- PART C — CHECK THE RESULT (every figure should be 0)
-- ---------------------------------------------------------------------
SELECT (SELECT COUNT(*) FROM vouchers WHERE cost_centre_id IS NULL) AS vouchers_without_cost_centre,
       (SELECT COUNT(*) FROM voucher_entries WHERE cost_centre_id IS NULL) AS entries_without_cost_centre,
       (SELECT COUNT(*) FROM voucher_entries e JOIN vouchers v ON v.id = e.voucher_id WHERE e.location_id <=> v.location_id = 0) AS entries_with_a_different_branch;

-- C2. Where the existing entries landed
SELECT c.name AS cost_centre, COUNT(*) AS entries
FROM voucher_entries e JOIN cost_centres c ON c.id = e.cost_centre_id
GROUP BY c.name ORDER BY entries DESC;
