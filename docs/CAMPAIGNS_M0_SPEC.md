# Campaigns M0 - first slice spec (to build; nothing built yet)

Goal: switch the Campaigns module on, create a campaign (Brand Campaign or Awareness-to-Sale), build its page from sections, schedule it, publish it, and see it on the public site and in the Archive. No pins, boards, moodboards, likes or comments yet (slices 2 and after). Switched off, nothing changes anywhere else.

## Tables (script 81_campaigns.sql; all under the `campaigns` backup key)
**campaigns**
id; slug (unique); title; subtitle; type (key from the registry: `brand`, `awareness_sale`; planned types are rejected); goal (`sales`, `reach`, later `signups`, `donations`); cover_media (file path or null); accent_color (null = site colour); teaser_at, starts_at, ends_at, early_access_at (all nullable datetimes); audience_rule (null = everyone, or a small JSON: tiers, loyalty level, previous customers); early_access_audience (same shape); is_published; published_at; is_paused; archived_at; feature_on_home (bool); status_note; approval_status (`draft`, `pending`, `approved`, `rejected`); approved_by; approved_at; rejected_note; created_by; updated_by; timestamps; soft deletes.
**campaign_sections**
id; campaign_id; position; type (`hero`, `story`, `countdown`, `video`, `products`, `cta`; later `moodboard`, `pins`, `gallery`, `poll`, `waitlist`); settings (JSON per type); show_from; show_until; audience_rule (nullable); timestamps.
**campaign_items** (what a campaign features, by reference; E-commerce optional)
id; campaign_id; section_id (nullable); item_type (`product`, `service`, `hamper`, `auction`); item_id; position; available_from (nullable: a coming-soon date for that item inside the campaign); label_override (nullable); timestamps. Unique on (campaign_id, item_type, item_id).
**campaign_events** (views and clicks, kept small)
id; campaign_id; section_id (nullable); event (`view`, `click`, `item_click`); user_id (nullable); session_key (hashed); created_at. Index on (campaign_id, event, created_at). Old rows can be rolled up later.

## Rules
- Registry in code: `CampaignTypes` with key, label, family, status (`available` or `planned`), capabilities, required modules, default sections, goal options. Planned types show locked in the picker and are refused by the API.
- Status is computed (see the plan): draft, scheduled, teaser, live, ended, paused, archived. Ended and archived campaigns stay public and read-only unless unpublished.
- Items resolve through `CatalogueAdapter` (inside Campaigns): when E-commerce is off, products and services sections are hidden from the picker, and an existing one shows "needs E-commerce" to staff and is omitted for the public. Names, prices, images and stock come from the live record, never copied.
- Publishing: admin, super admin and manager publish. Sales rep and finance save drafts and send for approval; approval creates the calendar task for their manager (employee manager, else admins) through CalendarService; nobody approves their own; a rejection carries a note.
- Sales numbers: sum of posted sales vouchers (invoices, cash sales, minus credit notes) whose lines are the campaign's items, dated inside the campaign window. Checkout is not touched.
- Slugs: lowercase, letters, digits and dashes only, unique. No "/" anywhere. Public address `/campaigns/<slug>`.

## Backend
Routes (all inside `module:campaigns`): admin list, create, update, publish and unpublish, pause, archive, delete; sections (add, update, reorder, delete); items (add, remove, reorder); approval (submit, approve, reject); numbers (views, clicks, sales in window). Public: list (live, upcoming, archive), show by slug (sections filtered by their dates and audience), record a view or click. Services under `app/Services/Campaigns/` (CampaignTypes, CampaignStatus, CatalogueAdapter, CampaignSales, CampaignApproval). A permission check per action by role.

## Frontend (folder `frontend/src/campaigns/`)
Admin: Campaigns list (status chips, type, dates, numbers); campaign editor (details, schedule, audience, then the section builder: add, drag to reorder, per-section schedule, live preview); approvals inbox for managers; module-gated sidebar group. Public: `/campaigns` (Live, Upcoming, Archive tabs), `/campaigns/<slug>` (renders sections), a "current campaign" block for the homepage when one is featured. Everything lazy-loaded behind the module gate; theme colours throughout.

## Build order
1. Script 81 (read-only check, change, result check) and the backup map entry.
2. Type registry, status logic, models, routes, role checks.
3. Admin list and editor (details and schedule) without sections.
4. Sections and items, with the live preview.
5. Public pages and the homepage block.
6. Approval flow and calendar task.
7. Numbers (views, clicks, sales in window).
Each step is committed and pushed on its own and leaves the site working.
