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
