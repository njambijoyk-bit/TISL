# AI purposes: each kind of AI work with its own keys and models (plan)

Status: plan, waiting for the owner. The four choices at the end are my recommendations; say if any should change, or say "go".

## Where we are now

Five features call an AI model, all through one gateway (`app/Services/Ai/AiGateway.php`) and the keys on **AI → Keys**:

| Feature | Purpose it asks for today |
|---|---|
| Mimi chat | `mimi` |
| Careers screening | `screening` |
| Page analysis (the AI button on module pages) | `analytics` |
| Explain in words (Insights) | `analytics` |
| Projects weekly update drafts | `analytics` |

Each key has **one** "used for" value (`analytics`, `mimi`, `screening` or `all`), one model, and a place in the order. A call tries that purpose's keys in order and moves on when one fails.

What this costs:

- **Three features share one purpose.** When the analytics key runs out, page analysis, explanations and Projects drafts all stop together. None of them can have its own model or its own limit.
- **A key serves either one purpose or every purpose.** You cannot say "this key is for Mimi and screening, nothing else".
- **A key has one model for everything.** One Anthropic account can't use a cheap model for drafts and a stronger one for Mimi.
- **Only page analysis records usage.** Nobody can see what Mimi, screening, explanations or drafts cost, or how often a key failed and the next one answered.
- **A key that is over quota is tried again on every call** before the next key is used, which slows every answer down until someone fixes it.

## What changes

### 1. Purposes: each kind of AI work is its own class

The list of purposes lives in code, one line each, with a name, what it is for, and who sees what the model writes:

| Purpose | Feature | Who reads the answer | What the model is given |
|---|---|---|---|
| `mimi` | Mimi chat | customers and staff | the conversation |
| `screening` | Careers screening | HR | an applicant's CV and answers (personal data) |
| `analytics` | Page analysis | staff | a module's figures |
| `explain` | Explain in words (Insights) | staff | figures already worked out |
| `drafts` | Projects weekly update drafts | the lead, then the client | a work's week, never money |

A new AI feature later adds one line here and asks for its own purpose.

**A purpose that belongs to a module follows that module's licence.** `screening` belongs to Careers and `drafts` belongs to Projects; `mimi`, `analytics` and `explain` belong to the core and are always there.

- If the module is **not licensed**, its purpose is hidden on AI → Keys: no card on the Purposes tab and no tick box under "Kept to". Its calls are refused before any key is touched.
- If the module is **licensed**, its purpose shows whether the module is switched on or off. That way the owner can set up keys before switching the module on.
- This uses `LicenseManager::isLicensed()`, not `isActive()`.
- Lines, kept-to ticks and usage stay stored when a licence lapses, and come back as they were if it returns.

### 2. Keys: open to all purposes, or kept to some

Each key is either:

- **Open to all**: any purpose may use it, or
- **Kept to some**: only the purposes ticked on the key may use it. For example a key kept to "Careers screening" is never sent anything else, and nothing else ever reaches that account.

### 3. Each purpose has its own line of keys, each with its own model

On a purpose's card the owner lines up the keys it uses, first choice first. The line can hold any key open to all and any key kept to that purpose. For each place in the line they choose **the model**: the same Anthropic key can run a small model for drafts and a larger one for Mimi.

A call goes down its purpose's line:

1. Its first key, with the model chosen for this purpose.
2. If that fails in a way another key might not (busy, over quota, bad key, no connection), the next key in the line.
3. If the purpose has no line of its own yet, it uses the keys open to all, in their general order, with each key's own model. A company that only has "all" keys today keeps working exactly as it does.
4. If every key fails, the feature does what it already does without AI: Mimi says she can't answer now, explanations and drafts fall back to plain text, screening waits and retries.

A request that would fail on every key (a bad request) stops at once instead of going down the line.

### 4. A failing key rests

A key that fails with "over quota", "bad key" or "no credit" is skipped for a rest period (choice 4) and the line moves straight to the next key. The keys screen shows "resting until 14:05, over quota". A "Test now" button ends the rest early.

### 5. Every call is recorded

A small log row for every call:

- the purpose, the key, the model and how many tokens
- the estimated cost (the existing rough rates: an estimate, not a bill)
- how long it took
- whether it answered first time or **fell back** to a later key, and the error if it failed

It never stores what was asked or answered. That stays where each feature already keeps it, for example Mimi's own logs.

From that log:

- **Each purpose's card** shows this month's calls, tokens, estimated cost and fallbacks.
- **Each key** shows what it served.
- **A monthly limit per purpose** is optional (choice 3), in tokens or in estimated cost:
  - at 80% the AI admins are told;
  - at 100% that purpose stops using the AI until the next month or until the limit is raised, and the feature falls back as in step 4.

### 6. The screen: AI → Keys gets two tabs

- **Keys**: as now (provider, label, the key, base URL), plus "Open to all" or "Kept to:" with a tick per purpose. Shows rest status and last error.
- **Purposes**: one card per purpose, each with:
  - its line of keys in order, each with its model (drag to reorder);
  - "Test this purpose", which sends a one-word test down the line and shows which key answered;
  - this month's usage, and the limit if one is set.

## What changes in each feature

- Explain in words asks for `explain` instead of `analytics`.
- Projects weekly drafts ask for `drafts` instead of `analytics`.
- Page analysis, Mimi and screening keep their purpose names.
- Page analysis already writes its own usage rows (`AiAnalyticsSession`). Those stay; the new call log comes in addition.

## Moving existing keys (nothing stops working)

- A key with "used for: all" becomes **open to all**, with its model and order unchanged.
- A key with "used for: analytics" becomes **kept to page analysis, explain and drafts**. Those three used it before, so they still do.
- A key with "used for: mimi" or "used for: screening" becomes **kept to** that one.
- No purpose has a line of its own at first, so every call goes exactly where it goes today until the owner sets lines up.

## Data

### Script `270_ai_purposes.sql` (adds only)

| Table | What it holds |
|---|---|
| `ai_key_purposes` | Which purposes a key that is not open to all is kept to (`key_id`, `purpose`) |
| `ai_purpose_lines` | Each purpose's line: `purpose`, `key_id`, `position`, `model` (empty = the key's own model) |
| `ai_purpose_settings` | Per purpose: `monthly_limit`, `limit_unit` (tokens or cost), `warned_at`; one row per purpose that has a limit |
| `ai_calls` | One row per call: `purpose`, `key_id`, `model`, `prompt_tokens`, `completion_tokens`, `cost_estimate`, `ms`, `position` (1 = first choice), `outcome` (ok, failed), `error`, `created_at` |

Plus two columns on `ai_provider_keys`:

- `open_to_all` (yes/no), filled from today's `used_for`
- `resting_until`, with `rest_reason`

`used_for` is kept and still read, until the owner has run the script, so the code works before and after.

## Builds

| Build | What |
|---|---|
| A.1 | Purposes registry (each with the module it belongs to, hidden unless that module is licensed), keys open or kept, lines per purpose with a model per place, resting keys, the call log; `explain` and `drafts` switched over; moving existing keys. Tests for every path down a line. |
| A.2 | The screen: Keys tab (open or kept, rest status), Purposes tab (line with models, test this purpose). Browser check. |
| A.3 | Usage per purpose and per key from the call log, monthly limits with the 80% notice and the stop at 100%. Tests and browser check. |

Size: small to medium. One script, no new permission (the AI → Keys screen's existing permission, `ai.keys`, covers all of it).

## Four choices (my recommendation first; say if any should change)

1. **"Kept to" is strict.** A key kept to some purposes is never used for any other, even when every other key has failed. This is what lets you promise that applicants' CVs only go to the account you chose. (The other way: allow it as a last resort.)
2. **The model is chosen per place in a purpose's line,** so one key can serve several purposes with different models. If nothing is chosen, the key's own model is used. (The other way: one model per key, as now; you would add the same key twice to use two models.)
3. **Monthly limits per purpose are optional and off by default.** When set: a notice at 80%, and the purpose stops at 100% and falls back as it does when it has no AI. (The other way: notices only, never stop.)
4. **A key that is over quota or refused rests for 10 minutes,** then is tried again; a busy or timed-out key does not rest. The rest length can be changed on the screen. (The other way: no rest, as now.)
