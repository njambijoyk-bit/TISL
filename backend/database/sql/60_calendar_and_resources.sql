-- =====================================================================
-- 60_calendar_and_resources.sql
-- The staff calendar and the things that can be booked.
--   calendar_entries     one row per thing on someone's calendar (a booking, task, milestone, project end, block…), pointing back to what it is;
--                        visibility says who may see it: staff (the owner), team (managers and the team), customer (the customer too)
--   bookable_resources   a staff member, room, table or piece of equipment that can be booked (capacity, branch, buffers)
--   resource_hours       its weekly working hours (several rows a day allowed)
--   resource_time_off    time it is not available (leave, a blocked day)
--   resource_services    which services (or one package) a resource can do
--   calendar_tokens      each staff member's secret link for subscribing in Google, Outlook or Apple Calendar
-- Run in Workbench. Safe to re-run.
-- =====================================================================

-- PART A — READ-ONLY CHECK (expect 0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('calendar_entries', 'bookable_resources', 'resource_hours', 'resource_time_off', 'resource_services', 'calendar_tokens');

-- PART B — CREATE (DDL, commits on its own)
CREATE TABLE IF NOT EXISTS bookable_resources (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type              VARCHAR(20) NOT NULL DEFAULT 'staff',      -- staff | room | table | equipment
    user_id           BIGINT UNSIGNED NULL,                       -- the person, for staff
    name              VARCHAR(120) NOT NULL,
    location_id       BIGINT UNSIGNED NULL,                       -- the branch it is at
    capacity          INT NOT NULL DEFAULT 1,                     -- how many bookings (or people) at the same time
    buffer_before_min INT NOT NULL DEFAULT 0,
    buffer_after_min  INT NOT NULL DEFAULT 0,
    is_active         TINYINT(1) NOT NULL DEFAULT 1,
    notes             VARCHAR(255) NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    KEY idx_resource_user (user_id),
    KEY idx_resource_type (type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resource_hours (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    resource_id BIGINT UNSIGNED NOT NULL,
    weekday     TINYINT NOT NULL,                                 -- 0 = Sunday … 6 = Saturday
    starts_at   TIME NOT NULL,
    ends_at     TIME NOT NULL,
    KEY idx_hours_resource (resource_id, weekday)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resource_time_off (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    resource_id BIGINT UNSIGNED NOT NULL,
    starts_at   DATETIME NOT NULL,
    ends_at     DATETIME NOT NULL,
    reason      VARCHAR(160) NULL,
    created_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_off_resource (resource_id, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS resource_services (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    resource_id        BIGINT UNSIGNED NOT NULL,
    service_id         BIGINT UNSIGNED NOT NULL,
    service_variant_id BIGINT UNSIGNED NULL,                      -- empty = every package of the service
    UNIQUE KEY uq_resource_service (resource_id, service_id, service_variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS calendar_entries (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id      BIGINT UNSIGNED NULL,                            -- whose calendar (a staff member); empty for a room's own entry
    resource_id  BIGINT UNSIGNED NULL,                            -- the bookable resource it occupies
    source_type  VARCHAR(40) NOT NULL,                            -- booking | task | milestone | project | block | verification …
    source_id    BIGINT UNSIGNED NOT NULL DEFAULT 0,
    kind         VARCHAR(30) NOT NULL,                            -- what to colour it as
    title        VARCHAR(200) NOT NULL,
    starts_at    DATETIME NOT NULL,
    ends_at      DATETIME NULL,
    all_day      TINYINT(1) NOT NULL DEFAULT 0,
    location_id  BIGINT UNSIGNED NULL,
    customer_id  BIGINT UNSIGNED NULL,
    status       VARCHAR(30) NULL,
    visibility   VARCHAR(10) NOT NULL DEFAULT 'staff',            -- staff | team | customer
    url          VARCHAR(200) NULL,                               -- where the entry opens
    meta         JSON NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_entry_source (source_type, source_id, user_id, resource_id),
    KEY idx_entry_user (user_id, starts_at),
    KEY idx_entry_resource (resource_id, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS calendar_tokens (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL,
    token      VARCHAR(64) NOT NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_token (token),
    UNIQUE KEY uq_token_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C — RESULT CHECK (expect 6 rows)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()
  AND table_name IN ('calendar_entries', 'bookable_resources', 'resource_hours', 'resource_time_off', 'resource_services', 'calendar_tokens') ORDER BY table_name;
