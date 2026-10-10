# Security: how TISL knows who you are — plan

Status: **plan, nothing built yet.** Decisions marked ✔ are the owner's; the rest are recommendations waiting for a yes.

The idea in one line: **how a person proves who they are** (real cryptography, standard and vetted) is separate from **how we show it** (the ceremony: a seal, a dispatch, a cross-examination). The ceremony is skin. The proof is passkeys (WebAuthn / FIDO2), never a homemade cipher.

The three themes the owner asked us to take seriously: **Plato's Cave** (a fake TISL must not be able to fool anyone), **the Ship of Theseus** (devices change; the account must survive that safely) and **the Socratic Cross-Examination** (ask harder questions only when the situation deserves it, and never confuse "proved who you are" with "allowed to do this").

---

## 1. Where TISL stands today (read from the code)

| # | What is there now | Why it matters | Phase |
|---|---|---|---|
| F1 | Changing or resetting a password **does not end other sessions** (`AuthController::changePassword` and `resetPassword` leave every token alive). | Someone who stole a session keeps it after the owner changes the password. The first thing a victim does does not help. | 0 |
| F2 | Sign-in tokens **never expire** (`config/sanctum.php` `expiration => null`) and live in the browser's `localStorage`. | Any script that ever runs on the page can read the token and keep it forever. | 0 |
| F3 | **No rate limit** on sign-in, forgot-password or register. Only a per-account lock (5 wrong passwords → locked 30 minutes) which (a) lets anyone lock a known email out, and (b) answers "locked" for real accounts and "invalid" for unknown ones, so it also tells a stranger which emails have accounts. | Guessing and lock-out attacks; account discovery. | 0 |
| F4 | Passwords: 8 characters minimum, nothing else. | Weak passwords are accepted. | 0 |
| F5 | **No second factor at all.** (The phone OTP only verifies a number.) | A staff password is the whole key to books, payroll and payment settings. | 1 |
| F6 | No list of signed-in devices, no "sign out everywhere", no "new sign-in" alert. | Nobody can see or end a stolen session. | 0–1 |
| F7 | Google and Microsoft sign-in (`OAuthController`) is a second door. | Any rule we add must be checked after **every** way of signing in. | 1 |
| F8 | Password reset by email and "admin resets a password" (`UserController::resetPassword`) exist. | These are recovery paths. They are the weakest link unless strong sign-in is tied to the **account**, not to one method. | 3 |
| F9 | One good step-up exists: payment keys ask for the owner's password again, are logged and emailed (`PaymentSettingsController`). | The right pattern, used in one place. We generalise it. | 2 |
| F10 | Sign-in events (success, failure, reset) are **not recorded anywhere**; authorization decisions are (`AccessLog`), and modules have their own logs. | No one place to answer "what happened to this account?" | 0 |

Good foundations to build on: the access engine (roles, clearance, branch scope, time-limited grants, **approval limits per role**), hashed passwords, `force_password_change`, Sanctum, the "off → log → on" rollout pattern the access engine already uses for branch limits, and our own signed-code and QR system.

## 2. Principles

1. **Proof ≠ presentation.** Names, animations and rituals are configurable skin. Every ceremony maps to an established mechanism. We do not invent cryptography.
2. **Authentication never grants permission.** The authorization engine decides what a person may do. A second factor can only *add* a condition; it can never override a role, a branch limit, an approval limit or a grant's end date.
3. **Strength belongs to the account, not to the method.** If an account requires a phishing-resistant sign-in, then password, Google, email link and an admin-set password are all *insufficient* for it. Otherwise the weakest door wins.
4. **Recovery is designed first.** The easiest way into a strongly protected account is its recovery. So recovery is as strict as the account.
5. **Roll out safely: off → log → enforce**, with grace periods and a break-glass way back in, so a mistake cannot lock the owner out.
6. **One security log**, and the owner hears about the scary events.
7. **Plain words always sit beside the ceremony.** "The Wax Seal — sign in with your fingerprint or face." A company can switch the theatre off ("Simple mode").

## 3. The model: four layers

```
 1 PROOF      passkey · security key · password · email link · (later) tap-to-approve, QR sign-in
 2 SESSION    who, from which device, what strength was reached, when it was last proven (freshness)
 3 POLICY     what strength each person and each sensitive action needs
 4 JUDGE      risk rules + the cross-examination screen; authorization is asked FIRST
```

Strength levels (plain names; the standard's own: NIST AAL):
- **S0** password only (today).
- **S1** two different things: password + a passkey/authenticator, or a verified-email link + something else.
- **S2** **phishing-resistant**: a passkey with fingerprint/face/PIN checked on the device, or a hardware security key. No code to type, nothing to copy, tied to the real website.

### 3.1 Proof methods

| Method | Experience name | Mechanism | Used by |
|---|---|---|---|
| Passkey (fingerprint, face, device PIN) | **The Wax Seal** | WebAuthn, user-verification required | everyone; the flagship |
| Hardware key (USB / NFC) | **The Iron Seal** | WebAuthn cross-platform, touch to confirm | super admins, finance approvers |
| Password | — | kept as a first step and for legacy accounts; better rules (F4) | all, shrinking |
| Sign-in link by email | **The Sealed Letter** | single-use link to a verified mailbox | customers, fallback only |
| Recovery codes | **The Spare Seal** | 10 single-use codes, stored hashed | recovery |
| Tap to approve on another device, with number matching | **The Watchword** | signed approval from a trusted device; user picks the number shown | Phase 4 |
| Scan to sign in | **The Courier** | our QR + a signed one-time code; the phone approves | Phase 4 |
| NFC badge, watch | — | later, only with real cryptographic badges | Phase 4+ |

SMS codes are **not** offered as a way in. They can be diverted and phished.

### 3.2 Plato's Cave — a copy of TISL must not be able to fool anyone

*Appearance is not proof of reality.* A fake page can copy our logo, wording and colours perfectly. What it cannot copy is the **website address the browser itself reports** to the passkey.

What we do:
- **Origin-bound passkeys.** A passkey belongs to one site. The browser refuses to use it on another address and tells our server which address it was asked on. The server checks: the origin and RP ID match ours, the challenge is the one we issued (single-use, 2 minutes), the user-verification flag is set for S2, the signature is genuine, and the signature counter has not gone backwards (a copied key).
- **The domain is decided now.** A passkey is tied to the domain it was made for (`RP ID`). Changing domain later orphans every passkey. Recommendation: pick the registrable domain (for example `targetisl.co.ke`) as the RP ID so the shop and the API can sit on subdomains. *Needs the owner's answer: the real production domains.*
- **The page reassures, the browser proves.** After the email is typed, the screen shows the person's own **seal phrase** and image (chosen by them), the real domain, and the plain sentence "You are signing in to the real TISL, not a copy." This is a flourish: a live phishing proxy can defeat a phrase. The protection is the passkey.
- **Phishable paths shrink.** Any account needing S2 loses the phishable fallbacks (no password-only, no code, no email link). A fake page then has nothing to steal.
- **The walls of the cave:** sign-in tokens leave `localStorage` for a `HttpOnly` cookie session (Sanctum's stateful SPA mode) or, at minimum, expire and rotate; Content-Security-Policy, `frame-ancestors` (so an approval screen cannot be framed and clicked for you), HSTS, `Referrer-Policy`, secure cookie flags. *Needs the owner's hosting details for the headers.*

### 3.3 The Ship of Theseus — devices change, the account stays itself

*If every plank is replaced, is it the same ship?* A person's account must survive new phones, lost laptops and rotated keys, **without** letting a stranger become "the same person".

- **A device is its cryptographic credential, not its name.** Identity is the credential ID and public key (a passkey, a hardware key, or a trusted-browser key the browser creates and cannot export). Not the user-agent, not the IP, not a cookie. Table `auth_credentials`: nickname, kind, public key, sign counter, whether it is **synced** (backup-eligible) or **device-bound**, transports, added when and **how** (first / approved by credential X / recovery), last used (when, where), revoked (when, by whom), and **`replaced_by`**, which keeps the lineage: *"Amina's new phone replaced her old Pixel on 3 March"*.
- **Adding a device** needs an existing device to approve it (fresh passkey on the old one) — or the recovery ladder below. The very first credential is added right after password + verified email, with an alert.
- **Replacing a device** ("I got a new phone"): enrol the new one while the old one approves; the old one is revoked in the same step and every session tied to it ends.
- **Lost a device:** from any other credential, **Revoke** ends that device's sessions at once; an alert goes to every remaining device and the email.
- **Two is the minimum for privileged accounts** (and nudged for everyone): "add a second device so you never get locked out". Super admins need two, and policy can demand **device-bound, not synced** (we read the authenticator's backup flags) because a synced passkey lives in an Apple or Google account, outside TISL's trust.
- **Cooling-off for the new:** a credential added in the last 24 hours cannot approve critical actions. Stolen-session attackers love to add their own device first; this denies them.
- **Rotation:** reminders to re-confirm credentials yearly; hardware keys never expire; the clone detector (counter going backwards) disables a credential and alerts.
- **Sessions know their device.** Table `auth_sessions` links each token to the credential, the strength reached (S0–S2), the methods used, and **when strong proof last happened** (freshness). The account page lists devices and sessions with Revoke buttons.

**The recovery ladder** (strict as the account):
1. Another registered credential.
2. **Recovery codes** (10, shown once, printed, stored hashed, each works once).
3. **Assisted recovery** (staff accounts): the person asks; **two other administrators** approve (the Council of Two; neither is the person); then a **24-hour cooling-off** during which every channel is alerted and the real owner of the account can cancel; the resulting session can do one thing only: enrol a new credential.
4. **Owner break-glass:** a server-side command (`security:recover`), logged, documented in a runbook, for the case where the owner and every backup are gone. Not a screen.
- Customers: the email link, with a cooling-off and an alert, because the stakes are lower.
- **An admin resetting a password does not touch passkeys.** There is a separate "reset sign-in methods" action: critical class, dual control, cooling-off for privileged accounts.

### 3.4 The Socratic Cross-Examination — ask more only when it matters

*Never confuse an assumption with knowledge.*

**Order of questions (always the same):**
1. **Authorization first.** `Authorizer`: permission, branch scope, time-limited grants, approval limit. If the answer is no, it is no: no amount of proof changes that, and the screen says so plainly.
2. **Then the judge:** does this action, at this moment, need more proof than the session already has?
3. **Then the cross-examination screen**, only if yes.

**Two moments:**
- **Signing in** (risk rules decide how much proof): a new device, a new network or country, an hour far from the person's usual ones, many failures before this success, a changed browser, a branch they never use. Result: let in / ask for a stronger method / let in with a notice / refuse and alert.
- **Sensitive actions** (the action decides): a short **catalogue**, like the permission catalogue, in code, each with a class, the strength needed, how fresh the proof must be, whether a reason is required and whether two people are needed.

Starter catalogue (about a dozen; the owner can raise or lower each):

| Action | Class | Needs |
|---|---|---|
| Payment keys changed (exists today with a password) | critical | S2 fresh ≤ 5 min · reason |
| Roles, permissions, clearance or access grants changed | critical | S2 fresh · reason · **two people** |
| Someone's sign-in methods reset, or an account's strength lowered | critical | S2 fresh · **two people** |
| Security settings themselves changed | critical | S2 fresh · **two people** |
| Payroll run approved or paid | critical | S2 fresh · approval limit · two people above the limit |
| Backup restored | critical | S2 fresh · reason |
| Staff account created, disabled or its role changed | elevated | S2 fresh |
| Bulk export (customers, payroll, ledgers) | elevated | S1 fresh ≤ 15 min |
| Posted voucher cancelled or refund above a limit | elevated | S1 fresh · approval limit |
| Bank or payee details changed | elevated | S1 fresh |

**The screen** (the *Sphinx's question*): shows the facts **from the server's record, never from the browser** — who is acting, which company and branch, which account or document, the amount, why it was flagged ("new device", "payroll for a branch you do not normally work in") — and asks: *"Is this the action you intended?"* The proof is a passkey assertion whose challenge is bound to that pending-action record (action, parameters hash, expiry, single use). A recorded approval cannot authorize a different action or be replayed (*the Paradox*). Critical actions also ask for a short reason; it is logged.

**Not an exam on every click:** proof has a freshness window. One cross-examination covers a short run of related actions; a stale session is asked again only for the next sensitive step.

**The Council of Two** (dual authorization) is built on the approval limits the access engine already has: the initiator and an approver who is a different person, who holds the approval permission and an adequate limit, both with fresh strong proof; the request expires; neither can substitute a second account of their own. Both are logged. It serves recovery, role changes and large payments.

**Rollout of every rule: off → log → enforce.** In log mode the system records "this would have asked a question" without asking. The owner sees how many people each rule would have affected before turning it on. Same pattern, same screen style as the branch-scope settings.

### 3.5 The experience layer (names are skin; every one maps to a mechanism)

| Experience | What it really is | Where |
|---|---|---|
| **The Wax Seal** | passkey sign-in and approval: *"A document awaits your seal."* | sign-in, step-up |
| **Plato's Cave** panel | real-domain statement + the person's seal phrase | sign-in page |
| **The Watchword** | number matching between two devices | Phase 4 |
| **Sealed Dispatch** | a pending approval (step-up request, new-device request) | notifications, approvals |
| **Ship of Theseus** | *My devices*: list, nickname, add, replace, revoke, lineage | account page |
| **The Socratic screen** | cross-examination for sensitive actions | modal |
| **Janus** | the two-sided confirmation: who is acting + exactly what | inside the Socratic screen |
| **Council of Two** | dual authorization | approvals |
| **The Oracle** | the ceremonial approval screen itself | all of the above |
| **The Trojan Horse** | monitoring, anomaly alerts, honey-token style traps on admin endpoints (never deceiving real users) | security log, alerts |

Rules: plain label first, theme second; honours "reduced motion"; works with keyboard and screen readers; every animation can be switched off.

## 4. Who needs what (defaults; the owner changes them)

Strength is a setting on the **role** in the role builder (and a default per kind of account). A person who holds several roles gets the highest requirement.

| Account | Default strength | Credentials | Notes |
|---|---|---|---|
| Customers | S0 → optional passkey ("sign in faster") | 1+ | passkey offered after a sign-in; email link as fallback |
| Ordinary staff | S1 | passkey nudged, then required after the grace period | shared counters: short idle timeout, badge later |
| Cashiers | S1 | passkey or approved authenticator | per-workstation sessions |
| Managers, finance | **S2** after grace | 2 | |
| Admins | **S2** | 2 | |
| Super admins, owner | **S2, device-bound** | 2 + recovery codes | break-glass runbook |
| Drivers | S1, phone-first | passkey on the phone | |
| Vendors, applicants | S0 + optional passkey | | lowest risk surface |

Grace periods: enrolment campaign first (a banner, then a "do it now" screen), enforcement date later, and **never enforced on the owner before at least two credentials and recovery codes exist.**

## 5. Data (new tables, numbered database scripts from 123; all added to the backup map)

- `auth_credentials` — the ship's planks (above).
- `auth_sessions` — token ↔ credential, strength, methods, last strong proof, ip, user agent, last seen, revoked.
- `auth_challenges` — single-use challenges: purpose (sign-in / enrol / step-up / recover), user, context hash, context, expiry, used.
- `security_events` — the one log: sign-in ok/failed, new device, credential added/revoked/cloned, step-up asked/answered/refused, recovery steps, policy changes; severity; ip; user agent.
- `security_settings` — policy values, rule modes (off / log / enforce), grace dates.
- `step_up_rules` — per catalogue action: mode, strength, freshness, reason required, dual.
- `dual_requests` — the Council of Two: action, context, initiator, approver, status, expiry.
- `recovery_codes`, `recovery_requests` — codes (hashed) and assisted recoveries with their cooling-off.

## 6. Build order (each phase tested, mutation-checked, pushed, like Codes and Events)

**Phase 0 — Close the gaps (no new screens to learn).**
Revoke every other session when a password is changed or reset, and add "sign out everywhere" · rate limits on sign-in, register and forgot-password · one uniform answer for unknown email and wrong password, and a lock that cannot be used to lock someone out (delay per account **and** address, growing, instead of a flat 30 minutes) · tokens that expire (staff: idle 12 h; customers: 30 days sliding) · password rules (10+ characters, common-password list) · the security log (F10) with sign-in events · "new sign-in" email · the sessions list with Revoke · security headers pass.

**Phase 1 — Passkeys and devices (Plato + Theseus).**
RP ID and origins configuration · WebAuthn endpoints (register options/verify, authenticate options/verify, discoverable "sign in with passkey" with browser autofill) · enrolment prompt after sign-in · *My devices* (list, rename, add, replace, revoke, lineage) · sessions tied to credentials, strength and freshness stored · one **policy gate** after every sign-in path (password, Google, Microsoft, passkey, link) · recovery codes · owner view "who has not enrolled" · seal phrase · alerts on new device / revoke / clone.

**Phase 2 — Step-up and risk (Socratic).**
The catalogue · `assurance` middleware on routes · the cross-examination screen with server-held context · risk rules in **log mode** · the owner dashboard of "would have asked" · move payment-keys from "password again" to the unified step-up (password stays as the fallback for S1 users until the policy flips).

**Phase 3 — Policy and recovery.**
Strength per role in the role builder · grace and enforcement dates · enrolment campaigns · assisted recovery with cooling-off · **Council of Two** · break-glass command and runbook · "reset sign-in methods" action.

**Phase 4 — Convenience.**
Tap-to-approve with number matching (Web Push to a trusted device; iPhone needs the installed app) · scan-to-sign-in using our QR and signed codes (with number matching, device and place shown, single use, bound to the requesting browser) · email sign-in link for customers · authenticator-app codes (optional, S1 only) · NFC badges and watches later.

## 7. How it will be proved

- **WebAuthn uses a vetted library** (`web-auth/webauthn-lib`), not our own code. We test our *use* of it: wrong origin, wrong RP ID, replayed or expired challenge, counter going backwards, missing user verification, revoked credential, wrong user, challenge of another purpose. A software authenticator (made with OpenSSL in the tests) plays the part of the device.
- **A real browser end to end:** Playwright drives Chromium's **virtual authenticator**, so register, sign in, replace device, revoke and step-up run through the real browser API in our automated checks.
- Step-up: the matrix of action × strength × freshness, binding to the pending record, no bypass of the authorization engine, no self-approval in dual control, cooling-off for new credentials.
- Phase 0: a test for each of F1–F4, F6, F10.
- Mutation checks on every rule, as before.
- Written manual checks for real hardware: Android fingerprint, iPhone Face ID, Windows Hello, a YubiKey, a PWA install.

## 8. Honest limits and risks

- Passkeys need **HTTPS and a settled domain.** Decide the domain before enrolling anyone.
- **Synced passkeys** are convenient and live in the person's Apple or Google account. Fine for most staff; not for super admins (device-bound policy).
- **Lock-out is the real danger.** Hence grace periods, two credentials, recovery codes, assisted recovery, break-glass, and never enforcing on the owner first.
- A **screen that looks like a ceremony is not security.** The seal phrase, the animations and the names add nothing against a skilled attacker; the passkey, the origin check and the server-held context do.
- **Geography needs data.** "New country" and "impossible travel" need a GeoIP file (MaxMind GeoLite2, free but licensed). Without it we use known networks and hours only.
- **Web Push** to approve on a phone works in the installed app on iPhone, and in the browser on Android and desktop.
- **Hardware keys cost money** (two per super admin).
- Real-time proxy phishing defeats passwords and one-time codes; only S2 stops it. That is why S2 is the target for privileged accounts and the fallbacks are removed for them.
- Sign-in cannot defend against someone who is **already inside** a legitimate session (malware on the machine). That is what freshness windows, the Socratic screen and the dual control limit.

## 9. Decisions for the owner

1. **Phase 0 first, before anything new?** Recommended: yes (it fixes real holes: F1, F2, F3).
2. **Who must use a passkey, and when?** Recommended: staff with admin, finance or payroll access required after a grace period; customers optional.
3. **Library or write our own WebAuthn?** Recommended: the vetted library. (For QR codes we wrote our own and proved them; for security-critical cryptography the standard advice is to use code many experts have already attacked.)
4. **How does staff recovery work?** Recommended: recovery codes **and** assisted recovery with two administrators and a 24-hour cooling-off, plus the break-glass command for the owner.
5. **What goes in the first release?** Recommended: Phase 0, then Phase 1 and 2; tap-to-approve and QR sign-in after.
6. **The production domain(s)** for the RP ID, and where the frontend is hosted (for headers and cookies).
7. **Token storage:** `HttpOnly` cookie session (safer, a small change to how the frontend talks to the API) or keep a header token with expiry and rotation. Recommended: cookie session.
8. **Seal phrase on the sign-in page:** yes as a flourish? Recommended: yes, clearly labelled as not a security factor.
