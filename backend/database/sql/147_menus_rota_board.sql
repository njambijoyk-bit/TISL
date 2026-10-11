-- =====================================================================
-- 147_menus_rota_board.sql
-- Menus module, step 14: the open shift board (docs/MENUS_PLAN.md). Pay from the rota and clocking in from the rota page need no tables.
--   menus_open_shifts   a shift nobody holds yet, or one a chef gave back: any chef who is free may claim it
--   menus_open_claims   a chef's claim on an open shift; a manager awards one (or claims go straight through, by a setting)
-- Run 146 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_open_shifts', 'menus_open_claims');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_open_shifts (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    location_id       BIGINT UNSIGNED NOT NULL,
    station_id        BIGINT UNSIGNED NULL,
    shift_date        DATE NOT NULL,
    starts_at         TIME NOT NULL,
    ends_at           TIME NOT NULL,
    note              VARCHAR(200) NULL,
    status            VARCHAR(10) NOT NULL DEFAULT 'open',      -- open | filled | cancelled | expired
    release_shift_id  BIGINT UNSIGNED NULL,                     -- a chef gave this shift back: it is theirs until someone else takes it
    filled_shift_id   BIGINT UNSIGNED NULL,
    filled_chef_id    BIGINT UNSIGNED NULL,
    created_by        BIGINT UNSIGNED NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_menus_open_shifts_day (status, shift_date, location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_open_claims (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    open_id     BIGINT UNSIGNED NOT NULL,
    chef_id     BIGINT UNSIGNED NOT NULL,
    note        VARCHAR(200) NULL,
    status      VARCHAR(10) NOT NULL DEFAULT 'requested',        -- requested | awarded | declined | withdrawn
    decided_by  BIGINT UNSIGNED NULL,
    decided_at  DATETIME NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_open_claims (open_id, chef_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_open_shifts', 'menus_open_claims');
