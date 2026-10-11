-- =====================================================================
-- 148_menus_rota_pay.sql
-- Menus module, step 15: shift premiums, overtime approval and clocking in by place (docs/MENUS_PLAN.md).
--   menus_premiums      a premium rule: night hours, weekend days or public holidays pay an extra percentage (and/or an amount) per hour worked
--   menus_holidays      the public holidays (a day, a name, for every branch or one)
--   menus_overtime      a chef's overtime for a day, waiting for a manager to approve before payroll pays it
--   menus_clock_sites   where a branch is for clocking in: the point (empty = the branch's own address point) and how far from it counts as there
--   menus_clock_events  every clock in and out from the rota page: who, when, where, how far from the branch, and what was decided
-- Run 147 first. Safe to re-run. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_premiums', 'menus_holidays', 'menus_overtime', 'menus_clock_sites', 'menus_clock_events');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS menus_premiums (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(80) NOT NULL,
    kind           VARCHAR(8) NOT NULL,                         -- night | weekend | holiday
    starts_at      TIME NULL,                                   -- night: from (may be later than until: it runs past midnight)
    ends_at        TIME NULL,                                   -- night: until
    weekdays       VARCHAR(20) NULL,                            -- weekend: 1 Monday ... 7 Sunday, comma separated (6,7)
    extra_pct      DECIMAL(6,2) NOT NULL DEFAULT 0,             -- on top of the hourly rate: 25 = a quarter more
    flat_per_hour  DECIMAL(12,2) NOT NULL DEFAULT 0,            -- or a fixed amount for each hour (both may be set)
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_by     BIGINT UNSIGNED NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_holidays (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    holiday_date  DATE NOT NULL,
    name          VARCHAR(80) NOT NULL,
    location_id   BIGINT UNSIGNED NULL,                         -- empty = every branch
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_menus_holidays_day (holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_overtime (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    chef_id     BIGINT UNSIGNED NOT NULL,
    work_date   DATE NOT NULL,
    minutes     INT NOT NULL,                                   -- the overtime worked that day, as worked out from the rota or attendance
    status      VARCHAR(10) NOT NULL DEFAULT 'pending',         -- pending | approved | rejected
    note        VARCHAR(300) NULL,
    decided_by  BIGINT UNSIGNED NULL,
    decided_at  DATETIME NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_menus_overtime_day (chef_id, work_date),
    KEY idx_menus_overtime_status (status, work_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_clock_sites (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    location_id  BIGINT UNSIGNED NOT NULL,
    latitude     DECIMAL(10,7) NULL,                            -- empty = use the branch's own point (Locations)
    longitude    DECIMAL(10,7) NULL,
    radius_m     SMALLINT UNSIGNED NOT NULL DEFAULT 150,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_menus_clock_sites (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS menus_clock_events (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id     BIGINT UNSIGNED NOT NULL,
    chef_id     BIGINT UNSIGNED NULL,
    shift_id    BIGINT UNSIGNED NULL,
    location_id BIGINT UNSIGNED NULL,
    action      VARCHAR(4) NOT NULL,                            -- in | out
    latitude    DECIMAL(10,7) NULL,
    longitude   DECIMAL(10,7) NULL,
    accuracy_m  INT NULL,
    distance_m  INT NULL,                                       -- from the branch point, when it could be worked out
    result      VARCHAR(12) NOT NULL,                           -- ok | outside | warned | no_position | poor_signal | no_site
    created_at  TIMESTAMP NULL,
    KEY idx_menus_clock_events_day (created_at),
    KEY idx_menus_clock_events_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('menus_premiums', 'menus_holidays', 'menus_overtime', 'menus_clock_sites', 'menus_clock_events');
