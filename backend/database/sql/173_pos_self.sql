-- =====================================================================
-- 173_pos_self.sql
-- Point of sale, step 7 (docs/POS_PLAN.md): self checkout.
--   pos_self_sessions  one row per basket a customer finishes at a self-checkout screen: its code (shown on the screen), the station, the order held for the M-Pesa payment, or the held sale waiting at the staff counter
-- Run 169 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pos_self_sessions';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS pos_self_sessions (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    station_id    BIGINT UNSIGNED NOT NULL,
    session_code  VARCHAR(10) NOT NULL,
    pay           VARCHAR(8) NOT NULL,                      -- screen | counter
    voucher_id    BIGINT UNSIGNED NULL,                     -- screen: the order waiting for the payment (it becomes the Cash Sale)
    hold_id       BIGINT UNSIGNED NULL,                     -- counter: the held basket a cashier recalls
    status        VARCHAR(10) NOT NULL DEFAULT 'pending',   -- pending | paid | cancelled
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_pos_self_code (session_code),
    KEY idx_pos_self_station (station_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK AFTER
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pos_self_sessions';
