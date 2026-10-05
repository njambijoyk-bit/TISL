# Campaigns M1 - pins, boards and moodboards (to plan, then build; nothing built yet)

Goal: the Pinterest-style layer inside the Campaigns module. People browse an endless masonry feed of pins, open a pin, download its image when allowed, save pins to boards, and make their own boards (public or private). Staff curate official boards and composed moodboards, and campaigns can show a board, a pin grid or a moodboard as a section. Switched off, or with E-commerce off, nothing else changes: a product pin simply needs E-commerce.

## Words
- **Pin:** one thing: an image, a video (YouTube, Vimeo, TikTok or Facebook link, or an uploaded file), a product/service/hamper/auction (needs E-commerce), a link, or a note.
- **Board:** a collection of pins, like a Pinterest board. Public or private. Staff boards are official and need approval for sales rep and finance. Customer boards are personal.
- **Moodboard:** a composed collage on an artboard, made from a layout (a template). A template is a moodboard with empty slots; "save as template" and "start from template" use the same record. Moodboards are brand content, made by staff.

## Tables (script 83, all under the `campaigns` backup key)
**campaign_pins**: id; kind (`image`, `video`, `item`, `link`, `note`); owner_user_id; source (`staff`, `customer`); title; caption; credit; tags (JSON list); media_path, thumb_path, media_width, media_height; video (JSON: provider, source, embed_url, file, poster); item_type, item_id (a catalogue reference); link_url; allow_download (default 1); status (`visible`, `hidden`); hidden_reason; campaign_id (nullable: made inside a campaign); timestamps; soft deletes.
**campaign_boards**: id; owner_user_id; title; description; cover_pin_id; visibility (`public`, `private`); is_official; approval_status (`draft`, `pending`, `approved`, `rejected`); approved_by, approved_at, rejected_note; campaign_id (nullable); status (`visible`, `hidden`); timestamps; soft deletes. The address is `/boards/<id>-<slug of title>`.
**campaign_board_pins**: id; board_id; pin_id; position; note; added_by; created_at; unique on (board_id, pin_id). Saving a pin to a board is a row here (a pin can sit on many boards).
**campaign_moodboards**: id; owner_user_id; title; template_key (a built-in preset, or null); layout (JSON: artboard ratio and slots); contents (JSON: slot -> pin, text, colour or sticker); is_template; campaign_id (nullable); approval_status as boards; status; timestamps; soft deletes.
**campaign_board_follows**: id; user_id; board_id; created_at; unique on (user_id, board_id). A signed-in customer (or staff member) follows a public board; the board's follower count is counted from this table.
No tags table: tags are a JSON list searched with LIKE, which is enough until the feed is large.

## Rules
- **Who sees what.** A pin is in the public feed when it is visible and either staff-made and not tied to a private place, or sits on at least one public, approved, visible board. Private-board pins show only to the board's owner and to staff (sales rep, finance and up; every view is logged to the activity log). Hidden pins and boards show only to staff.
- **Who creates.** Staff (admin, super admin, manager, sales rep, finance) make pins, official boards and moodboards. Sales rep and finance work is saved as a draft and goes for approval to their manager (or the admins) with a calendar task, exactly like campaigns. Customers make personal boards, save pins to them, and upload their own pins: images, links and video embeds, but not video files. A customer pin always goes onto one of their boards when it is made.
- **A pin is public when its board is public.** A public board makes its pins public (they show in the feed and on the board page). A pin that sits only on private boards is private to the owner (and staff). Turning a board private hides its pins from the public again; turning it public shows them. Nothing needs approving for customer boards; staff can hide any pin or board.
- **Following.** A signed-in person follows a public board (never their own). A "Following" tab on the feed shows the newest pins from the boards they follow. A board that turns private drops out of its followers' feeds (their follow is kept, and it comes back if it turns public again). Followers are counted, and the owner sees how many but not who, unless they are staff.
- **Downloads.** A per-pin switch, on by default. Off: no download button and our download endpoint refuses; the picture can still be seen. The download comes through our endpoint, named after the pin.
- **Video.** The same four embed sites and the same upload (MP4 or WebM, 100 MB, poster frame taken in the browser) as the campaign video section; the embed code is reused.
- **Images.** JPG, PNG or WebP up to 10 MB. The width and height are stored so the grid never jumps. A 640-pixel thumbnail is made with GD when the server has it, otherwise the original is used.
- **Feed.** Cursor paging (newest first, or by tag/search), 30 at a time, stable while new pins arrive. Two tabs: "Discover" (all public pins) and "Following" (pins from followed boards). Product pins read live name, price and picture through the catalogue adapter.
- **Moderation.** A pin or board can be hidden by staff (with a reason). Reports, likes and comments arrive later through the Engagement Engine; pins and boards already have the type, id and status it needs.

## Backend
Services under `app/Services/Campaigns/`: PinService (create, update, hide, media), BoardService (create, add and remove pins, visibility, approval), MoodboardService, Feed (visibility and cursor), plus `Moodboard presets` in code (six layouts). Approval reuses CampaignApproval's pattern with a generic "approve this item" calendar task. Public routes: feed, pin, board, download. Customer routes: my boards, create and edit board, upload a pin (image, link, embed), save and unsave a pin, follow and unfollow a board, the following feed. Admin routes: pin library, boards, moodboards, approvals.

## Moodboard layout (templates)
An artboard with a fixed aspect ratio and slots positioned in percent (x, y, width, height, rotation, layer, shape: rectangle, rounded, circle, polaroid). A slot accepts a photo (a pin), a colour swatch, a text label (a handwritten or chosen font), a product cut-out or a sticker. Percent positions mean it scales to any screen. Six presets to start: simple grid, overlap collage (like the references), swatch-led, hero and details, polaroid scatter, editorial. A free-form drag editor can come later.

## Frontend (folder `frontend/src/campaigns/`)
Public: `/world` (endless masonry feed with tag and search), a pin page (also opens over the feed), `/boards/<id-slug>`, "Save" menu on every pin (choose or create a board), "My boards" for signed-in customers (create, rename, public or private, remove pins, upload a pin) and a Follow button with the follower count on each public board. Admin: Pins library (upload, video, product, edit, hide), Boards (official boards, approvals), Moodboards (pick a template, fill slots, save as template). Campaign page builder gets three more sections: board or pin grid, moodboard, and community gallery.

## Build order
1. Script 83 (tables) and the backup map entry.
2. Pins: backend, image and video upload (with thumbnails), admin library.
3. Boards: backend, staff boards, approval with calendar tasks, board admin.
4. Public: `/world` feed, pin page, board page, download endpoint.
5. Customer boards: save to a board, create boards, upload pins (images, links, embeds), My boards, public or private, and following boards with the Following feed.
6. Moodboards: presets, slot filling, preview, save as template.
7. Campaign sections (board or pin grid, moodboard, gallery) and the numbers (saves, downloads).
Each step is committed and pushed on its own and leaves the site working.

## Decided
- Customers can upload images, links and video embeds, but not video files.
- A public board makes its pins public.
- Customers can follow public boards now (not later), with a Following feed.
