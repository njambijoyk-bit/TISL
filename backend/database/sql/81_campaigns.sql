-- =====================================================================
-- 81_campaigns.sql
-- The Campaigns module, first slice: campaigns, their page sections, the items they feature, and a small views/clicks log.
-- Nothing else is changed. Safe to re-run: each table is only created if it is missing.
-- Run in Workbench: Part A on its own (read-only), then Part B, then Part C.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Which of the four tables exist already? (4 rows = nothing more to do; fewer = run part B)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('campaigns', 'campaign_sections', 'campaign_items', 'campaign_events');

-- PART B - CHANGE (creates tables, commits on its own)
CREATE TABLE IF NOT EXISTS campaigns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(120) NOT NULL,                    -- lowercase letters, digits and dashes; the public address /campaigns/<slug>
    title VARCHAR(160) NOT NULL,
    subtitle VARCHAR(255) NULL,
    type VARCHAR(40) NOT NULL DEFAULT 'brand',     -- brand | awareness_sale (the others are planned and refused by the app)
    goal VARCHAR(30) NOT NULL DEFAULT 'reach',     -- reach | sales
    cover_media VARCHAR(500) NULL,                 -- a file path in storage
    accent_color VARCHAR(20) NULL,                 -- empty = the site colour
    teaser_at DATETIME NULL,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,                         -- empty = runs until archived
    early_access_at DATETIME NULL,
    audience_rule JSON NULL,                       -- empty = everyone
    early_access_audience JSON NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    published_at DATETIME NULL,
    is_paused TINYINT(1) NOT NULL DEFAULT 0,
    archived_at DATETIME NULL,
    feature_on_home TINYINT(1) NOT NULL DEFAULT 0,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'draft',   -- draft | pending | approved | rejected
    approved_by BIGINT UNSIGNED NULL,
    approved_at DATETIME NULL,
    rejected_note VARCHAR(500) NULL,
    created_by BIGINT UNSIGNED NULL,
    updated_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    UNIQUE KEY uq_campaigns_slug (slug),
    INDEX idx_campaigns_window (is_published, starts_at, ends_at),
    INDEX idx_campaigns_approval (approval_status)
);

CREATE TABLE IF NOT EXISTS campaign_sections (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    campaign_id BIGINT UNSIGNED NOT NULL,
    position INT NOT NULL DEFAULT 0,
    type VARCHAR(30) NOT NULL,                     -- hero | story | countdown | video | products | cta (more later)
    settings JSON NULL,
    show_from DATETIME NULL,
    show_until DATETIME NULL,
    audience_rule JSON NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    INDEX idx_campaign_sections_campaign (campaign_id, position)
);

CREATE TABLE IF NOT EXISTS campaign_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    campaign_id BIGINT UNSIGNED NOT NULL,
    section_id BIGINT UNSIGNED NULL,
    item_type VARCHAR(20) NOT NULL,                -- product | service | hamper | auction
    item_id BIGINT UNSIGNED NOT NULL,
    position INT NOT NULL DEFAULT 0,
    available_from DATETIME NULL,                  -- a coming-soon date for this item inside the campaign
    label_override VARCHAR(160) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    UNIQUE KEY uq_campaign_items (campaign_id, item_type, item_id),
    INDEX idx_campaign_items_section (section_id)
);

CREATE TABLE IF NOT EXISTS campaign_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    campaign_id BIGINT UNSIGNED NOT NULL,
    section_id BIGINT UNSIGNED NULL,
    event VARCHAR(20) NOT NULL,                    -- view | click | item_click
    user_id BIGINT UNSIGNED NULL,
    session_key CHAR(40) NULL,                     -- hashed, so a visit can be counted once without storing who it was
    created_at TIMESTAMP NULL,
    INDEX idx_campaign_events (campaign_id, event, created_at)
);

-- PART C - RESULT CHECK. Expect 4 rows from the first query and 0 campaigns.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('campaigns', 'campaign_sections', 'campaign_items', 'campaign_events');
SELECT COUNT(*) AS campaigns FROM campaigns;
