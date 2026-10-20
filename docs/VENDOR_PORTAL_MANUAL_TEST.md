# Vendor portal, tendering and pre-qualification: manual test

Extras module. Vendors register, log in, apply for pre-qualification (PQ), bid on tenders and see the vendor orders they win. Admin posts tenders, reviews PQ and awards bids.

**What has a screen and what does not (today)**

| Area | Screen | API only |
|---|---|---|
| Vendor register / dashboard / profile | yes | |
| Vendor: browse tenders, my bids, my PQs, my orders | yes (read) | |
| Vendor: place / submit / withdraw a bid, upload bid files | | yes |
| Vendor: apply for / submit PQ, upload PQ files | | yes |
| Admin: tender list, detail (bids, documents tabs), create / edit, publish / close / cancel | yes | |
| Admin: invite vendors, evaluate bid, award bid | | yes |
| Admin: PQ templates list, PQ submissions list | yes (read) | |
| Admin: create PQ template, review PQ, verify PQ document | | yes |

Steps marked **[API]** are done with curl or Postman (setup in section 2).

---

## 1. Setup

```
# from backend/
# run in order, on your MySQL database
database/sql/215_vendor_orders_rename.sql
database/sql/216_vendor_portal.sql
database/sql/217_tender_notice_fields.sql   # the notice columns (OCID, method, fee, ...)
database/sql/218_tenders_nav_link.sql        # the public "Tenders" menu link
database/sql/219_vendors_status_column.sql   # lets vendors.status hold 'suspended'
database/sql/220_policy_acceptance_vendor.sql # vendor_id / vendor_number on policy acceptances

php artisan access:seed
```

Then:

1. Log in as an admin with the **super_admin** role (it holds every permission, including the 7 new ones).
2. Module Center: make sure **Extras** is licensed and switched **on**.
3. Hard refresh the browser so the module list reloads.

Check the permissions loaded:

```sql
SELECT `key`, is_write FROM permissions
WHERE module_key = 'extras' AND (`key` LIKE 'tender%' OR `key` LIKE 'prequal%' OR `key` = 'vendors.portal');
-- expect 7 rows
```

Default grants: `manager` gets `tenders.view`, `prequalification.view`. `senior_accountant` gets `tenders.view`, `tenders.manage`, `prequalification.view`. Everything else is a manual grant.

## 2. API testing setup [API]

The app uses cookie sessions, so for curl/Postman make a bearer token in tinker:

```
php artisan tinker
>>> \App\Models\User::where('email','admin@tisl.test')->first()->createToken('t')->plainTextToken
>>> \App\Models\User::where('email','chairs@acme.test')->first()->createToken('t')->plainTextToken
```

Use `Authorization: Bearer <token>`, `Accept: application/json`. Base URL: your backend `/api`. Keep one admin token and one token per vendor.

---

## 3. Test data

### Vendors (register at `/vendor-register`)

Password for all: `Vendor#2026pass` (must pass the strong-password rule). Phones and emails must be unique.

| | Company | Contact | Email | Phone | Tax ID | City |
|---|---|---|---|---|---|---|
| A | Acme Office Supplies Ltd | Wanjiru Kamau | chairs@acme.test | 0711000001 | P051000001A | Nairobi |
| B | Bravo Furniture Co | Otieno Odhiambo | sales@bravo.test | 0711000002 | P051000002B | Mombasa |
| C | Citrus Cleaning Services | Amina Hassan | info@citrus.test | 0711000003 | P051000003C | Kisumu |

### PQ template [API] `POST /api/admin/prequalification/templates`

```json
{
  "name": "Goods Supplier Pre-qualification",
  "category": "goods",
  "description": "Basic compliance check for goods suppliers.",
  "validity_months": 12,
  "sections": [
    { "title": "Company", "questions": [
      { "key": "years_trading", "label": "Years in business", "type": "number" },
      { "key": "annual_turnover", "label": "Annual turnover (KES)", "type": "number" } ] },
    { "title": "Experience", "questions": [
      { "key": "similar_work", "label": "Describe 2 similar supplies in the last 3 years", "type": "text" } ] }
  ],
  "required_documents": [
    { "type": "tax_compliance", "label": "KRA tax compliance certificate" },
    { "type": "registration", "label": "Certificate of incorporation" }
  ]
}
```

### Tenders (admin UI: `/admin/tenders/new`)

Set the deadline to a future date (a few days out). It cannot be in the past when creating.

| # | Title | Category | Budget (KES) | Visibility | Requirements | Criteria |
|---|---|---|---|---|---|---|
| T1 | Supply of 200 ergonomic office chairs | Goods | 800,000 to 1,200,000 | All vendors | 12-month warranty; Delivery to Nairobi | Price; Delivery time; Warranty |
| T2 | Supply of 50 standing desks | Goods | 600,000 to 900,000 | Pre-qualified only | ISO-certified supplier | Price; Quality |
| T3 | Monthly office cleaning, 12 months | Services | 300,000 to 480,000 | Invited only | Own equipment | Price; Experience |

### Bids [API] `POST /api/vendor-portal/tenders/{id}/bid`

Vendor A on T1:

```json
{
  "cover_letter": "Acme is pleased to submit our offer.",
  "technical_proposal": "Ergonomic mesh chairs, 12-month warranty.",
  "delivery_timeline_days": 21,
  "items": [ { "description": "Ergonomic office chair", "quantity": 200, "unit_price": 4800 } ]
}
```
Total 960,000.

Vendor B on T1: same, `unit_price` 5200 and `delivery_timeline_days` 14. Total 1,040,000.

---

## 4. Test flow

### 4.1 Registration and approval
1. Open `/vendor-register`, register vendor A. **Expect:** success message "pending approval", you land signed in.
2. Register B and C the same way.
3. Duplicate check: register A again with the same email. **Expect:** "This email is already registered" error.
4. Weak password / mismatched confirm. **Expect:** field errors, no account created.
5. Settings > Policies > Acceptances (Terms of Use): the registration shows as context `vendor register`, with the vendor's company and number and a **Vendor** tag; the new filter "Vendors only" lists just these.
6. Admin: `/admin/vendors`, find the 3 vendors (status `pending_approval`). Set each to **active** (`PUT /api/admin/vendors/{id}` with `{"status":"active"}` if there is no button).

DB check:
```sql
SELECT id, vendor_number, company_name, status FROM vendors ORDER BY id DESC LIMIT 3;
SELECT id, email, role, status FROM users WHERE role='vendor';
```

### 4.1b A portal login for a vendor we created ourselves
1. Admin > Vendors, with Extras on and `vendors.portal` held (super_admin has it). Each vendor shows **Has login** / **No login** in a Portal column.
2. On a vendor with **No login** (e.g. Bravo) click **Create login**. The email is the vendor's own (change it if you like). Type an initial password, press **Generate**, or leave it blank. **Expect:** a screen with the email and password; a generated one is shown once, with a Copy button.
3. Sign in as that vendor at `/login` in a private window with that password. **Expect:** you are sent to choose a new password, then to `/vendor-portal`.
4. Try a weak password such as `password1`. **Expect:** it is refused with the password-rules message. Try the email of an existing login. **Expect:** "A login with this email already exists."
5. Back on the vendor click **Reset password**. **Expect:** a new password; the vendor's open sessions end; they must choose their own again at next sign-in.
6. **Suspend** that vendor. **Expect:** their login is refused (see 4.9b). **Activate** lifts it.

### 4.1c Policy acceptances are recorded for vendors
1. Register a vendor with the consent box ticked, then open Settings > Policies > Acceptances for Terms of Use and Privacy Policy. **Expect:** a `vendor register` row in each, naming the vendor with a **Vendor** tag.
2. Sign out and sign in as that vendor with the consent box ticked. **Expect:** a `login` row in each policy for the vendor, every time (the same as customers).
3. Bump the major version of Terms of Use. Sign in as the vendor without ticking the box. **Expect:** "Please accept the updated policies to continue"; ticking it and signing in again records a new `login` row.
4. A vendor made by an admin (4.1b) has no acceptances yet, so their first sign-in asks for them the same way.

### 4.2 Portal
1. Log in as vendor A, open `/vendor-portal`. **Expect:** dashboard with vendor number, counts at 0.
2. `/vendor-portal/profile`: change phone, add website `https://acme.test`, save. **Expect:** saved toast, values persist after refresh.

### 4.3 PQ
1. [API] Admin creates the PQ template above. **Expect:** it shows in `/admin/prequalification/templates` and, for vendors, in `/vendor-portal/pq` under Available Templates.
2. [API] Vendor A: `POST /vendor-portal/pq/templates/{id}/apply` with `{"responses":{"years_trading":8,"annual_turnover":25000000,"similar_work":"Supplied 150 chairs to X in 2024."}}` then upload both documents via `POST /vendor-portal/pq/{pqId}/documents` (multipart: `file`, `document_type=tax_compliance` / `registration`), then `POST /vendor-portal/pq/{pqId}/submit`.
3. **Expect:** `/vendor-portal/pq` shows the application as submitted; admin `/admin/prequalification/submissions` lists it.
4. [API] Admin verifies each document: `POST /admin/prequalification/submissions/{pqId}/documents/{docId}/verify`.
5. [API] Admin reviews: `POST /admin/prequalification/submissions/{id}/review`
   ```json
   { "status": "qualified", "score": 85, "review_notes": "All documents valid.", "categories_qualified": ["goods"] }
   ```
   **Expect:** status `qualified`; vendor A dashboard "active PQs" = 1.
6. Rejection rule: review another submission with `"status":"rejected"` and no `rejection_reason`. **Expect:** 422.

### 4.4 Tenders (admin)
1. Create T1, T2, T3 at `/admin/tenders/new`. **Expect:** each opens its detail page as `draft` with a tender number.
2. Publish T1 and T2. **Expect:** status `published`. Publishing a tender with no deadline is refused.
3. [API] T3 is invited only: `POST /admin/tenders/{T3}/invite` `{"vendor_ids":[<C id>]}`, then publish T3.

### 4.4b Public tender notices (no login)
1. Create a tender with the notice fields filled (admin form): number `KEFRI/1074/0003/2026-27`, OCID `ocds-5whusi-308866-KEFRI/1074/0003/2026-27`, category Works, method Open Tender, submission Electronic, reservation scheme `AGPO - Youth`, preference scheme ticked, opening venue `KEFRI HQ - SCM OFFICE`, fee 0, validity 154, financial year `2026/2027`, public link `https://tenders.go.ke/tenders/308866`, deadline a few days ahead. Upload a file as an attachment [API], then publish.
2. Open a private window (not signed in) and go to `/tenders`. **Expect:** the notice is listed as Open; the storefront menu shows **Tenders**.
3. Open it. **Expect:** OCID, tender number, title, procurement method/category, submission methods, reservation scheme, opening venue, published date, close date and time, tender fee, validity, financial year, preference scheme YES, public link, and the attachment (click it to download).
4. **Expect not to see:** an `invited` tender, a `draft` or `cancelled` tender, or any budget figures.
5. Close the tender. **Expect:** it moves to the Closed filter on `/tenders`.
6. Switch Extras off. **Expect:** `/tenders` and `/api/public/tenders` stop working and the menu link disappears.

### 4.5 Visibility (vendor side, `/vendor-portal/tenders`)

| Vendor | Should see |
|---|---|
| A (qualified in goods) | T1, T2 |
| B (not PQ'd) | T1 only |
| C (invited to T3) | T1, T3 |

### 4.6 Bidding [API]
1. Vendor A and vendor B create the bids above on T1. **Expect:** status `draft`.
2. Both submit: `POST /vendor-portal/bids/{id}/submit`. **Expect:** `submitted`; visible at `/vendor-portal/bids`.
3. Vendor A bids on T1 again. **Expect:** 422 "already submitted a bid".
4. Vendor B on T2 (not PQ'd). **Expect:** 404 (not visible to them).
5. Withdraw test: vendor C bids on T3, submits, then `POST /vendor-portal/bids/{id}/withdraw`. **Expect:** `withdrawn`.

### 4.7 Evaluate and award
1. Admin `/admin/tenders/{T1}` → Bids tab. **Expect:** both bids, with totals 960,000 and 1,040,000.
2. Close T1 (button). **Expect:** `closed`; vendors can no longer bid.
3. [API] Evaluate: `PUT /admin/tenders/{T1}/bids/{bidA}/evaluate` `{"status":"shortlisted","evaluation_score":88,"evaluation_notes":"Best price"}`; bid B `{"status":"under_review","evaluation_score":74}`.
4. [API] Award: `POST /admin/tenders/{T1}/bids/{bidA}/award`.
   **Expect:**
   - T1 `awarded`, awarded vendor = A.
   - bid A `awarded`, bid B `rejected`.
   - a **vendor order** created in `draft`, total 960,000, linked to the bid, with one line (200 x 4,800).
5. Vendor A `/vendor-portal/orders` shows the new order (read-only).

```sql
SELECT id, po_number, vendor_id, status, total, tender_bid_id FROM vendor_orders ORDER BY id DESC LIMIT 1;
```

### 4.8 Module gating (the key licensing test)
1. Switch **Extras off** in Module Center and refresh.
2. **Expect:** `/vendor-register`, `/vendor-portal/*`, `/admin/tenders*`, `/admin/prequalification/*` redirect away; the API routes return 404.
3. Switch it back on. Everything returns, data intact.

### 4.9 Permissions
1. Create an admin with the **manager** role. **Expect:** can open `/admin/tenders` and `/admin/prequalification/submissions`; cannot create a tender or open PQ templates.
2. A plain **customer** account hitting `/api/vendor-portal/dashboard`. **Expect:** 404 (no vendor record).

### 4.9b Suspend and activate a vendor
1. Register a vendor (e.g. Citrus), then in Admin > Vendors click **Activate**. **Expect:** status `active`, and the vendor now appears in Books > Purchases > New purchase > Supplier (a Sundry Creditors ledger was created). For vendors activated earlier, run `php artisan vendors:ledgers` once.
2. While that vendor is signed in on another browser, click **Suspend**. **Expect:** the Vendors row shows a red `suspended` badge; the vendor's open session ends at once; signing in again is refused with a message that the account is suspended; `/api/vendor-portal/*` returns 403.
3. Open New purchase. **Expect:** the suspended vendor is still in the Supplier list, labelled `(SUSPENDED)`, and a red "Suspended vendor" badge shows when it is chosen. Purchases and payments to it still work.
4. Click **Activate**. **Expect:** the vendor can sign in again; the label and badge disappear.

### 4.10 Core is unchanged
Admin `/admin/vendors` still creates a vendor and its Sundry Creditor ledger exactly as before, with Extras on or off.

---

## 5. Known gaps (found while writing this)

- **Approval is not enforced in the portal.** A vendor in `pending_approval` can already log in, browse and bid. Approval is recorded but nothing blocks the unapproved.
- **No screens** for the API-only steps in the table at the top.
- `access:seed` and the SQL scripts were never run against a real database before this test; report any SQL error with the line number.

## 6. Reset test data

```sql
DELETE FROM vendor_orders WHERE tender_bid_id IS NOT NULL;
DELETE FROM tender_bid_documents; DELETE FROM tender_bid_items; DELETE FROM tender_bids;
DELETE FROM tender_invitations; DELETE FROM tender_documents; DELETE FROM tenders;
DELETE FROM prequalification_documents; DELETE FROM prequalifications; DELETE FROM prequalification_templates;
```
(Delete `vendor_order_items` for those orders first if foreign keys complain.)
