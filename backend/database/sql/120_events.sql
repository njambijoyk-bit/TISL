-- =====================================================================
-- 120_events.sql
-- Events (ticketed): events, their sessions, ticket types, tickets, door check-ins, refund requests and settings.
--   events                   the event: what, where, when it is on sale, refund cut-off
--   event_sessions           one row per date/time (a single-date event has one; multi-day or recurring have many)
--   event_ticket_types       General, VIP, Early bird, Free RSVP...: price, how many, when on sale, per-order limits
--   event_ticket_type_sessions  which sessions a ticket type admits to (none listed = every session)
--   event_tickets            one admission: held while unpaid, valid once paid, cancelled / released otherwise
--   event_checkins           every scan at the door (also the refused ones), per ticket and session
--   event_refund_requests    a buyer asks for money back; staff approve or decline
--   event_settings           one row: default sales ledger, how long seats are held, wording
-- Safe to re-run: every table is CREATE IF NOT EXISTS. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK (which of the new tables exist now; none on a first run)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('events', 'event_sessions', 'event_ticket_types', 'event_ticket_type_sessions', 'event_tickets', 'event_checkins', 'event_refund_requests', 'event_settings');

-- PART B - CREATE
CREATE TABLE IF NOT EXISTS events (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    title             VARCHAR(200) NOT NULL,
    slug              VARCHAR(220) NOT NULL,
    summary           VARCHAR(300) NULL,
    description       TEXT NULL,
    kind              VARCHAR(10) NOT NULL DEFAULT 'in_person',         -- in_person | online | hybrid
    venue_name        VARCHAR(200) NULL,
    venue_address     VARCHAR(300) NULL,
    map_url           VARCHAR(500) NULL,
    online_url        VARCHAR(500) NULL,                                 -- the join link: shown only to ticket holders
    organiser         VARCHAR(160) NULL,
    main_image        VARCHAR(500) NULL,
    video_url         VARCHAR(500) NULL,
    status            VARCHAR(12) NOT NULL DEFAULT 'draft',              -- draft | published | cancelled | postponed
    is_listed         TINYINT(1) NOT NULL DEFAULT 1,                     -- shown in the events list (off = only people with the link)
    currency_id       BIGINT UNSIGNED NULL,
    sales_ledger_id   BIGINT UNSIGNED NULL,                              -- where ticket sales are booked (default: the setting)
    tax_rate_id       BIGINT UNSIGNED NULL,
    location_id       BIGINT UNSIGNED NULL,                              -- the branch that runs it
    max_per_order     SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    refund_until      DATETIME NULL,                                     -- after this a buyer can no longer ask for a refund (null = never)
    refund_policy     TEXT NULL,
    allow_name_change TINYINT(1) NOT NULL DEFAULT 1,
    published_at      DATETIME NULL,
    created_by        BIGINT UNSIGNED NULL,
    updated_by        BIGINT UNSIGNED NULL,
    deleted_at        TIMESTAMP NULL,
    created_at        TIMESTAMP NULL,
    updated_at        TIMESTAMP NULL,
    UNIQUE KEY uq_events_slug (slug),
    KEY idx_events_status (status, is_listed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_sessions (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id      BIGINT UNSIGNED NOT NULL,
    label         VARCHAR(120) NULL,
    starts_at     DATETIME NOT NULL,
    ends_at       DATETIME NULL,
    capacity      INT UNSIGNED NULL,                                     -- the most people in this session (null = no limit beyond the ticket types)
    is_cancelled  TINYINT(1) NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_event_sessions_event (event_id, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_ticket_types (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id        BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(120) NOT NULL,
    description     VARCHAR(500) NULL,
    price           DECIMAL(12,2) NOT NULL DEFAULT 0,                    -- 0 = free (RSVP)
    capacity        INT UNSIGNED NULL,                                   -- how many can be sold (null = unlimited)
    min_per_order   SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    max_per_order   SMALLINT UNSIGNED NULL,                              -- null = the event's limit
    sale_starts_at  DATETIME NULL,
    sale_ends_at    DATETIME NULL,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    deleted_at      TIMESTAMP NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_event_ticket_types_event (event_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_ticket_type_sessions (
    ticket_type_id  BIGINT UNSIGNED NOT NULL,
    session_id      BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (ticket_type_id, session_id),
    KEY idx_ettt_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_tickets (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id        BIGINT UNSIGNED NOT NULL,
    ticket_type_id  BIGINT UNSIGNED NOT NULL,
    reference       VARCHAR(12) NOT NULL,                                -- short code a person can read out
    state           VARCHAR(12) NOT NULL DEFAULT 'held',                 -- held | valid | cancelled | released
    held_until      DATETIME NULL,
    order_id        BIGINT UNSIGNED NULL,                                -- the Sales Order the purchase made
    sale_id         BIGINT UNSIGNED NULL,                                -- what it became when paid (Cash Sale)
    customer_id     BIGINT UNSIGNED NULL,
    buyer_name      VARCHAR(160) NULL,
    buyer_email     VARCHAR(190) NULL,
    buyer_phone     VARCHAR(40) NULL,
    holder_name     VARCHAR(160) NULL,
    price           DECIMAL(12,2) NOT NULL DEFAULT 0,                    -- what it cost, in the event's currency
    issued_at       DATETIME NULL,
    cancelled_at    DATETIME NULL,
    cancel_reason   VARCHAR(200) NULL,
    sold_by         BIGINT UNSIGNED NULL,                                -- staff who sold it at the box office
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_event_tickets_reference (reference),
    KEY idx_event_tickets_event (event_id, state),
    KEY idx_event_tickets_type (ticket_type_id, state),
    KEY idx_event_tickets_order (order_id),
    KEY idx_event_tickets_buyer (buyer_email),
    KEY idx_event_tickets_held (state, held_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_checkins (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id      BIGINT UNSIGNED NOT NULL,
    ticket_id     BIGINT UNSIGNED NULL,
    session_id    BIGINT UNSIGNED NULL,
    result        VARCHAR(16) NOT NULL,                                  -- ok | already | wrong_event | wrong_session | not_valid | not_found | manual
    code_text     VARCHAR(120) NULL,
    checked_by    BIGINT UNSIGNED NULL,
    note          VARCHAR(200) NULL,
    created_at    TIMESTAMP NULL,
    updated_at    TIMESTAMP NULL,
    KEY idx_event_checkins_ticket (ticket_id, session_id),
    KEY idx_event_checkins_event (event_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_refund_requests (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    event_id        BIGINT UNSIGNED NOT NULL,
    ticket_id       BIGINT UNSIGNED NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'pending',              -- pending | approved | declined
    reason          VARCHAR(300) NULL,
    amount          DECIMAL(12,2) NOT NULL DEFAULT 0,
    requested_by    VARCHAR(190) NULL,
    decided_by      BIGINT UNSIGNED NULL,
    decided_at      DATETIME NULL,
    decision_note   VARCHAR(300) NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    KEY idx_event_refunds_event (event_id, status),
    KEY idx_event_refunds_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS event_settings (
    id          TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    settings    JSON NULL,
    updated_by  BIGINT UNSIGNED NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- PART C - CHECK (expect 8 rows)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('events', 'event_sessions', 'event_ticket_types', 'event_ticket_type_sessions', 'event_tickets', 'event_checkins', 'event_refund_requests', 'event_settings');
