-- =====================================================================
-- 83_campaign_pins_boards.sql
-- Campaigns, second slice: pins, boards, the pins on each board, moodboards, and who follows which board.
-- Nothing else is changed. Safe to re-run: each table is only created if it is missing.
-- Run in Workbench: Part A on its own (read-only), then Part B, then Part C.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Which of the five tables exist already? (5 rows = nothing more to do; fewer = run part B)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('campaign_pins', 'campaign_boards', 'campaign_board_pins', 'campaign_moodboards', 'campaign_board_follows');

-- PART B - CHANGE (creates tables, commits on its own)
CREATE TABLE IF NOT EXISTS campaign_pins (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    kind VARCHAR(10) NOT NULL,                      -- image | video | item | link | note
    owner_user_id BIGINT UNSIGNED NULL,
    source VARCHAR(10) NOT NULL DEFAULT 'staff',    -- staff | customer
    title VARCHAR(160) NULL,
    caption TEXT NULL,
    credit VARCHAR(160) NULL,
    tags JSON NULL,                                 -- a list of words
    media_path VARCHAR(500) NULL,
    thumb_path VARCHAR(500) NULL,
    media_width INT UNSIGNED NULL,
    media_height INT UNSIGNED NULL,
    video JSON NULL,                                -- provider, embed address, uploaded file, poster
    item_type VARCHAR(20) NULL,                     -- product | service | hamper | auction (needs E-commerce)
    item_id BIGINT UNSIGNED NULL,
    link_url VARCHAR(500) NULL,
    allow_download TINYINT(1) NOT NULL DEFAULT 1,
    status VARCHAR(10) NOT NULL DEFAULT 'visible',  -- visible | hidden
    hidden_reason VARCHAR(255) NULL,
    campaign_id BIGINT UNSIGNED NULL,               -- set when it was made inside a campaign
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_campaign_pins_feed (status, id),
    INDEX idx_campaign_pins_owner (owner_user_id),
    INDEX idx_campaign_pins_campaign (campaign_id)
);

CREATE TABLE IF NOT EXISTS campaign_boards (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(160) NOT NULL,
    description VARCHAR(500) NULL,
    cover_pin_id BIGINT UNSIGNED NULL,
    visibility VARCHAR(10) NOT NULL DEFAULT 'private',      -- public | private
    is_official TINYINT(1) NOT NULL DEFAULT 0,              -- made by staff for the brand
    approval_status VARCHAR(20) NOT NULL DEFAULT 'approved', -- draft | pending | approved | rejected (official boards by sales rep or finance start as draft)
    approved_by BIGINT UNSIGNED NULL,
    approved_at DATETIME NULL,
    rejected_note VARCHAR(500) NULL,
    campaign_id BIGINT UNSIGNED NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'visible',          -- visible | hidden
    hidden_reason VARCHAR(255) NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_campaign_boards_owner (owner_user_id),
    INDEX idx_campaign_boards_public (visibility, status, approval_status),
    INDEX idx_campaign_boards_campaign (campaign_id)
);

CREATE TABLE IF NOT EXISTS campaign_board_pins (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    board_id BIGINT UNSIGNED NOT NULL,
    pin_id BIGINT UNSIGNED NOT NULL,
    position INT NOT NULL DEFAULT 0,
    note VARCHAR(255) NULL,
    added_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_campaign_board_pins (board_id, pin_id),
    INDEX idx_campaign_board_pins_pin (pin_id)
);

CREATE TABLE IF NOT EXISTS campaign_moodboards (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(160) NOT NULL,
    template_key VARCHAR(40) NULL,                  -- the built-in layout it started from, if any
    layout JSON NULL,                               -- the artboard ratio and its slots
    contents JSON NULL,                             -- what fills each slot: a pin, text, a colour or a sticker
    is_template TINYINT(1) NOT NULL DEFAULT 0,      -- a layout other moodboards can start from
    campaign_id BIGINT UNSIGNED NULL,
    approval_status VARCHAR(20) NOT NULL DEFAULT 'approved',
    approved_by BIGINT UNSIGNED NULL,
    approved_at DATETIME NULL,
    rejected_note VARCHAR(500) NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'visible',
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_campaign_moodboards_owner (owner_user_id),
    INDEX idx_campaign_moodboards_campaign (campaign_id)
);

CREATE TABLE IF NOT EXISTS campaign_board_follows (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    board_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_campaign_board_follows (user_id, board_id),
    INDEX idx_campaign_board_follows_board (board_id)
);

-- PART C - RESULT CHECK. Expect 5 rows from the first query and 0 pins.
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('campaign_pins', 'campaign_boards', 'campaign_board_pins', 'campaign_moodboards', 'campaign_board_follows');
SELECT COUNT(*) AS pins FROM campaign_pins;
