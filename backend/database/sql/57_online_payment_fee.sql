-- =====================================================================
-- 57_online_payment_fee.sql
-- Adds the service fee "Online payment fee" (a card or mobile-money fee passed on to the customer) to Service Fees.
-- Script 56 skipped "Payment processing fee" because an auction charge already has that name; that one is left alone.
-- This script commits by itself. Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECK. The Service Fees group (expect 1 row) and whether the ledger exists (expect 0 rows on the first run)
SELECT id, name FROM ledger_groups WHERE name = 'Service Fees';
SELECT id, name, group_id FROM ledgers WHERE name = 'Online payment fee';

-- PART B — ADD IT AND SAVE
START TRANSACTION;

SET @grp_fees := (SELECT id FROM ledger_groups WHERE name = 'Service Fees' ORDER BY id LIMIT 1);
SET @vat      := (SELECT tax_rate_ledger_id FROM ledgers WHERE name = 'Services - standard (VAT-able)' LIMIT 1);

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, rate_type, rate_value, currency_id, tax_nature, tax_rate_ledger_id, settings, created_at, updated_at)
SELECT @grp_fees, 'Online payment fee', 0, 0, 1, 'percent', 0, NULL, 'taxable', @vat,
       JSON_OBJECT('applies_to', 'service', 'charge_kind', 'payment_processing', 'timing', 'completion', 'refundable', FALSE, 'default_on', FALSE, 'unit', ''),
       NOW(), NOW()
WHERE @grp_fees IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Online payment fee');

COMMIT;

-- PART C — RESULT CHECK (expect 1 row, in Service Fees, VAT-able)
SELECT l.id, l.name, g.name AS grp, l.tax_nature, l.rate_type, l.rate_value FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE l.name = 'Online payment fee';
