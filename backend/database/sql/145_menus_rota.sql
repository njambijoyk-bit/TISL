-- =====================================================================
-- 145_menus_rota.sql
-- Menus module, step 12 (docs/MENUS_PLAN.md): chef rotas and days off.
--   menus_shifts     a chef working a part of a day at a branch (and a station): draft until the week is published, then the chef is told
--   menus_days_off   a chef's leave, sick days or days off: requested (by the chef) or recorded (by a manager), approved or declined
-- Run 132 to 144 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_shifts', 'menus_days_off');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_shifts (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    chef_id      BIGINT UNSIGNED NOT NULL,
    location_id  BIGINT UNSIGNED NOT NULL,                      -- the branch the chef works at
    station_id   BIGINT UNSIGNED NULL,                          -- the station, if the shift is for one
    shift_date   DATE NOT NULL,
    starts_at    TIME NOT NULL,
    ends_at      TIME NOT NULL,                                 -- later than starts_at, the same day
    status       VARCHAR(10) NOT NULL DEFAULT 'draft',          -- draft | published
    note         VARCHAR(200) NULL,
    published_at DATETIME NULL,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_menus_shifts_day (shift_date, location_id),
    KEY idx_menus_shifts_chef (chef_id, shift_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_days_off (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    chef_id       BIGINT UNSIGNED NOT NULL,
    from_date     DATE NOT NULL,
    to_date       DATE NOT NULL,
    kind          VARCHAR(10) NOT NULL DEFAULT 'off',           -- leave | sick | off | other
    reason        VARCHAR(300) NULL,
    status        VARCHAR(10) NOT NULL DEFAULT 'requested',     -- requested | approved | declined | cancelled
    requested_by  BIGINT UNSIGNED NULL,
    decided_by    BIGINT UNSIGNED NULL,
    decided_at    DATETIME NULL,
    decision_note VARCHAR(300) NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_menus_days_off_chef (chef_id, from_date, to_date),
    KEY idx_menus_days_off_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_shifts', 'menus_days_off');
