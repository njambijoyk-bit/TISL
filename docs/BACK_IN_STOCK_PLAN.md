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

## Hampers, product cards, products with options (added)
- **Product cards** (large, compact and polaroid) show a small **Notify me** button on an out-of-stock product that is not open for preorder; it opens the same form in a dialog drawn on the page (not inside the card).
- **Products with several options:** if the shopper has not picked one, the server asks which: the form shows the options that are out of stock (if only one is out it is taken without asking). The message names the option.
- **Hampers** (script 113 adds `hamper_id` to both tables): the form is on the hamper page and a button on the hamper card. A hamper can be waited for while it can not be made up (the shop's own rule: every part at the hamper's branch, minus what is promised to preorders). "As many as stock" means **how many hampers can be made up** (the fewest of what each part allows). When any part of a hamper someone waits for goes up in stock, the people waiting for it are told if it can now be made. The message links to `/hampers/{slug}`; hampers need a sign-in, so a guest signs in first and lands on the hamper. Staff tab lists hampers beside products, with their own tell buttons.
- Shown for hampers only where the shop already tells shoppers a hamper is out of stock or coming soon (that needs the Campaigns module, as the hamper's stock state does).
- Emails to people with no bell row (guests) now keep their button: the link is stored on the delivery (`payload`, script 110) and the email job reads it. Before this a guest's email had no "Order now" button.

## Not done / by design
- A message does not reserve stock. Nothing tracks whether the person then bought (the hold window is the approximation).
- No confirmation email on asking (one email when it is back, with a stop link; throttled and capped per email).
- Unverified in the real environment: the queue worker picking up `TellBackInStock` on a real restock (purchase receipt, transfer, count), and real email/WhatsApp delivery. Try: ask on an out-of-stock product, receive a purchase of it, and watch Stock alerts → Record.
