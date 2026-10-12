# Memberships module plan

Status: **plan only, nothing built.** Written 12 Oct 2026 after the owner asked to build Memberships and integrate it with Meals (Menus) subscriptions and Courses. Decisions marked ✔ are the owner's; the rest are recommendations waiting for a yes.

## 1. What it is

Recurring money: a customer holds a **membership** of a **plan** for consecutive **periods** (week, month, quarter, year, or N days). Each period is billed through the existing **Books ledger** (Sales Order → invoice → receipt, credit note for a refund), exactly as Courses does. **Memberships does no accounting of its own**; it keeps the plan, who holds it, the period dates and the ids that point at the invoices.

What a plan gives is a list of **benefits**. Memberships does not know how to run a course or a meal plan: each module registers a small **benefit handler** and Memberships only tells it "this person now holds this plan" or "this person no longer does".

## 2. Integration (the point of the module)

| Module | What a plan can do there | How |
|---|---|---|
| **Courses** | give access to chosen offerings, or to every offering of a kind or category, for as long as the membership is in good standing | benefit `courses`: `CourseAccess::grant(source: membership, ref: membership:ID)` on activation/renewal, `revoke` on pause, lapse or cancel (the access service already supports this source). Option per benefit: **tuition fee waived for members** (registration, exam, materials and kit fees are still charged) |
| **Menus (meals)** | a meal plan subscription **requires** an active membership (any plan, or named plans); members may get a **% discount** on a meal plan | `menus_plans.requires_membership` (a setting, **off until Memberships exists**), checked in `SubscriptionService::subscribe`; a subscription whose membership lapses is paused by the existing "two unpaid weeks" rule or at once (setting) |
| **Class passes / credits** | N sessions per period (10-session packs), spent on live classes, bookings, events | `membership_credits` ledger (grant, spend, expire, refund); Courses and Bookings spend through one `Credits::spend()` |
| **Events / E-commerce** | ticket discount, free tickets, member price | later steps, same handler contract |
| **Branch access and check-in** | allowed branches, a member QR card, a door/desk check-in | Signed code type `mem` (like tickets), `membership_checkins`, later step |

A benefit handler is `register(type, label, grant(Membership), revoke(Membership), describe(plan))`, the same registry idea as the core Codes resolvers. A module that is switched off simply has no handler, and its benefits are hidden.

## 3. Billing rules (recommended)

- **Plan**: name, description, price per period before tax, sales account (the tax comes from the ledger), period length, **joining fee** (once), **trial** days, **grace** days, auto-renew, places (optional), allowed branches, benefits, active.
- **Join** (counter by staff, or online by the signed-in person; the payer needs a customer account): membership `pending` → first invoice (joining fee + first period, or trial then first period) → paid → `active`, period 1 starts. Unpaid within the pending time (setting, 48 h) → released.
- **Renewal**: the next period is invoiced `renewal_lead_days` (setting, 7) before the period ends, with a pay link (M-Pesa STK or card; **M-Pesa cannot be debited automatically**, so every period is an invoice the member pays; card-on-file auto-charge can come later if the gateway supports it). Paid → the next period starts the day the last ends (no gap).
- **Dunning**: reminders 3 days before, on the due date and 3 days after; unpaid past the due date → `past_due` (benefits stay for the **grace** days) → `lapsed` (benefits revoked). Paying a lapsed membership re-activates it from the payment day (the gap is not billed).
- **Pause** (member asks; up to N days per year, a setting; benefits suspended, the period end moves out), **resume**, **cancel** (at the end of the paid period by default; immediately only by staff; no automatic refund, staff may refund the unused part as a credit note with `memberships.refund`).
- **Change plan**: an upgrade takes effect now and the difference for the rest of the period is invoiced; a downgrade takes effect at the next renewal.
- **Member and payer** can differ (a parent or a company pays). Seats for a company plan come later.

## 4. Tables (a numbered idempotent script; every table in `ModuleTables` under `'memberships'`)

`membership_plans`, `membership_plan_benefits` (plan, type, JSON config), `memberships` (member, payer, plan, status, started_on, current period dates, paused_until, cancel_at, trial_ends), `membership_periods` (membership, from, to, invoice voucher id, order voucher id, amount, status: invoiced / paid / void), `membership_events` (a log of every change and who made it), `membership_credits` (a ledger of grants and spends), `membership_checkins`, `membership_settings`. Money lives in vouchers and ledgers; these tables hold only ids that point at them.

## 5. Permissions (roles stay data, never code)

`memberships.view`, `memberships.manage` (plans, benefits, settings), `memberships.enrol` (sell and take payments at the desk), `memberships.refund`, `memberships.grant` (give or end a membership without billing, with a reason), `memberships.checkin`. Added to the catalogue and to the `NoRoleNamesInCodeTest` snapshot, like Courses.

## 6. Build steps (each: built, then tested and mutation-checked when the owner says; the owner says "go" for the next)

1. **Foundation**: permissions, module and licence id (8 is already reserved), settings, plans and benefits (admin), the benefit-handler registry, nav, backup tables.
2. **Join and bill**: membership lifecycle, periods and invoices through the ledger, payment hook in `GatewayPaymentService`, renewal, dunning, grace, lapse, pause, cancel, change plan, jobs (`memberships:sweep`), notices.
3. **The member's side**: `/membership` plans page, join and pay, My membership (status, next payment, pay now, benefits, pause, cancel).
4. **Courses and Menus integration**: the `courses` benefit handler (access, tuition waiver), the Menus requirement and discount on meal plans (setting off until switched on).
5. **Credits / class passes** and spending them on live classes.
6. **Check-in, branch access and the member card** (signed QR).
7. **Reports** (active by plan, new, churn, monthly recurring revenue, expiring, past due), then tests and mutation checks for all steps.

## 7. Questions for the owner

1. Benefit handlers per module as above: yes?
2. Every period billed as an invoice with a pay link (no auto-debit on M-Pesa): yes?
3. Courses for members: **tuition waived, other fees still charged**, or access only with every fee charged as normal?
4. Meal plans: start with **"requires a membership" and a member discount**, and leave **"the membership includes the meal plan"** (one bill) for later?
5. Upgrade now with the difference invoiced, downgrade at renewal: yes?
