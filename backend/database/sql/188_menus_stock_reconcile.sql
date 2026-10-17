-- =====================================================================
-- 188_menus_stock_reconcile.sql
-- Make the stock journal agree with the shelf for the kitchen's ingredients. The Stock query and the Stock reports add up the stock journal (stock_movements); the Menus Stock page
-- and the Count sheet add up the lots on the shelf (menus_stock_batches). They should give the same figure for every ingredient variant at every branch. When they do not, some
-- movement never reached the journal (it was made before the journal copied the kitchen's movements, or a cancelled opening receipt left no reversal), and this script adds one
-- "reconcile" movement for the difference, so the journal says what the shelf says. The shelf is never changed.
-- Run 187_menus_core_stock.sql first, INCLUDING its part B2 (it copies the earlier movements): run this only when Part A of 187 says movements_to_copy = 0, otherwise a
-- movement would be counted twice. Safe to re-run (a second run finds nothing to add). Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
-- A1. kitchen movements 187 has not copied yet (must be 0 before part B)
SELECT COUNT(*) AS movements_to_copy FROM menus_stock_moves m
 WHERE m.created_at < COALESCE((SELECT MIN(x.created_at) FROM stock_movements x WHERE x.item_type = 'menus_ingredient_item'), '9999-12-31');

-- A2. every ingredient variant and branch where the shelf and the journal differ (an empty result means they agree)
SELECT k.item_id, CONCAT(g.name, ' - ', it.name) AS ingredient_variant, k.location_id, loc.name AS branch,
       COALESCE(l.lots_qty, 0) AS on_the_shelf, COALESCE(j.journal_qty, 0) AS in_the_journal, COALESCE(l.lots_qty, 0) - COALESCE(j.journal_qty, 0) AS difference
  FROM (SELECT item_id, location_id FROM menus_stock_batches UNION SELECT item_id, location_id FROM stock_movements WHERE item_type = 'menus_ingredient_item') k
  LEFT JOIN (SELECT item_id, location_id, SUM(qty_left) AS lots_qty FROM menus_stock_batches GROUP BY item_id, location_id) l ON l.item_id = k.item_id AND l.location_id = k.location_id
  LEFT JOIN (SELECT item_id, location_id, SUM(quantity) AS journal_qty FROM stock_movements WHERE item_type = 'menus_ingredient_item' AND reversed = 0 GROUP BY item_id, location_id) j ON j.item_id = k.item_id AND j.location_id = k.location_id
  LEFT JOIN menus_ingredient_items it ON it.id = k.item_id
  LEFT JOIN menus_ingredients g ON g.id = it.ingredient_id
  LEFT JOIN locations loc ON loc.id = k.location_id
 WHERE ABS(COALESCE(l.lots_qty, 0) - COALESCE(j.journal_qty, 0)) > 0.00005
 ORDER BY g.name, it.name, loc.name;

-- PART B - ADD THE MISSING MOVEMENTS (one "reconcile" row for each difference, dated today, at the cost of what is on the shelf)
INSERT INTO stock_movements (voucher_id, voucher_item_id, variant_id, location_id, quantity, movement_type, movement_date, created_at, batch_id, unit_cost, ref_type, ref_id, reversed, item_type, item_id)
SELECT NULL, NULL, NULL, d.location_id, d.diff, 'reconcile', CURDATE(), NOW(), NULL,
       COALESCE(c.avg_cost, (SELECT x.unit_cost FROM stock_movements x WHERE x.item_type = 'menus_ingredient_item' AND x.item_id = d.item_id AND x.unit_cost > 0 ORDER BY x.id DESC LIMIT 1), 0),
       'reconcile', NULL, 0, 'menus_ingredient_item', d.item_id
  FROM (
        SELECT k.item_id, k.location_id, COALESCE(l.lots_qty, 0) - COALESCE(j.journal_qty, 0) AS diff
          FROM (SELECT item_id, location_id FROM menus_stock_batches UNION SELECT item_id, location_id FROM stock_movements WHERE item_type = 'menus_ingredient_item') k
          LEFT JOIN (SELECT item_id, location_id, SUM(qty_left) AS lots_qty FROM menus_stock_batches GROUP BY item_id, location_id) l ON l.item_id = k.item_id AND l.location_id = k.location_id
          LEFT JOIN (SELECT item_id, location_id, SUM(quantity) AS journal_qty FROM stock_movements WHERE item_type = 'menus_ingredient_item' AND reversed = 0 GROUP BY item_id, location_id) j ON j.item_id = k.item_id AND j.location_id = k.location_id
       ) d
  LEFT JOIN (SELECT item_id, location_id, SUM(qty_left * unit_cost) / NULLIF(SUM(qty_left), 0) AS avg_cost FROM menus_stock_batches WHERE qty_left > 0 GROUP BY item_id, location_id) c ON c.item_id = d.item_id AND c.location_id = d.location_id
 WHERE ABS(d.diff) > 0.00005;

-- PART C - CHECK AFTER (must return no rows)
SELECT k.item_id, k.location_id, COALESCE(l.lots_qty, 0) AS on_the_shelf, COALESCE(j.journal_qty, 0) AS in_the_journal
  FROM (SELECT item_id, location_id FROM menus_stock_batches UNION SELECT item_id, location_id FROM stock_movements WHERE item_type = 'menus_ingredient_item') k
  LEFT JOIN (SELECT item_id, location_id, SUM(qty_left) AS lots_qty FROM menus_stock_batches GROUP BY item_id, location_id) l ON l.item_id = k.item_id AND l.location_id = k.location_id
  LEFT JOIN (SELECT item_id, location_id, SUM(quantity) AS journal_qty FROM stock_movements WHERE item_type = 'menus_ingredient_item' AND reversed = 0 GROUP BY item_id, location_id) j ON j.item_id = k.item_id AND j.location_id = k.location_id
 WHERE ABS(COALESCE(l.lots_qty, 0) - COALESCE(j.journal_qty, 0)) > 0.00005;
