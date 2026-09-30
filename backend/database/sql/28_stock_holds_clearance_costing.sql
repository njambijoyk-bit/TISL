-- =====================================================================
-- 28_stock_holds_clearance_costing.sql        (stock, phase 2)
-- Quarantine, recall, clearance pricing and the costing method.
--
--   stock_batch_events               what was done to a batch and by whom:
--                                    quarantine, release, recall, recall
--                                    cancelled, clearance set / cleared
--   stock_batches.clearance_percent  a near-expiry batch on clearance: sales that take
--                                    from it are discounted by this percent
--   stock_batches.held_reason        why a batch is quarantined or recalled
--   stock_movements.ref_type/ref_id  the document a movement belongs to when it is not
--                                    a voucher (transfer, stock count, production, job)
--   stock_settings.costing_method    lot (each batch keeps its own cost, default) |
--                                    average (a product's batches share one moving
--                                    average cost; the stock value is unchanged)
--   stock_settings.returns_to_quarantine
--                                    a customer's return of an expiry product goes into a
--                                    held batch for checking instead of back on the shelf
--
-- Run after 22–27. Safe to re-run.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- ---------------------------------------------------------------------

SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'stock_batches' AND column_name IN ('clearance_percent', 'held_reason'))
    OR (table_name = 'stock_movements' AND column_name IN ('ref_type', 'ref_id'))
    OR (table_name = 'stock_settings' AND column_name IN ('costing_method', 'returns_to_quarantine')))
UNION ALL
SELECT table_name, NULL FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name = 'stock_batch_events';


-- ---------------------------------------------------------------------
-- PART B — TABLE AND COLUMNS (DDL, commits on its own; each skips itself if present)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_batch_events (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    batch_id   BIGINT UNSIGNED NOT NULL,
    action     VARCHAR(30)     NOT NULL,      -- quarantine | release | recall | recall_cancelled | recall_notified | clearance_set | clearance_cleared
    note       VARCHAR(255)    NULL,
    meta       JSON            NULL,
    user_id    BIGINT UNSIGNED NULL,
    created_at TIMESTAMP       NULL,
    KEY idx_event_batch (batch_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_column_if_missing;

DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;

CALL add_column_if_missing('stock_batches',  'clearance_percent',    'DECIMAL(5,2) NULL');
CALL add_column_if_missing('stock_batches',  'held_reason',          'VARCHAR(255) NULL');
CALL add_column_if_missing('stock_movements', 'ref_type',            'VARCHAR(20) NULL');
CALL add_column_if_missing('stock_movements', 'ref_id',              'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('stock_settings', 'costing_method',       'VARCHAR(10) NOT NULL DEFAULT ''lot''');
CALL add_column_if_missing('stock_settings', 'returns_to_quarantine', 'TINYINT(1) NOT NULL DEFAULT 0');

DROP PROCEDURE IF EXISTS add_column_if_missing;

SET @has_idx := (SELECT COUNT(*) FROM information_schema.statistics
                 WHERE table_schema = DATABASE() AND table_name = 'stock_movements' AND index_name = 'idx_movement_ref');
SET @sql := IF(@has_idx = 0, 'ALTER TABLE stock_movements ADD INDEX idx_movement_ref (ref_type, ref_id)', 'SELECT 1');
PREPARE st FROM @sql; EXECUTE st; DEALLOCATE PREPARE st;


-- ---------------------------------------------------------------------
-- PART C — RESULT CHECK. Expect the table and all six columns.
-- ---------------------------------------------------------------------

SELECT table_name, column_name FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND ((table_name = 'stock_batches' AND column_name IN ('clearance_percent', 'held_reason'))
    OR (table_name = 'stock_movements' AND column_name IN ('ref_type', 'ref_id'))
    OR (table_name = 'stock_settings' AND column_name IN ('costing_method', 'returns_to_quarantine')))
ORDER BY table_name, column_name;

SELECT costing_method, returns_to_quarantine FROM stock_settings WHERE id = 1;
