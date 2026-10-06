# Services: video and brochures - plan (nothing built yet)

Two changes to services, built together. A small detour from Campaigns.

## Part 1 - Service video (upload or link)

**Today:** `services.video_url` is a plain text box and is never shown anywhere. `brochure_url` is the same (saved, never shown).

**Data (no new column):** the existing `video_url` column holds either a link (`https://...`) or the path of an uploaded file (`/storage/services/video/...`). Starting with `/storage` means upload; anything else is a link. Links are checked with the same allow-list the pins use (YouTube, Vimeo, TikTok, Facebook). Replacing or removing a video deletes the old uploaded file.

**Admin form:** the Video field becomes None / Upload a file / Paste a link, with a preview and Remove. Upload: MP4 or WebM, up to the PHP limit (100 MB).

**Customer card (services list):**
- No video: unchanged (main image).
- Video: hover plays it muted and looping over the image; moving away shows the main image again. Touch screens do not autoplay (they show the image with a play mark).
- Link videos play through the embed (muted); uploads through a plain video tag.

**Customer detail page (gallery order):** video, main image, other images, then back to the video. The side arrows and thumbnails follow that order; the video has a thumbnail with a play mark.
- The video plays only while it is on screen and is the selected item. Scroll it out of view, or pick an image, and it pauses. This avoids sound with nothing to see.
- Browsers refuse sound before a tap, so it starts muted with an unmute button.

## Part 2 - Brochures

**Abolish `brochure_url`.** Replace it with brochure settings stored as data (no new column per setting):
- `services.brochure_meta` (JSON): this service's own choices.
- `service_settings.brochure_defaults` (JSON, the existing one-row defaults table): the shop-wide defaults.
- A service uses its own value where it has set one, otherwise the default. A service with no template falls back to the default template.

**Settings held (all optional per service, all have a default):**
- Customers can download a brochure: yes / no
- Template: which one
- Show price: show / "price on request" / hide
- Show the main image (cover)
- Show other images (and how many)
- Show other charges (the service's fee ledgers that apply, with their conditions)
- Print the booking policy (the live booking terms, placeholders filled in)
- Also: features and deliverables, requirements and the questions customers answer, pricing tiers, duration and how it is delivered, rating, contact details and a QR link to the service

**Templates:** three built into the code (Classic, Modern with a big cover, Minimal text), each a print layout. Staff choose the shop default and can override it per service. Adding more later is adding a layout.

**Admin tab:** Services, **Brochures**, Service categories, Service settings. On the Brochures tab:
1. Defaults card: default template and the default switches above.
2. Template gallery: a preview of each template.
3. A table of services with their template, download on/off and whether the price shows, with row checkboxes to apply a setting to many services at once.
4. Per service: edit its settings, and Preview the PDF (staff can preview even if download is off).
The service form no longer has a Brochure URL box; it shows a short summary with a link to the Brochures tab.

**The PDF:** made on demand from the service's current details (dompdf, already in the project), so it is never out of date and nothing is stored. Endpoint: `GET /services/{id}/brochure`, only when download is allowed and the service is visible; throttled. Customer service page shows a **Download brochure** button only when allowed.

## Database
One script (92): add `services.brochure_meta`, add `service_settings.brochure_defaults`, drop `services.brochure_url` (test data only). Part A read-only check, B change, C result check.

## Build steps (one go)
1. Script 92 and the model changes.
2. Video: backend upload and cleanup, admin field, card hover, detail gallery with in-view playback.
3. Brochure: settings resolver (defaults + service), three print templates, PDF endpoint, staff preview.
4. Brochures tab (defaults, gallery, table with bulk apply, per-service edit), nav tab, remove Brochure URL from the form.
5. Customer Download button on the service page.
6. Test with a database that matches script 92, render PDFs and look at them, lint and build.

## Questions before building
1. Link videos on a card: play the YouTube or Vimeo embed muted on hover (slower to start than an uploaded file). OK?
2. Existing services: brochure download on or off by default? (Suggest on, with the default template.)
3. A service with a negotiable price: show "Price on request" in the brochure. OK?
4. Three templates to start. OK, or different styles?
