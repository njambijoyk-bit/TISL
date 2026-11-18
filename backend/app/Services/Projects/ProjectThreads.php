<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Notify\Notifier;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Conversations on a piece of work (docs/PROJECTS_STAGE6_SPEC.md, build 6.1).
 *
 * Three audiences: the team only (`projects.messages.internal`), the client's chosen contacts (`projects.messages.client`), and other parties'
 * chosen contacts (the same permission; owner's choice 2 keeps client and parties apart). Reading needs the audience's permission and the right to
 * open the work; writing also needs a project role that may talk (ability `talk`) and work that is not frozen.
 *
 * A message the team writes in a client or others conversation goes to its contacts through the Core Notifier (email, WhatsApp), and what was
 * sent where is kept on the message. Each conversation has an owner who answers it and is open or closed; a new message opens it again.
 * How far each person has read is kept per conversation.
 */
class ProjectThreads
{
    public const AUDIENCES = ['team' => 'Team', 'client' => 'Client', 'others' => 'Others'];

    public function __construct(private ProjectAccess $access) {}

    /** The conversations on a piece of work this person may read, with unread counts. @return array<string, mixed> */
    public function list(object $project, User $user, array $f = []): array
    {
        $this->needReady();
        $may = $this->audiences($user, $project);
        $rows = DB::table('project_threads')->where('project_id', $project->id)->whereIn('audience', $may['read'] ?: ['none'])
            ->when(($f['state'] ?? 'open') !== 'all', fn ($q) => $q->where('state', $f['state'] ?? 'open'))
            ->orderByDesc('last_message_at')->orderByDesc('id')->get();
        $unread = $this->unread($rows->pluck('id')->all(), $user);
        $owners = DB::table('users')->whereIn('id', $rows->pluck('owner_id')->filter()->all() ?: [0])->pluck('name', 'id');
        $people = $this->peopleOf($rows->pluck('id')->all());
        $lastBodies = $this->lastMessages($rows->pluck('id')->all());

        return [
            'ready' => true,
            'threads' => $rows->map(fn ($t) => $this->shape($t, $owners, $people, $unread, $lastBodies))->values()->all(),
            'audiences' => array_intersect_key(self::AUDIENCES, array_flip($may['write'])),
            'contacts' => $may['write'] ? $this->contactsFor($project) : ['client' => [], 'others' => []],
            'team' => $may['write'] ? $this->members($project) : [],
            'can' => ['start' => (bool) $may['write']],
        ];
    }

    /** One conversation with its messages; reading it marks it read. @return array<string, mixed> */
    public function show(object $project, int $threadId, User $user): array
    {
        $t = $this->readable($project, $threadId, $user);
        $msgs = DB::table('project_thread_messages')->where('thread_id', $t->id)->orderBy('id')->limit(500)->get();
        $names = DB::table('users')->whereIn('id', $msgs->pluck('user_id')->merge($msgs->pluck('removed_by'))->filter()->unique()->all() ?: [0])->pluck('name', 'id');
        $contacts = DB::table('project_contacts')->whereIn('id', $msgs->pluck('contact_id')->filter()->unique()->all() ?: [0])->pluck('name', 'id');
        $last = (int) ($msgs->max('id') ?? 0);
        if ($last) {
            DB::table('project_message_reads')->updateOrInsert(['thread_id' => $t->id, 'user_id' => $user->id], ['last_message_id' => $last, 'read_at' => now()]);
        }
        $owners = DB::table('users')->where('id', $t->owner_id)->pluck('name', 'id');
        $write = $this->mayWrite($project, $t, $user);
        $moderate = $this->access->decide($user, 'moderate', $project)['allowed'];

        return $this->shape($t, $owners, $this->peopleOf([(int) $t->id]), [], []) + [
            'messages' => $msgs->map(fn ($m) => [
                'id' => (int) $m->id, 'from' => $m->user_id ? ['type' => 'person', 'id' => (int) $m->user_id, 'name' => $names[$m->user_id] ?? 'Someone'] : ['type' => 'contact', 'id' => (int) $m->contact_id, 'name' => $contacts[$m->contact_id] ?? 'A contact'],
                'mine' => (int) $m->user_id === (int) $user->id, 'body' => $m->removed_at ? null : $m->body, 'via' => $m->via,
                'sent_to' => $m->sent_to ? json_decode($m->sent_to, true) : null, 'edited' => $m->edited_at !== null,
                'removed' => $m->removed_at ? ['by' => $names[$m->removed_by] ?? 'someone', 'at' => $m->removed_at] : null, 'task_id' => $m->task_id ? (int) $m->task_id : null, 'at' => $m->created_at,
                'can_change' => ! $m->removed_at && ! $m->contact_id && (($moderate ?? false) || ((int) $m->user_id === (int) $user->id && \Carbon\Carbon::parse($m->created_at)->gt(now()->subMinutes(15)) && $write)),
            ])->values()->all(),
            'tag_list' => $write ? $this->tags() : [],
            'people' => $write ? $this->members($project) : [],
            'can' => ['write' => $this->mayWrite($project, $t, $user), 'manage' => $this->mayWrite($project, $t, $user) && ((int) $t->owner_id === (int) $user->id || (int) $t->created_by === (int) $user->id || $this->access->decide($user, 'moderate', $project)['allowed'])],
        ];
    }

    /** Start a conversation, with its first message. @param array<string, mixed> $d subject, audience, contacts (ids), owner_id, body */
    public function start(object $project, array $d, User $by): int
    {
        $this->needReady();
        $audience = (string) ($d['audience'] ?? 'team');
        if (! isset(self::AUDIENCES[$audience])) {
            throw new ProjectException('Choose who the conversation is with.');
        }
        $this->access->authorize($by, $audience === 'team' ? 'talk_team' : 'talk_client', $project);
        $subject = trim(preg_replace('/\s+/', ' ', (string) ($d['subject'] ?? '')));
        if ($subject === '') {
            throw new ProjectException('Give the conversation a subject.');
        }
        $contacts = $this->checkContacts($project, $audience, (array) ($d['contacts'] ?? []));
        $owner = ! empty($d['owner_id']) ? (int) $d['owner_id'] : (int) $by->id;
        if (! in_array($owner, array_column($this->members($project), 'id'), true)) {
            throw new ProjectException('The person who answers it must be on this work.');
        }
        if (trim((string) ($d['body'] ?? '')) === '') {
            throw new ProjectException('Write the first message.');
        }
        $id = DB::transaction(function () use ($project, $audience, $subject, $contacts, $owner, $by) {
            $id = DB::table('project_threads')->insertGetId(['project_id' => $project->id, 'subject' => mb_substr($subject, 0, 200), 'audience' => $audience, 'owner_id' => $owner, 'state' => 'open',
                'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($contacts as $c) {
                DB::table('project_thread_people')->insert(['thread_id' => $id, 'contact_id' => $c, 'added_by' => $by->id, 'added_at' => now()]);
            }
            ProjectLog::record((int) $project->id, $by, 'thread.started', 'thread', $id, null, ['subject' => $subject, 'audience' => $audience, 'contacts' => count($contacts)]);

            return $id;
        });
        $this->post($project, $id, (string) $d['body'], $by);

        return $id;
    }

    /**
     * Write a message. In a client or others conversation it goes to the contacts through the Notifier. People @mentioned (chosen from the work's
     * people) are told; #tags in the text tag the conversation. @param int[] $mentions @return int the message's id
     */
    public function post(object $project, int $threadId, string $body, User $by, array $mentions = []): int
    {
        $t = $this->readable($project, $threadId, $by);
        if (! $this->mayWrite($project, $t, $by)) {
            $this->access->authorize($by, $t->audience === 'team' ? 'talk_team' : 'talk_client', $project);   // answers as the access rules do, and logs the refusal
            throw new ProjectException('You may not do that here.', 403);
        }
        $body = $this->clean($body);
        $id = DB::table('project_thread_messages')->insertGetId(['thread_id' => $t->id, 'user_id' => $by->id, 'body' => $body, 'via' => 'app', 'created_at' => now()]);
        DB::table('project_threads')->where('id', $t->id)->update(['last_message_at' => now(), 'state' => 'open', 'updated_at' => now()]);
        DB::table('project_message_reads')->updateOrInsert(['thread_id' => $t->id, 'user_id' => $by->id], ['last_message_id' => $id, 'read_at' => now()]);
        if ($t->audience !== 'team') {
            $sent = $this->sendOut($project, $t, $id, $body, $by);
            DB::table('project_thread_messages')->where('id', $id)->update(['sent_to' => json_encode($sent)]);
        }
        $this->mention($project, $t, $id, $body, $mentions, $by);
        $this->tagFromText($t, $body);
        ProjectLog::record((int) $project->id, $by, 'message.posted', 'thread', (int) $t->id, null, ['message' => $id]);

        return $id;
    }

    /** Change a message: your own within 15 minutes, or anyone's with `projects.messages.moderate`. The original is kept in the log. */
    public function edit(object $project, int $threadId, int $messageId, string $body, User $by): void
    {
        [$t, $m] = $this->ownOrModerate($project, $threadId, $messageId, $by);
        $body = $this->clean($body);
        DB::table('project_thread_messages')->where('id', $m->id)->update(['body' => $body, 'edited_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'message.edited', 'thread', (int) $t->id, ['message' => (int) $m->id, 'body' => $m->body], ['body' => $body]);
    }

    /** Remove a message: it reads "Removed by …"; the text is kept in the log. */
    public function remove(object $project, int $threadId, int $messageId, User $by): void
    {
        [$t, $m] = $this->ownOrModerate($project, $threadId, $messageId, $by);
        DB::table('project_thread_messages')->where('id', $m->id)->update(['removed_at' => now(), 'removed_by' => $by->id]);
        ProjectLog::record((int) $project->id, $by, 'message.removed', 'thread', (int) $t->id, ['message' => (int) $m->id, 'body' => $m->body], null);
    }

    /** Turn a message into a task on the same work (the title from its first line), linked back to it. @return int the task's id */
    public function makeTask(object $project, int $threadId, int $messageId, User $by): int
    {
        $t = $this->readable($project, $threadId, $by);
        $m = DB::table('project_thread_messages')->where('id', $messageId)->where('thread_id', $t->id)->whereNull('removed_at')->first() ?? throw new ProjectException('Not found.', 404);
        if ($m->task_id) {
            throw new ProjectException('This message is already a task.');
        }
        $text = preg_replace('#^/task\s+#i', '', trim((string) $m->body));
        $title = mb_substr(trim(strtok($text, "\n") ?: $text), 0, 200);
        $id = app(ProjectTasks::class)->create($project, ['title' => $title, 'description' => "From the conversation \"{$t->subject}\":\n\n{$text}", 'people' => [(int) $by->id]], $by);
        DB::table('project_thread_messages')->where('id', $m->id)->update(['task_id' => $id]);

        return $id;
    }

    /** Set a conversation's tags. @param int[] $tagIds */
    public function tag(object $project, int $threadId, array $tagIds, User $by): void
    {
        $t = $this->readable($project, $threadId, $by);
        if (! $this->mayWrite($project, $t, $by)) {
            throw new ProjectException('You may not do that here.', 403);
        }
        $ids = array_values(array_unique(array_map('intval', $tagIds)));
        if (count($ids) !== DB::table('project_tags')->whereIn('id', $ids ?: [0])->where('is_active', 1)->count()) {
            throw new ProjectException('Choose tags from the list.');
        }
        DB::table('project_thread_tags')->where('thread_id', $t->id)->delete();
        foreach ($ids as $tag) {
            DB::table('project_thread_tags')->insert(['thread_id' => $t->id, 'tag_id' => $tag]);
        }
        ProjectLog::record((int) $project->id, $by, 'thread.tagged', 'thread', (int) $t->id, null, ['tags' => $ids]);
    }

    /** The company's tags. @return array<int, array<string, mixed>> */
    public function tags(bool $all = false): array
    {
        return DB::table('project_tags')->when(! $all, fn ($q) => $q->where('is_active', 1))->orderBy('name')->get()
            ->map(fn ($t) => ['id' => (int) $t->id, 'key' => $t->key, 'name' => $t->name, 'status' => $t->status_token, 'is_active' => (bool) $t->is_active])->all();
    }

    /** Add or change a tag (Configuration). @param array<string, mixed> $d key, name, status, is_active */
    public function saveTag(?int $id, array $d, User $by): void
    {
        $this->needReady();
        $name = trim(preg_replace('/\s+/', ' ', (string) ($d['name'] ?? '')));
        if ($name === '') {
            throw new ProjectException('Give the tag a name.');
        }
        $key = strtolower(trim((string) ($d['key'] ?? '')) ?: preg_replace('/[^a-z0-9]+/', '-', strtolower($name)));
        $key = trim(preg_replace('/[^a-z0-9_-]+/', '', $key), '-');
        if ($key === '' || mb_strlen($key) > 40) {
            throw new ProjectException('A tag is typed after # in letters, numbers and dashes.');
        }
        if (DB::table('project_tags')->where('key', $key)->when($id, fn ($q) => $q->where('id', '!=', $id))->exists()) {
            throw new ProjectException("There is already a tag #{$key}.");
        }
        $status = in_array($d['status'] ?? null, ['info', 'good', 'warning', 'problem'], true) ? $d['status'] : null;
        $row = ['key' => $key, 'name' => mb_substr($name, 0, 60), 'status_token' => $status, 'is_active' => array_key_exists('is_active', $d) ? ($d['is_active'] ? 1 : 0) : 1];
        if ($id) {
            if (! DB::table('project_tags')->where('id', $id)->exists()) {
                throw new ProjectException('Not found.', 404);
            }
            DB::table('project_tags')->where('id', $id)->update($row);
        } else {
            DB::table('project_tags')->insert($row + ['created_by' => $by->id, 'created_at' => now()]);
        }
        ProjectLog::record(null, $by, $id ? 'tag.changed' : 'tag.added', 'tag', $id, null, $row);
    }

    /** Close or open a conversation, change who answers it, or its contacts. @param array<string, mixed> $d state, owner_id, contacts, subject */
    public function update(object $project, int $threadId, array $d, User $by): void
    {
        $t = $this->readable($project, $threadId, $by);
        if (! $this->mayWrite($project, $t, $by)) {
            throw new ProjectException('You may not do that here.', 403);
        }
        $row = [];
        if (array_key_exists('state', $d)) {
            if (! in_array($d['state'], ['open', 'closed'], true)) {
                throw new ProjectException('A conversation is open or closed.');
            }
            $row['state'] = $d['state'];
        }
        if (array_key_exists('owner_id', $d)) {
            $owner = (int) $d['owner_id'];
            if (! in_array($owner, array_column($this->members($project), 'id'), true)) {
                throw new ProjectException('The person who answers it must be on this work.');
            }
            $row['owner_id'] = $owner;
        }
        if (array_key_exists('subject', $d)) {
            $s = trim(preg_replace('/\s+/', ' ', (string) $d['subject']));
            if ($s === '') {
                throw new ProjectException('Give the conversation a subject.');
            }
            $row['subject'] = mb_substr($s, 0, 200);
        }
        $contacts = array_key_exists('contacts', $d) && $t->audience !== 'team' ? $this->checkContacts($project, $t->audience, (array) $d['contacts']) : null;
        DB::transaction(function () use ($t, $row, $contacts, $by, $project) {
            if ($row) {
                DB::table('project_threads')->where('id', $t->id)->update($row + ['updated_at' => now()]);
            }
            if ($contacts !== null) {
                DB::table('project_thread_people')->where('thread_id', $t->id)->whereNotIn('contact_id', $contacts ?: [0])->delete();
                foreach (array_diff($contacts, DB::table('project_thread_people')->where('thread_id', $t->id)->pluck('contact_id')->map(fn ($v) => (int) $v)->all()) as $c) {
                    DB::table('project_thread_people')->insert(['thread_id' => $t->id, 'contact_id' => $c, 'added_by' => $by->id, 'added_at' => now()]);
                }
            }
            ProjectLog::record((int) $project->id, $by, 'thread.changed', 'thread', (int) $t->id, array_intersect_key((array) $t, $row), $row + ($contacts !== null ? ['contacts' => $contacts] : []));
        });
    }

    /** Unread conversations for the tab and the menu. @param int[] $threadIds @return array<int, int> thread id => unread messages */
    public function unread(array $threadIds, User $user): array
    {
        if (! $threadIds) {
            return [];
        }
        $reads = DB::table('project_message_reads')->where('user_id', $user->id)->whereIn('thread_id', $threadIds)->pluck('last_message_id', 'thread_id');
        $out = [];
        foreach (DB::table('project_thread_messages')->whereIn('thread_id', $threadIds)->whereNull('removed_at')->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $user->id))
            ->get(['id', 'thread_id']) as $m) {
            if ($m->id > (int) ($reads[$m->thread_id] ?? 0)) {
                $out[(int) $m->thread_id] = ($out[(int) $m->thread_id] ?? 0) + 1;
            }
        }

        return $out;
    }

    /** Which audiences this person may read and write on this work. @return array{read: string[], write: string[]} */
    public function audiences(User $user, object $project): array
    {
        $open = $this->access->decide($user, 'open', $project)['allowed'];
        $read = [];
        $write = [];
        if ($open && $user->hasPermission('projects.messages.internal')) {
            $read[] = 'team';
        }
        if ($open && $user->hasPermission('projects.messages.client')) {
            array_push($read, 'client', 'others');
        }
        if ($this->access->decide($user, 'talk_team', $project)['allowed']) {
            $write[] = 'team';
        }
        if ($this->access->decide($user, 'talk_client', $project)['allowed']) {
            array_push($write, 'client', 'others');
        }

        return ['read' => $read, 'write' => $write];
    }

    // ------------------------------------------------------------------ inside

    /** To each contact in the conversation, through the Notifier. @return array<int, array{contact: string, channels: string[]}> */
    private function sendOut(object $project, object $t, int $messageId, string $body, User $by): array
    {
        $out = [];
        $contacts = DB::table('project_thread_people as tp')->join('project_contacts as c', 'c.id', '=', 'tp.contact_id')->where('tp.thread_id', $t->id)->whereNull('c.deleted_at')->get(['c.id', 'c.name', 'c.email', 'c.phone']);
        foreach ($contacts as $c) {
            $r = app(Notifier::class)->sendToContact(['name' => $c->name, 'email' => $c->email, 'phone' => $c->phone], ProjectNotices::MESSAGE, "{$t->subject} · {$project->number}",
                "{$by->name}:\n\n{$body}", ['subject' => "{$t->subject} [{$project->number}]", 'data' => ['project_thread' => (int) $t->id, 'project_message' => $messageId, 'contact' => (int) $c->id]]);
            $out[] = ['contact' => $c->name, 'channels' => array_values(array_diff($r['channels'] ?? [], ['database']))];
        }

        return $out;
    }

    private function readable(object $project, int $threadId, User $user): object
    {
        $this->needReady();
        $t = DB::table('project_threads')->where('id', $threadId)->where('project_id', $project->id)->first();
        if (! $t || ! in_array($t->audience, $this->audiences($user, $project)['read'], true)) {
            throw new ProjectException('Not found.', 404);
        }

        return $t;
    }

    private function mayWrite(object $project, object $t, User $user): bool
    {
        return in_array($t->audience, $this->audiences($user, $project)['write'], true);
    }

    /** Contacts a conversation can include: the client's for a client conversation, the work's parties' for an others one. @return int[] */
    private function checkContacts(object $project, string $audience, array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', array_filter($ids))));
        if ($audience === 'team') {
            return [];
        }
        if (! $ids) {
            throw new ProjectException($audience === 'client' ? 'Choose who at the client the conversation is with.' : 'Choose who at the other parties the conversation is with.');
        }
        $allowed = array_column($this->contactsFor($project)[$audience], 'id');
        if (array_diff($ids, $allowed)) {
            throw new ProjectException($audience === 'client' ? 'A client conversation is with the client\'s contacts only. Start an "Others" conversation for anyone else.' : 'Choose contacts of the parties on this work.');
        }

        return $ids;
    }

    /** @return array{client: array<int, array<string, mixed>>, others: array<int, array<string, mixed>>} */
    private function contactsFor(object $project): array
    {
        $shape = fn ($c) => ['id' => (int) $c->id, 'name' => $c->name, 'email' => $c->email, 'phone' => $c->phone, 'reachable' => ($c->email ?? '') !== '' || ($c->phone ?? '') !== ''];
        $client = $project->customer_id ? DB::table('project_contacts')->where('owner_type', 'customer')->where('owner_id', $project->customer_id)->whereNull('deleted_at')->orderByDesc('is_main')->orderBy('name')->get()->map($shape)->all() : [];
        $parties = DB::table('project_party_links')->where('project_id', $project->id)->pluck('party_id')->unique()->all();
        $partyNames = DB::table('project_parties')->whereIn('id', $parties ?: [0])->pluck('name', 'id');
        $others = DB::table('project_contacts')->where('owner_type', 'party')->whereIn('owner_id', $parties ?: [0])->whereNull('deleted_at')->orderBy('name')->get()
            ->map(fn ($c) => $shape($c) + ['party' => $partyNames[$c->owner_id] ?? null])->all();

        return ['client' => $client, 'others' => $others];
    }

    /** @return array<int, array{id: int, name: string}> */
    private function members(object $project): array
    {
        $now = now();

        return DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->join('project_role_permissions as p', 'p.project_role_id', '=', 'm.project_role_id')
            ->where('m.project_id', $project->id)->where('m.status', 'active')->where('p.ability', 'open')->where(fn ($q) => $q->whereNull('m.ends_at')->orWhere('m.ends_at', '>=', $now))
            ->orderBy('u.name')->distinct()->get(['u.id', 'u.name'])->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->all();
    }

    /** @return array<int, array<int, array{id: int, name: string}>> */
    private function peopleOf(array $ids): array
    {
        return DB::table('project_thread_people as tp')->join('project_contacts as c', 'c.id', '=', 'tp.contact_id')->whereIn('tp.thread_id', $ids ?: [0])->orderBy('c.name')
            ->get(['tp.thread_id', 'c.id', 'c.name'])->groupBy('thread_id')->map(fn (Collection $g) => $g->map(fn ($c) => ['id' => (int) $c->id, 'name' => $c->name])->values()->all())->all();
    }

    /** @return array<int, object> */
    private function lastMessages(array $ids): array
    {
        if (! $ids) {
            return [];
        }
        $last = DB::table('project_thread_messages')->whereIn('thread_id', $ids)->groupBy('thread_id')->selectRaw('thread_id, MAX(id) as id')->pluck('id', 'thread_id');
        $rows = DB::table('project_thread_messages as m')->leftJoin('users as u', 'u.id', '=', 'm.user_id')->leftJoin('project_contacts as c', 'c.id', '=', 'm.contact_id')
            ->whereIn('m.id', $last->values()->all() ?: [0])->get(['m.thread_id', 'm.body', 'm.removed_at', 'm.created_at', 'u.name as person', 'c.name as contact']);

        return $rows->keyBy('thread_id')->all();
    }

    /** @return array<string, mixed> */
    private function shape(object $t, $owners, array $people, array $unread, array $last): array
    {
        $l = $last[$t->id] ?? null;

        return ['id' => (int) $t->id, 'subject' => $t->subject, 'audience' => $t->audience, 'state' => $t->state, 'tags' => $this->tagsOf((int) $t->id), 'owner' => $t->owner_id ? ['id' => (int) $t->owner_id, 'name' => $owners[$t->owner_id] ?? null] : null,
            'contacts' => $people[$t->id] ?? [], 'unread' => (int) ($unread[$t->id] ?? 0), 'last_message_at' => $t->last_message_at,
            'last' => $l ? ['from' => $l->person ?? $l->contact, 'text' => $l->removed_at ? null : mb_substr((string) $l->body, 0, 90), 'at' => $l->created_at] : null];
    }

    /** @return array<int, array{id: int, key: string, name: string, status: ?string}> */
    private function tagsOf(int $threadId): array
    {
        return DB::table('project_thread_tags as tt')->join('project_tags as g', 'g.id', '=', 'tt.tag_id')->where('tt.thread_id', $threadId)->orderBy('g.name')->get(['g.id', 'g.key', 'g.name', 'g.status_token'])
            ->map(fn ($g) => ['id' => (int) $g->id, 'key' => $g->key, 'name' => $g->name, 'status' => $g->status_token])->all();
    }

    /** Store and tell the people mentioned: people on the work who may read this conversation, never the writer. */
    private function mention(object $project, object $t, int $messageId, string $body, array $ids, User $by): void
    {
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (! $ids) {
            return;
        }
        $on = array_column($this->members($project), 'id');
        $people = User::whereIn('id', array_intersect($ids, $on))->where('id', '!=', $by->id)->get()
            ->filter(fn ($u) => in_array($t->audience, $this->audiences($u, $project)['read'], true));
        foreach ($people as $u) {
            DB::table('project_message_mentions')->insertOrIgnore(['message_id' => $messageId, 'user_id' => $u->id]);
        }
        ProjectNotices::tell($people, ProjectNotices::FOLLOW, "{$by->name} mentioned you on {$project->number}", "In \"{$t->subject}\":\n\n" . mb_substr($body, 0, 400),
            "/admin/projects/{$project->id}?tab=messages&thread={$t->id}", 'Open the conversation');
    }

    /** #tags typed in a message tag the conversation, when they are on the company's list. */
    private function tagFromText(object $t, string $body): void
    {
        if (! preg_match_all('/(?:^|\s)#([a-z0-9][a-z0-9_-]{0,39})\b/i', $body, $m)) {
            return;
        }
        foreach (DB::table('project_tags')->whereIn('key', array_map('strtolower', $m[1]))->where('is_active', 1)->pluck('id') as $tag) {
            DB::table('project_thread_tags')->insertOrIgnore(['thread_id' => $t->id, 'tag_id' => $tag]);
        }
    }

    /** @return array{0: object, 1: object} the conversation and the message, when this person may change it */
    private function ownOrModerate(object $project, int $threadId, int $messageId, User $by): array
    {
        $t = $this->readable($project, $threadId, $by);
        $m = DB::table('project_thread_messages')->where('id', $messageId)->where('thread_id', $t->id)->whereNull('removed_at')->first() ?? throw new ProjectException('Not found.', 404);
        if ($m->contact_id) {
            throw new ProjectException('A message from a contact is kept as it came.');
        }
        $own = (int) $m->user_id === (int) $by->id && \Carbon\Carbon::parse($m->created_at)->gt(now()->subMinutes(15)) && $this->mayWrite($project, $t, $by);
        if (! $own && ! $this->access->decide($by, 'moderate', $project)['allowed']) {
            throw new ProjectException((int) $m->user_id === (int) $by->id ? 'A message can be changed for 15 minutes after it is sent. After that, ask someone who moderates messages.' : 'Only someone who moderates messages can change another person\'s.', 403);
        }

        return [$t, $m];
    }

    private function clean(string $body): string
    {
        $body = trim(str_replace("\r\n", "\n", $body));
        if ($body === '') {
            throw new ProjectException('Write a message.');
        }
        if (mb_strlen($body) > 10000) {
            throw new ProjectException('A message holds up to 10,000 characters. Split it.');
        }

        return $body;
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::messages()) {
            throw new ProjectException('Conversations need database script 263. Run it first.', 409);
        }
    }
}
