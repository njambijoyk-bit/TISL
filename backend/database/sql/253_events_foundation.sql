-- =====================================================================
-- 253_events_foundation.sql
-- Events, phase 1 (docs/EVENTS_EMS_PLAN.md): the foundation for outside organisers, categories, a media gallery and the vendor / venue marketplace. Run script 120 first.
--   event_categories       the hierarchy of kinds of event (weddings, conferences...), managed by admin
--   event_organisers       who owns events: TISL itself (is_internal) and outside organisers, each with a verification status and a commission rate
--   event_organiser_members  the people who act for an organiser, and their role in it
--   event_documents        proof submitted for verification (organiser, vendor or venue), reviewed by admin
--   event_media            images, videos, embeds and documents on an event, organiser, vendor or venue; public or private
--   event_vendors, event_vendor_packages   a supplier's business profile and what it sells (menus, decor, photography...)
--   event_venues, event_venue_spaces       a venue's profile and its halls or spaces
--   event_provider_members the people who act for a vendor or a venue
--   events (new columns)   category, organiser, client, manager, participation model, approval and registration status, audience, venue
-- Existing events become TISL's own, already approved. Nothing is removed. Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECKS. Run first, on their own.
-- A1. Which of the new tables exist? (0 rows on the first run)
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('event_categories', 'event_organisers', 'event_organiser_members', 'event_documents', 'event_media', 'event_vendors', 'event_vendor_packages', 'event_venues', 'event_venue_spaces', 'event_provider_members');
-- A2. Which of the new events columns exist? (0 rows on the first run)
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'events' AND column_name IN ('category_id', 'organiser_id', 'client_customer_id', 'manager_user_id', 'participation', 'approval_status', 'registration_status', 'age_min', 'languages', 'accessibility', 'venue_id', 'venue_space_id');

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS event_categories (
    id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    parent_id             BIGINT UNSIGNED NULL,
    name                  VARCHAR(120) NOT NULL,
    slug                  VARCHAR(140) NOT NULL,
    icon                  VARCHAR(40) NULL,
    description           VARCHAR(300) NULL,
    cover_image           VARCHAR(500) NULL,
    default_participation VARCHAR(12) NULL,              -- free | paid | invitation | rsvp | approval | donation | members
    sort_order            INT NOT NULL DEFAULT 0,
    is_active             TINYINT(1) NOT NULL DEFAULT 1,
    created_at            TIMESTAMP NULL,
    updated_at            TIMESTAMP NULL,
    UNIQUE KEY uq_event_categories_slug (slug),
    KEY idx_event_categories_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_organisers (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name               VARCHAR(160) NOT NULL,
    slug               VARCHAR(180) NOT NULL,
    kind               VARCHAR(12) NOT NULL DEFAULT 'business',    -- business | individual | company
    email              VARCHAR(160) NULL,
    phone              VARCHAR(40) NULL,
    website            VARCHAR(300) NULL,
    logo               VARCHAR(500) NULL,
    description        TEXT NULL,
    tax_pin            VARCHAR(40) NULL,
    registration_no    VARCHAR(60) NULL,
    status             VARCHAR(12) NOT NULL DEFAULT 'pending',     -- pending | verified | suspended | rejected
    status_note        VARCHAR(300) NULL,
    verified_at        DATETIME NULL,
    verified_by        BIGINT UNSIGNED NULL,
    commission_percent DECIMAL(5,2) NULL,                          -- empty = the company's default (Events settings)
    is_internal        TINYINT(1) NOT NULL DEFAULT 0,              -- TISL itself: never needs verification or approval
    created_by         BIGINT UNSIGNED NULL,
    deleted_at         TIMESTAMP NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    UNIQUE KEY uq_event_organisers_slug (slug),
    KEY idx_event_organisers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_organiser_members (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    organiser_id BIGINT UNSIGNED NOT NULL,
    user_id      BIGINT UNSIGNED NOT NULL,
    role         VARCHAR(12) NOT NULL DEFAULT 'staff',             -- owner | manager | finance | door | staff
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uq_event_organiser_members (organiser_id, user_id),
    KEY idx_event_organiser_members_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_documents (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_type  VARCHAR(12) NOT NULL,                              -- organiser | vendor | venue
    owner_id    BIGINT UNSIGNED NOT NULL,
    type        VARCHAR(40) NOT NULL,                              -- national_id | business_registration | tax_pin | licence | other
    title       VARCHAR(160) NULL,
    path        VARCHAR(500) NOT NULL,
    status      VARCHAR(10) NOT NULL DEFAULT 'pending',            -- pending | accepted | rejected
    note        VARCHAR(300) NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    reviewed_at DATETIME NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_event_documents_owner (owner_type, owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_media (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_type   VARCHAR(12) NOT NULL,                             -- event | organiser | vendor | venue | package | space
    owner_id     BIGINT UNSIGNED NOT NULL,
    kind         VARCHAR(10) NOT NULL DEFAULT 'image',             -- image | video | embed | document
    role         VARCHAR(16) NOT NULL DEFAULT 'gallery',           -- cover | logo | poster | gallery | floor_plan | contract | other
    path         VARCHAR(500) NULL,                                -- a file we hold
    url          VARCHAR(500) NULL,                                -- an address outside (YouTube, Vimeo) for embeds
    title        VARCHAR(160) NULL,
    caption      VARCHAR(300) NULL,
    visibility   VARCHAR(8) NOT NULL DEFAULT 'public',             -- public | private (private is for the owner's team only: floor plans, contracts)
    mime         VARCHAR(80) NULL,
    size_bytes   BIGINT UNSIGNED NULL,
    sort_order   INT NOT NULL DEFAULT 0,
    created_by   BIGINT UNSIGNED NULL,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    KEY idx_event_media_owner (owner_type, owner_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_vendors (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name               VARCHAR(160) NOT NULL,
    slug               VARCHAR(180) NOT NULL,
    category           VARCHAR(30) NOT NULL DEFAULT 'other',       -- caterer | decorator | photographer | videographer | entertainer | equipment | transport | planner | florist | cake | other
    summary            VARCHAR(300) NULL,
    description        TEXT NULL,
    email              VARCHAR(160) NULL,
    phone              VARCHAR(40) NULL,
    website            VARCHAR(300) NULL,
    logo               VARCHAR(500) NULL,
    service_areas      JSON NULL,                                  -- counties / towns served
    tax_pin            VARCHAR(40) NULL,
    registration_no    VARCHAR(60) NULL,
    status             VARCHAR(12) NOT NULL DEFAULT 'pending',     -- pending | verified | suspended | rejected
    status_note        VARCHAR(300) NULL,
    verified_at        DATETIME NULL,
    verified_by        BIGINT UNSIGNED NULL,
    commission_percent DECIMAL(5,2) NULL,
    is_listed          TINYINT(1) NOT NULL DEFAULT 1,
    created_by         BIGINT UNSIGNED NULL,
    deleted_at         TIMESTAMP NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    UNIQUE KEY uq_event_vendors_slug (slug),
    KEY idx_event_vendors_status (status, is_listed, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_vendor_packages (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    vendor_id   BIGINT UNSIGNED NOT NULL,
    name        VARCHAR(160) NOT NULL,
    description TEXT NULL,
    price       DECIMAL(15,2) NOT NULL DEFAULT 0,
    price_unit  VARCHAR(10) NOT NULL DEFAULT 'fixed',              -- fixed | per_guest | per_hour | per_day
    currency_id BIGINT UNSIGNED NULL,
    min_guests  INT UNSIGNED NULL,
    max_guests  INT UNSIGNED NULL,
    inclusions  JSON NULL,
    deposit_percent DECIMAL(5,2) NULL,
    cancellation_policy TEXT NULL,
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    KEY idx_event_vendor_packages_vendor (vendor_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_venues (
    id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name               VARCHAR(160) NOT NULL,
    slug               VARCHAR(180) NOT NULL,
    summary            VARCHAR(300) NULL,
    description        TEXT NULL,
    country            VARCHAR(60) NULL,
    county             VARCHAR(80) NULL,
    town               VARCHAR(80) NULL,
    address            VARCHAR(300) NULL,
    latitude           DECIMAL(10,7) NULL,
    longitude          DECIMAL(10,7) NULL,
    map_url            VARCHAR(500) NULL,
    directions         TEXT NULL,
    parking            VARCHAR(300) NULL,
    accessibility      VARCHAR(300) NULL,
    facilities         JSON NULL,
    email              VARCHAR(160) NULL,
    phone              VARCHAR(40) NULL,
    website            VARCHAR(300) NULL,
    tax_pin            VARCHAR(40) NULL,
    registration_no    VARCHAR(60) NULL,
    status             VARCHAR(12) NOT NULL DEFAULT 'pending',
    status_note        VARCHAR(300) NULL,
    verified_at        DATETIME NULL,
    verified_by        BIGINT UNSIGNED NULL,
    commission_percent DECIMAL(5,2) NULL,
    is_listed          TINYINT(1) NOT NULL DEFAULT 1,
    created_by         BIGINT UNSIGNED NULL,
    deleted_at         TIMESTAMP NULL,
    created_at         TIMESTAMP NULL,
    updated_at         TIMESTAMP NULL,
    UNIQUE KEY uq_event_venues_slug (slug),
    KEY idx_event_venues_status (status, is_listed, county)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_venue_spaces (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    venue_id        BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(160) NOT NULL,
    description     TEXT NULL,
    capacity        INT UNSIGNED NULL,
    layouts         JSON NULL,                                     -- theatre, banquet, classroom, cocktail... with the capacity of each
    price           DECIMAL(15,2) NOT NULL DEFAULT 0,
    price_unit      VARCHAR(10) NOT NULL DEFAULT 'per_day',        -- fixed | per_hour | per_day
    currency_id     BIGINT UNSIGNED NULL,
    deposit_percent DECIMAL(5,2) NULL,
    cancellation_policy TEXT NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_event_venue_spaces_venue (venue_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_provider_members (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    provider_type VARCHAR(8) NOT NULL,                             -- vendor | venue
    provider_id   BIGINT UNSIGNED NOT NULL,
    user_id       BIGINT UNSIGNED NOT NULL,
    role          VARCHAR(12) NOT NULL DEFAULT 'staff',            -- owner | manager | staff
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    UNIQUE KEY uq_event_provider_members (provider_type, provider_id, user_id),
    KEY idx_event_provider_members_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN tbl VARCHAR(64), IN col VARCHAR(64), IN ddl TEXT)
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = tbl AND column_name = col) THEN
        SET @s = CONCAT('ALTER TABLE `', tbl, '` ADD COLUMN `', col, '` ', ddl);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_column_if_missing('events', 'category_id',         'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('events', 'organiser_id',        'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('events', 'client_customer_id',  'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('events', 'manager_user_id',     'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('events', 'participation',       "VARCHAR(12) NOT NULL DEFAULT 'paid'");
CALL add_column_if_missing('events', 'approval_status',     "VARCHAR(10) NOT NULL DEFAULT 'approved'");     -- draft | pending | approved | rejected
CALL add_column_if_missing('events', 'approval_note',       'VARCHAR(300) NULL');
CALL add_column_if_missing('events', 'registration_status', "VARCHAR(10) NOT NULL DEFAULT 'auto'");         -- auto (follows the ticket sale dates) | closed | waitlist
CALL add_column_if_missing('events', 'age_min',             'SMALLINT UNSIGNED NULL');
CALL add_column_if_missing('events', 'languages',           'VARCHAR(120) NULL');
CALL add_column_if_missing('events', 'accessibility',       'VARCHAR(300) NULL');
CALL add_column_if_missing('events', 'venue_id',            'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('events', 'venue_space_id',      'BIGINT UNSIGNED NULL');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- TISL itself as the first organiser (it never needs verification), and every existing event is its own
INSERT INTO event_organisers (name, slug, kind, status, is_internal, verified_at, created_at, updated_at)
SELECT 'TISL', 'tisl', 'company', 'verified', 1, NOW(), NOW(), NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM event_organisers WHERE is_internal = 1);
UPDATE events SET organiser_id = (SELECT id FROM event_organisers WHERE is_internal = 1 ORDER BY id LIMIT 1) WHERE id > 0 AND organiser_id IS NULL;

-- PART C - CHECKS
-- C1. Expect 10 rows.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('event_categories', 'event_organisers', 'event_organiser_members', 'event_documents', 'event_media', 'event_vendors', 'event_vendor_packages', 'event_venues', 'event_venue_spaces', 'event_provider_members');
-- C2. Expect 12 rows.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'events' AND column_name IN ('category_id', 'organiser_id', 'client_customer_id', 'manager_user_id', 'participation', 'approval_status', 'registration_status', 'age_min', 'languages', 'accessibility', 'venue_id', 'venue_space_id');
-- C3. Expect 0: no event without an organiser.
SELECT COUNT(*) AS events_without_organiser FROM events WHERE organiser_id IS NULL;
