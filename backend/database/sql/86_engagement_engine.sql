-- =====================================================================
-- 86_engagement_engine.sql
-- The Engagement Engine (part of Extras): reviews, comments, replies, likes, helpful votes and reports on products, services, hampers,
-- pins, boards, moodboards and campaigns. Who may do what is kept in settings, not in code.
-- Adds 7 tables and the one settings row. Nothing else is changed. Safe to re-run: each table is only created if it is missing.
-- Run each part on its own in Workbench: Part A (read-only), then B, then C.
-- =====================================================================

-- PART A - READ-ONLY CHECK. Which of the 7 tables exist already? (7 rows = nothing more to do; fewer = run part B)
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('engagement_settings', 'engagement_rules', 'engagement_posts', 'engagement_reactions', 'engagement_reports', 'engagement_log', 'engagement_report_reasons');

-- PART B - CHANGE (creates tables, commits on its own)
CREATE TABLE IF NOT EXISTS engagement_settings (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,                    -- always 1: the one row of settings
    enabled TINYINT(1) NOT NULL DEFAULT 1,                       -- master switch: off = no review, comment, like or report control anywhere
    preset VARCHAR(30) NOT NULL DEFAULT 'verified_buyers',       -- the last preset applied; 'custom' once a rule was changed by hand
    paid_required TINYINT(1) NOT NULL DEFAULT 1,                 -- proof of purchase: the invoice must be paid
    delivered_required TINYINT(1) NOT NULL DEFAULT 0,            -- proof of purchase: a product must be delivered
    service_completed_counts TINYINT(1) NOT NULL DEFAULT 1,      -- a completed booking counts as bought
    service_late_fee_counts TINYINT(1) NOT NULL DEFAULT 0,       -- a late cancellation with a fee invoiced counts as bought
    service_noshow_counts TINYINT(1) NOT NULL DEFAULT 0,         -- a no-show with a fee counts as bought
    service_free_cancel_counts TINYINT(1) NOT NULL DEFAULT 0,    -- a booking cancelled in time (nothing charged) counts as bought
    auto_hide_reports SMALLINT UNSIGNED NOT NULL DEFAULT 0,      -- this many open reports hide a post while staff look (0 = never)
    notify_author TINYINT(1) NOT NULL DEFAULT 1,                 -- tell the person when their post is pulled down
    notify_approvers VARCHAR(10) NOT NULL DEFAULT 'daily',       -- calendar tasks for held posts and reports: daily | each | none
    blocked_words JSON NULL,                                     -- a post containing one is always held
    updated_by BIGINT UNSIGNED NULL,
    updated_at DATETIME NULL
);

CREATE TABLE IF NOT EXISTS engagement_report_reasons (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(60) NOT NULL,
    position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    active TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS engagement_rules (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,                            -- product | service | hamper | pin | board | moodboard | campaign | post
    action VARCHAR(10) NOT NULL,                                 -- review | comment | reply | like | helpful | report
    settings JSON NOT NULL,                                      -- allowed, who, must have bought, hold, limits (see the app)
    updated_at DATETIME NULL,
    UNIQUE KEY uq_engagement_rule (target_type, action)
);

CREATE TABLE IF NOT EXISTS engagement_posts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(10) NOT NULL,                                   -- review | comment (a reply is a comment with a parent)
    parent_id BIGINT UNSIGNED NULL,
    user_id BIGINT UNSIGNED NULL,                                -- empty for a guest
    guest_name VARCHAR(60) NULL,
    guest_key CHAR(40) NULL,                                     -- hashed address, so a guest can be limited without storing who they are
    rating TINYINT UNSIGNED NULL,
    title VARCHAR(120) NULL,
    body TEXT NOT NULL,
    images JSON NULL,
    verified_purchase TINYINT(1) NOT NULL DEFAULT 0,
    proof_voucher_id BIGINT UNSIGNED NULL,                       -- the invoice or booking that showed they bought it
    status VARCHAR(10) NOT NULL DEFAULT 'published',             -- held | published | hidden | removed
    held_reason VARCHAR(40) NULL,
    decided_by BIGINT UNSIGNED NULL,
    decided_at DATETIME NULL,
    edited_at DATETIME NULL,
    created_at TIMESTAMP NULL,
    updated_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    INDEX idx_engagement_posts_target (target_type, target_id, status, id),
    INDEX idx_engagement_posts_user (user_id, created_at),
    INDEX idx_engagement_posts_parent (parent_id),
    INDEX idx_engagement_posts_queue (status, id)
);

CREATE TABLE IF NOT EXISTS engagement_reactions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(10) NOT NULL,                                   -- like | helpful
    user_id BIGINT UNSIGNED NULL,
    guest_key CHAR(40) NULL,
    created_at TIMESTAMP NULL,
    UNIQUE KEY uq_engagement_reaction_user (target_type, target_id, kind, user_id),
    UNIQUE KEY uq_engagement_reaction_guest (target_type, target_id, kind, guest_key),
    INDEX idx_engagement_reactions_target (target_type, target_id, kind)
);

CREATE TABLE IF NOT EXISTS engagement_reports (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    reporter_user_id BIGINT UNSIGNED NULL,
    guest_key CHAR(40) NULL,
    reason VARCHAR(60) NOT NULL,
    note VARCHAR(500) NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'open',                  -- open | kept | removed | flagged
    decided_by BIGINT UNSIGNED NULL,
    decided_at DATETIME NULL,
    decision_note VARCHAR(500) NULL,
    policy_key VARCHAR(60) NULL,                                 -- the policy breached, when flagged
    created_at TIMESTAMP NULL,
    INDEX idx_engagement_reports_target (target_type, target_id, status),
    INDEX idx_engagement_reports_queue (status, id)
);

CREATE TABLE IF NOT EXISTS engagement_log (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    target_type VARCHAR(20) NOT NULL,
    target_id BIGINT UNSIGNED NOT NULL,
    action VARCHAR(30) NOT NULL,                                 -- approved | hidden | removed | kept | flagged | settings | preset ...
    actor_user_id BIGINT UNSIGNED NULL,
    note VARCHAR(500) NULL,
    meta JSON NULL,
    created_at TIMESTAMP NULL,
    INDEX idx_engagement_log_target (target_type, target_id, created_at)
);

-- the one settings row, and a starting list of report reasons (only when there are none yet)
INSERT INTO engagement_settings (id, updated_at) SELECT 1, NOW() FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM engagement_settings WHERE id = 1);
INSERT INTO engagement_report_reasons (label, position)
SELECT x.label, x.position FROM (
    SELECT 'Spam or advertising' AS label, 1 AS position UNION ALL SELECT 'Rude or abusive', 2 UNION ALL SELECT 'Not appropriate', 3
    UNION ALL SELECT 'Wrong or misleading', 4 UNION ALL SELECT 'Someone else''s work', 5 UNION ALL SELECT 'Other', 6
) x WHERE NOT EXISTS (SELECT 1 FROM engagement_report_reasons);

-- PART C - RESULT CHECK. Expect 7 rows, 1 settings row, 6 report reasons, 0 rules (the app uses the preset until you save).
SELECT table_name FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_name IN ('engagement_settings', 'engagement_rules', 'engagement_posts', 'engagement_reactions', 'engagement_reports', 'engagement_log', 'engagement_report_reasons');
SELECT (SELECT COUNT(*) FROM engagement_settings) AS settings_rows, (SELECT COUNT(*) FROM engagement_report_reasons) AS reasons, (SELECT COUNT(*) FROM engagement_rules) AS rules;
