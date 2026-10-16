-- =====================================================================
-- 182_menus_ingredient_stock.sql
-- Menus owns its stock (docs/MENUS_STOCK_PLAN.md), step 2: ingredient stock comes in.
--   menus_stock_batches   a received lot of an ingredient variant at a branch: quantity in the ingredient's BASE unit, what is left, what one base unit cost, batch no, expiry
--   menus_stock_moves     every change to that stock (received, opening, later: used, wasted, counted, moved), each with the receipt or voucher it came from
--   menus_receipts        a goods-received document: the supplier, their invoice number, the branch, and the Purchase voucher it posted in the books
--   menus_receipt_lines   what was received: the variant, the quantity as typed (packs, the alternate unit or the base unit), the price, the batch it made
-- It also makes the three accounts Menus posts to (only if they do not exist), the same way script 22 made Stock and Cost of Goods Sold:
--   Food Ingredients Inventory   under Stock-in-hand       (current asset)
--   Food Cost of Sales           under Direct Expenses     (direct expense)
--   Food Waste Expense           under Direct Expenses     (direct expense)
-- Run 181 first. Nothing in the shop changes. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_stock_batches', 'menus_stock_moves', 'menus_receipts', 'menus_receipt_lines');
SELECT id, name, nature FROM ledger_groups WHERE name IN ('Stock-in-hand', 'Direct Expenses');
SELECT id, name, group_id FROM ledgers WHERE name IN ('Food Ingredients Inventory', 'Food Cost of Sales', 'Food Waste Expense');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_receipts (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kind                VARCHAR(12) NOT NULL DEFAULT 'purchase',   -- purchase | opening
    location_id         BIGINT UNSIGNED NOT NULL,
    supplier_ledger_id  BIGINT UNSIGNED NULL,                      -- a ledger under Sundry Creditors (empty when paid at once or for opening stock)
    supplier_invoice_no VARCHAR(60) NULL,
    receipt_date        DATE NOT NULL,
    voucher_id          BIGINT UNSIGNED NULL,                      -- the Purchase voucher (or the opening Journal) it posted
    status              VARCHAR(12) NOT NULL DEFAULT 'posted',     -- posted | cancelled
    narration           VARCHAR(255) NULL,
    subtotal            DECIMAL(18,2) NOT NULL DEFAULT 0,
    tax_total           DECIMAL(18,2) NOT NULL DEFAULT 0,
    total               DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_by          BIGINT UNSIGNED NULL,
    cancelled_at        TIMESTAMP NULL,
    created_at          TIMESTAMP NULL,
    updated_at          TIMESTAMP NULL,
    KEY idx_menus_receipt_loc (location_id, receipt_date),
    KEY idx_menus_receipt_voucher (voucher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_stock_batches (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    item_id      BIGINT UNSIGNED NOT NULL,                         -- menus_ingredient_items
    location_id  BIGINT UNSIGNED NOT NULL,
    batch_no     VARCHAR(60) NULL,
    received_on  DATE NOT NULL,
    expiry_date  DATE NULL,
    unit_cost    DECIMAL(18,6) NOT NULL DEFAULT 0,                 -- per BASE unit, before tax
    qty_in       DECIMAL(18,4) NOT NULL,                           -- base unit
    qty_left     DECIMAL(18,4) NOT NULL,                           -- base unit
    status       VARCHAR(10) NOT NULL DEFAULT 'ok',                -- ok | held | recalled
    source       VARCHAR(12) NOT NULL DEFAULT 'purchase',          -- purchase | opening | count | transfer | production
    receipt_id   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_batch_item (item_id, location_id, qty_left),
    KEY idx_menus_batch_expiry (expiry_date),
    KEY idx_menus_batch_receipt (receipt_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_stock_moves (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    item_id      BIGINT UNSIGNED NOT NULL,
    location_id  BIGINT UNSIGNED NOT NULL,
    batch_id     BIGINT UNSIGNED NULL,
    kind         VARCHAR(16) NOT NULL,                             -- purchase | opening | reversal | (later) use | waste | count | transfer_in | transfer_out | production
    quantity     DECIMAL(18,4) NOT NULL,                           -- base unit; in is positive, out is negative
    unit_cost    DECIMAL(18,6) NOT NULL DEFAULT 0,
    receipt_id   BIGINT UNSIGNED NULL,
    voucher_id   BIGINT UNSIGNED NULL,
    ref_type     VARCHAR(20) NULL,
    ref_id       BIGINT UNSIGNED NULL,
    note         VARCHAR(255) NULL,
    moved_on     DATE NOT NULL,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_move_item (item_id, location_id, moved_on),
    KEY idx_menus_move_receipt (receipt_id),
    KEY idx_menus_move_ref (ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_receipt_lines (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    receipt_id  BIGINT UNSIGNED NOT NULL,
    item_id     BIGINT UNSIGNED NOT NULL,
    input_qty   DECIMAL(18,4) NOT NULL,                            -- as typed
    input_unit  VARCHAR(8) NOT NULL DEFAULT 'base',                -- pack | alt | base
    qty_base    DECIMAL(18,4) NOT NULL,
    rate        DECIMAL(18,4) NOT NULL DEFAULT 0,                  -- price of one input unit, before tax
    amount      DECIMAL(18,2) NOT NULL DEFAULT 0,
    tax_rate_id BIGINT UNSIGNED NULL,
    tax_amount  DECIMAL(18,2) NOT NULL DEFAULT 0,
    batch_id    BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_menus_receipt_line (receipt_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- the three accounts (only where they do not exist; the Menus configuration can point at others)
SET @grp_stock  := (SELECT id FROM ledger_groups WHERE name = 'Stock-in-hand'   ORDER BY id LIMIT 1);
SET @grp_direct := (SELECT id FROM ledger_groups WHERE name = 'Direct Expenses' ORDER BY id LIMIT 1);

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_stock, 'Food Ingredients Inventory', 0, 1, 1, NOW(), NOW()
WHERE @grp_stock IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Food Ingredients Inventory');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_direct, 'Food Cost of Sales', 0, 1, 1, NOW(), NOW()
WHERE @grp_direct IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Food Cost of Sales');

INSERT INTO ledgers (group_id, name, opening_balance, is_system, is_active, created_at, updated_at)
SELECT @grp_direct, 'Food Waste Expense', 0, 1, 1, NOW(), NOW()
WHERE @grp_direct IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledgers WHERE name = 'Food Waste Expense');

-- PART C - CHECK AFTER (4 tables, the 3 accounts under the right groups)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_stock_batches', 'menus_stock_moves', 'menus_receipts', 'menus_receipt_lines');
SELECT l.id, l.name, g.name AS under FROM ledgers l JOIN ledger_groups g ON g.id = l.group_id WHERE l.name IN ('Food Ingredients Inventory', 'Food Cost of Sales', 'Food Waste Expense');
