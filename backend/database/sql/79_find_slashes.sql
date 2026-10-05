-- =====================================================================
-- 79_find_slashes.sql  (READ ONLY - changes nothing)
-- SKUs, voucher numbers and numbering prefixes/suffixes can no longer contain the symbol /.
-- This lists any that already do, so you can rename them in the app. Run each query on its own.
-- =====================================================================

-- 1. Products with a slash in the SKU
SELECT id, name, sku FROM products WHERE sku LIKE '%/%';

-- 2. Product variants with a slash in the SKU
SELECT id, product_id, name, sku FROM product_variants WHERE sku LIKE '%/%';

-- 3. Services with a slash in the SKU
SELECT id, name, sku FROM services WHERE sku LIKE '%/%';

-- 4. Numbering series whose prefix or suffix has a slash (new numbers from these would contain it)
SELECT id, name, prefix, suffix FROM voucher_series WHERE prefix LIKE '%/%' OR suffix LIKE '%/%';

-- 5. Vouchers already numbered with a slash (customers' order and quotation addresses use these numbers)
SELECT id, voucher_number, date FROM vouchers WHERE voucher_number LIKE '%/%' ORDER BY id DESC LIMIT 200;
