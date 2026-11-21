# HR Stage 2: Employee documents (spec)

Status: spec, waiting for the owner. Stage 2 of `docs/HR_HUB_PLAN.md`, after stages 1 and 1b (built). The four choices at the end are my recommendations; say if any should change, or say "go".

Every employee gets a secure place for their documents (contract, ID copy, certificates, CV, offer letter, and the company's own kinds), whether they were hired through Careers or added by hand. The company decides which kinds exist and, for each kind, whether it is required, whether it expires and who may see it, using catalogue permissions and the record's tiers from stage 1.

## How it is today

- Employees have nowhere to keep documents. Certifications are a list on the record (name, issuer, dates) with no file.
- **Projects** keeps its files in the **Vault**: one folder per piece of work under a "Projects" folder. Projects keeps only what each file means to the work, and the Vault holds the bytes, every version and the audit trail.
- **Careers** keeps applicants' documents outside the Vault, on the public or S3 disk. Stage 3 copies them into the employee's documents at hire.
- The record's tiers (work, personal, sensitive) and department leads' sensitivity (stage 1b) already decide who sees which part of a person.

## What changes

### 1. Document kinds (HR configuration)

A new **Document kinds** section on HR configuration (`hr.configure`). Each kind has:

| Setting | What it means |
|---|---|
| Name | "Employment contract", "National ID copy", "First aid certificate"… |
| Who may see it | One of the record's tiers: **Work**, **Personal**, or **Pay and identity**. Optionally also one catalogue permission, so for example medical notes need `hr.documents.medical` as well (choice 1). |
| Required | Everyone (or everyone of some employment types) should have one. A missing one shows on the record and in a "missing documents" list. |
| Expires | Whether it has an expiry date, and how many days before to warn (for example 30, 7). |
| The person sees their own | Whether the employee sees this kind of document on their own record. |
| The person may upload | Whether the employee may send this kind themselves when asked. |

Starter kinds, all changeable or removable:

| Kind | Tier | Required | Expires |
|---|---|---|---|
| Employment contract | Work | yes | no |
| Offer letter | Work | no | no |
| CV | Work | no | no |
| National ID or passport copy | Pay and identity | yes | passport only |
| KRA PIN certificate | Pay and identity | yes | no |
| Bank details proof | Pay and identity | no | no |
| Academic certificate | Personal | no | no |
| Professional licence or certificate | Work | no | yes, warn 30 and 7 days |
| Medical certificate | Personal, plus `hr.documents.medical` | no | yes |

### 2. Where documents live

- In the **Vault**, as Projects does: an "HR" folder, then one folder per employee, made with their first document. The Vault keeps the bytes, every version and its own audit trail.
- HR keeps only what a document is to the person: its kind, expiry date, whether it was asked for, and whether it was removed.
- **The folders are HR's only** (choice 2). They are reached through the employee's record, not by browsing the Vault. Who may open a document is HR's decision (tier, catalogue permission, the person, leads), not the Vault's sharing.

### 3. On the employee's record: a Documents tab

- **What the tab shows:** the person's documents grouped by kind, each with its version, date, expiry (amber within the warning days, red when expired) and who uploaded it. Kinds the viewer may not see are left out entirely.
- **Required kinds still missing** show as "Missing: Employment contract".
- **What HR can do** (`hr.manage`, plus that kind's tier or permission): upload, add a new version (older versions are kept), set or change the expiry date, remove (kept in the Vault and in the history, hidden from the tab), and download.
- **Leads** see their department's documents up to their sensitivity, as with the record.
- **Every view and download** is written to the person's history ("Grace N. downloaded Employment contract"), as Show is for pay details.

### 4. Asking the person for a document

- HR presses **Ask for it** on a missing or expiring kind, with a due date and a note.
- The person is told and finds it on **My profile → My documents**. There they upload the file themselves, if that kind allows it.
- The request shows as waiting on their record until the file arrives. When it does, HR is told, and the request closes.
- The person also sees their own documents there, for the kinds marked "the person sees their own".

### 5. Expiry warnings

- A daily check (`hr:document-warnings`, run each morning) warns at each kind's warning days and on the day it expires.
- The person is told. Whoever holds `hr.manage` is told too, with one notice listing everything due.
- **HR → Documents** lists every document expiring in the next 60 days, plus all missing required documents. Both lists follow the viewer's tiers and filter by department and branch.
- Certificates already on the record keep their expiry dates. Stage 2 lets a certificate have its file attached.

## Data

### Script `273_hr_documents.sql` (adds only)

| Table | What it holds |
|---|---|
| `hr_document_kinds` | key, name, tier (work, personal or sensitive), extra permission (empty or a catalogue key), required, required for (empty = everyone, or employment type keys), expires, warn days, person sees own, person may upload, active, order |
| `employee_documents` | employee_id, kind_id, vault_document_id, expires_on, warned (which warning days were sent), removed_at and removed_by, uploaded_by, created_at |
| `employee_document_requests` | employee_id, kind_id, note, due_on, asked_by, asked_at, fulfilled_document_id, fulfilled_at, cancelled_at |

Plus the starter kinds, and one new catalogue permission: `hr.documents.medical` ("See medical documents"), owner-only by default.

## Builds

| Build | What |
|---|---|
| 2.1 | Document kinds in HR configuration. Storage in the Vault's HR folders. The Documents tab: upload, versions, expiry, remove and download, each by tier or permission. Every view and download in the history. |
| 2.2 | Asking for a document: the request, the notice, "My documents" on My profile with the person's own upload, HR told when it arrives, and missing required documents shown. |
| 2.3 | Expiry warnings (daily), and HR → Documents with what is expiring and what is missing across the company. Browser checks. |

Size: medium. One script, one daily command, one new permission.

## Four choices (my recommendation first; say if any should change)

1. **Who sees a kind of document follows the record's tiers, with an optional extra permission.**
   - Each kind is Work, Personal or Pay and identity, exactly like the record, so leads and managers see documents up to the level they already see of the person.
   - A kind can also require one catalogue permission on top. For medical documents, that is a new `hr.documents.medical`.
   - The other way: each kind names only a catalogue permission, with no link to the tiers.
2. **HR documents are reached only through HR.**
   - They are kept in the Vault for safe storage and versions. The HR folders are closed to Vault browsing (owner only, as the Vault allows), so nobody stumbles on a contract while browsing.
   - The other way: they are visible in the Vault too, under its own sharing rules.
3. **People upload what is asked of them, and see the kinds marked for them.**
   - On My profile, the person sees their own documents of kinds marked "the person sees their own", and uploads a document only when HR asked for it and that kind allows it.
   - The other way: people may upload any kind at any time. HR would then review each one.
4. **Every view and download is in the person's history.**
   - Opening or downloading a document is written to the person's history, so they and HR can see who looked at their contract or ID.
   - The other way: only uploads, versions and removals are kept, and views are left in the Vault's own log.
