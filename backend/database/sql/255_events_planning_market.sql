-- 255: events phases 2 to 6 - commissioning (enquiries), the planning workspace, guests and RSVPs, advertising, and vendor / venue bookings.
-- Run after 253 and 254. Safe to run twice.

-- ── PART A - commissioning: a customer asks TISL to plan an event ─────────────
CREATE TABLE IF NOT EXISTS event_enquiries (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reference      VARCHAR(16) NOT NULL,
    customer_id    BIGINT UNSIGNED NULL,
    user_id        BIGINT UNSIGNED NULL,
    name           VARCHAR(160) NOT NULL,
    email          VARCHAR(190) NULL,
    phone          VARCHAR(40) NULL,
    event_type     VARCHAR(80) NOT NULL,
    category_id    BIGINT UNSIGNED NULL,
    event_date     DATE NULL,
    guests         INT UNSIGNED NULL,
    budget_min     DECIMAL(14,2) NULL,
    budget_max     DECIMAL(14,2) NULL,
    location       VARCHAR(200) NULL,
    notes          TEXT NULL,
    consultation_at DATETIME NULL,
    status         VARCHAR(12) NOT NULL DEFAULT 'new',      -- new | consulting | quoted | accepted | declined | closed
    quotation_id   BIGINT UNSIGNED NULL,
    order_id       BIGINT UNSIGNED NULL,
    invoice_id     BIGINT UNSIGNED NULL,
    event_id       BIGINT UNSIGNED NULL,                    -- the event project, once accepted
    assigned_to    BIGINT UNSIGNED NULL,
    admin_notes    TEXT NULL,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_enquiries_ref (reference),
    KEY idx_event_enquiries_status (status, created_at),
    KEY idx_event_enquiries_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PART B - the planning workspace ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_tasks (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id      BIGINT UNSIGNED NOT NULL,
    parent_id     BIGINT UNSIGNED NULL,
    depends_on_id BIGINT UNSIGNED NULL,
    title         VARCHAR(200) NOT NULL,
    notes         TEXT NULL,
    department    VARCHAR(60) NULL,
    assignee_id   BIGINT UNSIGNED NULL,
    priority      VARCHAR(8) NOT NULL DEFAULT 'normal',     -- low | normal | high | urgent
    status        VARCHAR(12) NOT NULL DEFAULT 'todo',      -- todo | doing | review | done | blocked | on_hold | cancelled
    starts_on     DATE NULL,
    due_on        DATE NULL,
    effort_hours  DECIMAL(6,2) NULL,
    evidence      VARCHAR(300) NULL,
    client_visible TINYINT(1) NOT NULL DEFAULT 0,
    sort_order    INT NOT NULL DEFAULT 0,
    completed_at  DATETIME NULL,
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_event_tasks_event (event_id, status, due_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_task_comments (
    id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    task_id    BIGINT UNSIGNED NOT NULL,
    user_id    BIGINT UNSIGNED NULL,
    body       VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_event_task_comments (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_milestones (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id    BIGINT UNSIGNED NOT NULL,
    title       VARCHAR(160) NOT NULL,
    due_on      DATE NULL,
    done_at     DATETIME NULL,
    client_visible TINYINT(1) NOT NULL DEFAULT 1,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_event_milestones_event (event_id, due_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_programme (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id      BIGINT UNSIGNED NOT NULL,
    day_on        DATE NULL,
    starts_at     VARCHAR(5) NULL,                         -- 14:30
    ends_at       VARCHAR(5) NULL,
    title         VARCHAR(200) NOT NULL,
    location      VARCHAR(160) NULL,
    responsible   VARCHAR(160) NULL,
    equipment     VARCHAR(300) NULL,
    notes         VARCHAR(500) NULL,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_event_programme_event (event_id, day_on, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_budget_lines (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id    BIGINT UNSIGNED NOT NULL,
    category    VARCHAR(80) NOT NULL,
    item        VARCHAR(200) NOT NULL,
    supplier    VARCHAR(160) NULL,
    booking_id  BIGINT UNSIGNED NULL,                      -- a vendor / venue booking that fills it
    estimated   DECIMAL(14,2) NOT NULL DEFAULT 0,
    approved    DECIMAL(14,2) NOT NULL DEFAULT 0,
    committed   DECIMAL(14,2) NOT NULL DEFAULT 0,
    actual      DECIMAL(14,2) NOT NULL DEFAULT 0,
    notes       VARCHAR(300) NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_event_budget_event (event_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_team (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id     BIGINT UNSIGNED NOT NULL,
    user_id      BIGINT UNSIGNED NULL,
    name         VARCHAR(160) NOT NULL,
    role         VARCHAR(80) NOT NULL,                     -- coordinator, photographer, usher ...
    phone        VARCHAR(40) NULL,
    sees_budget  TINYINT(1) NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_event_team_event (event_id),
    KEY idx_event_team_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_templates (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name        VARCHAR(120) NOT NULL,
    category_id BIGINT UNSIGNED NULL,
    description VARCHAR(300) NULL,
    body        JSON NOT NULL,                             -- {tasks:[{title,department,priority,offset_days}], milestones:[{title,offset_days}], budget:[{category,item}], programme:[{starts_at,title}], team:[{role}]}
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_templates_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PART C - guests and RSVPs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_guests (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id    BIGINT UNSIGNED NOT NULL,
    token       CHAR(24) NOT NULL,
    name        VARCHAR(160) NOT NULL,
    email       VARCHAR(190) NULL,
    phone       VARCHAR(40) NULL,
    role        VARCHAR(12) NOT NULL DEFAULT 'guest',      -- guest | speaker | performer | sponsor | vendor | staff | volunteer
    group_name  VARCHAR(80) NULL,
    table_label VARCHAR(40) NULL,
    plus_ones   SMALLINT UNSIGNED NOT NULL DEFAULT 0,      -- how many more they may bring
    rsvp        VARCHAR(8) NOT NULL DEFAULT 'pending',     -- pending | yes | no | maybe
    attending   SMALLINT UNSIGNED NOT NULL DEFAULT 0,      -- people coming, including them
    meal        VARCHAR(80) NULL,
    needs       VARCHAR(300) NULL,
    note        VARCHAR(300) NULL,
    invited_at  DATETIME NULL,
    reminded_at DATETIME NULL,
    reminders   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    responded_at DATETIME NULL,
    checked_in_at DATETIME NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_guests_token (token),
    KEY idx_event_guests_event (event_id, rsvp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_guest_history (
    id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    guest_id  BIGINT UNSIGNED NOT NULL,
    rsvp      VARCHAR(8) NOT NULL,
    attending SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_event_guest_history (guest_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PART D - advertising ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_ad_products (
    id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name           VARCHAR(120) NOT NULL,
    kind           VARCHAR(12) NOT NULL,                   -- featured | banner | category | search | newsletter
    description    VARCHAR(300) NULL,
    price          DECIMAL(14,2) NOT NULL DEFAULT 0,
    duration_days  SMALLINT UNSIGNED NOT NULL DEFAULT 7,
    max_slots      SMALLINT UNSIGNED NOT NULL DEFAULT 5,   -- running at the same time
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    created_at     TIMESTAMP NULL,
    updated_at     TIMESTAMP NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_ad_campaigns (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_id     BIGINT UNSIGNED NOT NULL,
    product_id   BIGINT UNSIGNED NOT NULL,
    category_id  BIGINT UNSIGNED NULL,                     -- for a category promotion
    requested_by BIGINT UNSIGNED NULL,
    starts_on    DATE NOT NULL,
    ends_on      DATE NOT NULL,
    amount       DECIMAL(14,2) NOT NULL DEFAULT 0,
    status       VARCHAR(10) NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | cancelled
    note         VARCHAR(300) NULL,
    invoice_id   BIGINT UNSIGNED NULL,
    impressions  INT UNSIGNED NOT NULL DEFAULT 0,
    clicks       INT UNSIGNED NOT NULL DEFAULT 0,
    registrations INT UNSIGNED NOT NULL DEFAULT 0,
    created_at   TIMESTAMP NULL,
    updated_at   TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_event_ads_run (status, starts_on, ends_on),
    KEY idx_event_ads_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PART E - vendor / venue bookings, money held for them, reviews, availability ──
CREATE TABLE IF NOT EXISTS event_bookings (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    reference     VARCHAR(16) NOT NULL,
    event_id      BIGINT UNSIGNED NOT NULL,
    provider_type VARCHAR(8) NOT NULL,                     -- vendor | venue
    provider_id   BIGINT UNSIGNED NOT NULL,
    offer_id      BIGINT UNSIGNED NULL,                    -- package or space
    requested_by  BIGINT UNSIGNED NULL,
    starts_on     DATE NOT NULL,
    ends_on       DATE NULL,
    guests        INT UNSIGNED NULL,
    message       VARCHAR(1000) NULL,
    quoted_amount DECIMAL(14,2) NULL,
    deposit_percent DECIMAL(5,2) NULL,
    commission_percent DECIMAL(5,2) NULL,
    status        VARCHAR(12) NOT NULL DEFAULT 'enquiry',  -- enquiry | quoted | accepted | confirmed | delivered | completed | declined | cancelled
    provider_note VARCHAR(500) NULL,
    cancel_reason VARCHAR(300) NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_bookings_ref (reference),
    KEY idx_event_bookings_provider (provider_type, provider_id, status, starts_on),
    KEY idx_event_bookings_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_provider_ledger (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider_type VARCHAR(8) NOT NULL,
    provider_id   BIGINT UNSIGNED NOT NULL,
    booking_id    BIGINT UNSIGNED NULL,
    kind          VARCHAR(12) NOT NULL,                    -- payment | commission | refund | payout
    amount        DECIMAL(14,2) NOT NULL,                  -- change in what is owed to the provider (+ owed, - kept or paid)
    voucher_id    BIGINT UNSIGNED NULL,
    reference     VARCHAR(120) NULL,
    note          VARCHAR(300) NULL,
    created_by    BIGINT UNSIGNED NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY idx_event_provider_ledger (provider_type, provider_id, created_at),
    KEY idx_event_provider_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_reviews (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    booking_id    BIGINT UNSIGNED NOT NULL,
    provider_type VARCHAR(8) NOT NULL,
    provider_id   BIGINT UNSIGNED NOT NULL,
    user_id       BIGINT UNSIGNED NULL,
    rating        TINYINT UNSIGNED NOT NULL,
    comment       VARCHAR(1000) NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_reviews_booking (booking_id),
    KEY idx_event_reviews_provider (provider_type, provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_blocked_dates (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider_type VARCHAR(8) NOT NULL,
    provider_id   BIGINT UNSIGNED NOT NULL,
    day_on        DATE NOT NULL,
    note          VARCHAR(120) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_blocked (provider_type, provider_id, day_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── PART F - columns on events ────────────────────────────────────────────────
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER $$
CREATE PROCEDURE add_column_if_missing(IN t VARCHAR(64), IN c VARCHAR(64), IN def VARCHAR(255))
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = t AND column_name = c) THEN
        SET @s = CONCAT('ALTER TABLE `', t, '` ADD COLUMN `', c, '` ', def);
        PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
    END IF;
END$$
DELIMITER ;
CALL add_column_if_missing('events', 'enquiry_id',   'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('events', 'initiative_id', 'BIGINT UNSIGNED NULL');
CALL add_column_if_missing('events', 'is_project',   'TINYINT(1) NOT NULL DEFAULT 0');
DROP PROCEDURE IF EXISTS add_column_if_missing;

-- PART G - CHECKS
-- G1. Expect 16 rows.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('event_enquiries', 'event_tasks', 'event_task_comments', 'event_milestones', 'event_programme', 'event_budget_lines', 'event_team', 'event_templates', 'event_guests', 'event_guest_history', 'event_ad_products', 'event_ad_campaigns', 'event_bookings', 'event_provider_ledger', 'event_reviews', 'event_blocked_dates');
-- G2. Expect 3 rows.
SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'events' AND column_name IN ('enquiry_id', 'initiative_id', 'is_project');
