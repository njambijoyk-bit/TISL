# Vendor portal, tenders and pre-qualification: manual test

Extras module. **The website is a notice board.** Procurement writes the tender elsewhere and uploads it (PDF, HTML...). The website shows it to the right people. Bidding, evaluation, awards and pre-qualification review happen **offline**. Vendors still register, log in, see the tenders meant for them and their orders.

Steps marked **[API]** are done with curl or Postman (setup in section 2). Everything else has a screen.

---

## 1. Setup

```
# from backend/
# run in order, on your MySQL database (each part on its own in Workbench)
database/sql/215_vendor_orders_rename.sql
database/sql/216_vendor_portal.sql
database/sql/217_tender_notice_fields.sql   # the notice columns (OCID, method, fee, ...)
database/sql/218_tenders_nav_link.sql        # the public "Tenders" menu link
database/sql/219_vendors_status_column.sql   # lets vendors.status hold 'suspended'
database/sql/220_policy_acceptance_vendor.sql # vendor_id / vendor_number on policy acceptances
database/sql/221_tender_notice_board.sql     # notice type, lots, people categories, recorded pre-qualification, mailings
database/sql/222_remove_online_bidding.sql   # DESTRUCTIVE: drops the old bid and PQ-application tables. Read Part A first.

php artisan access:seed
```

**222 deletes data** (every bid and every vendor-filled PQ application). Its Part A counts them first; skip it if you want to keep them for now. Nothing in the app reads those tables any more.

Then:

1. Log in as an admin with the **super_admin** role.
2. Module Center: make sure **Extras** is licensed and switched **on**.
3. Hard refresh the browser so the module list reloads.

Permissions (extras): `tenders.view`, `tenders.manage`, `prequalification.view`, `prequalification.manage`, `vendors.portal`. The old `tenders.evaluate` and `prequalification.templates` are gone from the catalogue.

Default grants: `manager` gets `tenders.view`, `prequalification.view`. `senior_accountant` gets `tenders.view`, `tenders.manage`, `prequalification.view`. Everything else is a manual grant.

## 2. API testing setup [API]

The app uses cookie sessions, so for curl/Postman make a bearer token in tinker:

```
php artisan tinker
>>> \App\Models\User::where('email','admin@tisl.test')->first()->createToken('t')->plainTextToken
```

Use `Authorization: Bearer <token>`, `Accept: application/json`. Base URL: your backend `/api`.

---

## 3. Test data

### Vendors (register at `/vendor-register`)

Password for all: `Vendor#2026pass`. Phones and emails must be unique. Activate them in Admin > Vendors.

| | Company | Contact | Email | Phone | Tax ID | People category |
|---|---|---|---|---|---|---|
| A | Acme Office Supplies Ltd | Wanjiru Kamau | chairs@acme.test | 0711000001 | P051000001A | none |
| B | Bravo Furniture Co | Otieno Odhiambo | sales@bravo.test | 0711000002 | P051000002B | Youth |
| C | Citrus Cleaning Services | Amina Hassan | info@citrus.test | 0711000003 | P051000003C | Women |

Set the people category in Admin > Vendors > Edit (it only shows when Extras is on).

### Tenders (admin UI: `/admin/tenders/new`)

| # | Title | Category | Who can see it | Reserved for | Lots |
|---|---|---|---|---|---|
| T1 | Supply of 200 ergonomic office chairs | Goods | **Public** | none | none |
| T2 | Supply of 50 standing desks | Goods | **Pre-qualified** | none | none |
| T3 | Monthly office cleaning, 12 months | Services | **Invited** | none | none |
| T4 | Catering supplies | Goods | **Vendors** | none | A Cups (Youth), B Plates (Women), C Spoons (open) |
| T5 | Youth uniforms | Goods | **Public** | **Youth** (whole tender) | none |

Give each a close date a few days ahead. Upload a PDF as the **Tender document** on T1, and an HTML file as an **Advertisement**.

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

### 4.3 Tenders (admin)
1. Create T1 to T5. **Expect:** each opens its page as a draft with a tender number. T4 shows its three lots, with the Youth and Women badges.
2. Open T1 > **Files**. Upload a PDF (type Tender document) and an HTML page (type Advertisement). **Expect:** each listed with its type, name, upload date and time. **Open** shows the PDF in a new tab; the HTML page shows with no scripts running (put `<script>alert(1)</script>` in it to check: nothing happens). **Download** saves it.
3. Publish T1 with "Tell eligible vendors now" ticked. **Expect:** status Published; a message saying how many vendors were told. Publishing a tender with no close date is refused.
4. Publish T2 to T5 (untick the box for T2).
5. T3 (Invited): open **Vendors and email**, search "Citrus", tick it, **Invite**. **Expect:** Citrus appears as an invited chip. Invite the whole **Women** group on T3. **Expect:** every active vendor in that group is added.
6. On T1 add a third file of type **Addendum** with "Tell eligible vendors" ticked and a note. **Expect:** the tenders list will now show an Addendum count of 1.

### 4.4 Public tender notices (no login)
1. Private window (not signed in), `/tenders`. **Expect:** the storefront menu shows **Tenders**. Only **T1 and T5** are listed (the Public ones). T2, T3 and T4 are not listed anywhere, not even by searching.
2. Tabs: **Active** (2), **AGPO** (T5 only), Closed, Terminated, All. Counts show on the tabs.
3. Table columns: Description, Method, Category, Close date, Time to close, Publish date, Addendum, Actions. The description wraps and is not cut off. Type in a column search box. **Expect:** the list narrows. Procuring entity shows only if some tender has one.
4. **Actions** menu on a row: **Share** (copy link, WhatsApp, email) and **More details**. Copy the link and open it in the private window. **Expect:** the details page.
5. Details page "Tender notice details": OCID, tender number, title, procuring entity, method, category, submission methods, reservation scheme, opening venue, published date, close date and time, fee, validity, financial year, preference scheme, public link, then the **Attachments** with type and upload date/time and Open/Download.
6. **Download Excel**. **Expect:** a spreadsheet of the filtered list.
7. Narrow the window to phone width. **Expect:** cards, not a table.
8. Close T1 (admin). **Expect:** it moves to the Closed tab; Time to close shows a dash.
9. Switch Extras off. **Expect:** `/tenders` and `/api/public/tenders` stop working and the menu link disappears.

### 4.5 Who sees what (vendor side, `/vendor-portal/tenders`)

Record pre-qualification first (4.6). Then:

| Who | Active tab | Restricted tab |
|---|---|---|
| Customer (signed in) | the Public ones only; `/api/vendor-portal/*` is 404 | not available |
| Vendor A (qualified in goods) | T1, T5 | T2, T4 |
| Vendor B (Youth, not qualified) | T1, T5 | T4 |
| Vendor C (Women, invited to T3) | T1, T5 | T3, T4 |

Also check: opening a vendor-only file link from the portal works for those vendors, and the same link copied to a private window after ten minutes stops working.

### 4.6 Pre-qualification (offline, recorded by staff)
1. Admin > Purchases > Vendors, vendor A > **Pre-qualification**. Record **Goods, Qualified, valid until** a year ahead, with a written reason. Try saving with no reason. **Expect:** refused.
2. Try **Refused** for services with a reason. **Expect:** it is listed as refused.
3. **Expect:** the vendor's `/vendor-portal/pq` lists both with the reasons and dates; the dashboard shows "Pre-qualified categories: 1".
4. **Extend** the goods one with a reason; **Revoke** it with a reason. **Expect:** the earlier reason is kept in the notes; after revoking, vendor A no longer sees T2.
5. `/admin/prequalification/submissions` lists everyone's records; the filters for category and "expiring in 30 days" work.

### 4.7 Emailing vendors
1. T2 > **Vendors and email**. **Expect:** "This reaches N vendors" matches who can see it (pre-qualified for the category). Send with a note. **Expect:** each gets a bell notification, and an email where their company email is on. A "Sent so far" line records it.
2. On a draft tender the send button is disabled with "Publish first".
3. T5 (reserved for Youth): **Expect:** only Youth vendors are counted.
4. T4 with lots A (Youth) and B (Women) and C (open): **Expect:** everyone who can see it is counted, because lot C is open.

### 4.8 Module gating (the key licensing test)
1. Switch **Extras off** in Module Center and refresh.
2. **Expect:** `/vendor-register`, `/vendor-portal/*`, `/admin/tenders*`, `/admin/prequalification/*`, `/tenders*` redirect away; the API routes return 404.
3. Switch it back on. Everything returns, data intact.

### 4.9 Permissions
1. Create an admin with the **manager** role. **Expect:** can open `/admin/tenders` and `/admin/prequalification/submissions`; cannot create a tender, upload a file, or record a pre-qualification.
2. A plain **customer** account hitting `/api/vendor-portal/dashboard`. **Expect:** 404 (no vendor record).

### 4.9b Suspend and activate a vendor
1. Register a vendor (e.g. Citrus), then in Admin > Vendors click **Activate**. **Expect:** status `active`, and the vendor now appears in Books > Purchases > New purchase > Supplier (a Sundry Creditors ledger was created). For vendors activated earlier, run `php artisan vendors:ledgers` once.
2. While that vendor is signed in on another browser, click **Suspend**. **Expect:** the Vendors row shows a red `suspended` badge; the vendor's open session ends at once; signing in again is refused with a message that the account is suspended; `/api/vendor-portal/*` returns 403.
3. Open New purchase. **Expect:** the suspended vendor is still in the Supplier list, labelled `(SUSPENDED)`, and a red "Suspended vendor" badge shows when it is chosen. Purchases and payments to it still work.
4. Click **Activate**. **Expect:** the vendor can sign in again; the label and badge disappear.

### 4.10 Core is unchanged
Admin `/admin/vendors` still creates a vendor and its Sundry Creditor ledger exactly as before, with Extras on or off.

---

## 5. Known gaps

- **Approval is not enforced in the portal.** A vendor in `pending_approval` can already log in and browse. Approval is recorded but nothing blocks the unapproved.
- Not built yet (Phase 2 and 3 of `TENDERS_AND_PREQUALIFICATION_PLAN.md`): addendum records with a new closing date, awarded lots and winners, the Awarded state from the screens, expiry reminders, machine flags.
- Pre-qualified visibility reads the new `vendor_prequalifications` table, so old PQ data is not carried over.

## 6. Reset test data

```sql
DELETE FROM tender_mailings; DELETE FROM tender_lots;
DELETE FROM tender_invitations; DELETE FROM tender_documents; DELETE FROM tenders;
DELETE FROM vendor_prequalifications;
```
(Uploaded files stay in `storage/app/private/tenders/` until you delete them.)
