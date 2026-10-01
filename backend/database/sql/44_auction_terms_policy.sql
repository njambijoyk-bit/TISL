-- 44: auction terms policy — make sure policy_acceptances can record the new "auction_bidding" context.
-- Run in MySQL Workbench against the TISL database. Safe to run more than once.
-- (The policy itself, "Auction Terms & Bidding Rules", creates itself the first time Settings → Policies is opened.)

-- ── 1. read-only: what type is the context column today? ──
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'policy_acceptances' AND COLUMN_NAME IN ('action_context', 'reference_type');

-- ── 2. only if the column is an ENUM, make it plain text so new contexts can be recorded ──
SET @is_enum := (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'policy_acceptances'
                   AND COLUMN_NAME = 'action_context' AND DATA_TYPE = 'enum');
SET @sql := IF(@is_enum > 0,
               'ALTER TABLE policy_acceptances MODIFY action_context VARCHAR(60) NOT NULL',
               'SELECT ''action_context is already plain text - nothing to change'' AS result');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. check ──
SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'policy_acceptances' AND COLUMN_NAME = 'action_context';
