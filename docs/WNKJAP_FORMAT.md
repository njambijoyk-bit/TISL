# The `.wnkjap` format and the books exchange

One company's books, at a depth the exporter chooses, sealed with a password. Another company opens it **in the browser** and sees it as read-only tables.
**Nothing of another company is ever written to this system's database**, for integrity and security: the file is decrypted in the page, kept in memory and gone when the page closes. Even a superadmin cannot import it into the books, and there is no way to log in to the other company's site from here.

## The file (version 1)

| Bytes | Meaning |
|---|---|
| 0–5 | ASCII `WNKJAP` |
| 6 | format version, `1` |
| 7 | key derivation, `1` = PBKDF2-HMAC-SHA256 |
| 8–11 | PBKDF2 rounds, unsigned 32-bit, big endian (written: 600 000; accepted: 100 000 to 5 000 000) |
| 12–27 | salt, 16 random bytes |
| 28–39 | AES-GCM nonce, 12 random bytes |
| 40– | AES-256-GCM ciphertext, then the 16-byte tag (the WebCrypto layout). **Bytes 0–39 are the associated data**, so changing a round count or a salt fails like a wrong password. |

The key is `PBKDF2-HMAC-SHA256(password as UTF-8, salt, rounds)` → 32 bytes. The plaintext is **gzip-compressed UTF-8 JSON**. Only the version, the key settings, the salt and the nonce are readable without the password; the company name, the depth and every figure are inside. A wrong password and a damaged file give the same answer.

A reader in PHP: `App\Services\Exchange\Wnkjap` (`seal`, `open`). A reader in the browser: `frontend/src/_shared/lib/wnkjap.js` (`openWnkjap`, WebCrypto). Any other language needs only PBKDF2, AES-GCM and gzip.

## The document inside

```json
{
  "format": "wnkjap", "version": 1, "level": 3, "level_name": "...", "created_at": "2026-10-09T09:00:00+03:00", "exported_by": "name or null",
  "company": { "id": "stable 32-hex id", "name", "legal_name", "short_code", "tax_pin", "email", "phone", "address", "city", "country", "base_currency": "KES", "currency_symbol": "KSh" },
  "period": { "from": "2026-01-01" | null, "to": "2026-12-31" | null },
  "branch_id": null | 3, "branch_limited": false, "opening_balances_left_out": false,
  "counts": { "<section>": rows },
  "sections": { "<section>": [ { ... }, ... ] }
}
```
`opening_balances_left_out` is true when the export was limited to one branch: opening balances belong to the whole company, so such a file shows movement only. `branch_limited` is true when the person who exported was limited to some branches.

Amounts are in the file's own base currency (`company.base_currency`); nothing is converted. Debit/credit sides are `D` and `C`; balances in `balances` are signed (debit positive).

## Depth (each level includes the ones before)

| Level | Name | Sections |
|---|---|---|
| 1 | Summary | `groups`, `ledgers`, `balances` |
| 2 | Books | adds `vouchers`, `entries`, `locations`, `cost_centres` |
| 3 | Detail | adds `voucher_items`, `voucher_taxes`, `bill_refs`, `customers`, `suppliers` |
| 4 | Full | adds `products`, `variants`, `stock`, `batches`, `batch_balances`, `movements`, `departments` |

Fields (a field a company does not have is simply missing):
- `groups`: id, parent_id, name, nature (asset, liability, income, expense), is_primary, affects_gross_profit, sort_order
- `ledgers`: id, group_id, name, code, opening_balance, opening_side, customer_id, supplier_id, is_active
- `balances`: ledger_id, opening, debit, credit, closing (for the period)
- `vouchers`: id, voucher_number, date, status (posted, cancelled), type, base_type, location_id, cost_centre_id, party_ledger_id, customer_id, party_name, reference_no, supplier_invoice_no, narration, total_amount, base_total, currency, source_voucher_id, due_date (memoranda are left out; the period filters by date)
- `entries` (posted vouchers only): voucher_id, line_no, ledger_id, side, amount, base_amount, narration, cost_centre_id, location_id
- `voucher_items`: id, voucher_id, line_no, item_type, variant_id, description, variant_label, sku, unit_code, quantity, rate, discount_amount, amount, tax_rate_percent, tax_amount, delivered_quantity, invoiced_quantity
- `voucher_taxes`: voucher_id, label, ledger_id, base_amount, tax_amount
- `bill_refs`: voucher_id, ledger_id, ref_type (new, against, advance), ref_name, against_voucher_id, amount, due_date
- `customers`: id, customer_number, first_name, last_name, company_name, email, phone, tax_id (no passwords or tokens, ever)
- `suppliers`: id, vendor_number, company_name, contact_name, email, phone, tax_id, city
- `products`, `variants`, `stock` (product_variant_id, location_id, quantity, reorder_level), `batches`, `batch_balances`, `movements` (in the period), `departments`

A file may hold at most 1 500 000 rows in all; a bigger export asks for a shorter period or a lower level.

## Getting a file

1. **Download** (Books > Other companies > Make a file): the exporter picks the depth, the period and a branch, and types a password (8 characters or more). Needs `imports.export`.
2. **Upload** the file in Books > Other companies and type the password. Needs `imports.view`.
3. **Pull on demand**: the exporting system makes a *key* (Other companies > Keys): a key text `keyId.secret` and its own file password, shown once. The key may be capped at a depth. The viewing system keeps a *connection* (name, address, key) and when someone presses Fetch, its server calls

   `GET {address}/api/exchange/export?level=2&from=2026-01-01&to=2026-12-31&location_id=3`
   `Authorization: Bearer keyId.secret`

   and hands the sealed file to the browser unopened; the person types the file password. The server never holds the password or the contents. Calls are rate limited (10 a minute), a wrong key is answered slowly, and a key can be switched off at any time. Only public `https` addresses are fetched.

Push (a site sending its file in) is not offered: there would be nowhere to keep it without storing it.

## For a site that is not this software

Implement `GET /api/exchange/export` as above (answer `application/octet-stream`, 401 for a wrong key, 403 when the level is above the key's) and produce the file with the layout above. The viewer here needs nothing else.
