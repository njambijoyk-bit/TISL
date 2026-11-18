# Projects Stage 6: Messages, meetings, working together (built)

Status: built. The owner said "build" on 2026-11-18, accepting the four choices at the end; all eight builds are done and listed under "As built".

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
3. Nothing else to set up for the stage to work. For replies by email, name a replies mailbox in Settings → Notifications → Email (6.5); for WhatsApp replies, the Meta or Twilio webhook already set up for delivery statuses is enough.

### To check by hand once the scripts are run

1. On a piece of work, open Messages, start a team conversation, @mention someone and add #urgent; they get a notice and it shows in their Inbox under Mentions.
2. Start a client conversation with a client contact who has your own email; the message arrives. With a replies mailbox named, reply to it, press "Read it now", and see the reply in the conversation.
3. Type `/time 30m checking` in a conversation, then look at your timesheet.
4. In your profile, "How I hear", set Projects to bell only; then get a task given to you: bell, no email.
5. Plan a client meeting with "Find a time everyone is free"; it lands on the team's calendars; the contact's email has a calendar file and an answer link that works without signing in.
6. After it starts, write minutes with an action item, make it a task, share the minutes.
7. Hand someone's open work on one piece of work to a colleague who is on it; both are told, and it shows in the work's Activity.

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

### 6.4 Core: staff choose their channels (done)

Screens: `docs/screens/notify-my-channels.png` (a staff member's own page), `docs/screens/notify-staff-tab.png` (the company's defaults and locks).

- **Groups of notices** (`NotificationTypes::GROUPS`): Projects (your work), Security and approvals, Sales/orders/quotations, Events, Suppliers and the kitchen, and Everything else (any staff type not listed, and any type added later).
- **Each staff member** chooses per group in their profile, new tab "How I hear": bell only, bell and email, or bell and WhatsApp, or "as the company sets it". WhatsApp goes to the phone on their staff profile, the way the company sends WhatsApp now (by hand from the list, or through Meta or Twilio); it cannot be chosen without a phone, or while the company does not send WhatsApp.
- **The company** sets each group's default and can lock it: Settings → Notifications → "How staff hear" (kept in the general settings, with its history and rollback like the rest). A lock wins over a choice made before it.
- **Until anyone chooses anything, every group is bell and email: exactly as before.**
- **How it is applied:** the ChannelResolver reads the choice. Bell only drops the email (logged as "staff_choice"). WhatsApp goes instead of email; if WhatsApp cannot be used (switched off, no phone, a type the company keeps to email), the email goes instead so nothing is lost. A type the company switched off is still bell only. Messages that need a colleague now (a second person to approve) still also go to WhatsApp as before.
- **One more place reads it:** an old-style bell row that names email (made before the Notifier) no longer emails someone who chose bell only for its group.
- **Routes:** `GET`, `PUT /admin/notifications/my-channels` (anyone with the admin area; only their own). The company's side is the existing `PUT /admin/notifications/settings/general` with `staff_groups`.
- **Tests:** `tests/Feature/NotifyStaffChannelsTest.php` (4), `tests/Unit/NotifyStaffModeResolverTest.php` (4). All Notifier and Projects tests pass. Browser check `e2e/notify-staff-channels-ui.mjs` (7 checks).

### 6.5 Core: replies filed into conversations (done)

Screens: `docs/screens/notify-replies-mailbox.png` (the mailbox, in Notifications settings → Email), `docs/screens/projects-replies-waiting.png` (the waiting list).

- **Answerable messages:** a message the team writes in a client or others conversation now goes out with a reply route. By email it carries its own reply address, `replies+<code>@yourdomain`, made from the mailbox named in settings (most mail hosts deliver `replies+anything@` to `replies@` with no setting). By WhatsApp the number it went to is remembered. With no mailbox named, the email has the usual reply-to, as before.
- **Owner's choice 1, the mailbox:** Settings → Notifications → Email → "Replies mailbox": the address, the IMAP server, port, security (SSL, STARTTLS or none), user name and password (kept encrypted like the mail password). It is read every five minutes (`notifications:read-replies`), and "Read it now" reads it at once; how the last read went shows under it. Saving only the mailbox does not send the mail-server test email again.
- **The IMAP reader is built in** (plain sockets and TLS): the server has no PHP IMAP extension, and none is needed. Unseen mail is fetched without marking it, kept once by its Message-ID, then marked seen.
- **What is kept of a reply:** the plain text (or the HTML made plain), without the quoted message under it ("On … wrote:", lines starting with ">", "Original Message", signature dashes).
- **WhatsApp:** the Meta and Twilio webhooks now also take incoming messages (still only after the provider's signature checks out). A message is filed into the one open conversation that wrote to that number in the last 90 days. If none is open, or more than one is, it waits (so nothing meant for one client lands in another's conversation by guessing).
- **Filing:** a reply becomes a message from that contact, marked "replied by email" or "by WhatsApp", opens the conversation again, and tells its followers ("Grace Wambua replied in …"). A reply from someone taken out of the conversation waits.
- **Waiting replies:** Projects → Inbox → "Replies waiting" (shown to people with `projects.messages.moderate`, with the count). Each shows who, when, the text and why it waits, and offers the conversations its sender is a contact in; "File it" puts it there as from that person, "Throw it away" discards it (kept, marked discarded). A reply from someone in no conversation can only be thrown away from here today; add them as a contact and to the conversation first, and it is offered.
- **Other modules:** `InboundReplies::register('module', Filer::class)` (in `AppServiceProvider`); a filer files, says whether its thing is open, and describes it. Projects is the only one so far.
- **Routes:** `POST /admin/notifications/settings/replies/read`; `GET /admin/projects/replies/waiting`, `POST /admin/projects/replies/{id}/file` (thread_id, contact_id), `POST /admin/projects/replies/{id}/discard`.
- **Tests:** `tests/Feature/NotifyRepliesTest.php` (7: the reply address, filing once, waiting and discarding, WhatsApp matching, the providers' incoming messages, mail parsing and quoted text, the IMAP conversation against a scripted server, a refused sign-in, saving the mailbox alone); `tests/Feature/ProjectsRepliesTest.php` (2). Browser checks: `e2e/projects-inbox-ui.mjs` (now 12), `e2e/notify-staff-channels-ui.mjs` (now 10).
- **To check by hand once a real mailbox is named:** send a message to a test contact, reply from their mail, press "Read it now", and see the reply in the conversation.

### 6.6 Meetings (done)

Screens: `docs/screens/projects-meeting-plan.png` (planning, with the free-time search), `docs/screens/projects-meeting.png` (a meeting and its answers), `docs/screens/projects-meeting-answer.png` (the page an outside contact answers on).

- **Tab:** Meetings, on each piece of work. Coming up first, then earlier and cancelled ones.
- **Planning:** title, team / client / others, day, time, how long, where, an online link (https only), agenda, people from the team (the organiser always comes), and for a client or others meeting the contacts (the same rule as conversations: the client's contacts for a client meeting, parties' contacts for others; a contact with no email or phone cannot be invited). Planning needs `projects.meetings` and a project role that may meet; a client or others meeting also needs `projects.messages.client`. Someone from the team who may not see client meetings cannot be invited to one.
- **Free-time search:** for the people from the team, the times in the next two weeks (half-hour steps, up to 24 shown) when all of them are free, inside company hours and working days (Attendance settings; 08:00 to 17:00, Monday to Friday until changed), skipping days marked leave, off or holiday in Attendance, anyone whose employee record says on leave, time off on their calendars, and anything already on their calendars at that time. It says who is away. Pick a time, or type one.
- **Calendar:** every staff attendee gets an entry (kind `meeting`, shown in the calendar's colour list), moved when the meeting moves, marked "declined" for someone who said no, and marked cancelled (kept, as a record) when it is called off.
- **Invitations** (new notice types: "Projects: meeting invitations, moves and cancellations, and minutes" for staff, in the Projects group of 6.4; the same for clients and parties, essential): staff get it on the bell (and as they chose) and answer yes, maybe or no on the meeting. Contacts get the details by email and WhatsApp, a calendar file (meeting.ics) on the email, and a personal link to `/meeting/<code>` where they answer without signing in (and can download the calendar file). The organiser is told each answer.
- **Core, the Notifier:** an email can now carry small files (`attachments`); only meeting invitations use it.
- **Moving or changing:** the organiser, or someone who may change the work or moderate, can change the time, place, link, agenda and the team. A new time or place tells everyone, with a fresh calendar file (calendars replace the old one), and asks everyone but the organiser to answer again. **Cancelling** asks why, tells everyone with a cancellation file, and the answer link then says it was cancelled.
- **/meet** in a conversation opens the meeting form with the conversation's audience, contacts and people (its owner and whoever wrote in it), and the text after /meet as the title.
- **Routes:** `GET`, `POST /projects/{project}/meetings`; `POST …/meetings/free-time`; `GET`, `PUT …/meetings/{meeting}`; `POST …/meetings/{meeting}/cancel`; `POST …/meetings/{meeting}/answer`. Without signing in (30 a minute): `GET /meetings/{code}`, `POST /meetings/{code}/answer`, `GET /meetings/{code}/ics`.
- **Services:** `ProjectMeetings`, `ProjectFreeTime`; Core `Calendar\IcsInvite`.
- **Tests:** `tests/Feature/ProjectsMeetingsTest.php` (5). Browser check `e2e/projects-meetings-ui.mjs` (12 checks).

### 6.7 Minutes and action items (done)

Screen: `docs/screens/projects-meeting-minutes.png`.

- **Minutes:** once a meeting has started, its organiser (or someone who may change the work or moderate) writes the minutes (what was said and decided) and the action items: what, who (someone on the work, or one of the meeting's contacts, marked "outside") and by when. Saving marks the meeting held (its calendar entries too). They can be changed later; an item that already became a task stays as it is, and is changed on its task.
- **Each action item becomes a task in one click** ("Make it a task"; needs `projects.tasks`): on the same work, titled as the item, given to its person (an item for someone outside goes to whoever makes the task, who follows it up), due on its day, and its description says which meeting it came from. The item then shows its task's reference. One item, one task.
- **Sharing the minutes:** "Share the minutes" sends the minutes and the action items to everyone invited: the team on the bell (and as they chose), and for a client or others meeting, the contacts through the Notifier. A team meeting's minutes never leave the team. Sharing again says "Minutes, updated". When they were shared shows on the meeting, and every save and share is in the log.
- **Routes:** `PUT /projects/{project}/meetings/{meeting}/minutes`, `POST …/meetings/{meeting}/actions/{action}/task`, `POST …/meetings/{meeting}/share`.
- **Tests:** two more in `tests/Feature/ProjectsMeetingsTest.php` (now 7). Browser check `e2e/projects-meetings-ui.mjs` (now 16 checks).

### 6.8 Handing work over (done)

Screen: `docs/screens/projects-handover.png`.

- **Page:** Projects → Hand over work (needs `projects.members.manage`), and a "Hand over" link on each active person on a piece of work's People tab, which opens it with that person and that work filled in.
- **What moves:** their open tasks (finished and cancelled ones stay as the record; if the new person is already on a task, the old one just comes off it), key dates they are responsible for (open or missed), conversations they answer (open), meetings they organise (planned, not yet over; the new organiser is added and marked coming), and their open follow-ups on the work's client (stage 3; listed once even when several pieces of work share the client). Everything is chosen to begin with; untick what stays.
- **On one piece of work, or all their work.** The new person must be on each piece of work: where they are not, that work's items stay, unticked, with "… is not on this work. Add them first." If anything chosen cannot move, nothing moves.
- **Who may:** `projects.members.manage`, and on each piece of work a project role that manages members (the Lead out of the box). **Owner's choice 4:** handing over someone else's work is a serious action, "Hand over someone's work" (out of the box it needs nothing; Configuration can ask for identity or a supervisor, suggested: a supervisor, with a reason). Handing over your own work is not.
- **Both people are told** (notice type "Projects: tasks…", so it follows their channel choice), and each piece of work's log says who handed what to whom, with counts by kind. Calendars follow: task, key date and meeting entries move to the new person.
- **Leading a piece of work** is still handed over on its People tab ("Transfer", stage 2).
- **Routes:** `GET /projects/handover/people`, `GET /projects/handover/preview` (from, to, project_id), `POST /projects/handover` (from, to, project_id, items).
- **Service:** `ProjectHandover`.
- **Tests:** `tests/Feature/ProjectsHandoverTest.php` (4); the serious-actions test now counts 16. Browser check `e2e/projects-handover-ui.mjs` (5 checks).
