# Projects Stage 6: Messages, meetings, working together (being built)

Status: the owner said "build" on 2026-11-18, accepting the four choices at the end. What is built so far is listed under "As built"; everything else is still design.

Stages 1 to 5 built the work, its people, its money and the doing of it. Stage 6 builds the talking about it: conversations on each piece of work (inside the team, with the client, with other parties), one inbox across all of them, meetings with minutes, following things, and handing someone's work over.

Size: medium to large, a little smaller than Stage 5. Eight builds, two scripts (one for Core, one for Projects), no new permissions (all five it uses are in the catalogue since Stage 1).

## The rules this stage keeps

1. **Messages leave through the Core Notifier.** Projects has no mail or WhatsApp code. A message to a client is an ordinary Notifier send (email, WhatsApp, bell), and its delivery shows in the Notifier's log as every other send does.
2. **Two things are new in Core, and both help every module, not just Projects:** staff choose how they hear about things (today staff get the bell and email only, with no say), and replies to messages can come back in and be filed against what they answer.

## In this stage

### 1. Conversations (a Messages tab on each piece of work)
- A conversation has a subject and one of three audiences:
  - **Team**: people on the work only. Needs `projects.messages.internal`.
  - **Client**: the team and chosen contacts of the client (Stage 3 contacts). Needs `projects.messages.client`. Each message the team writes goes to those contacts through the Notifier.
  - **Others**: the team and chosen contacts of other parties (opposing counsel, an architect, a supplier). Same permission as client.
- Each conversation has a person responsible for answering it (its owner) and is open or closed. Closing hides it from the default inbox; a new message opens it again.
- Messages are plain text with line breaks and links. Files arrive with the document vault in Stage 9.
- Read state per person: unread counts on the tab, on the inbox and in the menu.
- Editing your own message within 15 minutes; after that, and for other people's messages, `projects.messages.moderate` (the original is kept in the log, and the message says "edited"). Removing leaves "Removed by …" in its place. A message from a client is never edited.

### 2. Mentions, tags and typing shortcuts
- **@name** mentions someone on the work: they are told, and it shows in their inbox under "Mentions".
- **#tag** tags the conversation (tags are a company list, managed in Configuration). The inbox filters by tag.
- **/task** turns the message into a task on the same work (title from the message, linked back to it).
- **/time 1h30** logs time on the work (Stage 5 rules apply).
- **/meet** opens the meeting form with the conversation's people filled in.
- Shortcuts check the same permissions as their buttons.

### 3. The inbox, and following
- **Inbox** (Projects → Inbox, G then I): every conversation the person is in, across all their work, newest first, with unread counts. Filters: unread, mentions, mine to answer, tag, piece of work, audience, open or closed. With `projects.inbox.all`, every conversation on work they can open.
- **Follow** a piece of work, a conversation or a task to hear about it: new messages, a task moving, a key date moving. People on a task or a conversation follow it automatically; anyone can stop. Notices go through the Notifier (new type "Projects: messages and things you follow").

### 4. Core: staff choose their channels
- Today staff hear by bell and email, with no say. New: each staff member chooses, per group of notices (Projects work, approvals, security, sales, and so on), **bell only**, **bell and email**, or **bell and WhatsApp** (to the phone on their staff profile, sent the way the company sends WhatsApp now, by hand or through Meta or Twilio).
- The company sets each group's default and can lock a group (security messages stay on email, for example).
- A page in each person's account settings. ChannelResolver reads it; nothing else in the Notifier changes.

### 5. Core: replies come back into their conversation
- **Email**: each message sent from a conversation carries a reply address with a token (`replies+c4f9…@yourdomain`). A mailbox the company names in Notifications settings is read every few minutes; a reply is matched by its token and filed into its conversation, as a message from that contact. (How the mailbox is read is choice 1.)
- **WhatsApp**: Meta and Twilio already call our webhook for delivery statuses; the same webhook now also takes incoming messages. A message from a phone is filed into the open conversation that last wrote to that number. If none fits, or two do, it waits.
- **Waiting replies**: anything that cannot be matched waits in a list for someone with `projects.messages.moderate` to file it into a conversation, or throw it away. Nothing is lost silently.
- Other modules can use the same door later (a support ticket, an order) by registering what a token points at.

### 6. Meetings
- A meeting on a piece of work: title, when and how long, where or an online link, agenda, staff attendees and client or party contacts, and whether it is a team or a client meeting. Needs `projects.meetings`.
- **Free-time search**: for the staff attendees, the times in the next two weeks when all of them are free, inside company hours (Attendance settings), skipping leave and days off, and anything already on their calendars. Pick one, or type a time.
- **Calendar**: a calendar entry (new kind `meeting`) for every staff attendee, kept in step when it moves or is cancelled.
- **Invitations** through the Notifier: staff answer yes, no or maybe in the app; outside contacts get an email with the details, a calendar file, and a personal link to answer without signing in. Answers show on the meeting.
- Moving or cancelling tells everyone.

### 7. Minutes and action items
- After the meeting: minutes (notes and decisions) and action items (what, who, by when).
- **Each action item becomes a task** in one click, on the same work, given to its person, due on its day, linked back to the meeting.
- **Share the minutes** with the attendees (a client meeting's minutes go to the client contacts, through the Notifier). The minutes are kept on the meeting and in the log.

### 8. Handing work over
- Move one person's work on a piece of work, or on all their work, to someone else in one step: their open tasks, key dates they are responsible for, conversations they answer, meetings they organise, and follow-ups (Stage 3) on that work. Choose all or some.
- Both people are told; every move is logged. Handing over your own work needs `projects.members.manage`; handing over someone else's is also a serious action ("Hand over someone's work"; choice 4).
- Handing over the lead of a piece of work stays as it is (Stage 2).

## What changes outside Projects

| Where | Change | When it does anything |
|---|---|---|
| Notifier (Core) | Staff channel choices, per group of notices; the company's defaults and locks | Once a person or the company changes them; until then, exactly as today |
| Notifier (Core) | A reply address with a token on emails sent for a conversation; filing replies | Only for messages sent with a reply route (Projects conversations to begin with) |
| Notifier (Core) | A calendar file on meeting invitations | Only on invitations |
| WhatsApp webhooks (Core) | Also take incoming messages, not only delivery statuses | Only when Meta or Twilio sends one |
| Calendar (Core) | New entry kind `meeting`; free-time search across people | Written by Projects |
| Account settings | A "How I hear about things" page for staff | Once used |

Not changed: how customers choose their channels, the delivery log, email settings, the tap-to-send WhatsApp list.

## Waits for later

Files on messages and the client portal (Stage 9), video calls (an online link is enough), chat outside a piece of work (staff channels in the Slack sense are not planned), Mimi summaries of conversations (Stage 12).

## Permissions (all in the catalogue since Stage 1)

`projects.messages.internal`, `projects.messages.client`, `projects.messages.moderate`, `projects.meetings`, `projects.inbox.all`; handing over uses `projects.members.manage`.

New project-role abilities: `talk` (write in the work's conversations) and `meet` (plan its meetings). Lead and Member get both.

New serious action: hand over someone's work (out of the box needs nothing).

## Data

### Script `262_notify_staff_and_replies.sql` (Core, adds only)

| Table | Holds |
|---|---|
| `notification_staff_prefs` | A staff member's choice per group of notices: bell, email or WhatsApp |
| `notification_reply_routes` | A token, what it points at (module, kind, id), who it was sent to, which channel |
| `notification_inbound` | Every reply that came in: channel, from, text, when, and where it was filed (or that it waits) |

Plus the company's defaults and locks in the existing notification settings.

### Script `263_projects_messages.sql` (Projects, adds only)

| Table | Holds |
|---|---|
| `project_threads` | A conversation: work, subject, audience, owner, open or closed, last message |
| `project_thread_people` | Contacts in a client or others conversation |
| `project_thread_messages` | Messages: conversation, from (a person or a contact), text, how it came (app, email, WhatsApp), edited, removed |
| `project_message_mentions` | Who a message mentions |
| `project_message_reads` | How far each person has read each conversation |
| `project_tags`, `project_thread_tags` | The company's tags, and which conversations carry them |
| `project_follows` | Who follows which work, conversation or task |
| `project_meetings` | A meeting: work, title, when, where, link, agenda, audience, organiser, state, minutes |
| `project_meeting_people` | Attendees (people and contacts), their answer, and an outside person's answer link |
| `project_meeting_actions` | Action items: what, who, by when, the task it became |

## Builds

| Build | Contents |
|---|---|
| 6.1 | Scripts 262 and 263, conversations and messages, read state, the Messages tab |
| 6.2 | Mentions, tags, typing shortcuts, editing and moderation |
| 6.3 | The inbox, following, message notices |
| 6.4 | Core: staff channel choices, and the company's defaults and locks |
| 6.5 | Core: replies filed into conversations (email and WhatsApp), and the waiting list |
| 6.6 | Meetings: free-time search, calendar entries, invitations and answers |
| 6.7 | Minutes, action items into tasks, sharing the minutes |
| 6.8 | Handing work over |

Every build runs the Projects, Notifier and Calendar tests and the Projects browser checks.

## Four choices (my recommendation first)

1. **How incoming email replies are read:** a mailbox the company already has (for example replies@yourdomain), read every few minutes over IMAP, with its address and password in Notifications settings (works with any mail host). The other ways: a mail service that forwards replies to us (Mailgun, Postmark), which needs an account with one; or no email replies for now (WhatsApp replies and the app only).
2. **Who sees a client conversation:** the team and the client's chosen contacts only; other parties get their own "Others" conversations, so nothing meant for the client reaches the other side by mistake. The other way: one conversation can mix client and party contacts.
3. **Staff channel choices:** each person chooses per group of notices, from the company's default, and the company can lock a group. The other way: the company decides for everyone, per group, and staff cannot change it.
4. **Handing over someone else's work:** a serious action (out of the box it needs nothing, and the company can ask for a supervisor or identity in Configuration). The other way: just the permission.

## As built

### To run

1. `backend/database/sql/262_notify_staff_and_replies.sql` (Core; three tables) and `backend/database/sql/263_projects_messages.sql` (after 257 to 261; eleven tables, the new project-role abilities and four starting tags). Both add only.
2. No permission seed.

### 6.1 Conversations (done)

Screen: `docs/screens/projects-messages.png`.

- **The messages table is `project_thread_messages`, not `project_messages`:** the old Projects module had a `project_messages` table (script 256 drops it), so the new one has a name that can never meet it.
- **Scripts 262 and 263** make all of the stage's tables now (fourteen in all), so each is run once.
- **Service:** `ProjectThreads`. **Tab:** Messages, shown to people with either message permission.
- **Audiences:** team (`projects.messages.internal`), client and others (`projects.messages.client`). Reading needs the audience's permission and the right to open the work; writing also needs a project role that may talk (new ability `talk`, Lead and Member) and work that is not frozen. Someone without the client permission does not see client or others conversations at all.
- **Owner's choice 2:** a client conversation takes only the client's contacts (Stage 3); other parties' contacts (of parties linked to the work) go in "Others" conversations. A contact with no email and no phone cannot be chosen.
- **Sending:** each message the team writes in a client or others conversation goes to every contact in it through `Notifier::sendToContact` (new notice type "Projects: messages from the team about your work", essential, so a client who chose "essential only" still gets it), with the conversation's subject and the work's number. What went to whom and by which channels is kept on the message and shown under it.
- **Owner, open or closed:** each conversation has a person on the work who answers it; closing hides it from the open list; a new message opens it again. Subject, owner and contacts can be changed.
- **Read state:** per person per conversation; opening it marks it read; unread counts in the list (your own messages never count).
- **Routes:** `GET`, `POST /projects/{project}/threads`; `GET`, `PUT /projects/{project}/threads/{thread}`; `POST /projects/{project}/threads/{thread}/messages`.
- **Tests:** `tests/Feature/ProjectsThreadsTest.php` (3); two earlier tests now expect the new abilities. All Projects tests pass. Browser check `e2e/projects-messages-ui.mjs` (8 checks).

### 6.2 Mentions, tags, typing shortcuts, editing (done)

- **@mentions:** typing @ suggests the people on the work; the people chosen are sent with the message and told (notice type "Projects: messages and things you follow"). A name typed without choosing it is still found if it matches someone on the work exactly.
- **#tags:** typing # suggests the company's tags; a #tag in a message tags the conversation. Tags can also be set with the Tags button on a conversation. The list is in Configuration → Conversation tags (name, what is typed after #, shown as one of the named statuses, offered or not). Four to start with: urgent, waiting, decision, done.
- **/task** sends the message and makes it a task on the same work, linked back to it ("Made into a task" shows on the message). Any message can be made a task with its "Make a task" button. Needs the right to add tasks.
- **/time 1h30 note** logs time on the work (Stage 5 rules) instead of sending anything. "1h30", "1h 30m", "90m", "1.5h" all work.
- **/meet** says meetings arrive with build 6.6; it opens the meeting form from then.
- **Changing and removing:** your own message for 15 minutes; after that, and anyone's, with `projects.messages.moderate`. The message says "edited"; the old text is kept in the log. Removing leaves "Removed by …". A message from a client is never changed.
- **Routes:** `PUT`, `DELETE /projects/{project}/threads/{thread}/messages/{message}`; `POST …/messages/{message}/task`; `PUT /projects/{project}/threads/{thread}/tags`; `GET`, `POST /projects/configuration/tags`; `PUT /projects/configuration/tags/{tag}`.
- **Tests:** `tests/Feature/ProjectsMentionsTagsTest.php` (3). Browser check `e2e/projects-messages-ui.mjs` now 17 checks.

### 6.3 The inbox, following, message notices (done)

Screen: `docs/screens/projects-inbox.png`.

- **Inbox:** Projects → Inbox (G then I; the letter is a setting like the others). Every conversation on the work the person is on (an active member whose role may open it) in the audiences their permissions allow, newest first. With `projects.inbox.all` (and `projects.view_all`), every conversation on work they may see. Views: everything, unread, mentions, mine to answer, each with its count; filters: open or closed, piece of work, audience, tag. The filters are kept in the address. A line opens its conversation on its work.
- **Counts:** unread conversations show in the inbox views and in My Work's "Waiting for you" ("Conversations to read"). **Not done:** a number on the Projects menu entry. The menu has no place for counts today; adding one is a change to the shared navigation for every module, so it waits until one is wanted there.
- **Following:** a Follow button on the Messages tab (the whole work), on each conversation and on each task. People follow on their own: a conversation's owner, whoever started it, wrote in it or was mentioned; a task's people and whoever made it. Anyone can stop (kept as "muted"), or follow something more. Pressing Follow on something you follow on your own just removes the "stopped" mark.
- **Notices** (type "Projects: messages and things you follow"): a new message tells the conversation's followers and the work's followers who may read that conversation, except the writer and anyone just told by a mention. A task moving tells its followers and the work's followers (with the reason, when one was given). A key date moving tells the work's followers, with where it moved from and why. Nobody who may no longer open the work, and no inactive or suspended account, is told.
- **Routes:** `GET /projects/inbox`, `GET /projects/inbox/count`, `PUT /projects/{project}/follow` (type project, thread or task; id; on).
- **Services:** `ProjectInbox`, `ProjectFollows`.
- **Tests:** `tests/Feature/ProjectsInboxFollowTest.php` (3); My Work's test now expects the conversation count. Browser check `e2e/projects-inbox-ui.mjs` (9 checks).
