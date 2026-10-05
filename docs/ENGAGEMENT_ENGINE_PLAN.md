# Engagement Engine - plan (nothing built yet)

One engine for everything people say or do *about* something on the site: reviews, ratings, comments, replies, likes, helpful votes and reports. It attaches to anything by type and id (product, service, hamper, pin, board, moodboard, campaign, and a comment itself for replies). **Nothing about who may do what is written in code.** Each combination of *what* and *action* has settings an admin changes, and a few presets fill them in to start.

## Where we are today (what the engine replaces)
- Product reviews exist (`product_reviews`, `ProductReviewController`, `ReviewEligibilityController`). The rule "has this customer bought it" is fixed in code, and it looks at the old `orders` table, which script 34 dropped. So reviewing is broken right now; sales live in vouchers.
- Services have a "review count" on the page but no reviews.
- Publications have their own comments (`PublicationComment`); they stay as they are for now.
- A new module key, `engagement`, sits under Extras. Switched off: no review, comment, like or report control appears anywhere, and nothing else breaks.

## The idea: targets, actions, rules
- **Targets** (registered in code, each knows its module): product, service, hamper (E-commerce); pin, board, moodboard, campaign (Campaigns); comment (so replies and reactions on comments work).
- **Actions:** `review` (rating + words, optional photos), `comment`, `reply`, `like`, `helpful`, `report`.
- **A rule** = one target type + one action, with these settings (all editable, all with a default):

| Setting | Choices |
|---|---|
| Allowed | on / off |
| Who | everyone including guests / signed-in people / customers only / staff only |
| Must have bought it (products, services, hampers only) | no / yes |
| What counts as "bought" (below) | a few switches |
| Held for approval | never / always / first post of each person / guests only |
| One per person per item | yes / no |
| Edit window | none / minutes |
| Minimum words, photos allowed | numbers / on-off |
| Daily limit per person | number or no limit |
| Blocked words | a list; a match always holds the post |

Reports have their own settings: who may report, the list of reasons (editable), how many reports hide a post automatically while staff look (0 = never), and whether the person who posted is told.

## "Has this customer bought it" - settings, not code
Proof of purchase is read from the books: a **posted sales invoice or cash sale** that contains the item, dated before the review, **less credit notes** (a fully credited item is not a purchase). For services it also reads the booking.

Switches (each on the Engagement settings page):
- Must the invoice be **paid**? yes / no
- Must a product be **delivered**? yes / no (when delivery is tracked)
- Services: does a **completed** booking count? (default yes)
- Services: does a booking **cancelled late, with a cancellation fee invoiced** count as bought? yes / no (your example)
- Services: does a **no-show** with a fee count? yes / no
- Services: does a booking **cancelled in time** (nothing charged) count? (default no)
- Can a customer review something they **never bought**? yes / no. This is the "Must have bought it" setting above, per item type: products one answer, services another.
- Guests: may they review products? services? (default no for both; if yes they give a name, and their posts follow the "guests only" hold)

A review that passed the check carries a "Verified purchase" badge; with the setting off for that type, reviews from people who did not buy show without the badge.

## Presets (a starting point, then editable)
- **Verified buyers** (default; matches today's intent): products and services reviewed only by people who bought, held for approval; signed-in people can like, help-vote and report; guests can only read.
- **Open community:** signed-in people can review, comment, like and report without buying; held for approval for first-time posters.
- **Brand wall:** pins, boards, moodboards and campaigns can be liked and reported by signed-in people; comments held for approval; guests read only.
- **Read only:** everything off except reports.
Applying a preset overwrites the rules (with a confirmation); changing one rule afterwards marks the preset "customised".

## Reports and moderation
- A report is **not a takedown**. It opens a case; staff choose **keep it**, **pull it down**, or **flag it as a policy breach** (picking the policy from the policy ecosystem, with a note). Every decision is logged with who and when.
- Held posts and open reports appear in one **moderation queue** for admin, super admin and manager. (Sales rep and finance can read but not decide.)
- Pulling down a pin, board or moodboard uses the hide we already built. Pulling down a review or comment hides it from everyone but staff and the author.

## Data (new scripts, run in Workbench like the others)
- `engagement_rules` (target type, action, settings JSON) and `engagement_settings` (the purchase switches, report reasons, blocked words, preset name).
- `engagement_posts` (id, target type and id, kind review or comment, parent id for replies, user id or guest name, rating, title, body, photos, verified purchase, status held / published / hidden / removed, who approved).
- `engagement_reactions` (target, kind like or helpful, user id or a hashed guest key; one per person per target and kind).
- `engagement_reports` (target, reporter, reason, note, status open / kept / removed / flagged, decided by, policy note) and `engagement_log` (every moderation action).
- A one-time copy of the existing `product_reviews` into `engagement_posts`, then the old review routes are removed.
- All new tables go in the module's backup list (the lesson from Campaigns).

## Build order
1. **Core:** script, targets registry, rules and presets, the purchase check, the settings API and the Settings page (Settings > Engagement) with the presets.
2. **Reviews and comments** for products and services on the storefront (replacing the broken product review code; copy the old reviews across).
3. **Reactions and reports:** like, helpful, report buttons; the moderation queue with keep, pull down and flag.
4. **Brand wall:** like, comment and report on pins, boards, moodboards and campaigns in `/world` and campaign pages.
5. **Numbers and notices:** likes, comments and reports in campaign numbers; a calendar task for approvers when something is held or reported.

## Questions before step 1
1. **Engine switched off:** product reviews disappear from the storefront too (consistent: no engine, no controls). Or keep reviews working on their own when only E-commerce is on? I recommend the first.
2. **Old reviews:** copy them into the engine (their order links are dead since `orders` went). Yes?
3. **Held posts:** should approvers get a calendar task for each held post or report (like approvals), or only a count in the queue? I suggest one task per day while anything is waiting, not one per post.
4. **Guests:** when guests may post, ask for a name only, or name and email? I suggest name only, always held, limited by address.
