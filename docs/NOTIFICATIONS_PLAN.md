# Notifications: the plan (v2, decided)

Status: PLAN, answers in (see "Decided answers" at the end). **All four phases are BUILT** (see "As built" at the end). Written from the owner's answers on 2026-10-09. First user of it afterwards: preorder delay notices (`docs/PREORDER_PLAN.md`, "Not done").

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
3. **Two WhatsApp providers: Twilio and Meta WhatsApp Cloud API.** Both can be configured; one is *active*. Same driver interface, so a third can be added.
4. **Email is set up on the screen too, not in `.env`.** SMTP host, port, encryption, username, password, from name and address, reply-to, with a *Send a test* button. What is saved there wins; if nothing is saved the `.env` values keep working, so nothing breaks on upgrade.

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

**WhatsApp numbers and consent (decided):** the number can come from the customer's **profile** or from **checkout**, and an admin setting says which count: *profile only*, *checkout only*, or *both* (default **both**). A number from a source that counts is taken as willingness to get order updates by WhatsApp, and the time and source are stored (`whatsapp_consent_at`, `whatsapp_consent_source`). The customer can turn WhatsApp off in their profile at any time, and that always wins. When the mode is *both*, a customer gets the email **and** the WhatsApp message.

## Email in the screen

- Settings → Notifications → **Email**: driver *SMTP* (others later), host, port, encryption (none/TLS/SSL), username, password (write-only, masked), from name and address (default: company default email and name), reply-to, optional copy-to (replaces the hard-coded superadmin BCC).
- **Send a test** to the signed-in user's address; the result (OK / the server's error) and the time are kept and shown.
- Applied at run time: before each send the saved settings are loaded into the mailer (so queue workers pick up a change without a restart). Saved settings win over `.env`.
- Every send is logged in the delivery log; a failure is shown with the reason and can be retried.

## WhatsApp API in the screen

- Settings → Notifications → **WhatsApp**: switch *Automatic sending* on/off, **active provider** (**Meta WhatsApp Cloud API** or **Twilio**; one driver interface, so another can be added). Meta: phone number ID, business account ID, access token, app secret, webhook verify token. Twilio: account SID, auth token, the WhatsApp sender (or messaging service SID); a template there is a *Content SID*. All secrets write-only and masked. Language and *Send a test* to a number.
- Shows the **webhook address** to paste into Meta so delivered / read / failed statuses come back. The webhook checks the provider's signature (Meta: `X-Hub-Signature-256` with the app secret; Twilio: `X-Twilio-Signature` with the auth token).
- **Templates:** WhatsApp only lets a business start a conversation with an *approved template*. The Types tab maps each notification type to a template name and the order of its variables (`{{1}}` customer name, `{{2}}` order number, …). A type with no template is not sent automatically: it goes to the tap-to-send list. The screen shows which types are ready.
- The company number shown to customers ("Chat with us on WhatsApp", `wa.me/<number>`) is the **company default phone** (Books → Settings → Company). It is the same number the API sends from if that account is registered to it.

## The tap-to-send list (staff)

Notifications → **WhatsApp to send**: one row per message waiting (customer, text, a **Send in WhatsApp** button that opens `wa.me/<customer>?text=…`, *Mark sent*, *Skip*). Shown when the API is off, when a type has no template, when the API failed, or when staff prefer to send by hand. Uses the existing number cleaning (`CompanyProfile::waDigits`).

## Customer side

- **Profile → Notification settings:** *How should we reach you?* Company default / Email / WhatsApp / Both; *Essential messages only*; their WhatsApp number (pre-filled from the customer record, checked) and a consent line. Saved by the customer; never by staff on their behalf (staff can see it).
- Every email and bell item can carry a **Chat with us on WhatsApp** link to the company default number, with the order or topic in the prefilled text.

## Data (database script 108 and backup map)

- `notification_settings` (one row): `default_mode`, `email_enabled`, `whatsapp_enabled`, `whatsapp_auto_enabled`, `whatsapp_provider`, `essential_only_default`, `type_rules` (JSON: per type enabled / channels / template), `checkout_number_is_consent` (see question 2); **encrypted:** `mail_config` (host, port, encryption, username, password), `whatsapp_config` (ids, tokens, secrets); `mail_from_name`, `mail_from_address`, `mail_reply_to`, `mail_copy_to`; `mail_tested_at`, `mail_test_result`, `whatsapp_tested_at`, `whatsapp_test_result`.
- `notification_deliveries`: `notification_id`, `channel` (database | email | whatsapp), `via` (link | api), `status` (queued | sent | delivered | read | failed | to_send | skipped), `to_address`, `subject`, `body`, `wa_url`, `external_id`, `error`, `attempts`, `sent_at`, `delivered_at`, `read_at`, `handled_by`, timestamps. Kept 12 months, then the message text is blanked and the status kept (a daily scheduled command).
- `customers`: `notify_mode` (null = company default), `notify_essential_only`, `whatsapp_consent_at`, `whatsapp_consent_source` (profile | checkout).
- `notification_setting_versions`, `notification_setting_logs` as described under *Safety*.
- Settings are stored per **part** as one document (`general`, `types` plain; `email`, `whatsapp` encrypted as a whole), plus `whatsapp_number_sources` (profile | checkout | both) in *general*.
- Both new tables go in `ModuleTables` (backup map); the script follows the repo's read / change / check layout and is safe to run twice.

## Permissions (access engine, Catalog VERSION 8)

- `notifications.view`: see the delivery log, the tap-to-send list and the history. Admin and owner.
- `notifications.send`: work the tap-to-send list, retry failed sends, send a test message. Admin and owner.
- `notifications.settings`: open and change the email and WhatsApp settings, the type rules, and **roll back** to an earlier version. **Admin and owner** (decided).
- `notifications.keys.purge`: **delete old keys** (blank the secrets kept in earlier versions). **Owner only** (in `OWNER_ONLY`); an admin can replace a key but can never delete an old one (decided).
- New keys also go in the frozen holder snapshot of `NoRoleNamesInCodeTest`; no role names in code.

## Safety: every action logged, every change reversible (decided)

- **Audit log** `notification_setting_logs`, append-only (cannot be updated or deleted through the app): who, when, from which address, what (`saved`, `tested`, `rolled_back`, `keys_purged`, `switched_on/off`, `message_retried`, `whatsapp_marked_sent`, `whatsapp_skipped`, `rule_changed`), which part, which version, and a plain-words summary of the fields that changed. **Never a secret value**, old or new.
- **Versions** `notification_setting_versions`: every save of a part (*general*, *email*, *whatsapp*, *types*) writes a numbered version holding the whole part, secrets included, encrypted. The live settings are always the current version. Old versions are kept, so **replacing a key never loses the old one**.
- **Rollback:** pick an earlier version of a part and restore it. It becomes a *new* current version ("Rolled back to v7"), so nothing is overwritten and the rollback itself can be rolled back. If that version's keys were purged by the owner, the screen says so and asks for the keys again.
- **Test before it goes live:** saving the *email* or *WhatsApp* part first checks the connection (SMTP handshake / provider credentials). If the check fails, the change is **not applied** and the reason is shown; an admin may choose *Save anyway*, which is recorded as such.
- **Owner purge:** the owner may blank the secrets in chosen old versions (never the current one). The version and its log line stay, marked *keys deleted*, so history is complete even when the keys are gone.
- Switching a channel off is itself a version, so it can be reversed the same way.

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

1. **Foundation, email in the screen, safety net.** Script 108, settings parts with versions, audit log and rollback, owner purge, permissions, Email tab with test-before-save and *Send a test*, the `Notifier` with in-app and email drivers (queued), delivery log with retry, mail settings applied at run time (including in the queue worker), existing `createFor(..., ['database','email'])` now really sends. History tab (versions, log, rollback).
2. **WhatsApp tap-to-send + preferences.** Link driver and the staff list, company default mode and number sources, customer Profile → Notification settings, WhatsApp link in emails and the bell, retention command.
3. **WhatsApp API.** Provider interface with **Meta Cloud** and **Twilio** drivers, WhatsApp tab (keys, test, webhook address), template mapping per type, delivered/read statuses, automatic-by-default with `wa.me` fallback.
4. **Users of it.** **Preorder delay notices** (daily command: orders past their expected date, customers told, staff list); notices for preorder cancel decisions; order status messages.

Phases 1 and 2 need no outside account. Phase 3 needs a Twilio or Meta account to try for real. Both a queue worker and the scheduler run on the server (decided), so sends are queued and the daily commands are scheduled.

## Testing

- Unit: channel resolution as a table (mode × consent × address × switches × essential), run against an independent oracle; mutation checks on it.
- Email with `Mail::fake` and the saved-settings loader; WhatsApp API with `Http::fake`; webhook signature accept/reject; the "secret never serialised" test over every settings response.
- Browser harness for the settings screens, the staff list and the profile page.
- **Not testable from here:** a real SMTP server, a real Meta account and template approval. These need one live try by the owner before relying on them.

## Decided answers (2026-10-09)

1. **Providers:** Twilio and Meta WhatsApp Cloud API, both.
2. **Numbers / consent:** the profile number and the checkout number both count; an admin setting chooses profile, checkout or both (default both). Send to email and WhatsApp when the mode is both.
3. **Keys:** admin and owner may change them and roll back; only the owner may delete old keys; every action is logged; rollback as described under *Safety*.
4. **Existing `createFor` with `email`:** yes, they start sending real emails.
5. **Log retention:** 12 months, then text blanked.
6. **Queue worker and scheduler:** both are running.

## As built, phase 1

To switch it on: run `database/sql/108_notifications.sql` in Workbench, then `php artisan access:seed` (adds the four `notifications.*` permissions, Catalog version 8), then open **Settings → Notifications**. A queue worker must be running for emails to go out (decided: it is).

- **Settings** (`App\Services\Notify\NotifySettings`): parts `general`, `types` (plain) and `email`, `whatsapp` (encrypted whole). Every save is a numbered version (`notification_setting_versions`) and a log line (`notification_setting_logs`, append-only, never a value). Secrets are write-only (`{set, hint}`); blank on save keeps the old one; `clear` empties one. **Rollback** restores an earlier version as a new one. **Owner purge** (`notifications.keys.purge`, owner only) blanks the keys inside old versions, never the live one; a version whose keys were deleted can not be restored. Saving email first sends a real test email to the saver through the new settings; a failed test refuses the change unless *Save anyway* (recorded as `saved_anyway`). *Back to the server's settings* is itself a version.
- **Email in the screen**: host, port, security, username, password, sender, reply-to, copy-to. Applied by `MailConfigurator` at boot and before every queued job, so a worker needs no restart. Saved settings win over `.env`; with none saved `.env` keeps working. The screen warns when the server mailer is `log` (mail goes nowhere).
- **Notifier** (`Notifier::send`): resolves channels with `ChannelResolver` (the rules above, checked against a plain oracle over 41,000 combinations), makes the bell row, queues the email (`SendNotificationEmail`: sends once, keeps the failure reason, 3 tries then `failed`, retry by a named person), and leaves a WhatsApp message `to_send` with a `wa.me` link for a person. A problem on any channel is recorded and never reaches the caller. `Notification::createFor(..., ['database','email'])` now really sends (respecting the company switch and per-type rules).
- **Screens**: Settings → Notifications: Email, General (email on/off, essential-only default), Messages (turn a type off), Delivery log (filter, retry), History & rollback (versions, restore, owner's key deletion, the action log). `/admin/settings/email` redirects there.
- **Not in phase 1**: the WhatsApp tab and API drivers (phase 3), the staff "WhatsApp to send" list screen, customer preferences and the default mode screen (phase 2), delay notices (phase 4). The rows for WhatsApp messages are already created in the delivery log with their link.
- **Not testable here**: a real SMTP server and a running queue worker. Please send one test from the Email tab and place one real order to see the email arrive.

## As built, phase 2

To switch it on: run `database/sql/109_notify_essential_tristate.sql` (makes "essential messages only" yes / no / follow the company; harmless if you ran the updated 108), then use **Settings → Notifications**.

- **Company defaults** (General tab): email on/off, WhatsApp on/off, the **default way** (email / WhatsApp / both), **which numbers count** (profile / checkout / both, default both), essential-only default. Each change is a version and can be rolled back.
- **Customer's own say** (`NotificationPreferences`, Profile → *How we contact you*): follow the shop / email only / WhatsApp / both; essentials only / everything / follow the shop; their WhatsApp number (checked with the country code). The screen says in one line what an order update would use right now. "Email only" always wins. A number from a source the company accepts counts as willingness; its time and source (`profile` or `checkout`) are stored, and kept when the same number is saved again.
- **Checkout**: the phone given at checkout becomes the WhatsApp number (source `checkout`) only when the customer has none and has not chosen "email only". Whether that source counts is the company's setting.
- **WhatsApp to send** (staff list, first tab of Settings → Notifications, with a count): each waiting message shows the person, the text and **Send in WhatsApp** (opens `wa.me` with the number and message ready); after pressing Send there, **I sent it** marks it sent, **Skip** (with an optional reason) leaves it. Both record who (`handled_by`) and write `whatsapp_marked_sent` / `whatsapp_skipped` to the action log. Needs `notifications.send`; seeing the list needs `notifications.view`.
- **Messages tab**: each type can now also be limited to email or to WhatsApp.
- **Bell and emails**: the bell has a *Chat with us on WhatsApp* link to the company default number; emails already carried it.
- **Retention**: `notifications:prune` (daily 03:30) blanks the subject, text and link of delivery-log rows older than 12 months; status, time and type stay, and one `log_pruned` line is written. The action log is never pruned.
- **Not in phase 2**: the WhatsApp API (Twilio / Meta) and its settings tab (phase 3), guests without an account (phase 4), who sends order and delay messages (phase 4: nothing yet calls `Notifier::send` for orders).

## As built, phase 3

To switch it on: run `database/sql/110_notification_delivery_payload.sql` (one JSON column and an index on `notification_deliveries`). Until it is run, WhatsApp messages simply keep waiting for a person, as in phase 2. Then open **Settings → Notifications → WhatsApp API**.

- **Two providers, one interface** (`App\Services\Notify\WhatsApp\WhatsAppProvider`): **Meta WhatsApp Cloud API** (`MetaCloud`: phone number ID, business account ID, access token, app secret, webhook verify token) and **Twilio** (`Twilio`: account SID, auth token, WhatsApp sender or messaging service SID). A third is one class plus one line in `WhatsAppProviders`. All secrets are write-only and encrypted like the email password; they are versioned, logged and rolled back the same way, and only the owner can delete old ones.
- **Check before it goes live**: saving first asks the provider whether the keys work (Meta: reads the phone number record; Twilio: reads the account); a "no" refuses the change with the provider's own words unless *Save anyway*.
- **Automatic or by hand, per message type.** A customer message goes out by itself only when (a) WhatsApp is on in General, (b) the provider's *Send automatically* switch is on with its keys filled in, **and** (c) the type has an approved **template** (Messages tab: template name, or the Twilio Content SID `HX…`, plus the values for {{1}}, {{2}} … in order, chosen from `name, title, message, company, link`; line breaks are removed because WhatsApp refuses them). Anything else waits in *WhatsApp to send*, as in phase 2. `name` is the customer's first name.
- **Never lost**: the send is queued (3 tries, then 30 s and 3 min apart). If it still fails, or the provider later reports the message **failed**, it moves to *WhatsApp to send* with its wa.me link and the reason (`api_failed: …`). A delivered or read message is never moved back by a late failure.
- **Delivery reports**: public callbacks `/api/webhooks/whatsapp/meta` (GET to verify the address with the verify token; POST for statuses, checked with `X-Hub-Signature-256` and the app secret) and `/api/webhooks/whatsapp/twilio` (checked with `X-Twilio-Signature` and the auth token; the address is sent with every message, nothing to paste). A call that does not check out is answered 403 and changes nothing. Statuses only move forward: sent, delivered, read; `delivered_at` and `read_at` are filled in. The screen shows the Meta address to paste into Meta's webhook setup.
- **Send a test message**: one real approved template through the saved keys to a number you type (Meta accounts have `hello_world`); it is rate-limited and written to the history.
- **Verified**: both drivers against faked HTTP (what is sent, in which order, with which auth), Twilio's signature against the example in Twilio's own documentation, the signed/unsigned webhook cases, and the fallback. **Not verified**: a real Meta or Twilio account, template approval, and the live callbacks; those need one real try by the owner (send a test, then place an order for a customer with a WhatsApp number and a template).

## As built, phase 4

No new script. Needs the queue worker and the scheduler (both run, decided). The new daily command is `preorders:notify-delays` (09:20).

- **Order messages** (`OrderNotices`, storefront orders only, each sent once and remembered on the order in `meta.notices`): *received* (a preorder also says when it is expected), *payment received* (when the order becomes a Cash Sale, or an online payment settles its invoice), *on its way* / *delivered* (a delivery note; "1 of 4 items" for a part delivery, "everything delivered" when complete), *cancelled* (with the reason). Hooked into checkout, `VoucherService::convert` and `cancel`, and `GatewayPaymentService::settle`, all after the database commit, and none can fail the sale: a problem telling someone is reported and swallowed.
- **Guests** (no account) are reached at the email and phone they gave at checkout (`Notifier::sendToContact`): the email, and a WhatsApp message by hand or by API when the company's rules and the "checkout number counts" setting allow it. No bell, no link to the order page.
- **Delay notices** (`PreorderDelayNotices`): a **paid** preorder whose promised date has passed with goods still owed (`PreorderService::overdue`; the day itself is on time; unpaid, fully delivered and being-cancelled orders are left out). The customer is told the day after the date, again every 14 days, at most 3 times, with the date and the way to ask for a refund (the order page; guests are told to contact us). Staff who hold `stock.manage` get **one note a day** when anything is late. `--dry-run` only counts. The *Preorders waiting* list shows "N days late" on each line and a banner with the count.
- **Cancellation requests**: staff who hold `books.post` are told when a customer asks; the customer is told when it is approved (with the refund and where from) or declined (with the reason).
- **Everything is switchable**: every type is in Settings → Notifications → Messages (turn off, limit to email or WhatsApp, give a WhatsApp template); essential ones (orders, payments, delays, cancellations) respect "email only", the company default and the customer's choices as described above. New type: `preorder_delays_staff`.
- **Verified here** against in-memory tables with the queue faked; mutation checks on dates, repeat limits, once-only and error swallowing. **Not verified**: the hooks inside a real checkout, payment and delivery (they run in the books' own transactions, so please place one test order, pay it, deliver part of it, and watch the bell, the delivery log and the email).
