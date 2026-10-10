# Codes (core): QR codes and barcodes, made and read by us — plan

Status: **built so far:** the QR encoder and decoder, the barcode encoders (Code 128, EAN-13/8, UPC-A/E, Code 39, ITF/ITF-14), signed codes and the scan registry, the Codes page (Admin → Codes & labels: items, giving codes, printing labels, scan lookup, settings, print log) and the scanner component (camera where the browser can read codes, handheld scanners, typing). **Also built (phase B):** Data Matrix ECC 200 (all 30 sizes, GS1), PDF417, Code 93, Codabar, GS1-128. **Still to build:** our own camera decoder for browsers without a built-in reader (Safari/iPhone); scan buttons inside the stock screens; the checkout/POS. To use it: run `119_codes.sql` and `php artisan access:seed`.

Originally: This becomes a core service that Events (tickets) is the first user of, then Ecommerce, Stock, Menus, Courses and others.

## Decisions
- ✔ **We write our own encoder, in core**, not a library, so every module uses one thing and there is no outside dependency to update or trust.
- ✔ "arcodes" means **barcodes** (the 1-D lines), plus the 2-D family: **Data Matrix** and others are wanted too.
- ✔ **A Codes page comes before POS**: print codes and attach them to products, then use them at checkout and for inventory tracking. POS itself comes after.

## What core provides
1. **QR encoder** (PHP): text/bytes in, QR out. Versions 1–40, modes numeric / alphanumeric / byte (UTF-8), error correction L/M/Q/H, all 8 masks with penalty scoring, Reed–Solomon over GF(256), format and version information. Output as **SVG** (crisp at any print size, small, themeable colours, optional quiet zone, optional centre logo gap using error correction H) and **PNG** (via GD, for emails and PDFs).
2. **Barcode encoders** (PHP), in two phases:
   - **Phase A:** Code 128 (everything: SKUs, serials, asset tags, receipts), EAN-13 / EAN-8 / UPC-A / UPC-E (retail products with a real GTIN, check digits validated), Code 39, ITF / ITF-14 (cartons).
   - **Phase B:** **Data Matrix (ECC 200)** (tiny labels on small parts, jewellery, pharma, with GS1 Data Matrix), **PDF417** (IDs, boarding-pass style, long data), Code 93, Codabar, **GS1-128** (batch, expiry, serial in one code: ties into expiry/batch stock).
   - **Later, only if needed:** Aztec.
   SVG and PNG, human-readable text underneath optional.
3. **Signed payloads:** a code that carries a value only we can make: `type.id.signature` where the signature is an HMAC of the type and id with the app key (a per-purpose key derived from it, so a ticket code can never be replayed as a gift-voucher code). Verification is constant-time and needs no database to tell a forged code from a real one. Used for tickets, certificates, gift cards, pickup/delivery handovers.
4. **Short-link resolver:** QR codes that point at `https://shop/q/{code}`. Modules register what a code means; scanning with a normal phone camera opens the right page (a menu table → the table's menu; a product label → the product page; a course certificate → its public verification page; a ticket → "show this to staff" page), while the staff scanner calls the same code for the *action* (check in, receive stock). The registry is where each module plugs in; core never knows module details.
5. **Scanner (frontend, core component):** one `<CodeScanner>` for every module: uses the browser's built-in reader where it exists, otherwise our own decoder fallback running on camera frames. Also accepts a handheld USB/Bluetooth scanner (they type the code and press Enter) and a typed code. Remembers camera choice, beeps/vibrates on a read, debounces repeat reads.
6. **Renderer + label printing (frontend):** `<Code value kind size />` and print layouts for sticker/label sheets (A4 grids, 40×30 / 50×25 mm rolls) so products, stock batches, inventory assets, shelves, event tickets and table cards print from one place.
7. **Logging:** each scan result recorded by the caller module (who, when, result); core just returns a verdict.

## Who uses it
| Module | Code | What scanning does |
|---|---|---|
| Events | QR (signed) | check in at the door |
| Ecommerce / Stock | Code 128 / EAN-13 on variants (the `barcode` field already exists), batches, assets (`inventory_instances.barcode` exists) | receive stock, stock counts, find item, POS-style lookup |
| Delivery | QR on manifests/parcels | confirm handover |
| Menus | QR on table cards | opens that table's menu / order |
| Courses | QR on certificates | public "is this certificate real" page |
| Books | QR on invoices/receipts/gift vouchers | verify authenticity, redeem |
| Campaigns | QR to a campaign page | links from posters/print |
| Staff | QR on staff badges | attendance (later) |

## Build order (each tested; the encoder is proven against known answers)
1. **QR encoder** with tests against published reference vectors, plus a **round-trip test with a decoder** we also write (our scanner fallback), so encode→decode is checked over thousands of random strings, all versions, all levels. SVG/PNG output.
2. **Barcode encoders** (Code 128, EAN-13/UPC-A, Code 39, ITF) with known-answer tests and check digits.
3. **Signed payloads + resolver registry** (`/q/{code}`), scoped keys, tests for forgery, tampering, cross-purpose replay.
4. **Frontend:** `<Code>`, `<CodeScanner>`, label print sheets; checked in a real browser with a printed/generated code.
5. **The Codes page** (below) and scanning in stock screens.
6. **Events tickets and the door screen** (plan in `EVENTS_PLAN.md`).
7. Data Matrix, PDF417, Code 93, Codabar, GS1-128 (phase B encoders, same tests).
8. Later: POS checkout scanning, staff badges.

## The Codes page (Admin → Codes) — before POS
The place to make a product scannable and put a label on it.
- **Pick what to label:** products and variants (and their pack sizes), stock batches, inventory assets, shelf locations. Search, filter by category/brand/missing code, select many.
- **Give a code to what has none:** one click makes a unique internal code (EAN-13 in the in-store range with a valid check digit, or Code 128 from the SKU), checks it is not used anywhere, and saves it in the item's `barcode` field. An item that already has a real manufacturer GTIN keeps it. Changing or retiring a code keeps the old one findable (so old labels still scan).
- **Choose the look:** code type per item kind (defaults in Settings → Codes), label template (what prints beside the code: name, price, SKU, batch/expiry), size (A4 sheets of N labels, 50×25 mm and 40×30 mm rolls, shelf-edge strips), copies per item (a fixed number, or one per unit in stock/received).
- **Print or PDF**; reprint any time; a log of what was printed and by whom.
- **Use it:** a lookup (`GET /codes/lookup?code=…`) turns anything scanned into the variant / pack / batch / asset it belongs to. Stock screens (receiving, counts, transfers, find item) get a scan button now; the checkout/POS uses the same lookup when it is built.
- Pack barcodes: a carton code can stand for N units (so scanning a carton receives N).

## Notes and limits
- A hand-written QR encoder is a known, well-defined job (the standard is public) but easy to get subtly wrong; that is why the plan proves it by decoding what it makes and by reference vectors, and why we will also test with a real phone camera before relying on it.
- Printing quality is the shop's printer: the label sheets default to a large quiet zone and error correction M (H when a logo gap is used).
- No customer data goes in a QR: only the signed id. Staff scanner results show details after the server checks the staff member's permission.
- Settings: default error correction, colours, logo, label sizes (Settings → Codes), small.

## To confirm
- "arcodes" = barcodes (assumed).
- Barcode kinds above are enough (add Data Matrix / PDF417 later only if a need appears).
- Staff-badge attendance, and POS-style scanning at checkout, are later phases, not in the first build.

## How it was proved (kept so the next encoder gets the same treatment)
- Each encoder is checked against the standard's own tables and worked examples, against a second implementation where one exists (bit for bit), and by an **independent decoder (zxing-cpp)** reading what we make: 171 QR codes (every version and level at full capacity, every mask, the largest numeric and alphanumeric) and 255 barcodes. Run `tests/Tools/crosscheck` after any change to an encoder.
- The printed labels themselves were rendered by a browser at several sheet and roll sizes (down to 38 × 21 mm) and read back by the same independent decoder.
- Unit tests were also mutation-checked: deliberately breaking a rule makes a test fail.
