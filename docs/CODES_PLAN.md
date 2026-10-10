# Codes (core): QR codes and barcodes, made and read by us — plan

Status: **plan, nothing built yet.** This becomes a core service that Events (tickets) is the first user of, then Ecommerce, Stock, Menus, Courses and others.

## Decisions
- ✔ **We write our own encoder, in core**, not a library, so every module uses one thing and there is no outside dependency to update or trust.
- Read "arcodes" as **barcodes** (the 1-D lines). If AR (augmented reality) codes were meant, say so: that is a different, much bigger thing and not planned here.

## What core provides
1. **QR encoder** (PHP): text/bytes in, QR out. Versions 1–40, modes numeric / alphanumeric / byte (UTF-8), error correction L/M/Q/H, all 8 masks with penalty scoring, Reed–Solomon over GF(256), format and version information. Output as **SVG** (crisp at any print size, small, themeable colours, optional quiet zone, optional centre logo gap using error correction H) and **PNG** (via GD, for emails and PDFs).
2. **Barcode encoder** (PHP): Code 128 (everything: SKUs, serials, asset tags, receipts), EAN-13 / UPC-A (retail products that carry a real GTIN, with check digit validation), Code 39 (legacy asset tags), ITF (cartons). SVG and PNG, human-readable text underneath optional.
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
5. First consumer: **Events tickets and the door screen** (plan in `EVENTS_PLAN.md`), then stock labels and scanning on variants.

## Notes and limits
- A hand-written QR encoder is a known, well-defined job (the standard is public) but easy to get subtly wrong; that is why the plan proves it by decoding what it makes and by reference vectors, and why we will also test with a real phone camera before relying on it.
- Printing quality is the shop's printer: the label sheets default to a large quiet zone and error correction M (H when a logo gap is used).
- No customer data goes in a QR: only the signed id. Staff scanner results show details after the server checks the staff member's permission.
- Settings: default error correction, colours, logo, label sizes (Settings → Codes), small.

## To confirm
- "arcodes" = barcodes (assumed).
- Barcode kinds above are enough (add Data Matrix / PDF417 later only if a need appears).
- Staff-badge attendance, and POS-style scanning at checkout, are later phases, not in the first build.
