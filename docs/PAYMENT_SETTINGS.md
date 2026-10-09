# Payment keys (Settings → Payment keys)

The M-Pesa (Daraja) keys can be set on a screen instead of in `.env`. **Owner only.** Built the same way as the notification settings (`docs/NOTIFICATIONS_PLAN.md`), with stricter rules because these keys move money. Cards will be a second part on the same screen when you choose a provider.

## Decisions (from the owner)
- **Owner only** (permission `payments.keys`, held by the owner role alone; the admin role does not have it). The owner can give it to another role in the role builder.
- **Every change is emailed to the owner(s)** (everyone who holds the permission, the person who did it included) and **logged**.

## What it does
- **Where it lives:** Settings → *Payment keys* (`/admin/settings/payments`). Run `database/sql/116_payment_settings.sql` and `php artisan access:seed` (so the owner role gets the new permission).
- **Nothing changes until you save.** With nothing saved, the keys in `.env` (`DARAJA_*`) keep working exactly as before. What is saved here **wins** over `.env`; a field left empty here falls back to `.env`. The screen says, field by field, whether the value in use is *saved here*, *the server's own (.env)* or *not set*.
- **Keys are write-only.** Consumer key, consumer secret, passkey and the callback token are encrypted with the application key, never sent back to the browser (only "set" and the last four characters), and never written to the log or an email. A blank key on save means "keep the one we have".
- **Proved before it goes live.** Saving asks Safaricom for an access token with the key, secret and environment being saved. If Safaricom says no, nothing is changed (the reason is shown) unless the owner chooses *Save anyway*. This is only done when the key, secret or environment changed. The shortcode and passkey can only be proved by a payment: **Send the KES 1 prompt** sends a real KES 1 prompt through the live keys to the owner's phone (real money, paid to your shortcode).
- **Password again.** Saving, clearing, rolling back, making a new token, deleting old keys and sending the KES 1 prompt each ask for the owner's password (a wrong one is refused and logged as such).
- **History and rollback.** Every save is a numbered version holding the whole part (encrypted). *Restore* puts an earlier version back **as a new version**, so it can itself be undone; the callback token in use is kept so payments in flight are not lost. The owner can delete the keys kept in **old** versions (the live version is never touched); such a version can no longer be restored. *Go back to the server's keys* clears what is saved (also a version).
- **The log** (`payment_setting_logs`) is append-only: the app cannot change or delete a row. It records who, what, when and from which address, never a key.
- **Callback token.** The address Safaricom reports payments to is this site's own `/api/payments/callback` (or a typed one, for a tunnel), sent with every payment prompt (nothing to register with Safaricom), with a secret token added so only Safaricom's own call is believed. The token is made for you on the first save. *Make a new callback token* rotates it: **the old one still works for 2 hours**, so a payment already waiting is not lost; after that it is refused. Callbacks were already never trusted on their own (each is confirmed with Safaricom before it counts); the token is an extra lock. With no token anywhere, callbacks are still accepted as before this screen existed, and the screen warns.
- **Live needs https.** A typed callback address must start with `https://` for the live environment; the screen warns when the address is not https or looks private or local (Safaricom can not reach it).
- **Applying it.** Saved keys are laid over the configuration at boot and before every queued job, so the background worker picks up a change without a restart. The M-Pesa access token is remembered per environment and key, so a changed key never reuses the old one's token.

## If something goes wrong
- *The keys can no longer be read:* the server's application key (`APP_KEY`) changed; the screen says so; enter the keys again. (Keep `.env` filled in as the fallback.)
- *Stolen login:* the other owners get an email for every change; roll it back from History and change the password.
- *Payments stopped after a change:* History → restore the previous version, or *Go back to the server's keys*.

## Not verified here
- The real Safaricom calls (token test, KES 1 prompt) and the emails to owners need trying once on the real system: save the sandbox keys, send the KES 1 prompt, check the owner email and the History tab.
