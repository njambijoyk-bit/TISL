-- =====================================================================
-- 142_menus_operations.sql
-- Menus module, step 9 (docs/MENUS_PLAN.md): kitchen operations.
--   menus_waste   what was thrown away or eaten by staff (spoilage, over-prep, plate waste, staff meal), how much, what it cost, and the stock write-off journals it made.
--                 The prep list and the reorder suggestions need no tables: they are worked out from sales, bookings and stock.
-- Run 132 to 141 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'menus_waste';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_waste (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    location_id  BIGINT UNSIGNED NOT NULL,
    variant_id   BIGINT UNSIGNED NOT NULL,                      -- the stock item, or a dish (then its ingredients were written off)
    quantity     DECIMAL(18,4) NOT NULL,                        -- in the item's own stock unit (portions for a dish)
    cost         DECIMAL(14,2) NOT NULL DEFAULT 0,              -- what it was worth, at the cost of the batches it came from
    kind         VARCHAR(12) NOT NULL,                          -- spoilage | over_prep | plate | staff_meal | other
    note         VARCHAR(200) NULL,
    voucher_ids  JSON NULL,                                     -- the write-off journals in the books
    user_id      BIGINT UNSIGNED NULL,
    wasted_on    DATE NOT NULL,
    voided_at    DATETIME NULL,                                 -- a mistake, taken back (the stock returns)
    voided_by    BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_waste_day (location_id, wasted_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
