-- =====================================================================
-- 77_memorandum.sql
-- The Memorandum voucher type, and the end of Financial notes.
--
--   * A Memorandum is a voucher that posts nothing to the books. It records a debit / credit
--     entry that is expected or agreed, and a finance user can later convert it into a real
--     Journal. It is numbered like any voucher (for example WNKJ-MEMO-00001).
--   * Financial notes (the old "Memo" notes, test data only) are removed: the financial_notes
--     table goes, and the reconciliation line link to a note goes with it.
--
-- Run in Workbench. Safe to re-run: the voucher type and its numbering are only added when they
-- are missing, and the drops only happen when the thing is still there.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Run first, on its own.
-- 1. Is there a Memorandum type yet?   2. The Journal series it will copy its numbering from.
-- 3. Do the old notes still exist, and how many?   4. Does a reconciliation line still point at a note?
SELECT id, code, name, base_type, posts_accounts, is_active FROM voucher_types WHERE base_type IN ('memorandum', 'journal');
SELECT s.id, s.name, s.prefix, s.suffix, s.number_width, s.reset_period FROM voucher_series s JOIN voucher_types t ON t.id = s.voucher_type_id WHERE t.base_type = 'journal';
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'financial_notes';
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reconciliation_lines' AND column_name = 'financial_note_id';

-- PART B - CHANGE
-- B1. The voucher type and its numbering (a transaction: both or neither).
START TRANSACTION;

INSERT INTO voucher_types (code, name, base_type, posts_accounts, stock_effect, has_items, party_kind, default_ledger_id, is_system, is_active, created_at, updated_at)
SELECT 'MEMO', 'Memorandum', 'memorandum', 0, jr.stock_effect, 0, jr.party_kind, NULL, 1, 1, NOW(), NOW()
FROM voucher_types jr
WHERE jr.base_type = 'journal'
  AND NOT EXISTS (SELECT 1 FROM voucher_types WHERE base_type = 'memorandum')
ORDER BY jr.id
LIMIT 1;

-- Its numbering follows the Journal's: the prefix has JV replaced by MEMO (WNKJ-JV- becomes WNKJ-MEMO-);
-- if the Journal prefix has no JV in it, it is just MEMO-. One series for every branch.
INSERT INTO voucher_series (voucher_type_id, name, prefix, suffix, number_width, start_number, next_number, reset_period, last_reset_key, location_id, allow_manual, is_default, is_active, created_at, updated_at)
SELECT t.id, 'Memorandum',
       CASE WHEN js.prefix LIKE '%JV%' THEN REPLACE(js.prefix, 'JV', 'MEMO') ELSE 'MEMO-' END,
       js.suffix, js.number_width, 1, 1, 'never', NULL, NULL, js.allow_manual, 1, 1, NOW(), NOW()
FROM voucher_types t
JOIN voucher_types jt ON jt.base_type = 'journal'
JOIN voucher_series js ON js.voucher_type_id = jt.id
WHERE t.base_type = 'memorandum'
  AND NOT EXISTS (SELECT 1 FROM voucher_series WHERE voucher_type_id = t.id)
ORDER BY js.is_default DESC, js.id
LIMIT 1;

COMMIT;

-- B2. Financial notes go. DDL cannot be rolled back, so check part A first: the notes are test data.
DROP PROCEDURE IF EXISTS drop_financial_notes;
DELIMITER $$
CREATE PROCEDURE drop_financial_notes()
BEGIN
    DECLARE done INT DEFAULT 0;
    DECLARE fk_name VARCHAR(128);
    DECLARE cur CURSOR FOR
        SELECT constraint_name FROM information_schema.key_column_usage
        WHERE table_schema = DATABASE() AND table_name = 'reconciliation_lines' AND column_name = 'financial_note_id' AND referenced_table_name IS NOT NULL;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

    -- the foreign key from a reconciliation line to a note, whatever it is called
    OPEN cur;
    fk_loop: LOOP
        FETCH cur INTO fk_name;
        IF done = 1 THEN LEAVE fk_loop; END IF;
        SET @sql = CONCAT('ALTER TABLE reconciliation_lines DROP FOREIGN KEY `', fk_name, '`');
        PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
    END LOOP;
    CLOSE cur;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reconciliation_lines' AND column_name = 'financial_note_id') THEN
        ALTER TABLE reconciliation_lines DROP COLUMN financial_note_id;
    END IF;
    DROP TABLE IF EXISTS financial_notes;
END$$
DELIMITER ;
CALL drop_financial_notes();
DROP PROCEDURE IF EXISTS drop_financial_notes;

-- PART C - RESULT CHECK. Expect: the Memorandum type (posts_accounts 0) and a series with a MEMO prefix,
-- no financial_notes table, and no financial_note_id column.
SELECT t.id, t.code, t.name, t.base_type, t.posts_accounts, t.is_active, s.prefix, s.next_number
FROM voucher_types t LEFT JOIN voucher_series s ON s.voucher_type_id = t.id WHERE t.base_type = 'memorandum';
SELECT COUNT(*) AS financial_notes_tables_left FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'financial_notes';
SELECT COUNT(*) AS note_link_columns_left FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'reconciliation_lines' AND column_name = 'financial_note_id';
