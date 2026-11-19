# Projects Stage 9: Documents and portals (being built)

Status: the owner said "go" on 2026-11-19 after Stage 8, so this design is built straight away with the four choices at the end taken as recommended (as in every stage so far). Any of them can still be changed; say which. What is built so far is listed under "As built".

Stages 1 to 8 built the work, its money, the doing of it, the talking about it, its links and its people. Stage 9 is about its papers and the people outside: the files of each piece of work, documents made from templates, asking for files and sign-off, registers, a portal for the client, and short-lived links for anyone else.

Size: medium to large. Six builds, one script, no new permissions (all six are in the catalogue since Stage 1: `projects.files.view`, `.manage`, `.share`, `.sign`, `projects.templates`, `projects.guests`).

## The rules this stage keeps

1. **One place for documents.** A file's bytes, its versions and the vault's own audit stay in the Core vault, in a "Projects" folder with one folder per piece of work. Projects keeps only what a file is to the work (its folder on the work, who may see it, its register line, its expiry).
2. **Projects decides who sees a work's files**, by its own rules (Stage 1 and 2: on the work, the permission, confidential work, locked areas). The vault's own policies still apply to anyone opening the vault itself.
3. **Clients and guests see only what was shared with them.** A file is team-only until someone with `projects.files.share` shares it.
4. **No money in Projects.** The portal's bills are Books invoices, read from Books, paid through the existing customer payment.

## In this stage

### 1. Files on each piece of work (`projects.files.view`, `.manage`)
- A **Files** tab: folders on the work (any names, any depth), upload, a new version (the old ones kept), download, preview, rename, move, remove (to the work's trash, restorable).
- Each file is **team only** or **shared with the client** (`projects.files.share`); sharing and unsharing are logged.
- The first file creates the work's folder in the vault (Projects → number and name); nothing is made for work with no files.

### 2. Documents from templates (`projects.templates`)
- Templates in Configuration: a letter, a contract, a certificate, written with fill-in fields: the work (number, name, type, dates, place, reference, custom fields), the client and its main contact, the lead and the people on the work, the company, today.
- "Make a document" on the Files tab fills one in, shows it, and saves it to the work's files as a PDF (kept as a file like any other, with its own versions).

### 3. Asking for files and sign-off (`projects.files.sign`)
- **Ask for a file**: from a client contact (through the portal, or by email with a link) or a colleague, with a due date; what they send lands in the work's files; reminders when due.
- **Ask for sign-off** on a file: the exact version is fixed; the person approves or declines with their typed name and a note (owner's choice 2); the time, their address and the version are kept. A later version needs a new sign-off.

### 4. Registers and expiry
- **Registers** on a piece of work: a list with numbered lines (number, title, revision, status, the file), from company register kinds in Configuration (a drawing register, a document register, a permit register…). A new version of a register's file moves its revision on.
- **Expiry** on any file (a permit, an insurance certificate): the lead and whoever uploaded it are told at 60, 30 and 7 days and on the day; the Files tab marks it.

### 5. Client portal
- In the customer area (owner's choice 3): **My work**, each piece of work for their customer: its stage and phases, upcoming meetings they are invited to, files shared with them, file and sign-off requests waiting for them, and their invoices on that work from Books with the existing "pay" button.
- Their main contact or any contact with a portal login sees it; nothing team-only ever shows. The scorecard waits for Stage 12.

### 6. Guest links (`projects.guests`, a serious action)
- A link with an end date (owner's choice 4; at most 90 days) for someone outside with no account (an architect, a valuer): it opens one piece of work's shared files and the requests addressed to that link, nothing else.
- Every opening is logged; a link can be ended at any time; inviting a guest is the serious action "Give a guest link".

## What changes outside Projects

| Where | Change |
|---|---|
| Core vault | A "Projects" folder with one folder per piece of work that has files (made by Projects); nothing else in the vault changes |
| Customer area | "My work" comes back (hidden since Stage 1), showing the new portal |
| Public pages | A guest page and an upload page, each opened only with its own long code |

## Data

### Script `266_projects_documents.sql` (Projects, adds only)

| Table | Holds |
|---|---|
| `project_folders` | Folders on a piece of work (name, parent) |
| `project_files` | A file on a piece of work: its vault document, its folder, team or shared, expiry, register line, removed |
| `project_doc_templates` | Document templates and their text |
| `project_file_requests` | Asking for a file or a sign-off: from whom, by when, the file and version, the answer |
| `project_register_kinds`, `project_registers`, `project_register_lines` | Register kinds, a work's registers, and their lines |
| `project_guest_links`, `project_guest_visits` | Guest links and every opening |

## Builds

| Build | Contents |
|---|---|
| 9.1 | Script 266, the Files tab, folders, versions, sharing |
| 9.2 | Document templates and making documents |
| 9.3 | Asking for files and sign-off |
| 9.4 | Registers and expiry |
| 9.5 | The client portal |
| 9.6 | Guest links |

Every build runs the Projects tests and the Projects browser checks.

## Four choices (taken as recommended; say if any should change)

1. **Where files live:** in the Core vault (bytes, versions, its audit), with Projects deciding who sees them on the work. The other way: a separate store for Projects.
2. **Sign-off:** a typed name and a note, kept with the time, the address and the exact version. The other way: an e-signature service (an account with one, and its cost).
3. **What the client portal shows:** progress, meetings, shared files, requests and invoices with pay. The other way: shared files only.
4. **Guest links:** read-only to shared files and their own requests, an end date of at most 90 days, and a serious action. The other way: no guest links (outsiders get an email with a link per request only).

## As built

### To run

1. `backend/database/sql/266_projects_documents.sql` (after 257; needs the document vault's tables, which the live database has; nine tables, a "files" ability for the Lead and Members, and three register kinds to start with). Adds only.
2. No permission seed.

### 9.1 Files on each piece of work (done)

Screen: `docs/screens/projects-files.png`.

- **Files tab** (with `projects.files.view`): folders on the work (any names and depth), files with their size, who added them, versions, and "Team only" or "Shared with the client". Open a file to see it, download it or any earlier version.
- **Owner's choice 1, the vault:** the first file makes a "Projects" folder in the Core vault (once) and a folder for the work inside it (its number and name; found again by its own code, so renaming the work does not make a second one). Each file is a vault document with the vault's versions and its own access record ("module: projects"); it is tagged with the work's number, and kept "confidential" in the vault when the work is confidential. Nothing is made for work with no files.
- **Changing** (`projects.files.manage` and a project role that keeps files; the new project-role ability `files`, given to Lead and Member): add files (several at once, or dropped on the tab; up to 50 MB each), a new version (with what changed), rename, move to a folder, set the day it runs out (used in 9.4), remove (to "Removed files", where it can be put back; the vault keeps it) and folders (an empty folder can be removed).
- **Sharing** (`projects.files.share`): "Share with the client" or "Stop sharing"; a removed file comes back unshared. Shared files are what the portal (9.5) and guest links (9.6) show.
- **People who may see all work** (`projects.view_all`) can open its files too, and a frozen piece of work's files can still be read.
- **Every add, version, change, share, removal and putting back is in the work's log;** downloads and previews are in the vault's own record.
- **Routes:** `GET`, `POST /projects/{project}/files`; `GET`, `POST …/files/{file}/versions`; `GET …/files/{file}/download` (version, inline); `PUT …/files/{file}` (name, folder, runs out, or shared); `DELETE …/files/{file}`; `POST …/files/{file}/restore`; `POST /projects/{project}/folders`; `PUT`, `DELETE …/folders/{folder}`.
- **Tests:** `tests/Feature/ProjectsFilesTest.php` (3, on `ProjectsFilesTestCase`, which makes the vault's tables). Browser check `e2e/projects-files-ui.mjs` (8 checks). It caught that the shared API client sends JSON unless told otherwise; uploads now go as real file uploads.

### 9.2 Documents from templates (done)

Screen: `docs/screens/projects-make-document.png`.

- **Templates:** Configuration → Templates (writing them needs `projects.templates`): a name, which industry (or every one) and the text, with fill-in fields in double braces. Pressing a field in the list puts it where the cursor is. A field that is not known is refused when saving, naming it, so a letter never goes out with a hole nobody noticed. A template can be switched off.
- **Fields:** the work (number, name, kind, stage, start and expected end, place, reference, authority, description), the client (name, email, phone), the client's main contact (name, email), the lead (name, email), the people on the work, whoever makes the document, the company (name, email, phone), today, and any extra field on the work by its key (`{{field.plot_number}}`).
- **Making a document** (Files tab → "Make a document"; needs the right to keep the work's files): choose a template, see it filled from the work, named "template and number" (changeable); fields with nothing in them on this work are named and left empty. "Make it" keeps it on the work's files (in the folder that is open) as a PDF, marked "made from a template", with versions like any other file.
- **Filled as the maker sees the work:** a sensitive extra field they may not see stays empty. The template's own words are kept as written (never read as markup).
- **Routes:** `GET /projects/{project}/templates`; `POST …/templates/{template}/preview`; `POST …/templates/{template}/make` (folder, name); `GET`, `POST /projects/configuration/templates`, `PUT /projects/configuration/templates/{id}`.
- **Tests:** `tests/Feature/ProjectsDocTemplatesTest.php` (3). Browser check `e2e/projects-files-ui.mjs` (now 10 checks).
