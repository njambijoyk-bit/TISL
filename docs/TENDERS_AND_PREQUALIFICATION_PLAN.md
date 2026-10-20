# Tenders and pre-qualification as a notice board (DRAFT v3: planned, nothing new built yet)

**The decision:** the website is a way to **communicate**, not a tool to create or run tenders. Procurement writes the tender document elsewhere (Word, PDF), uploads it, and the website shows it to the right people. Vendors bid, and winners are chosen and told, **offline**. This replaces the earlier full e-procurement design (kept in `TENDERS_FULL_EPROCUREMENT_SHELVED.md`).

The price schedules and forms in the sample documents (price and completion schedule, goods price schedule with PPRA levy and VAT) stay **inside the tender PDF**; nothing in the system needs to understand them.

## 1. What a tender is on the website

**A notice record** with the fields from the government tender portal (already built unless marked new):
OCID, tender number, title, procurement method, procurement category, submission methods, reservation scheme, preference and reservation (YES/NO), opening venue, published date, close date and time, tender fee, validity in days, financial year, public link. **New:** `procuring_entity` (defaults to the company, so a column only shows if tenders from others are ever posted), `notice_type` (tender, prequalification, expression of interest), `commencement_date` if wanted.

**Attachments** (a tender can hold several), each with a **type**, its original name, and the date and time it was uploaded: Tender document, Tender notice, Advertisement, Addendum, Clarification, Notice of award, Other. PDF opens in the browser; **HTML is allowed** and shown in a sandbox (no scripts run), so an uploaded page cannot touch the site.

**Who can see it** (one choice per tender):

| Level | Who sees the tender and its files |
|---|---|
| **Public** | Everyone, including customers and visitors not signed in |
| **Vendors** | Any signed-in vendor (customers cannot see it) |
| **Pre-qualified vendors** | Only vendors currently pre-qualified (for the category) |
| **Invited** | Only the vendors you pick |

The public list shows **only Public** tenders. Vendors see the other three in their portal, according to their rights.

**Status:** Draft, Published, **Closed** (automatic once the close time passes), **Awarded**, **Terminated** (cancelled).

**Lots** (the cups, plates and spoons case): a tender can list its lots (A cups, B plates, C spoons) as rows in the notice. Bidding is offline, so lots only matter for describing the tender and **recording who won what**.

**Addenda:** an admin adds *Addendum 1, 2...* to a tender: a title, a note, the date, one or more files, and optionally a **new closing date**, which updates the tender and is shown as "Closing date changed from X to Y (Addendum 1)". The list shows an **Addendum** column.

**Award record (optional, after you decide offline):** per lot, the winner (a vendor from the list or typed name), amount and date, plus a Notice of award attachment, shown on the page once the tender is Awarded. A vendor can win all lots, some or none; the record is just a list of rows.

## 2. What the screens look like

**Public tenders list**, in the style of the government portal you showed:
- Tabs: **Active**, **Closed**, **AGPO** (reservation-scheme tenders), **Terminated**, **All**; plus **Restricted** for a signed-in vendor, showing the vendors-only, pre-qualified and invited tenders they may see.
- Columns: Description, Procuring entity, Method, Category, Close date, **Time to close** ("Closes in 5 days"), Publish date, **Addendum**, **Actions**.
- A **search box in each column** and a general search; a **Download Excel** button for the filtered list.
- **Actions menu:** *Share* (copy link, WhatsApp, email, the phone's share sheet) and *More details*.
- Fixes the portal's weakness: the description column is wide and wraps properly (in your screenshots it is cut off at the left edge), and on a phone each tender becomes a card.

**More details page:** the **Tender Notice Details** block exactly as in your Nyamira example, then **Attachments** listing type, name and upload date and time, each with Open and Download, and the addenda timeline.

**Admin:** the existing tender form, plus an **Attachments** panel (drag and drop, choose the type, delete, reorder), **Addenda**, **Lots and award**, buttons to Publish, Close, Terminate and Award, the **visibility** choice, and an optional **Notify eligible vendors** tick when publishing or adding an addendum (uses the existing in-app and email notifications).

## 3. Pre-qualification, offline

1. **The call:** a notice of type *prequalification* with the prequalification document attached. It uses the same list, details page, attachments and visibility as a tender.
2. **Vendors** download the document, fill it, scan it and send it to you by email or whatever channel you use.
3. **You review offline.** If you approve, you record it **on the vendor's page**: categories qualified (goods, services, works), qualified from, **valid until**, the scanned documents attached, and a note. You can also mark a vendor **expired** or **revoked**. **Approving or refusing requires a written reason**, saved with your name and the time.
4. **The website updates itself:** the vendor now sees pre-qualified-only tenders, and their portal shows "Pre-qualified for goods, valid until 31 Mar 2027". Expiry reminders (30 days before) go to you and to the vendor.

The earlier idea of a **machine pre-check with a reason** still fits here, on a smaller scale: when you record a pre-qualification or approve a new vendor registration, the system flags what it can prove from the data (tax PIN missing, a certificate date already expired, no attachment) as "flagged by machine" with a reason, and a human decides with a reason. There are no bid answers to check any more.

## 4. What exists now and what changes

| Today | Change |
|---|---|
| Notice fields, public list and details page | Keep the details page; **rebuild the list** as the table above; add `procuring_entity`, `notice_type`, the Terminated status |
| Visibility: all vendors, pre-qualified, invited | Add **Public**; the public list shows only Public; the vendors option stays as "Vendors" |
| Public sees tenders that are all-vendors or pre-qualified | **Stop:** only Public tenders are public; vendor portal shows the rest |
| Attachments: admin upload exists as an API only, public download only | **Admin attachments panel**, new types, upload date shown, inline PDF and sandboxed HTML, a **download for signed-in vendors** on restricted tenders |
| Addenda: none | **Add** (section 1) |
| Vendor bids (API), bid evaluation, award that creates a vendor order | **Hide** from the screens (kept in the database, unused). The award record in section 1 replaces it |
| Vendor-filled pre-qualification templates and submissions (API) | **Hide**; replaced by the admin-recorded pre-qualification on the vendor (section 3). The existing pre-qualification table can hold the record |
| Vendor portal: dashboard, tenders, bids, PQ, orders, profile | Keep **dashboard, tenders, profile, PQ status**; remove **My bids** and the PQ application pages from the menu |

## 5. Build order

1. **Phase 1, publishing and visibility:** the Public level and the privacy fix; admin attachments panel with types and sandboxed viewing; the new public table with tabs, per-column search, time to close, share and Excel; the vendor-portal list with downloads.
2. **Phase 2, addenda and results:** addenda with the optional new closing date and the column and timeline; lots; the award record; Terminated and Awarded states; the Notify tick.
3. **Phase 3, pre-qualification:** the call as a notice type; the vendor's recorded pre-qualification with reasons, expiry and reminders; the portal status; the machine flags.

## 6. Plain questions (my default in bold)

1. Should customers who are signed in ever see vendors-only tenders? **No.**
2. For a pre-qualified-only tender, is a vendor pre-qualified for the tender's **category** (goods, services, works)? **Yes.**
3. Do you want an **email to eligible vendors** when you publish a restricted tender or add an addendum? **Yes, as a tick you control each time.**
4. Should the award record (winner and amount) be **shown publicly**? **Yes, once the tender is Awarded, and you can leave it off for a tender.**
5. Keep the old bid and pre-qualification-application code in the database, only hidden? **Yes.**
