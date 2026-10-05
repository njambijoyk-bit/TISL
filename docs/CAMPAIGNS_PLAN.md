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
