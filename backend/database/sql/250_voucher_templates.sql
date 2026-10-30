-- =====================================================================
-- 250_voucher_templates.sql
-- Voucher templates and recurring drafts: a saved voucher shape (the entries, lines and narration as they were on the form) that can be used any time, or repeat on a schedule.
-- A repeating template never posts anything by itself: when it falls due it leaves a draft in the inbox on the Vouchers tab, which a person opens, checks and posts.
--   voucher_templates        name, category, which form (voucher | purchase), the voucher type, the saved form state (JSON), the repeat (none / weekly / monthly / quarterly / yearly) and the next due date
--   voucher_template_drafts  what a repeating template left behind: the date it was due, a copy of the saved form state, and whether it is pending, opened or skipped
-- Safe to run twice. Run each part on its own in Workbench.
-- =====================================================================

-- PART A - READ-ONLY CHECK. 0 rows on the first run.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('voucher_templates', 'voucher_template_drafts');

-- PART B - CHANGE
CREATE TABLE IF NOT EXISTS voucher_templates (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    category        VARCHAR(40) NULL,
    form            VARCHAR(12) NOT NULL DEFAULT 'voucher',      -- the screen it fills: voucher (the general form) or purchase (the Purchases page)
    voucher_type_id BIGINT UNSIGNED NULL,                        -- for the general form: which kind of voucher
    base_type       VARCHAR(30) NULL,                            -- its base type, so a template survives a voucher type being renamed
    form_state      JSON NULL,                                   -- what was on the form: { h, lines, entries, tenders, acct }
    repeat_every    VARCHAR(12) NOT NULL DEFAULT 'none',         -- none | weekly | monthly | quarterly | yearly
    repeat_day      SMALLINT UNSIGNED NULL,                      -- day of the month (monthly, quarterly, yearly) or of the week 1-7 (weekly)
    next_due_on     DATE NULL,
    last_made_on    DATE NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    is_starter      TINYINT(1) NOT NULL DEFAULT 0,
    created_by      BIGINT UNSIGNED NULL,
    created_at      TIMESTAMP NULL,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uq_voucher_templates_name (name),
    KEY idx_voucher_templates_due (is_active, next_due_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS voucher_template_drafts (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    template_id BIGINT UNSIGNED NOT NULL,
    due_on      DATE NOT NULL,
    form_state  JSON NULL,
    status      VARCHAR(10) NOT NULL DEFAULT 'pending',          -- pending | opened | skipped
    handled_by  BIGINT UNSIGNED NULL,
    handled_at  TIMESTAMP NULL,
    created_at  TIMESTAMP NULL,
    updated_at  TIMESTAMP NULL,
    UNIQUE KEY uq_voucher_template_drafts_once (template_id, due_on),
    KEY idx_voucher_template_drafts_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PART C - CHECK. Expect 2 rows.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('voucher_templates', 'voucher_template_drafts');
