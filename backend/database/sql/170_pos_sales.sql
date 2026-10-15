-- =====================================================================
-- 170_pos_sales.sql
-- Point of sale, step 2 (docs/POS_PLAN.md): checkout.
--   pos_holds      a sale put on hold at a till, to be recalled (by the same person or another at that branch) and finished later
--   pos_sale_keys  the key each sale carries from the till: a double tap or a retry finds the sale already made instead of making a second one
-- Run 169 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('pos_holds', 'pos_sale_keys');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS pos_holds (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    location_id  BIGINT UNSIGNED NOT NULL,
    station_id   BIGINT UNSIGNED NULL,
    user_id      BIGINT UNSIGNED NOT NULL,
    label        VARCHAR(80) NULL,
    cart         JSON NOT NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_pos_holds_location (location_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pos_sale_keys (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    sale_key    VARCHAR(64) NOT NULL,
    voucher_id  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_pos_sale_keys (user_id, sale_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK AFTER
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('pos_holds', 'pos_sale_keys');
