# Security Phase 4: convenience features — what, how hard, and how it fits TISL

Phases 0–3 are built. Phase 4 is **convenience**: ways to sign in or approve things with less typing. None of it makes TISL safer than it is now (passkeys, step-up, the Council of Two and recovery already do that). Each item adds a new door, so each needs care. It is optional and can be done in any order.

**Where TISL stands today** (read from the code): passkeys are the strong proof; the PWA plugin (`vite-plugin-pwa`) is installed; there is **no Web Push** (no VAPID keys, no push subscriptions); there are **no QR or authenticator-app libraries**; email and the in-app bell already work for notices; the cookie session, sessions list, rate limits and alert emails from earlier phases are all reusable.

Complexity scale: **S** = a day or less · **M** = 2–4 days · **L** = a week or more. All include the same testing we have done so far (unit tests, mutation checks, a real-browser check).

---

## 4.1 Email sign-in link (customers only)

**What it is.** A customer types their email and gets a one-time link instead of typing a password.

| | |
|---|---|
| **Complexity** | **S–M** |
| **Pros** | Customers who forget passwords (the most common support problem) get in without a reset. We already send email and have the cooling and "This was not me" machinery. No new device or app. |
| **Cons** | Only as safe as the customer's email account. Link scanners in some mail systems "click" links and use them up (needs a confirm button on the page). Customers with slow email feel it is slower than a saved password. |
| **Suits us?** | **Yes, customers only.** Never for staff: it would be a weaker door next to their passkey. |
| **Needs** | Mail that is reliable (SMTP is already needed). No new packages. |
| **Risks to design for** | Link single-use and short-lived; tied to the browser that asked (so a forwarded link fails); rate limits; never reveals whether an email exists. |

## 4.2 Authenticator-app codes (6-digit TOTP), optional

**What it is.** The person scans a code into Google Authenticator / Microsoft Authenticator and types the 6-digit number as a second step.

| | |
|---|---|
| **Complexity** | **M** |
| **Pros** | Works on any phone with no push setup and no internet at the moment of use. Familiar to many people. Useful as a "second factor" for customers who do not want passkeys. |
| **Cons** | **Phishable**: a fake site can ask for the number and use it at once. Our plan keeps strong proof for staff as passkeys only, so this stays "S1": allowed for customers, **never** counted as strong for staff. Lost phone needs its own recovery. Clock drift on a phone causes confusing failures. |
| **Suits us?** | **Partly.** Useful for customers who want more than a password; not for staff (they have passkeys). Low value if customers will happily use passkeys or the email link. |
| **Needs** | One small PHP library for the codes (`spomky-labs/otphp` or similar), a QR image to show once (a small JS library), a new script (one table for secrets, encrypted), backup codes. |

## 4.3 Scan-to-sign-in (QR from phone to computer)

**What it is.** The computer shows a QR code; the person scans it with the phone they are already signed in on and taps "Yes, that is me", and the computer is signed in.

| | |
|---|---|
| **Complexity** | **L** |
| **Pros** | Nice for staff on a shared computer who do not want to type a password; passkeys across devices (Google/Apple "use a phone") already give much of this for free through the browser. |
| **Cons** | This is the textbook "QR login hijack": an attacker shows **their** QR on a fake page and a hurried person approves it. It is only safe with all of: a number shown on both screens that the person must match, the computer's place and device shown on the phone, a very short single-use code tied to the browser that asked, and a signed-in phone that has just proved itself with a passkey. That is a lot of careful design for a convenience. |
| **Suits us?** | **Low priority.** WebAuthn already offers cross-device sign-in (the browser shows its own QR for the phone's passkey) and that is phishing-resistant by design. Ours would be a weaker copy. I would **skip it** unless staff ask for it. |
| **Needs** | New tables, a short-lived channel between the two screens (polling is enough), the phone's approval screen, QR generation, many new tests. |

## 4.4 Tap-to-approve (a phone notification to approve a step-up or Council request)

**What it is.** When an action needs a second person or a re-check, the other person's phone buzzes; they open it, see the facts, match a number, and approve with their fingerprint. Today they must open the Approvals page.

| | |
|---|---|
| **Complexity** | **L** (the biggest of the four) |
| **Pros** | Makes the Council of Two and assisted recovery much faster in practice (nobody has to be sitting on the Approvals page). The approval itself is still a passkey, so the safety does not drop. |
| **Cons** | Needs **Web Push**: a service worker, VAPID keys, a subscription table, a push library on the server, and working HTTPS. **iPhone only receives web push when the site is installed to the Home Screen as an app**, so it is unreliable for people who do not install it. Notifications can be turned off, delayed or blocked by the phone, so the Approvals page must stay as the fallback. Push contents travel through Google/Apple servers, so they must hold no secrets (just "something needs you"). |
| **Suits us?** | **Good fit later**, once the Council of Two and assisted recovery are in real use and the slowness is felt. We already have the PWA plugin and the alert system, so the groundwork is partly there. A cheaper first step: send the existing email/bell alert (already built) and add the **WhatsApp** channel TISL already uses elsewhere, with a link to Approvals. That gives most of the speed for a fraction of the work. |
| **Needs** | VAPID key pair in server settings; a push library (`minishlink/web-push`); a service worker (the PWA plugin can host it); a subscriptions table; an "allow notifications" prompt; a test device on Android and, for iPhone, an installed app. |

## 4.5 NFC badges and watches (later)

Tap a staff badge or a watch to prove who you are. **L–XL** and needs hardware, readers and a hardware supplier. **Not recommended now**; USB/NFC **security keys** already work today as passkeys with no extra code.

---

## Summary table

| Item | Complexity | Safety effect | Fit for TISL | My advice |
|---|---|---|---|---|
| 4.1 Email sign-in link | S–M | Neutral for customers (as safe as their email) | Customers only | **Do first** if customers struggle with passwords |
| 4.2 Authenticator codes | M | Slightly stronger than a password alone, still phishable | Optional, customers only | Do only if asked for |
| 4.3 Scan-to-sign-in | L | Risk of QR hijack if designed carelessly | Weak; the browser already has a safer version | **Skip** |
| 4.4 Tap-to-approve | L | Neutral (approval is still a passkey); makes approvals faster | Good, once approvals are used a lot | Try the **cheap WhatsApp/email link first**, real push later |
| 4.5 NFC / watches | L–XL | n/a | Needs hardware | Not now |

## What I would do

1. **Nothing new for staff.** The staff side is already strong; more doors only add risk.
2. **4.1 (email link for customers)** if password resets are a support burden.
3. **Speed up approvals** by sending the existing Approvals alert on WhatsApp too (small), and only build real Web Push (4.4) if that is still too slow.
4. Leave 4.2, 4.3 and 4.5 until someone actually asks.

Before any of it: roll out Phases 1–3 on the live server and watch the Test-mode numbers (Admin → Security → Sensitive actions). That tells us what people really find annoying, which is a better guide than this list.
