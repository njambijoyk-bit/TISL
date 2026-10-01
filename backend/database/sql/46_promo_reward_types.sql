-- 46: promo and referral codes give a percentage or a fixed amount only — remove free-shipping and gift-voucher "rewards".
-- Run in MySQL Workbench against the TISL database, block by block. Re-runnable.
-- (The reward a referrer earns — referrer_reward_type — is a different thing and is left alone.)

-- ── 1. read-only: how many codes use the removed types, and have they been used? ──
SELECT c.reward_type, COUNT(*) AS codes, SUM(c.times_used > 0) AS ever_used,
       SUM(EXISTS (SELECT 1 FROM referral_code_usage u WHERE u.referral_code_id = c.id)) AS with_usage_rows
FROM referral_codes c
WHERE c.reward_type NOT IN ('percentage', 'fixed_amount')
GROUP BY c.reward_type;

-- ── 2. delete the ones that were never used ──
START TRANSACTION;
DELETE c FROM referral_codes c
WHERE c.reward_type NOT IN ('percentage', 'fixed_amount')
  AND c.times_used = 0
  AND NOT EXISTS (SELECT 1 FROM referral_code_usage u WHERE u.referral_code_id = c.id);

-- ── 3. the ones that were used cannot be deleted (their history points at them): switch them off instead ──
UPDATE referral_codes SET status = 'expired'
WHERE reward_type NOT IN ('percentage', 'fixed_amount') AND status = 'active';

-- ── 4. check: what is left of those types (only used, switched-off codes should remain) ──
SELECT id, code, reward_type, status, times_used FROM referral_codes WHERE reward_type NOT IN ('percentage', 'fixed_amount');
COMMIT;
