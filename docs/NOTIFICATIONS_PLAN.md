# Notifications: the plan (v1, decided; open questions at the end)

Status: PLAN. Nothing is built yet. Written from the owner's answers on 2026-10-09. First user of it afterwards: preorder delay notices (`docs/PREORDER_PLAN.md`, "Not done").

## The rule

**Every message the system sends to a person goes through one place (the Notifier).** It decides the channels, sends, and writes down what happened. Features say *what happened and to whom*; they never send mail or build WhatsApp links themselves. **No key, password or token lives in code or `.env`: they are entered on a settings screen, stored encrypted on the server, and shown only as `••••1234`.**

## What exists today (checked in the code)

| Piece | State |
|---|---|
| In-app bell and list | Works: `notifications` table, `Notification` model, `NotificationController`, `NotificationsModal`. Created by quotations, stock recalls, expiry, engagement, policy, auth. |
| Email from notifications | **Not sent.** A few callers list `email` in `channels` (`orderNotification`, `referralNotification`) but nothing sends it. |
| Email elsewhere | One-off `Mail::raw` in bookings and documents, from the company default email (`CompanyProfile::defaultEmail()`, set at boot in `AppServiceProvider`). The SMTP server itself comes from `.env`. |
| WhatsApp | Only `wa.me/<customer number>?text=…` links built in `VoucherShareService` and `BookingNoticeService`, quoting the company default phone. A person taps Send. No API. |
| Secrets pattern to copy | `AiProviderKey` (AI → Keys): key entered on a screen, encrypted, `hint()` shows the last four. `BackupSetting`: `encrypted:array` casts. |
| Scheduler | `routes/console.php` has daily commands. Queue default is `database` (needs a worker running). |

## Decisions (the owner's answers)

1. **WhatsApp has two ways, both kept.**
   - **Tap to send** (`wa.me` link): always available, no account. Staff get a "WhatsApp to send" list; each row opens WhatsApp with the message ready and is marked done.
   - **Automatic API:** set up on a settings screen (provider, keys, templates). The browser never calls WhatsApp (that would expose the secret); the server does.
   - When the API is configured and switched on, **automatic is the default** and `wa.me` stays on every row as the manual alternative and as the fallback when the API fails or has no approved template. With no API, `wa.me` is the default.
2. **Company default mode, customer override.** Settings → Notifications holds the company's default mode: **email**, **WhatsApp** or **both**. A customer may override it in Profile → Notification settings. In-app always happens too.
3. **Email is set up on the screen too, not in `.env`.** SMTP host, port, encryption, username, password, from name and address, reply-to, with a *Send a test* button. What is saved there wins; if nothing is saved the `.env` values keep working, so nothing breaks on upgrade.

"Coded on the frontend" is read as *configured from the frontend* (a screen), with the secrets kept server-side. If something else was meant, say so.

## Who gets what (the channel rules, in one place)

For a message of a given **type** to a given **person**:

1. **In-app** (the bell): always, for anyone with an account.
2. **Mode** = the person's own choice if they made one, otherwise the company default (email / WhatsApp / both).
3. A channel is used only if it is **switched on** (company), the person has **somewhere to receive it** (a valid email; a WhatsApp number) and, for WhatsApp, has given **consent**.
4. If the chosen channel can not be used, the other one is tried; **an essential message is never silent** (it falls back to email, then to the bell and a staff list).
5. **Essential** types (orders, preorders, payments, refunds, cancellations, delays) ignore "essential only" off; **non-essential** types (offers, engagement) respect the customer's choices and the "essential only" switch.
6. Each type can be switched off, or given its own channels, by the company (Types tab).

Staff: bell, plus email when the type says so. No personal preferences in v1.

**WhatsApp consent:** the customer chooses WhatsApp or both in their profile (or ticks it at checkout beside their number); the time is stored. The company default only applies to WhatsApp once consent exists. Until then those messages go by email. *Open question 2.*

## Email in the screen

- Settings → Notifications → **Email**: driver *SMTP* (others later), host, port, encryption (none/TLS/SSL), username, password (write-only, masked), from name and address (default: company default email and name), reply-to, optional copy-to (replaces the hard-coded superadmin BCC).
- **Send a test** to the signed-in user's address; the result (OK / the server's error) and the time are kept and shown.
- Applied at run time: before each send the saved settings are loaded into the mailer (so queue workers pick up a change without a restart). Saved settings win over `.env`.
- Every send is logged in the delivery log; a failure is shown with the reason and can be retried.

## WhatsApp API in the screen

- Settings → Notifications → **WhatsApp**: switch *Automatic sending* on/off, **provider** (first: **Meta WhatsApp Cloud API**; the code is a driver interface so Twilio, 360dialog and others can be added), phone number ID, business account ID, access token, app secret (all write-only, masked), webhook verify token, language, *Send a test* to a number.
- Shows the **webhook address** to paste into Meta so delivered / read / failed statuses come back. The webhook checks Meta's signature.
- **Templates:** WhatsApp only lets a business start a conversation with an *approved template*. The Types tab maps each notification type to a template name and the order of its variables (`{{1}}` customer name, `{{2}}` order number, …). A type with no template is not sent automatically: it goes to the tap-to-send list. The screen shows which types are ready.
- The company number shown to customers ("Chat with us on WhatsApp", `wa.me/<number>`) is the **company default phone** (Books → Settings → Company). It is the same number the API sends from if that account is registered to it.

## The tap-to-send list (staff)

Notifications → **WhatsApp to send**: one row per message waiting (customer, text, a **Send in WhatsApp** button that opens `wa.me/<customer>?text=…`, *Mark sent*, *Skip*). Shown when the API is off, when a type has no template, when the API failed, or when staff prefer to send by hand. Uses the existing number cleaning (`CompanyProfile::waDigits`).

## Customer side

- **Profile → Notification settings:** *How should we reach you?* Company default / Email / WhatsApp / Both; *Essential messages only*; their WhatsApp number (pre-filled from the customer record, checked) and a consent line. Saved by the customer; never by staff on their behalf (staff can see it).
- Every email and bell item can carry a **Chat with us on WhatsApp** link to the company default number, with the order or topic in the prefilled text.

## Data (database script 108 and backup map)

- `notification_settings` (one row): `default_mode`, `email_enabled`, `whatsapp_enabled`, `whatsapp_auto_enabled`, `whatsapp_provider`, `essential_only_default`, `type_rules` (JSON: per type enabled / channels / template), `checkout_number_is_consent` (see question 2); **encrypted:** `mail_config` (host, port, encryption, username, password), `whatsapp_config` (ids, tokens, secrets); `mail_from_name`, `mail_from_address`, `mail_reply_to`, `mail_copy_to`; `mail_tested_at`, `mail_test_result`, `whatsapp_tested_at`, `whatsapp_test_result`.
- `notification_deliveries`: `notification_id`, `channel` (database | email | whatsapp), `via` (link | api), `status` (queued | sent | delivered | read | failed | to_send | skipped), `to_address`, `subject`, `body`, `wa_url`, `external_id`, `error`, `attempts`, `sent_at`, `delivered_at`, `read_at`, `handled_by`, timestamps. Kept for a stated period (question 5).
- `customers`: `notify_mode` (null = company default), `notify_essential_only`, `whatsapp_consent_at`.
- Both new tables go in `ModuleTables` (backup map); the script follows the repo's read / change / check layout and is safe to run twice.

## Permissions (access engine, Catalog VERSION 8)

- `notifications.view`: see the delivery log and the tap-to-send list.
- `notifications.send`: work the tap-to-send list, retry failed sends, send a test message.
- `notifications.settings`: **owner only** (like `mimi.routing`): open and change the email and WhatsApp settings and the type rules, because they hold secrets.
- New keys also go in the frozen holder snapshot of `NoRoleNamesInCodeTest`; no role names in code.

## Security rules

- Secrets are encrypted at rest (the app key must be backed up with the database, or saved keys become unreadable and must be entered again; the screen says so when one can not be read).
- Write-only fields: the server never returns a secret, only `••••` and the last four; a blank field on save means "keep the old one".
- Secrets never appear in logs, errors, activity entries or exports; the delivery log stores the message text but not credentials.
- The webhook is public by nature: it only accepts a correctly signed request and changes only delivery status.
- Test sends are rate-limited and go only to the signed-in user's own address or a number they type.
- Changes to the settings are written to the activity log (who, when, which part; never the value).

## How it is built

- `App\Services\Notify\Notifier::send(recipient, type, subject, body, options)`: resolves channels (the rules above), creates the bell row, then hands each other channel to a **driver**: `InApp`, `Email` (SMTP via the saved settings), `WhatsAppLink` (builds the `wa.me` row), `WhatsAppApi` (provider interface; `MetaCloud` first). Each returns a result that is written to `notification_deliveries`; a failure never breaks the caller.
- A **type registry** (code, with company overrides from `type_rules`): key, label, essential?, default channels, email subject/body, WhatsApp text and template mapping.
- `Notification::createFor(..., channels)` is kept and routed through the Notifier, so existing callers keep working and those that already list `email` start sending it. *Open question 4.*
- Email layout: company name and logo, one action button, WhatsApp link, company contacts in the footer.
- Sending is queued when a queue worker is running, otherwise sent at once (settings show which).

## Phases

1. **Foundation + email in the screen.** Script 108, settings model with encrypted casts, Email tab with test send, `Notifier` with in-app and email drivers, delivery log (read-only list, retry), permissions, tests.
2. **WhatsApp tap-to-send + preferences.** Link driver and the staff list, company default mode and switches, customer Profile → Notification settings with consent, WhatsApp link in emails and the bell.
3. **WhatsApp API.** Provider interface and Meta Cloud driver, WhatsApp tab (keys, test, webhook address), template mapping per type, delivered/read statuses, automatic-by-default with `wa.me` fallback.
4. **Users of it.** Route existing `createFor` email channels through it; **preorder delay notices** (daily command: orders past their expected date, customers told, staff list); notices for preorder cancel decisions; order status messages.

Phases 1 and 2 stand on their own and need no outside account. Phase 3 needs a WhatsApp Business account to try for real.

## Testing

- Unit: channel resolution as a table (mode × consent × address × switches × essential), run against an independent oracle; mutation checks on it.
- Email with `Mail::fake` and the saved-settings loader; WhatsApp API with `Http::fake`; webhook signature accept/reject; the "secret never serialised" test over every settings response.
- Browser harness for the settings screens, the staff list and the profile page.
- **Not testable from here:** a real SMTP server, a real Meta account and template approval. These need one live try by the owner before relying on them.

## Open questions

1. **Provider.** Is Meta's WhatsApp Cloud API right (assumed)? Or Twilio, 360dialog, Africa's Talking?
2. **Consent.** Should a number given at checkout count as consent for *order updates* by WhatsApp (a switch, off by default), or only an explicit tick in the profile?
3. **Who may see and change the keys?** Owner only (assumed), or also a named permission?
4. **Existing `createFor` with `email`.** Start sending real emails for referral and order notifications once this is in (assumed yes)?
5. **Log retention.** How long to keep the delivery log (suggest 12 months, then message text blanked, status kept)?
6. **Queue worker.** Is `php artisan queue:work` (or a scheduler entry) running on the server? If not, sends happen at once and slow requests slightly.
