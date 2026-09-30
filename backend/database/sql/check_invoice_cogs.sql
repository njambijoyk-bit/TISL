-- =====================================================================
-- check_invoice_cogs.sql  — READ-ONLY. Changes nothing.
-- Why did a Sales invoice post no Cost of Goods Sold / Stock lines?
-- Run each query on its own and send me the results.
-- =====================================================================

-- 1. Do the Stock and Cost of Goods Sold ledgers exist in Books settings?
--    (both must be filled in, or no COGS is ever posted)
SELECT s.stock_ledger_id, ls.name AS stock_ledger,
       s.cogs_ledger_id,  lc.name AS cogs_ledger
FROM accounting_settings s
LEFT JOIN ledgers ls ON ls.id = s.stock_ledger_id
LEFT JOIN ledgers lc ON lc.id = s.cogs_ledger_id;

-- 2. Does each selling voucher type move stock?
--    stock_effect = 'none' means that type never takes stock out (and so posts no cost).
SELECT id, code, name, base_type, stock_effect, posts_accounts, is_active
FROM voucher_types
WHERE base_type IN ('sales', 'cash_sale', 'delivery_note', 'sales_order', 'credit_note')
ORDER BY base_type, id;

-- 3. The most recent Sales invoices: did they move stock, and were they made from another document?
SELECT v.id, v.voucher_number, t.base_type, v.date, v.moves_stock, v.source_voucher_id, v.total_amount
FROM vouchers v JOIN voucher_types t ON t.id = v.voucher_type_id
WHERE t.base_type IN ('sales', 'cash_sale')
ORDER BY v.id DESC
LIMIT 10;

-- 4. Stock movements and the cost they carried, for those same vouchers
--    (no rows, or unit_cost 0, means nothing was costed)
SELECT m.voucher_id, v.voucher_number, m.variant_id, m.quantity, m.unit_cost, m.movement_type
FROM stock_movements m JOIN vouchers v ON v.id = m.voucher_id
WHERE m.voucher_id IN (SELECT id FROM (SELECT id FROM vouchers ORDER BY id DESC LIMIT 10) x)
ORDER BY m.voucher_id DESC;
