-- 45: why is a promo code not logged as used?  READ-ONLY — changes nothing. Run each block in Workbench and send me what you see.

-- 1. does the usage table have the voucher link (script 35)?  Expect voucher_id to be listed.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'referral_code_usage'
ORDER BY ORDINAL_POSITION;

-- 2. vouchers that carry a promo code, and whether a usage row exists for them
SELECT v.id, v.voucher_number, t.base_type, v.status, v.customer_id,
       JSON_UNQUOTE(JSON_EXTRACT(v.meta, '$.promo_code_id')) AS promo_code_id,
       (SELECT COUNT(*) FROM referral_code_usage u WHERE u.voucher_id = v.id AND u.status = 'completed') AS usage_rows
FROM vouchers v
JOIN voucher_types t ON t.id = v.voucher_type_id
WHERE JSON_EXTRACT(v.meta, '$.promo_code_id') IS NOT NULL
ORDER BY v.id DESC
LIMIT 30;

-- 3. invoices / cash sales whose lines show a promo discount but never got the code on the voucher
SELECT v.id, v.voucher_number, t.base_type, i.discount_ref AS code, SUM(i.discount_amount) AS discount
FROM voucher_items i
JOIN vouchers v ON v.id = i.voucher_id
JOIN voucher_types t ON t.id = v.voucher_type_id
WHERE i.discount_source = 'promo' AND v.status = 'posted'
GROUP BY v.id, v.voucher_number, t.base_type, i.discount_ref
ORDER BY v.id DESC
LIMIT 30;

-- 4. the codes themselves: are they marked public, and what do the counters say?
SELECT id, code, type, is_public, target_customer_id, status, times_used, max_uses, max_uses_per_customer, valid_until
FROM referral_codes
WHERE type <> 'customer_referral'
ORDER BY id DESC
LIMIT 30;
