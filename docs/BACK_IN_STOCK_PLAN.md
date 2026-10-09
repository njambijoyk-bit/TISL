# Back-in-stock alerts ("tell me when it is back")

Decisions (from the owner): anyone with an email address can ask; the same channels and preferences as every other message; tell **as many people as there is stock**, **or everyone**, and the company can choose.

## How it works (as built)
- **Asking.** On an out-of-stock product page (and not when a preorder is open) a box says "Email me when it is back in stock". A signed-in customer has the email filled in. Open to guests, throttled (10 a minute). One request per email per option; a repeat is "you are already on the list". At most 20 waiting requests per email. Refused when the product can in fact be bought now, or when the company has switched the alerts off. Table `stock_watches` (script 112).
- **When stock goes up.** Every stock change ends in `VariantStockService::recomputeCaches`, which already works out what customers can buy of each variant (selling branches only, minus what is promised to preorders). When that number goes up and someone is waiting, a `TellBackInStock` job is queued after the transaction commits (never inside a half-finished posting).
- **Who is told** (Settings → Notifications → General → Back-in-stock alerts):
  - *As many people as there is stock, first come first served* (the default): the earliest requests, one person per unit. People told in the last N hours (default 24, 1–168) count against the stock, so a stray return does not tell another batch while the first is deciding. The rest keep waiting for the next stock.
  - *Everyone waiting*.
  - *Staff do it* (nothing on its own).
  Never anybody when nothing can be bought. Each request is told once (marked told **before** anything is sent, so two runs at once can not tell the same person twice).
- **Staff override**, Settings → Notifications → **Stock alerts**: who is waiting for what, what is in stock, **Tell as many as stock** / **Tell all N** per product, and the record of every time people were told (automatic or by whom). Table `stock_watch_runs`.
- **The message** is a normal notification of type `back_in_stock`, so it follows the company's channel rules and each customer's way of being reached (email, WhatsApp tap-to-send or API). It is **essential**: the customer asked for exactly this, so "essential messages only" does not silence it. It says stock is first come first served and that the message holds nothing for them, links to the product (`/products/{id}?variant={id}`) and carries a **stop link** (`/stock-alerts/stop/{token}`, a page with one button; works any number of times). WhatsApp via the API needs a template for `back_in_stock` like any other type (Settings → Messages).
- **Housekeeping.** Requests nobody acted on for a year become `expired` (daily). Both tables are in the backup map.

## Not done / by design
- A message does not reserve stock. Nothing tracks whether the person then bought (the hold window is the approximation).
- No confirmation email on asking (one email when it is back, with a stop link; throttled and capped per email).
- Back-in-stock for **hampers**, and the product cards in lists, do not have the button yet (the product page only).
- Unverified in the real environment: the queue worker picking up `TellBackInStock` on a real restock (purchase receipt, transfer, count), and real email/WhatsApp delivery. Try: ask on an out-of-stock product, receive a purchase of it, and watch Stock alerts → Record.
