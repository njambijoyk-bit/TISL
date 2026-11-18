<?php

namespace App\Services\Projects;

use App\Models\User;
use App\Services\Calendar\CalendarService;
use App\Services\Calendar\IcsInvite;
use App\Services\Notify\Notifier;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Meetings on a piece of work (docs/PROJECTS_STAGE6_SPEC.md, builds 6.6 and 6.7). A meeting has a title, when and how long, where or an online
 * link, an agenda, staff attendees (people on the work) and, for a client or others meeting, contacts. Planning one needs `projects.meetings`
 * and a project role that may meet; a client or others meeting also needs `projects.messages.client`, since it reaches people outside.
 *
 * Every staff attendee gets a calendar entry (kind `meeting`), kept in step when it moves or is cancelled. Invitations go through the Notifier:
 * staff answer in the app; contacts get the details, a calendar file and a personal link to answer without signing in. Moving or cancelling
 * tells everyone, with a fresh calendar file.
 */
class ProjectMeetings
{
    public const SOURCE = 'project_meeting';
    public const ANSWERS = ['yes' => 'Yes', 'no' => 'No', 'maybe' => 'Maybe'];

    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function list(object $project, User $user): array
    {
        $this->needReady();
        $this->access->authorize($user, 'open', $project);
        $rows = DB::table('project_meetings')->where('project_id', $project->id)->whereIn('audience', $this->audiences($user, $project) ?: ['none'])
            ->orderByRaw("CASE WHEN state = 'planned' AND ends_at >= ? THEN 0 ELSE 1 END", [now()])->orderByRaw("CASE WHEN state = 'planned' AND ends_at >= ? THEN starts_at END ASC", [now()])->orderByDesc('starts_at')->limit(200)->get();
        $plan = $this->mayPlan($user, $project);

        return [
            'ready' => true,
            'meetings' => $rows->map(fn ($m) => $this->shape($m, $user, false))->values()->all(),
            'team' => $plan ? array_map(fn ($u) => ['id' => $u['id'], 'name' => $u['name']], $this->members($project)) : [],
            'contacts' => $plan && in_array('client', $this->audiences($user, $project), true) ? app(ProjectThreads::class)->contactsFor($project) : ['client' => [], 'others' => []],
            'audiences' => array_intersect_key(ProjectThreads::AUDIENCES, array_flip($plan ? $this->audiences($user, $project) : [])),
            'can' => ['plan' => $plan],
        ];
    }

    /** @return array<string, mixed> */
    public function show(object $project, int $id, User $user): array
    {
        return $this->shape($this->readable($project, $id, $user), $user, true);
    }

    /** @param array<string, mixed> $d title, date, time, minutes, location, online_link, agenda, audience, people (user ids), contacts (ids), thread_id */
    public function create(object $project, array $d, User $by): int
    {
        $this->needReady();
        $audience = (string) ($d['audience'] ?? 'team');
        $this->mayPlanOrFail($by, $project, $audience);
        [$start, $end] = $this->when($d);
        $title = trim(preg_replace('/\s+/', ' ', (string) ($d['title'] ?? '')));
        if ($title === '') {
            throw new ProjectException('Give the meeting a title.');
        }
        $people = $this->checkPeople($project, (array) ($d['people'] ?? []), $by, $audience);
        $contacts = $this->checkContacts($project, $audience, (array) ($d['contacts'] ?? []));
        $link = $this->link($d['online_link'] ?? null);
        $thread = ! empty($d['thread_id']) ? (int) DB::table('project_threads')->where('id', (int) $d['thread_id'])->where('project_id', $project->id)->value('id') : null;

        $id = DB::transaction(function () use ($project, $title, $start, $end, $d, $audience, $by, $people, $contacts, $link, $thread) {
            $id = DB::table('project_meetings')->insertGetId(['project_id' => $project->id, 'title' => mb_substr($title, 0, 200), 'starts_at' => $start, 'ends_at' => $end,
                'location' => $this->text($d['location'] ?? null, 200), 'online_link' => $link, 'agenda' => $this->text($d['agenda'] ?? null, 5000), 'audience' => $audience,
                'organiser_id' => $by->id, 'state' => 'planned', 'thread_id' => $thread ?: null, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($people as $u) {
                DB::table('project_meeting_people')->insert(['meeting_id' => $id, 'user_id' => $u, 'response' => $u === (int) $by->id ? 'yes' : 'pending', 'answered_at' => $u === (int) $by->id ? now() : null]);
            }
            foreach ($contacts as $c) {
                DB::table('project_meeting_people')->insert(['meeting_id' => $id, 'contact_id' => $c, 'response' => 'pending', 'answer_token' => Str::random(40)]);
            }
            ProjectLog::record((int) $project->id, $by, 'meeting.planned', 'meeting', $id, null, ['title' => $title, 'starts_at' => $start->toDateTimeString(), 'people' => count($people), 'contacts' => count($contacts)]);

            return $id;
        });
        $this->syncCalendar($id);
        $this->tellEveryone($project, $id, $by, 'invite');

        return $id;
    }

    /** Change the details; a new time or place tells everyone and asks them to answer again. */
    public function update(object $project, int $id, array $d, User $by): void
    {
        $m = $this->manageable($project, $id, $by);
        if ($m->state !== 'planned') {
            throw new ProjectException($m->state === 'cancelled' ? 'This meeting was cancelled.' : 'This meeting has been held. Its minutes are kept on it.');
        }
        [$start, $end] = array_key_exists('date', $d) || array_key_exists('time', $d) || array_key_exists('minutes', $d)
            ? $this->when($d + ['date' => substr($m->starts_at, 0, 10), 'time' => substr($m->starts_at, 11, 5), 'minutes' => Carbon::parse($m->starts_at)->diffInMinutes(Carbon::parse($m->ends_at))])
            : [Carbon::parse($m->starts_at), Carbon::parse($m->ends_at)];
        $row = ['starts_at' => $start, 'ends_at' => $end, 'updated_at' => now()];
        foreach (['title' => 200, 'location' => 200, 'agenda' => 5000] as $k => $max) {
            if (array_key_exists($k, $d)) {
                $row[$k] = $k === 'title' ? (trim((string) $d[$k]) ?: throw new ProjectException('Give the meeting a title.')) : $this->text($d[$k], $max);
            }
        }
        if (array_key_exists('online_link', $d)) {
            $row['online_link'] = $this->link($d['online_link']);
        }
        $moved = $start->ne(Carbon::parse($m->starts_at)) || $end->ne(Carbon::parse($m->ends_at)) || (array_key_exists('location', $row) && $row['location'] !== $m->location) || (array_key_exists('online_link', $row) && $row['online_link'] !== $m->online_link);
        DB::transaction(function () use ($m, $row, $moved, $by, $project, $d) {
            DB::table('project_meetings')->where('id', $m->id)->update($row);
            if (array_key_exists('people', $d)) {
                $this->setPeople($project, $m, (array) $d['people'], $by);
            }
            if ($moved) {
                DB::table('project_meeting_people')->where('meeting_id', $m->id)->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $m->organiser_id))->update(['response' => 'pending', 'answered_at' => null]);
            }
            ProjectLog::record((int) $project->id, $by, $moved ? 'meeting.moved' : 'meeting.changed', 'meeting', (int) $m->id, ['starts_at' => $m->starts_at, 'location' => $m->location], ['starts_at' => (string) $row['starts_at'], 'location' => $row['location'] ?? $m->location]);
        });
        $this->syncCalendar((int) $m->id);
        if ($moved) {
            $this->tellEveryone($project, (int) $m->id, $by, 'moved');
        }
    }

    public function cancel(object $project, int $id, ?string $reason, User $by): void
    {
        $m = $this->manageable($project, $id, $by);
        if ($m->state !== 'planned') {
            throw new ProjectException('Only a planned meeting can be cancelled.');
        }
        DB::table('project_meetings')->where('id', $m->id)->update(['state' => 'cancelled', 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'meeting.cancelled', 'meeting', (int) $m->id, null, null, ProjectLog::DONE, trim((string) $reason) ?: null);
        $this->syncCalendar((int) $m->id);
        $this->tellEveryone($project, (int) $m->id, $by, 'cancelled', trim((string) $reason) ?: null);
    }

    /** A staff attendee answers in the app. */
    public function answer(object $project, int $id, string $response, User $by): void
    {
        $m = $this->readable($project, $id, $by);
        $row = DB::table('project_meeting_people')->where('meeting_id', $m->id)->where('user_id', $by->id)->first() ?? throw new ProjectException('You are not invited to this meeting.', 403);
        $this->record($m, $row, $response, $by->name);
    }

    /** What an outside person sees on their answer link (no sign-in). @return array<string, mixed> */
    public function byToken(string $token): array
    {
        [$m, $row] = $this->tokenRow($token);
        $project = DB::table('projects')->where('id', $m->project_id)->first(['number', 'title']);

        return ['title' => $m->title, 'project' => "{$project->number} {$project->title}", 'starts_at' => $m->starts_at, 'ends_at' => $m->ends_at, 'location' => $m->location, 'online_link' => $m->online_link,
            'agenda' => $m->agenda, 'state' => $m->state, 'organiser' => DB::table('users')->where('id', $m->organiser_id)->value('name'), 'who' => DB::table('project_contacts')->where('id', $row->contact_id)->value('name'),
            'response' => $row->response, 'answers' => self::ANSWERS, 'company' => \App\Models\CompanyProfile::name()];
    }

    public function answerByToken(string $token, string $response): array
    {
        [$m, $row] = $this->tokenRow($token);
        if ($m->state !== 'planned' || Carbon::parse($m->ends_at)->isPast()) {
            throw new ProjectException($m->state === 'cancelled' ? 'This meeting was cancelled.' : 'This meeting is over.');
        }
        $this->record($m, $row, $response, DB::table('project_contacts')->where('id', $row->contact_id)->value('name') ?? 'A contact');

        return $this->byToken($token);
    }

    /**
     * Minutes and action items (build 6.7). Saving them marks a started meeting held. Action items that already became tasks stay; the rest are
     * replaced by what is sent. @param array<int, array{id?: int, text: string, user_id?: ?int, contact_id?: ?int, due_date?: ?string}> $actions
     */
    public function saveMinutes(object $project, int $id, ?string $minutes, array $actions, User $by): void
    {
        $m = $this->manageable($project, $id, $by);
        if ($m->state === 'cancelled') {
            throw new ProjectException('This meeting was cancelled.');
        }
        if (Carbon::parse($m->starts_at)->isFuture()) {
            throw new ProjectException('Minutes are written once the meeting has started.');
        }
        $staff = DB::table('project_meeting_people')->where('meeting_id', $m->id)->whereNotNull('user_id')->pluck('user_id')->map(fn ($v) => (int) $v)->all();
        $on = array_column($this->members($project), 'id');
        $contacts = DB::table('project_meeting_people')->where('meeting_id', $m->id)->whereNotNull('contact_id')->pluck('contact_id')->map(fn ($v) => (int) $v)->all();
        $clean = [];
        foreach (array_values($actions) as $i => $a) {
            $text = trim(preg_replace('/\s+/', ' ', (string) ($a['text'] ?? '')));
            if ($text === '') {
                continue;
            }
            $user = ! empty($a['user_id']) ? (int) $a['user_id'] : null;
            $contact = ! empty($a['contact_id']) ? (int) $a['contact_id'] : null;
            if ($user && ! in_array($user, array_unique(array_merge($staff, $on)), true)) {
                throw new ProjectException('An action item is given to someone on this work.');
            }
            if ($contact && ! in_array($contact, $contacts, true)) {
                throw new ProjectException('An action item for someone outside is given to one of the meeting\'s contacts.');
            }
            $due = ! empty($a['due_date']) ? (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $a['due_date']) ? (string) $a['due_date'] : throw new ProjectException('Choose the day an action item is due.')) : null;
            $clean[] = ['id' => ! empty($a['id']) ? (int) $a['id'] : null, 'text' => mb_substr($text, 0, 300), 'user_id' => $user, 'contact_id' => $user ? null : $contact, 'due_date' => $due, 'sort_order' => $i];
        }
        DB::transaction(function () use ($m, $minutes, $clean, $by, $project) {
            $kept = DB::table('project_meeting_actions')->where('meeting_id', $m->id)->whereNotNull('task_id')->pluck('id')->map(fn ($v) => (int) $v)->all();
            DB::table('project_meeting_actions')->where('meeting_id', $m->id)->whereNull('task_id')->delete();
            foreach ($clean as $a) {
                if ($a['id'] && in_array($a['id'], $kept, true)) {
                    DB::table('project_meeting_actions')->where('id', $a['id'])->update(['sort_order' => $a['sort_order']]);   // already a task: the task is where it changes now
                    continue;
                }
                DB::table('project_meeting_actions')->insert(['meeting_id' => $m->id] + array_diff_key($a, ['id' => 1]));
            }
            DB::table('project_meetings')->where('id', $m->id)->update(['minutes' => $this->text($minutes, 20000), 'state' => 'held', 'updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'meeting.minutes', 'meeting', (int) $m->id, null, ['actions' => count($clean)]);
        });
        $this->syncCalendar((int) $m->id);
    }

    /** An action item becomes a task on the same work, given to its person, due on its day, linked back to the meeting. @return int the task's id */
    public function actionToTask(object $project, int $id, int $actionId, User $by): int
    {
        $m = $this->readable($project, $id, $by);
        $a = DB::table('project_meeting_actions')->where('id', $actionId)->where('meeting_id', $m->id)->first() ?? throw new ProjectException('Not found.', 404);
        if ($a->task_id) {
            throw new ProjectException('This action item is already a task.');
        }
        $who = $a->contact_id ? DB::table('project_contacts')->where('id', $a->contact_id)->value('name') : null;
        $task = app(ProjectTasks::class)->create($project, ['title' => $a->text, 'due_date' => $a->due_date, 'people' => $a->user_id ? [(int) $a->user_id] : [(int) $by->id],
            'description' => "From the meeting \"{$m->title}\" on " . Carbon::parse($m->starts_at)->format('j M Y') . '.' . ($who ? " For {$who} (outside); followed up by whoever has this task." : '')], $by);
        DB::table('project_meeting_actions')->where('id', $a->id)->update(['task_id' => $task]);
        ProjectLog::record((int) $project->id, $by, 'meeting.action_task', 'meeting', (int) $m->id, null, ['action' => (int) $a->id, 'task' => $task]);

        return $task;
    }

    /** Send the minutes and action items to everyone invited: staff in the app, a client or others meeting's contacts through the Notifier. */
    public function shareMinutes(object $project, int $id, User $by): void
    {
        $m = $this->manageable($project, $id, $by);
        if ($m->state !== 'held' || trim((string) $m->minutes) === '') {
            throw new ProjectException('Write the minutes first.');
        }
        $again = $m->minutes_shared_at !== null;
        $actions = DB::table('project_meeting_actions as a')->leftJoin('users as u', 'u.id', '=', 'a.user_id')->leftJoin('project_contacts as c', 'c.id', '=', 'a.contact_id')
            ->where('a.meeting_id', $m->id)->orderBy('a.sort_order')->get(['a.text', 'a.due_date', 'u.name as person', 'c.name as contact']);
        $list = $actions->map(fn ($a) => '- ' . $a->text . (($a->person ?? $a->contact) ? ' (' . ($a->person ?? $a->contact) . ')' : '') . ($a->due_date ? ', by ' . Carbon::parse($a->due_date)->format('j M Y') : ''))->implode("\n");
        $title = ($again ? 'Minutes, updated: ' : 'Minutes: ') . "{$m->title} · {$project->number}";
        $body = Carbon::parse($m->starts_at)->format('l j F Y, H:i') . "\n\n" . trim((string) $m->minutes) . ($list !== '' ? "\n\nAction items:\n{$list}" : '');
        $people = DB::table('project_meeting_people')->where('meeting_id', $m->id)->get();
        ProjectNotices::tell(User::whereIn('id', $people->pluck('user_id')->filter()->all() ?: [0])->where('id', '!=', $by->id)->get(), ProjectNotices::MEETING, $title, $body,
            "/admin/projects/{$project->id}?tab=meetings&meeting={$m->id}", 'Open the meeting');
        if ($m->audience !== 'team') {
            foreach (DB::table('project_contacts')->whereIn('id', $people->pluck('contact_id')->filter()->all() ?: [0])->whereNull('deleted_at')->get() as $c) {
                try {
                    app(Notifier::class)->sendToContact(['name' => $c->name, 'email' => $c->email, 'phone' => $c->phone], ProjectNotices::MEETING_INVITE, $title, "{$by->name}, {$project->number}:\n\n{$body}", ['subject' => $title, 'data' => ['project_meeting' => (int) $m->id]]);
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }
        DB::table('project_meetings')->where('id', $m->id)->update(['minutes_shared_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'meeting.minutes_shared', 'meeting', (int) $m->id, null, ['again' => $again]);
    }

    /** The meeting as a calendar file, for an outside person's link. */
    public function icsByToken(string $token): string
    {
        [$m] = $this->tokenRow($token);

        return $this->ics($m, $m->state === 'cancelled' ? 'CANCEL' : 'REQUEST');
    }

    /** @param int[] $people @return array<string, mixed> */
    public function freeTime(object $project, array $people, int $minutes, User $by, ?int $except = null): array
    {
        $this->needReady();
        if (! $this->mayPlan($by, $project)) {
            throw new ProjectException('You may not plan meetings on this work.', 403);
        }
        $on = array_column($this->members($project), 'name', 'id');
        $people = array_values(array_filter(array_map('intval', $people), fn ($u) => isset($on[$u])));
        if (! $people) {
            throw new ProjectException('Choose who from the team comes, then look for a free time.');
        }

        return app(ProjectFreeTime::class)->find($people, $minutes, null, $except);
    }

    /** Keep the staff attendees' calendars in step: one entry each, marked cancelled or declined as it is. */
    public function syncCalendar(int $id): void
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('calendar_entries')) {
            return;
        }
        try {
            $m = DB::table('project_meetings as m')->join('projects as p', 'p.id', '=', 'm.project_id')->where('m.id', $id)->first(['m.*', 'p.number']);
            $people = DB::table('project_meeting_people')->where('meeting_id', $id)->whereNotNull('user_id')->get(['user_id', 'response']);
            DB::table('calendar_entries')->where('source_type', self::SOURCE)->where('source_id', $id)->whereNotIn('user_id', $people->pluck('user_id')->all() ?: [0])->delete();
            foreach ($people as $p) {
                app(CalendarService::class)->put(['user_id' => (int) $p->user_id, 'source_type' => self::SOURCE, 'source_id' => $id, 'kind' => 'meeting', 'title' => "{$m->number} · {$m->title}",
                    'starts_at' => Carbon::parse($m->starts_at), 'ends_at' => Carbon::parse($m->ends_at), 'all_day' => false,
                    'status' => $m->state === 'cancelled' ? 'cancelled' : ($p->response === 'no' ? 'declined' : $m->state), 'visibility' => 'team',
                    'url' => "/admin/projects/{$m->project_id}?tab=meetings&meeting={$id}", 'meta' => ['location' => $m->location, 'online_link' => $m->online_link, 'answer' => $p->response]]);
            }
        } catch (\Throwable $e) {
            report($e);
        }
    }

    // ------------------------------------------------------------------ inside

    private function record(object $m, object $row, string $response, string $name): void
    {
        if (! isset(self::ANSWERS[$response])) {
            throw new ProjectException('Answer yes, no or maybe.');
        }
        if ($row->response === $response) {
            return;
        }
        DB::table('project_meeting_people')->where('id', $row->id)->update(['response' => $response, 'answered_at' => now()]);
        $this->syncCalendar((int) $m->id);
        $project = DB::table('projects')->where('id', $m->project_id)->first();
        ProjectLog::record((int) $m->project_id, $row->user_id ? User::find($row->user_id) : null, 'meeting.answered', 'meeting', (int) $m->id, ['answer' => $row->response], ['answer' => $response, 'who' => $name]);
        $organiser = $m->organiser_id && (int) $m->organiser_id !== (int) $row->user_id ? User::find($m->organiser_id) : null;
        ProjectNotices::tell($organiser, ProjectNotices::MEETING, "{$name} answered " . mb_strtolower(self::ANSWERS[$response]) . " · {$m->title}", "{$project->number} · " . $this->whenText($m),
            "/admin/projects/{$m->project_id}?tab=meetings&meeting={$m->id}", 'Open the meeting');
    }

    /** Invitations, moves and cancellations: staff in the app, contacts with a calendar file and their answer link. */
    private function tellEveryone(object $project, int $id, User $by, string $what, ?string $reason = null): void
    {
        $m = DB::table('project_meetings')->where('id', $id)->first();
        $where = trim(implode(' · ', array_filter([$m->location, $m->online_link])));
        $lead = match ($what) { 'invite' => 'Invitation', 'moved' => 'Moved', default => 'Cancelled' };
        $title = "{$lead}: {$m->title} · {$project->number}";
        $details = $this->whenText($m) . ($where !== '' ? "\nWhere: {$where}" : '') . ($what === 'cancelled' && $reason ? "\nWhy: {$reason}" : '') . ($m->agenda && $what !== 'cancelled' ? "\n\nAgenda:\n{$m->agenda}" : '');
        $people = DB::table('project_meeting_people')->where('meeting_id', $id)->get();
        $staff = User::whereIn('id', $people->pluck('user_id')->filter()->all() ?: [0])->where('id', '!=', $by->id)->get();
        ProjectNotices::tell($staff, ProjectNotices::MEETING, $title, "{$by->name}: {$details}", "/admin/projects/{$project->id}?tab=meetings&meeting={$id}", $what === 'cancelled' ? 'Open the meeting' : 'Answer');
        $ics = $this->ics($m, $what === 'cancelled' ? 'CANCEL' : 'REQUEST');
        $contacts = DB::table('project_meeting_people as mp')->join('project_contacts as c', 'c.id', '=', 'mp.contact_id')->where('mp.meeting_id', $id)->whereNull('c.deleted_at')->get(['mp.answer_token', 'c.name', 'c.email', 'c.phone']);
        foreach ($contacts as $c) {
            $path = "/meeting/{$c->answer_token}";
            $ask = $what === 'cancelled' ? '' : "\n\nPlease say whether you can come: " . rtrim((string) config('app.frontend_url'), '/') . $path;
            try {
                app(Notifier::class)->sendToContact(['name' => $c->name, 'email' => $c->email, 'phone' => $c->phone], ProjectNotices::MEETING_INVITE, $title, "{$by->name}, {$project->number}:\n\n{$details}{$ask}",
                    ['subject' => $title, 'action_url' => $what === 'cancelled' ? null : $path, 'action_text' => 'Answer the invitation', 'attachments' => [['name' => 'meeting.ics', 'mime' => 'text/calendar; method=' . ($what === 'cancelled' ? 'CANCEL' : 'REQUEST'), 'content' => $ics]],
                        'data' => ['project_meeting' => $id]]);
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    private function ics(object $m, string $method): string
    {
        $project = DB::table('projects')->where('id', $m->project_id)->first(['number']);
        $organiser = DB::table('users')->where('id', $m->organiser_id)->first(['name', 'email']);
        $host = parse_url((string) config('app.url'), PHP_URL_HOST) ?: 'tisl';

        return IcsInvite::make(['uid' => "tisl-meeting-{$m->id}@{$host}", 'sequence' => max(0, Carbon::parse($m->updated_at ?? $m->created_at)->timestamp - Carbon::parse($m->created_at)->timestamp),
            'method' => $method, 'starts_at' => Carbon::parse($m->starts_at), 'ends_at' => Carbon::parse($m->ends_at), 'title' => "{$m->title} ({$project->number})", 'description' => $m->agenda,
            'location' => trim(implode(' · ', array_filter([$m->location, $m->online_link]))) ?: null, 'url' => $m->online_link, 'organiser' => ['name' => $organiser->name ?? 'Organiser', 'email' => $organiser->email ?? null]]);
    }

    /** @return array<string, mixed> */
    private function shape(object $m, User $user, bool $full): array
    {
        $people = DB::table('project_meeting_people')->where('meeting_id', $m->id)->get();
        $names = DB::table('users')->whereIn('id', $people->pluck('user_id')->filter()->push($m->organiser_id)->all() ?: [0])->pluck('name', 'id');
        $contacts = DB::table('project_contacts')->whereIn('id', $people->pluck('contact_id')->filter()->all() ?: [0])->pluck('name', 'id');
        $mine = $people->firstWhere('user_id', $user->id);
        $project = DB::table('projects')->where('id', $m->project_id)->first();
        $manage = $this->mayManage($user, $project, $m);
        $out = ['id' => (int) $m->id, 'title' => $m->title, 'starts_at' => $m->starts_at, 'ends_at' => $m->ends_at, 'minutes_long' => (int) Carbon::parse($m->starts_at)->diffInMinutes(Carbon::parse($m->ends_at)),
            'location' => $m->location, 'online_link' => $m->online_link, 'audience' => $m->audience, 'state' => $m->state, 'past' => Carbon::parse($m->ends_at)->isPast(),
            'organiser' => ['id' => (int) $m->organiser_id, 'name' => $names[$m->organiser_id] ?? null], 'my_answer' => $mine?->response,
            'answers' => ['yes' => $people->where('response', 'yes')->count(), 'no' => $people->where('response', 'no')->count(), 'maybe' => $people->where('response', 'maybe')->count(), 'pending' => $people->where('response', 'pending')->count()]];
        if (! $full) {
            return $out;
        }

        $actions = DB::table('project_meeting_actions as a')->leftJoin('project_work_tasks as t', 't.id', '=', 'a.task_id')->where('a.meeting_id', $m->id)->orderBy('a.sort_order')->orderBy('a.id')
            ->get(['a.*', 't.number as task_number', 't.status as task_status']);

        return $out + [
            'agenda' => $m->agenda, 'thread_id' => $m->thread_id ? (int) $m->thread_id : null,
            'minutes' => $m->minutes, 'minutes_shared_at' => $m->minutes_shared_at,
            'actions' => $actions->map(fn ($a) => ['id' => (int) $a->id, 'text' => $a->text, 'user_id' => $a->user_id ? (int) $a->user_id : null, 'contact_id' => $a->contact_id ? (int) $a->contact_id : null,
                'due_date' => $a->due_date, 'task' => $a->task_id ? ['id' => (int) $a->task_id, 'ref' => "{$project->number}-T{$a->task_number}", 'status' => $a->task_status] : null])->values()->all(),
            'people' => $people->map(fn ($p) => $p->user_id ? ['type' => 'person', 'id' => (int) $p->user_id, 'name' => $names[$p->user_id] ?? 'Someone', 'answer' => $p->response, 'organiser' => (int) $p->user_id === (int) $m->organiser_id]
                : ['type' => 'contact', 'id' => (int) $p->contact_id, 'name' => $contacts[$p->contact_id] ?? 'A contact', 'answer' => $p->response, 'organiser' => false])->values()->all(),
            'can' => ['manage' => $manage, 'answer' => $mine !== null && $m->state === 'planned' && ! Carbon::parse($m->ends_at)->isPast(),
                'minutes' => $manage && $m->state !== 'cancelled' && ! Carbon::parse($m->starts_at)->isFuture(), 'tasks' => $this->access->decide($user, 'tasks', $project)['allowed']],
        ];
    }

    private function whenText(object $m): string
    {
        $s = Carbon::parse($m->starts_at);
        $e = Carbon::parse($m->ends_at);

        return 'When: ' . $s->format('l j F Y, H:i') . ' to ' . $e->format($s->isSameDay($e) ? 'H:i' : 'l j F H:i');
    }

    /** @return array{0: Carbon, 1: Carbon} */
    private function when(array $d): array
    {
        $date = (string) ($d['date'] ?? '');
        $time = (string) ($d['time'] ?? '');
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || ! preg_match('/^\d{2}:\d{2}$/', $time)) {
            throw new ProjectException('Choose the day and the time.');
        }
        $minutes = (int) ($d['minutes'] ?? 60);
        if ($minutes < 5 || $minutes > 720) {
            throw new ProjectException('A meeting lasts between 5 minutes and 12 hours.');
        }
        $start = Carbon::parse("{$date} {$time}");

        return [$start, $start->copy()->addMinutes($minutes)];
    }

    private function link(mixed $v): ?string
    {
        $v = trim((string) $v);
        if ($v === '') {
            return null;
        }
        if (! preg_match('#^https://#i', $v) || ! filter_var($v, FILTER_VALIDATE_URL)) {
            throw new ProjectException('The online link must be a full https:// address.');
        }

        return mb_substr($v, 0, 300);
    }

    private function text(mixed $v, int $max): ?string
    {
        $v = trim(str_replace("\r\n", "\n", (string) $v));

        return $v === '' ? null : mb_substr($v, 0, $max);
    }

    /** @return int[] staff on the work who may see this kind of meeting, with the organiser always in */
    private function checkPeople(object $project, array $ids, User $by, string $audience): array
    {
        $on = array_column($this->members($project), 'id');
        $ids = array_values(array_unique(array_merge([(int) $by->id], array_map('intval', array_filter($ids)))));
        if (array_diff($ids, $on)) {
            throw new ProjectException('Everyone invited from the team must be on this work.');
        }
        foreach (User::whereIn('id', $ids)->get() as $u) {
            if (! in_array($audience, $this->audiences($u, $project), true)) {
                throw new ProjectException("{$u->name} may not see " . ($audience === 'team' ? 'team' : $audience) . ' meetings. Invite them to a team meeting instead.');
            }
        }

        return $ids;
    }

    private function setPeople(object $project, object $m, array $ids, User $by): void
    {
        $want = $this->checkPeople($project, $ids, User::find($m->organiser_id) ?? $by, $m->audience);
        $have = DB::table('project_meeting_people')->where('meeting_id', $m->id)->whereNotNull('user_id')->pluck('user_id')->map(fn ($v) => (int) $v)->all();
        DB::table('project_meeting_people')->where('meeting_id', $m->id)->whereIn('user_id', array_diff($have, $want) ?: [0])->delete();
        foreach (array_diff($want, $have) as $u) {
            DB::table('project_meeting_people')->insert(['meeting_id' => $m->id, 'user_id' => $u, 'response' => 'pending']);
        }
    }

    /** @return int[] */
    private function checkContacts(object $project, string $audience, array $ids): array
    {
        $ids = array_values(array_unique(array_map('intval', array_filter($ids))));
        if ($audience === 'team') {
            if ($ids) {
                throw new ProjectException('A team meeting is for the team only. Make it a client or others meeting to invite contacts.');
            }

            return [];
        }
        if (! $ids) {
            throw new ProjectException($audience === 'client' ? 'Choose who at the client is invited.' : 'Choose who at the other parties is invited.');
        }
        $allowed = array_column(array_filter(app(ProjectThreads::class)->contactsFor($project)[$audience], fn ($c) => $c['email'] || $c['phone']), 'id');
        if (array_diff($ids, $allowed)) {
            throw new ProjectException($audience === 'client' ? 'A client meeting invites the client\'s contacts only (with an email or phone).' : 'Choose contacts of the parties on this work (with an email or phone).');
        }

        return $ids;
    }

    /** @return array<int, array{id: int, name: string}> */
    private function members(object $project): array
    {
        $now = now();

        return DB::table('project_members as m')->join('users as u', 'u.id', '=', 'm.user_id')->join('project_role_permissions as p', 'p.project_role_id', '=', 'm.project_role_id')
            ->where('m.project_id', $project->id)->where('m.status', 'active')->where('p.ability', 'open')->where(fn ($q) => $q->whereNull('m.ends_at')->orWhere('m.ends_at', '>=', $now))
            ->orderBy('u.name')->distinct()->get(['u.id', 'u.name'])->map(fn ($u) => ['id' => (int) $u->id, 'name' => $u->name])->all();
    }

    /** The audiences this person may see meetings of: team with the meetings or internal messages permission, client and others with the client permission. @return string[] */
    private function audiences(User $user, object $project): array
    {
        if (! $this->access->decide($user, 'open', $project)['allowed']) {
            return [];
        }
        $out = $user->hasPermission('projects.meetings') || $user->hasPermission('projects.messages.internal') ? ['team'] : [];

        return $user->hasPermission('projects.messages.client') ? array_merge($out, ['client', 'others']) : $out;
    }

    private function mayPlan(User $user, object $project): bool
    {
        return $this->access->decide($user, 'meet', $project)['allowed'];
    }

    private function mayPlanOrFail(User $user, object $project, string $audience): void
    {
        if (! isset(ProjectThreads::AUDIENCES[$audience])) {
            throw new ProjectException('Choose who the meeting is with.');
        }
        $this->access->authorize($user, 'meet', $project);
        if ($audience !== 'team') {
            $this->access->authorize($user, 'talk_client', $project);
        }
    }

    private function mayManage(User $user, object $project, object $m): bool
    {
        return $this->mayPlan($user, $project) && ((int) $m->organiser_id === (int) $user->id || $this->access->decide($user, 'moderate', $project)['allowed'] || $this->access->decide($user, 'edit', $project)['allowed']);
    }

    private function manageable(object $project, int $id, User $by): object
    {
        $m = $this->readable($project, $id, $by);
        if (! $this->mayManage($by, $project, $m)) {
            throw new ProjectException('Only the organiser, or someone who may change this work, can change the meeting.', 403);
        }

        return $m;
    }

    private function readable(object $project, int $id, User $user): object
    {
        $this->needReady();
        $m = DB::table('project_meetings')->where('id', $id)->where('project_id', $project->id)->first();
        if (! $m || ! in_array($m->audience, $this->audiences($user, $project), true)) {
            throw new ProjectException('Not found.', 404);
        }

        return $m;
    }

    /** @return array{0: object, 1: object} */
    private function tokenRow(string $token): array
    {
        $this->needReady();
        $row = strlen($token) >= 32 ? DB::table('project_meeting_people')->where('answer_token', $token)->first() : null;
        $m = $row ? DB::table('project_meetings')->where('id', $row->meeting_id)->first() : null;
        if (! $m || DB::table('projects')->where('id', $m->project_id)->whereNotNull('deleted_at')->exists()) {
            throw new ProjectException('This invitation link is not valid.', 404);
        }

        return [$m, $row];
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::messages()) {
            throw new ProjectException('Meetings need database script 263.', 409);
        }
    }
}
