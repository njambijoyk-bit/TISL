-- =====================================================================
-- 174_pos_help.sql
-- Point of sale: "Call for help" from a self-checkout screen.
--   pos_help_requests  a customer pressed Call for help at a station; staff at that branch see it on their till until someone marks it done
-- Run 169 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pos_help_requests';

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS pos_help_requests (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    station_id   BIGINT UNSIGNED NOT NULL,
    location_id  BIGINT UNSIGNED NOT NULL,
    status       VARCHAR(8) NOT NULL DEFAULT 'open',       -- open | done
    handled_by   BIGINT UNSIGNED NULL,
    handled_at   DATETIME NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_pos_help_open (location_id, status),
    KEY idx_pos_help_station (station_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK AFTER
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'pos_help_requests';
