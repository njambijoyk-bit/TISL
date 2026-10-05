# Campaigns module plan (planned, not built)

A campaign is a temporary or permanent "world" with a schedule, an audience, content and participation. It is much bigger than a discount: launches, teasers, giveaways, voting, flash events, collections, UGC, challenges, education, cause/fundraising. It is a paid module (`campaigns`, already a key in the Module Center).

## Rules that keep everything safe
1. **One-way dependencies.** Campaigns -> Core always (Books, customers, files, loyalty, promo codes). Campaigns -> E-commerce only through a thin optional adapter (products, brands, coming-soon, pre-order). E-commerce never imports Campaigns. Switching Campaigns off changes nothing in the shop.
2. **Capabilities, not one big type.** A campaign has a type (launch, giveaway, voting, fundraiser...) and a set of capabilities (content, pins/boards, commerce, engagement, fundraising). Each capability declares what it needs; the admin only offers a capability when its module is on. Fundraising needs Books (Core), not E-commerce. Commerce needs E-commerce. If E-commerce is later switched off, a commerce part shows a clear "needs E-commerce" note instead of failing.
3. **Brand is optional.** An installation may or may not have a brand. A campaign's brand is an optional reference to a brand when E-commerce is on; the brand hub exists only when a house brand is set.
4. **Three gates, same as other modules.** API routes (`module:campaigns`), navigation (modules.js), lazy frontend routes. The shop shows a "Save / Pin" control only when Campaigns is active.
5. **Backup.** Every campaign table is listed under the `campaigns` module in the backup map (a switched-off module's tables are skipped, so they must be classified).

## Pinterest-style layer: Pins and Boards
- **Pin:** one piece of media or content: image, video (upload or YouTube/Vimeo link), a product (optional, E-commerce), a link, or a note. Has caption, tags, credit, whether it may be downloaded, and its source (staff, customer, campaign).
- **Board:** a curated set of pins. A campaign moodboard is a board. Customers can create their own boards, save pins to them, and download images where allowed.
- Masonry feed, infinite scroll, lazy loading, tags and search. Boards are public or private.
- Videos: store with the existing file storage plus a poster image; embed external video; no transcoding in the first version.
- Needs new tables (pins, boards, board_pins, saves, plus moderation fields). Publications stay as the long-form Journal.

## Phases
- **M0 Foundation:** campaigns (name, slug, cover, type, schedule, audience, optional brand), campaign state follows the clock (teaser -> live -> archived), campaign hub page and archive, admin CRUD, module wiring, backup map.
- **M1 Pins and boards (staff curated):** pins, boards, masonry view, video, download, campaign moodboards.
- **M2 Customer boards:** save to board, create boards, likes, reporting and moderation, privacy.
- **M3 Commerce capability:** products on pins/campaigns, coming soon, waitlist (optional, E-commerce).
- **M4 Engagement:** polls/votes, spin, giveaways, challenges, secret access (uses tiers, loyalty, promo codes).
- **M5 Fundraiser:** donations tracked as Books receipts; own tables, no E-commerce.
- **M6 Pre-orders:** designed with the books and stock, last.

## Things to decide / watch
- Customer-created content needs moderation, a report button, a takedown path and a copyright note; downloads need a per-pin allow flag.
- Video storage and bandwidth cost; set size limits.
- Whether the discovery feed lives on its own page (`/world`) or also on the homepage.

## Decisions so far (second round)
- **Campaigns do not need a brand.** A campaign owns its identity (title, cover, accent colour, logo). A brand is only an optional filter ("add everything from brand X"). A campaign can feature products, services, hampers or auctions through one generic catalogue reference (type + id) resolved by an adapter that only works when E-commerce is on.
- **Moodboards are their own thing, not Publications.** A moodboard is a composed collage on an artboard, built from a template: ready-made layouts (slots with position, size, shape and what they accept: photo, colour swatch, text label, product cut-out, sticker). Templates ship as presets in code (no table); a moodboard stores the chosen template key and what fills each slot. A free-form drag editor can come after the templates. A **board** (Pinterest-style set of pins) is different from a **moodboard** (a composed collage); a moodboard can be started from a board.
- **Video embeds are in the first version.** YouTube and Vimeo links only (allow-list), privacy-friendly embed, poster image shown first and the player loaded on click. Uploaded video comes later.
- **Who can create boards:** admins, managers, sales reps and customers. Staff boards can be marked official and attached to campaigns; customer boards are personal (public or private) and can be hidden by staff.
- **Report engine is separate and later:** one engine in Extras, module-regulated, for reports, product and service reviews, helpful votes. Pins and boards are built so that engine can attach to them later (each has a type, an id and a visible/hidden status). Campaigns show the report button only when that engine is active.
- **Downloads:** a per-pin switch, on by default. Turning it off hides the button and blocks our download endpoint; the image can still be seen on screen (that cannot be prevented), so say so in the admin hint.

## What lives where
- **Campaigns module (`campaigns`):** its own frontend folder (`frontend/src/campaigns/`), backend services under `app/Services/Campaigns/`, and tables named `campaign_*` so ownership and the backup map are obvious. Holds campaigns, pins, boards, moodboards, participation, analytics.
- **E-commerce:** keeps products, services, brands, hampers and auctions. It knows nothing about Campaigns. The adapter that reads it lives inside Campaigns.
- **Core:** files and storage, customers and users, tiers, loyalty, promo codes, Books (for the fundraiser later), the Module Center.
- **Extras:** the report engine (later), optional.
- **Public pages:** a discovery feed (`/world`), campaign pages by slug, boards and moodboards by id and slug, and "my boards" for signed-in customers. **Admin:** a Campaigns group in the sidebar, shown only when the module is on.

## Decisions (third round)
- **Video, now:** embed YouTube, Vimeo, TikTok and Facebook links (allow-list, consent banner respected, poster shown first, player loads on click), and upload from the device. Facebook gives no poster without a token, so the pin takes an uploaded or chosen poster. Device upload: MP4 (H.264) or WebM, a size limit set in settings, a poster frame taken in the browser before upload (no server video tools needed). iPhone MOV may not play everywhere: warn, convert later. The server's upload limits (PHP `upload_max_filesize`, `post_max_size`) must be raised to match. Uploaded files are not in a database backup; say so in the backup page.
- **Endless scrolling:** cursor-based paging (stable while new pins arrive), an observer at the end of the grid, fixed aspect ratios from stored width and height so nothing jumps, lazy images, the grid trimmed when very long, scroll position restored on Back, and a "Load more" button for keyboard users.
- **Likes and reports (Extras engine):** one engine for likes, helpful votes, reports and reviews, attached to anything by type and id (pin, board, campaign, product, service). Campaigns call it only when it is on; with it off the buttons and counts are hidden. (A board's public or private setting has nothing to do with the engine; with the engine off there is simply no like, comment or report button, and staff hide content from the admin boards list.)
- **Templates and moodboards are one thing.** A template is just a moodboard layout with empty slots; a moodboard is that layout filled in. So: one record type with a layout and its slot contents, a flag "is a template", built-in presets shipped in code, and admins can "save as template" and "start from template".
- **Private and public boards (customers).** Private: the owner and our staff can see it (sales rep, manager, admin, super admin); other customers cannot. Public: anyone. Staff viewing a customer's private board is written to the activity log, and the privacy policy says staff can see private boards (a major policy version, so people are asked again).
- **Official boards (sales rep and finance):** saved as drafts, sent for approval, published when a manager, admin or super admin approves. When one is created, a task appears on the approver's calendar ("Approve or reject <name>'s board"). The approver is the person's manager (employees.manager_id); if none, the admins. Nobody approves their own. Approving or rejecting clears the task and tells the author (a rejection carries a note and returns it to draft). Editing a published official board by a non-approver returns it to pending. Manager, admin and super admin boards publish directly. Customer boards need no approval.

## Decisions (fourth round)
- **The Extras engine is the Engagement Engine.** One engine, attached to anything by type and id (pin, board, campaign, product, service...). Module-regulated (Extras). Its parts:
  - **Feedback:** reviews, ratings, comments, replies (replies are comments on a comment).
  - **Reactions:** helpful, like, other reactions.
  - **Moderation:** reports, flags, review status, moderation actions.
  Existing product reviews stay as they are until the engine is built; they can move into it later.
- **A report is not a takedown.** A report opens a review: staff either keep the content, pull it down, or flag it for a policy breach (with a note saying which policy). Every action is recorded (activity log).
- **Public or private is the customer's choice, always**, independent of the engine. Without the engine there are simply no like, comment or report buttons, and staff can hide any pin or board from the admin boards list.
- **No new policy.** Boards link to the existing Privacy Policy and Website Policy, whose wording gets one added line saying that our staff can see private boards. (Whether that edit is a major version, which asks everyone to agree again, is a choice for when it is edited.)
- **Who sees customers' boards:** every staff role except drivers can see a customer's private board (viewing is logged). Sales rep and finance are restricted only in making **official** boards, which stay drafts until a manager, admin or super admin approves.
- **Video upload limit:** 100 MB.
