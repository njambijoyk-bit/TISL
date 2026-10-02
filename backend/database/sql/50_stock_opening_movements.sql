-- =====================================================================
-- 50_stock_opening_movements.sql
-- Why the stock reports show some items below zero although they are in stock: stock that was on the shelf BEFORE
-- movements were recorded (the opening batches script 23 made, or a quantity typed straight onto a product) has a
-- batch balance but no movement for coming in, so later sales look like stock that never existed.
-- This gives each batch a single "opening stock" movement for exactly the missing amount, dated the day before its
-- first recorded movement (or its received date), at the batch's own cost. Nothing else is changed: the shop's stock
-- quantities and the books are untouched, and a batch whose cost is 0 will read "No cost" in the reports.
-- Needs script 49. Run in Workbench. Safe to re-run (the second run finds nothing to add).
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. Script 49 has been run (expect 2 rows: item_type, item_id)
SELECT column_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'stock_movements' AND column_name IN ('item_type', 'item_id');

-- A2. Batches whose balance is MORE than their movements add up to — these get an opening movement
SELECT p.name AS product, pv.name AS variant, l.name AS branch, b.batch_id,
       b.quantity AS on_hand, COALESCE(m.q, 0) AS movements, b.quantity - COALESCE(m.q, 0) AS missing_in, sb.unit_cost
FROM stock_batch_balances b
JOIN stock_batches sb ON sb.id = b.batch_id
JOIN product_variants pv ON pv.id = sb.variant_id
JOIN products p ON p.id = pv.product_id
LEFT JOIN locations l ON l.id = b.location_id
LEFT JOIN (SELECT batch_id, location_id, SUM(quantity) AS q FROM stock_movements WHERE reversed = 0 GROUP BY batch_id, location_id) m
       ON m.batch_id = b.batch_id AND m.location_id = b.location_id
WHERE b.quantity - COALESCE(m.q, 0) > 0.00005
ORDER BY p.name, pv.name;

-- A3. Batches whose movements add up to MORE than the balance (stock left the books that the batch never held) — NOT touched; look at these yourself
SELECT p.name AS product, pv.name AS variant, l.name AS branch, b.batch_id,
       b.quantity AS on_hand, COALESCE(m.q, 0) AS movements, b.quantity - COALESCE(m.q, 0) AS difference
FROM stock_batch_balances b
JOIN stock_batches sb ON sb.id = b.batch_id
JOIN product_variants pv ON pv.id = sb.variant_id
JOIN products p ON p.id = pv.product_id
LEFT JOIN locations l ON l.id = b.location_id
LEFT JOIN (SELECT batch_id, location_id, SUM(quantity) AS q FROM stock_movements WHERE reversed = 0 GROUP BY batch_id, location_id) m
       ON m.batch_id = b.batch_id AND m.location_id = b.location_id
WHERE b.quantity - COALESCE(m.q, 0) < -0.00005
ORDER BY p.name, pv.name;

-- A4. Movements that name no batch at all (sold or adjusted with no stock behind them) — NOT touched; these are the real "below zero" items
SELECT p.name AS product, pv.name AS variant, SUM(m.quantity) AS qty, COUNT(*) AS movements, MIN(m.movement_date) AS first_on, MAX(m.movement_date) AS last_on
FROM stock_movements m
JOIN product_variants pv ON pv.id = m.variant_id
JOIN products p ON p.id = pv.product_id
WHERE m.batch_id IS NULL AND m.reversed = 0
GROUP BY p.name, pv.name
ORDER BY p.name, pv.name;

-- PART B — ADD THE OPENING MOVEMENTS (transaction)
-- IMPORTANT: finish with COMMIT (or ROLLBACK) in the same Workbench tab. A transaction left open keeps its locks and the app
-- then fails with "Lock wait timeout exceeded" on stock counts, sales and purchases. READ COMMITTED keeps the locks to a minimum.
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;

INSERT INTO stock_movements (voucher_id, voucher_item_id, variant_id, item_type, item_id, location_id, quantity, movement_type, movement_date, reversed, created_at, batch_id, unit_cost, ref_type, ref_id)
SELECT NULL, NULL, sb.variant_id, 'product_variant', sb.variant_id, b.location_id, b.quantity - COALESCE(m.q, 0), 'opening_stock',
       LEAST(sb.received_at, COALESCE(DATE_SUB(m.first_on, INTERVAL 1 DAY), sb.received_at)), 0, NOW(), b.batch_id, sb.unit_cost, 'stock_backfill', b.batch_id
FROM stock_batch_balances b
JOIN stock_batches sb ON sb.id = b.batch_id
LEFT JOIN (SELECT batch_id, location_id, SUM(quantity) AS q, MIN(movement_date) AS first_on FROM stock_movements WHERE reversed = 0 GROUP BY batch_id, location_id) m
       ON m.batch_id = b.batch_id AND m.location_id = b.location_id
WHERE sb.variant_id IS NOT NULL AND b.quantity - COALESCE(m.q, 0) > 0.00005;

-- PART C — RESULT CHECK
-- C1. How many opening movements this added (0 on a re-run)
SELECT ROW_COUNT() AS opening_movements_added;

-- C2. Batches still short of a movement — must be 0
SELECT COUNT(*) AS still_missing
FROM stock_batch_balances b
LEFT JOIN (SELECT batch_id, location_id, SUM(quantity) AS q FROM stock_movements WHERE reversed = 0 GROUP BY batch_id, location_id) m
       ON m.batch_id = b.batch_id AND m.location_id = b.location_id
WHERE b.quantity - COALESCE(m.q, 0) > 0.00005;

-- When C2 shows 0 run:  COMMIT;    To undo instead run:  ROLLBACK;
-- Do not leave this tab with the transaction open. Afterwards you can run:  SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;
