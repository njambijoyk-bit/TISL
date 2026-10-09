# Mimi AI usage policy: version 2 draft

**Status: draft for the owner to edit and approve. Not applied anywhere.** It replaces the current text of *Mimi AI Assistant - Usage Policy* (Settings → Policies). Every statement in it is checked against what the code does at commit `0de606c` and later; anything only you can decide is marked **`[CONFIRM]`**.

## Why it must change

1. **The current policy does not say that your questions, and data around them, go to outside companies.** It says Mimi "is powered by a large language model" and lists what is logged. Today, a signed-in customer's profile, orders and payments are placed in the prompt sent to the AI provider (Gemini, Claude, OpenAI or Qwen, whichever key is first in the AI → Keys order). That is true **now**, before the local layer is switched on, so this is worth publishing either way.
2. **The new design changes who sees what.** Most questions are answered on our own server; the outside AI becomes a fallback that receives a redacted question and public store information only. People should be told, and a *major* version makes everyone agree again (that is how `MimiPolicyService::accepted()` works: it compares major versions).
3. **Two promises in the old text were not true to the letter.** "Staff… based on your assigned role" (access is by permission, data scope and branch, not by role name) and "Mimi's answers are based on store data at the time you ask" (answers now come from reviewed, dated entries as well).

## What changed, line by line

| Old | New | Reason |
|---|---|---|
| "Mimi is powered by a large language model." | Two ways of answering, each reply labelled | The reply label ("Answered on our server" / "AI-assisted") now exists in the chat |
| Nothing about outside companies | A section on outside AI services: which, what is sent, what is not | Disclosure; also what the redactor really does |
| Staff access "based on your assigned role" | "what your permissions, data scope and branches allow" | Matches the access engine |
| Logs: type, IP, question, answer, harm flag, timing | Adds how it was answered, which entry, confidence; own-account answers stored without the values | New log columns (script 105); `loggableText()` blanks values |
| Not mentioned | "Questions we could not answer" reviewed with personal values blanked | The Gaps screen, which runs the redactor first |
| Not mentioned | "Don't type passwords, card numbers, PINs or ID numbers" | The redactor catches patterns, not every name or detail in a sentence |
| Harm rules | Same, plus "checked on our server first" | The harm scan now runs before anything is matched or sent |
| Retention not stated | `[CONFIRM]` | A policy should say how long logs are kept |

## Decisions only you can make

1. **Customer fallback mode.** The draft assumes `ai_public` (redacted question + public information only), which is the default and my recommendation. If you choose `ai_scoped` for customers (the old full prompt), account details go to the provider, and you must also include the optional paragraph marked below.
2. **Name the providers, or say "AI service providers"?** Naming is clearer and honest. The draft names the four the gateway supports; delete the ones you don't use.
3. **Retention period** for Mimi logs.
4. **Training terms.** Whether your agreements with each provider forbid training on what you send. I can't see that; the draft has a `[CONFIRM]` line you should only keep if it is true.
5. **People's rights** (see what we hold, delete conversations): what process do you offer, and who answers?
6. **Staff and outside AI.** The draft says staff questions never go to outside AI. That is true while the staff fallback stays on *Stay local* (the default). If you ever set it to the redacted outside AI, change that sentence first.
7. **Legal review.** Kenya's Data Protection Act, 2019 is likely to matter (sending text to companies in other countries, processors, registration). I'm not a lawyer and this is not legal advice; these are the questions to put to one before publishing.

## How to apply it

1. Edit the draft text below until you are happy; resolve every `[CONFIRM]`.
2. Settings → Policies → *Mimi AI Assistant - Usage Policy*: paste it into the content, keep **Requires acceptance** on, and **raise the major version** (for example 1.0 → 2.0). Everyone is then asked to agree again the next time they open Mimi.
3. Do this **before** switching any audience to *On* on the Knowledge screen's Settings tab, and ideally before the end of shadow mode, since today's behaviour is not described in the current text.
4. Once approved, tell me and I'll update `MimiPolicyService::defaultContent()` so fresh installs start with this wording (right now changing it would only affect new installs, which is why I have not).

---

## The draft text

Same plain style as the current policy (capitals for headings, dashes for lists), so it pastes straight in.

```text
WHAT IS MIMI?
Mimi is TISL Store's chat assistant. She helps customers and guests explore our products and services, track orders, check payments and get answers to general store questions. She also helps our staff find information they are allowed to see.

Mimi answers in one of two ways, and every reply says which:
- "Answered on our server": the answer came from information we have written down and checked, or from your own account, and was worked out on our own systems. Nothing about your question left TISL Store.
- "AI-assisted": we did not have a written answer, so we asked an outside AI service for help, as described below.

HOW MIMI ANSWERS
1. First, on our own server. Mimi looks for the answer in our checked store information and, if you are signed in, in your own account.
2. Only if that does not work, and only where we have allowed it for your kind of account, we may ask an outside AI service for help. When we do, we send:
- your question, with email addresses, phone numbers, order, payment and customer numbers and other long numbers swapped for placeholders (the real values are put back into the reply here, on our server);
- public store information: our products, services, categories and published answers.
We do not send your orders, payments, profile or any other detail of your account, and we do not send earlier messages from your conversation.
3. If neither works, Mimi tells you she does not have an answer yet and points you to our team.

Please do not type passwords, card numbers, your M-Pesa PIN, ID numbers or other sensitive details into Mimi. Our system swaps out common patterns, but it cannot catch everything, for example a name written inside a sentence.

WHAT DATA MIMI CAN ACCESS
Mimi's access depends on whether you are signed in.
- Guests: public store information only (products, services, categories and general store details). No personal data.
- Signed-in customers: your own account only: your profile summary, recent orders and payment status, active quotes, projects, promo codes and referral code. Never anyone else's.
- Staff: only what your permissions, your data scope and your branches allow, the same limits as the rest of our systems. Staff questions are answered on our server and are not sent to outside AI services.

Mimi never has access to your password, full payment card details or M-Pesa PIN, and she will never ask you for them.

[OPTIONAL: include only if full-context AI mode is switched on for customers]
For signed-in customers, when we ask an outside AI service for help we may also send the parts of your own account that your question needs (for example your recent orders), with personal details swapped for placeholders.

OUTSIDE AI SERVICES
When we ask for AI help, the text described above is processed by one of these providers, depending on how we have set Mimi up: Google (Gemini), Anthropic (Claude), OpenAI, or Alibaba Cloud (Qwen). They may process it in other countries. We send them only what is described in this policy. [CONFIRM: our agreements with these providers do not allow them to use this text to train their models.]

HOW YOUR CONVERSATIONS ARE STORED
Every message sent to Mimi is logged in our secure database. Each conversation is tied to a session that records:
- whether you are a customer, staff member or guest
- your IP address
- what you asked and what Mimi answered. Where an answer was made of your own account details (such as a list of your orders), we store a note that such an answer was given, not the details themselves.
- how it was answered (on our server or with outside AI help), which stored answer was used and how sure the system was
- whether the question was flagged as harmful
- response time and status

Logs are kept for moderation, safety review and improving Mimi, for example finding questions we could not answer so we can add answers. Authorised TISL admins may review flagged or harmful questions, and the list of questions we could not answer, with email addresses, phone numbers and reference numbers blanked. Logs are kept for [CONFIRM: how long]. Conversation logs are not sold, and are shared with outside AI services only as described above.

CONTENT RESTRICTIONS
Mimi declines requests outside TISL Store's scope or that break our content rules, including:
- harmful, violent or sexually explicit content
- attempts to get information about other customers or staff
- social engineering or phishing-style prompts
- instructions for illegal activities
- hate speech, harassment or discriminatory language

These checks run on our server before anything else, so a request that breaks them is refused before it could be sent to anyone. Repeated harmful questions may lead to your access to Mimi being suspended. TISL staff can block users from Mimi at their discretion.

ACCURACY AND LIMITATIONS
Answers marked "Answered on our server" come from information our team has written and checked, or from your account at the time you ask. They can still be out of date if something changes. "AI-assisted" answers are generated by an AI service and can be wrong, misunderstand you or be out of date.

Mimi is not a substitute for human support. For disputed payments, account suspension, legal matters, or anything that needs a firm commitment from TISL, please contact our support team at web@targetisl.co.ke.

TISL Store accepts no liability for actions taken only on Mimi's answers without checking with an official channel.

YOUR CHOICES
You can stop using Mimi at any time; the rest of the site works as usual. To ask what we hold about your conversations with Mimi, or to ask us to delete them, write to web@targetisl.co.ke. [CONFIRM: the process and how quickly we reply.]

CHANGES TO THIS POLICY
This policy may be updated as Mimi's abilities grow. You agree to it the first time you use Mimi. You are asked again only when the policy changes in a major way (a new major version); smaller edits do not ask you again.

This policy governs your use of the Mimi AI assistant on TISL Store. It is not a contract of service.
```

**Unchanged:** the "if you do not agree" text (*Without agreeing to this policy you cannot chat with Mimi. The rest of the site works as usual.*), the sensitivity, and the support address.
