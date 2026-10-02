-- =====================================================================
-- 56_service_income_and_fees.sql
-- Service Income and the fees a service can carry.
--
--   Service Income                       a group beside Sales Accounts, reserved for services ("applies to services")
--     Services - standard (VAT-able)       copies the tax of  Sales - standard (VAT-able sales)
--     Services - exempt                    copies the tax of  Sales - exempt
--     Services - zero rated                copies the tax of  Sales - zero rated
--     Service Returns                      copies the tax of  Sales Returns (switched off like it is)
--     Service Fees                         subgroup: call-out, travel, urgent, after-hours, consumables, equipment hire, extra
--                                          person, overtime, service charge, booking fee, late cancellation, no-show, reschedule,
--                                          payment processing  — each with "taxed (with a tax ledger) or not taxed"
--   Current Liabilities
--     Service Deposits & Pass-through      subgroup: Customer Deposits - Bookings, Tips Payable, Disbursements Payable
--
-- Existing services are moved to the matching Services ledger by their current tax treatment. The amounts on the fee
-- ledgers are starting suggestions (deposit 20%, cancellation 50%, no-show 100%…): change them on the ledger or per service.
-- Run in Workbench. Safe to re-run (nothing is added twice).
-- =====================================================================

-- PART A — READ-ONLY CHECKS. Run first, on their own.
-- A1. The groups this builds on (expect Sales Accounts and Current Liabilities, one row each)
SELECT id, name, nature, behaviour, parent_id, is_primary FROM ledger_groups WHERE name IN ('Sales Accounts', 'Current Liabilities', 'Service Income', 'Service Fees', 'Service Deposits & Pass-through') ORDER BY name;

-- A2. The sales ledgers whose tax is copied (expect 4 rows)
SELECT id, name, group_id, tax_nature, tax_rate_ledger_id, is_active FROM ledgers
WHERE name IN ('Sales - standard (VAT-able sales)', 'Sales - exempt', 'Sales - zero rated', 'Sales Returns');

-- A3. The base currency (expect 1 row) and ledgers that already carry the new names (expect 0 rows on the first run)
SELECT id, code FROM currencies WHERE is_base = 1;
SELECT id, name FROM ledgers WHERE name LIKE 'Services - %' OR name IN ('Service Returns', 'Call-out fee', 'Customer Deposits - Bookings', 'Tips Payable', 'Disbursements Payable');

-- A4. How the services are sold now (which sales account, and how many services)
SELECT l.name AS sales_account, l.tax_nature, COUNT(*) AS services FROM services s LEFT JOIN ledgers l ON l.id = s.sales_ledger_id GROUP BY l.name, l.tax_nature;

-- PART B — GROUPS AND LEDGERS (transaction; re-runnable)
SET @old_safe := @@SQL_SAFE_UPDATES;
SET SQL_SAFE_UPDATES = 0;

START TRANSACTION;

SET @grp_sales := (SELECT id FROM ledger_groups WHERE name = 'Sales Accounts' ORDER BY id LIMIT 1);
SET @grp_liab  := (SELECT id FROM ledger_groups WHERE name = 'Current Liabilities' ORDER BY id LIMIT 1);

-- the groups
INSERT INTO ledger_groups (parent_id, name, nature, is_primary, is_system, affects_gross_profit, sort_order, behaviour, settings, created_at, updated_at)
SELECT g.parent_id, 'Service Income', g.nature, g.is_primary, 0, g.affects_gross_profit, g.sort_order + 1, 'sales', JSON_OBJECT('applies_to', 'service'), NOW(), NOW()
FROM ledger_groups g WHERE g.id = @grp_sales AND NOT EXISTS (SELECT 1 FROM ledger_groups x WHERE x.name = 'Service Income');
SET @grp_service := (SELECT id FROM ledger_groups WHERE name = 'Service Income' ORDER BY id LIMIT 1);

INSERT INTO ledger_groups (parent_id, name, nature, is_primary, is_system, affects_gross_profit, sort_order, behaviour, settings, created_at, updated_at)
SELECT @grp_service, 'Service Fees', g.nature, 0, 0, g.affects_gross_profit, 1, 'charge', JSON_OBJECT('applies_to', 'service'), NOW(), NOW()
FROM ledger_groups g WHERE g.id = @grp_service AND NOT EXISTS (SELECT 1 FROM ledger_groups x WHERE x.name = 'Service Fees');
SET @grp_fees := (SELECT id FROM ledger_groups WHERE name = 'Service Fees' ORDER BY id LIMIT 1);

INSERT INTO ledger_groups (parent_id, name, nature, is_primary, is_system, affects_gross_profit, sort_order, behaviour, settings, created_at, updated_at)
SELECT @grp_liab, 'Service Deposits & Pass-through', 'liability', 0, 0, 0, 90, 'charge', JSON_OBJECT('applies_to', 'service'), NOW(), NOW()
FROM ledger_groups g WHERE g.id = @grp_liab AND NOT EXISTS (SELECT 1 FROM ledger_groups x WHERE x.name = 'Service Deposits & Pass-through');
SET @grp_pass := (SELECT id FROM ledger_groups WHERE name = 'Service Deposits & Pass-through' ORDER BY id LIMIT 1);

-- the four service sales ledgers, taking their tax from the product sales ledgers
INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, tax_nature, tax_rate_ledger_id, side, created_at, updated_at)
SELECT @grp_service, m.new_name, 0, 0, src.is_active, src.tax_nature, src.tax_rate_ledger_id, src.side, NOW(), NOW()
FROM (SELECT 'Sales - standard (VAT-able sales)' AS old_name, 'Services - standard (VAT-able)' AS new_name
      UNION ALL SELECT 'Sales - exempt', 'Services - exempt'
      UNION ALL SELECT 'Sales - zero rated', 'Services - zero rated'
      UNION ALL SELECT 'Sales Returns', 'Service Returns') m
JOIN ledgers src ON src.name = m.old_name
WHERE @grp_service IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers l WHERE l.name = m.new_name);

-- the fee ledgers
SET @base_cur := (SELECT id FROM currencies WHERE is_base = 1 ORDER BY id LIMIT 1);
SET @vat      := (SELECT tax_rate_ledger_id FROM ledgers WHERE name = 'Sales - standard (VAT-able sales)' LIMIT 1);

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, rate_type, rate_value, currency_id, tax_nature, tax_rate_ledger_id, settings, created_at, updated_at)
SELECT IF(f.liab = 1, @grp_pass, @grp_fees), f.name, 0, 0, 1, f.rate_type, f.rate_value, IF(f.rate_type = 'percent', NULL, @base_cur),
       f.tax_nature, IF(f.tax_nature = 'taxable', @vat, NULL),
       JSON_OBJECT('applies_to', 'service', 'charge_kind', f.kind, 'timing', f.timing, 'refundable', f.refundable = 1, 'default_on', FALSE, 'unit', f.unit),
       NOW(), NOW()
FROM (
      SELECT 'Call-out fee' AS name, 'call_out' AS kind, 'fixed' AS rate_type, 0 AS rate_value, 'taxable' AS tax_nature, 'completion' AS timing, 0 AS liab, 0 AS refundable, '' AS unit
      UNION ALL SELECT 'Travel', 'travel', 'per_unit', 0, 'taxable', 'completion', 0, 0, 'km'
      UNION ALL SELECT 'Urgent / same-day surcharge', 'urgent', 'percent', 25, 'taxable', 'booking', 0, 0, ''
      UNION ALL SELECT 'After-hours surcharge', 'after_hours', 'percent', 25, 'taxable', 'booking', 0, 0, ''
      UNION ALL SELECT 'Consumables', 'consumables', 'fixed', 0, 'taxable', 'completion', 0, 0, ''
      UNION ALL SELECT 'Equipment / room hire', 'equipment', 'per_unit', 0, 'taxable', 'completion', 0, 0, 'hour'
      UNION ALL SELECT 'Extra person fee', 'extra_person', 'per_unit', 0, 'taxable', 'completion', 0, 0, 'person'
      UNION ALL SELECT 'Overtime', 'overtime', 'per_unit', 0, 'taxable', 'completion', 0, 0, 'hour'
      UNION ALL SELECT 'Service charge', 'service_charge', 'percent', 10, 'taxable', 'completion', 0, 0, ''
      UNION ALL SELECT 'Booking fee', 'booking_fee', 'fixed', 0, 'taxable', 'booking', 0, 0, ''
      UNION ALL SELECT 'Late cancellation fee', 'cancellation', 'percent', 50, 'out_of_scope', 'late_cancel', 0, 0, ''
      UNION ALL SELECT 'No-show fee', 'no_show', 'percent', 100, 'out_of_scope', 'no_show', 0, 0, ''
      UNION ALL SELECT 'Reschedule fee', 'reschedule', 'fixed', 0, 'taxable', 'reschedule', 0, 0, ''
      UNION ALL SELECT 'Payment processing fee', 'payment_processing', 'percent', 0, 'taxable', 'completion', 0, 0, ''
      UNION ALL SELECT 'Customer Deposits - Bookings', 'deposit', 'percent', 20, 'out_of_scope', 'booking', 1, 1, ''
      UNION ALL SELECT 'Tips Payable', 'tip', 'percent', 0, 'out_of_scope', 'completion', 1, 0, ''
      UNION ALL SELECT 'Disbursements Payable', 'disbursement', 'fixed', 0, 'out_of_scope', 'completion', 1, 0, ''
     ) f
WHERE @grp_fees IS NOT NULL AND @grp_pass IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers l WHERE l.name = f.name);

-- existing services follow the new accounts, by their current tax treatment
UPDATE services s
JOIN ledgers o ON o.id = s.sales_ledger_id
JOIN ledgers n ON n.name = CASE o.tax_nature WHEN 'taxable' THEN 'Services - standard (VAT-able)' WHEN 'exempt' THEN 'Services - exempt' WHEN 'zero_rated' THEN 'Services - zero rated' ELSE NULL END
SET s.sales_ledger_id = n.id
WHERE o.group_id = @grp_sales;

-- PART C — RESULT CHECK (look before you COMMIT)
-- C1. The new groups (expect 3 rows)
SELECT id, name, nature, behaviour, parent_id, settings FROM ledger_groups WHERE name IN ('Service Income', 'Service Fees', 'Service Deposits & Pass-through');

-- C2. The new ledgers (expect 4 + 14 + 3 = 21 rows), with how each is taxed
SELECT g.name AS grp, l.name, l.rate_type, l.rate_value, l.tax_nature, l.tax_rate_ledger_id, JSON_UNQUOTE(JSON_EXTRACT(l.settings, '$.timing')) AS timing
FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id
WHERE g.name IN ('Service Income', 'Service Fees', 'Service Deposits & Pass-through') ORDER BY g.name, l.name;

-- C3. Services still on a product sales account — expect 0 (a service with no tax set, if any, stays and must be fixed on its form)
SELECT COUNT(*) AS services_not_moved FROM services s JOIN ledgers o ON o.id = s.sales_ledger_id WHERE o.group_id = @grp_sales;

-- When the results look right run:  COMMIT;    To undo instead run:  ROLLBACK;
-- Do not leave this tab with the transaction open. Afterwards you can run:  SET SQL_SAFE_UPDATES = @old_safe;
