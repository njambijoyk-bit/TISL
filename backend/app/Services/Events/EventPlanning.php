<?php

namespace App\Services\Events;

use App\Models\Events\Event;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * The private planning workspace of one event: tasks (with comments), milestones, the programme (running order), the budget lines, the team and templates. Nothing here is public; the client
 * sees only what is marked client-visible. The budget is hidden from team members who were not given it (a photographer plans their shots, not the money).
 */
final class EventPlanning
{
    public const TASK_STATUS = ['todo', 'doing', 'review', 'done', 'blocked', 'on_hold', 'cancelled'];
    public const PRIORITY = ['low', 'normal', 'high', 'urgent'];

    public function __construct(private EventAccess $access)
    {
    }

    public static function ready(): bool
    {
        return Schema::hasTable('event_tasks') && Schema::hasTable('event_budget_lines');
    }

    private function now(): array
    {
        return ['created_at' => now(), 'updated_at' => now()];
    }

    /** May this person see the money of this event? A team row on the event decides for that person; otherwise the event's owners and TISL's staff may. */
    public function canSeeBudget(Event $e, ?User $u): bool
    {
        $row = $u ? DB::table('event_team')->where(['event_id' => $e->id, 'user_id' => $u->id])->first() : null;

        return $row ? (bool) $row->sees_budget : true;
    }

    private function clean(array $in, array $allowed): array
    {
        return array_intersect_key($in, array_flip($allowed));
    }

    // ── overview ─────────────────────────────────────────────────────────

    public function overview(Event $e, ?User $u): array
    {
        $tasks = DB::table('event_tasks')->where('event_id', $e->id);
        $byStatus = (clone $tasks)->selectRaw('status, COUNT(*) n')->groupBy('status')->pluck('n', 'status');
        $total = (int) $byStatus->sum();
        $out = ['event' => ['id' => $e->id, 'title' => $e->title, 'status' => $e->status, 'is_project' => (bool) $e->is_project, 'enquiry_id' => $e->enquiry_id, 'initiative_id' => $e->initiative_id],
            'tasks' => ['total' => $total, 'done' => (int) ($byStatus['done'] ?? 0), 'late' => (clone $tasks)->whereNotIn('status', ['done', 'cancelled'])->whereNotNull('due_on')->where('due_on', '<', today()->toDateString())->count(), 'by_status' => $byStatus],
            'next_milestone' => DB::table('event_milestones')->where('event_id', $e->id)->whereNull('done_at')->orderBy('due_on')->first(['title', 'due_on']),
            'team' => DB::table('event_team')->where('event_id', $e->id)->count(), 'can_see_budget' => $this->canSeeBudget($e, $u)];
        if ($out['can_see_budget']) {
            $out['budget'] = $this->budgetTotals($e);
        }
        $out['bookings'] = Schema::hasTable('event_bookings') ? DB::table('event_bookings')->where('event_id', $e->id)->whereNotIn('status', ['declined', 'cancelled'])->count() : 0;
        $out['guests'] = Schema::hasTable('event_guests') ? ['total' => DB::table('event_guests')->where('event_id', $e->id)->count(), 'yes' => (int) DB::table('event_guests')->where('event_id', $e->id)->where('rsvp', 'yes')->sum('attending')] : null;
        $out['activity'] = DB::table('event_tasks')->where('event_id', $e->id)->orderByDesc('updated_at')->limit(8)->get(['id', 'title', 'status', 'updated_at'])->all();

        return $out;
    }

    // ── tasks ────────────────────────────────────────────────────────────

    public function tasks(Event $e, bool $clientOnly = false): array
    {
        $names = User::whereIn('id', DB::table('event_tasks')->where('event_id', $e->id)->whereNotNull('assignee_id')->pluck('assignee_id'))->pluck('name', 'id');
        $comments = DB::table('event_task_comments')->whereIn('task_id', DB::table('event_tasks')->where('event_id', $e->id)->pluck('id'))->selectRaw('task_id, COUNT(*) n')->groupBy('task_id')->pluck('n', 'task_id');

        return DB::table('event_tasks')->where('event_id', $e->id)->when($clientOnly, fn ($q) => $q->where('client_visible', 1))->orderBy('sort_order')->orderBy('due_on')->orderBy('id')->get()
            ->map(fn ($t) => (array) $t + ['assignee' => $names[$t->assignee_id] ?? null, 'comments' => (int) ($comments[$t->id] ?? 0), 'late' => $t->due_on && $t->due_on < today()->toDateString() && ! in_array($t->status, ['done', 'cancelled'], true)])->all();
    }

    private function taskRules(array $in, ?object $current = null): array
    {
        $row = $this->clean($in, ['title', 'notes', 'department', 'assignee_id', 'priority', 'status', 'starts_on', 'due_on', 'effort_hours', 'evidence', 'client_visible', 'parent_id', 'depends_on_id', 'sort_order']);
        if (array_key_exists('title', $row) && trim((string) $row['title']) === '') {
            throw ValidationException::withMessages(['title' => 'Give the task a title.']);
        }
        if (isset($row['status']) && ! in_array($row['status'], self::TASK_STATUS, true)) {
            throw ValidationException::withMessages(['status' => 'Unknown status.']);
        }
        if (isset($row['priority']) && ! in_array($row['priority'], self::PRIORITY, true)) {
            throw ValidationException::withMessages(['priority' => 'Unknown priority.']);
        }
        $start = $row['starts_on'] ?? $current?->starts_on;
        $due = $row['due_on'] ?? $current?->due_on;
        if ($start && $due && $due < $start) {
            throw ValidationException::withMessages(['due_on' => 'The due date is before the start.']);
        }

        return $row;
    }

    public function saveTask(Event $e, array $in, ?int $id, ?User $by): array
    {
        $cur = $id ? DB::table('event_tasks')->where(['id' => $id, 'event_id' => $e->id])->first() ?? abort(404) : null;
        $row = $this->taskRules($in, $cur);
        foreach (['parent_id', 'depends_on_id'] as $k) {
            if (! empty($row[$k]) && ! DB::table('event_tasks')->where(['id' => $row[$k], 'event_id' => $e->id])->exists()) {
                throw ValidationException::withMessages([$k => 'That task is not on this event.']);
            }
            if ($id && ($row[$k] ?? null) == $id) {
                throw ValidationException::withMessages([$k => 'A task cannot depend on itself.']);
            }
        }
        $status = $row['status'] ?? $cur?->status ?? 'todo';
        $depends = $row['depends_on_id'] ?? $cur?->depends_on_id ?? null;
        if ($status === 'done' && $depends && DB::table('event_tasks')->where('id', $depends)->whereNotIn('status', ['done', 'cancelled'])->exists()) {
            throw ValidationException::withMessages(['status' => 'It waits for another task that is not done yet.']);
        }
        $row['completed_at'] = $status === 'done' ? ($cur?->completed_at ?? now()) : null;
        if ($cur) {
            DB::table('event_tasks')->where('id', $cur->id)->update($row + ['updated_at' => now()]);
            $id = $cur->id;
        } else {
            if (empty($row['title'])) {
                throw ValidationException::withMessages(['title' => 'Give the task a title.']);
            }
            $id = DB::table('event_tasks')->insertGetId($row + ['event_id' => $e->id, 'created_by' => $by?->id] + $this->now());
        }

        return collect($this->tasks($e))->firstWhere('id', $id);
    }

    public function deleteTask(Event $e, int $id): void
    {
        DB::table('event_task_comments')->where('task_id', $id)->delete();
        DB::table('event_tasks')->where(['id' => $id, 'event_id' => $e->id])->delete();
        DB::table('event_tasks')->where('event_id', $e->id)->where('parent_id', $id)->update(['parent_id' => null]);
        DB::table('event_tasks')->where('event_id', $e->id)->where('depends_on_id', $id)->update(['depends_on_id' => null]);
    }

    public function comments(Event $e, int $taskId): array
    {
        abort_unless(DB::table('event_tasks')->where(['id' => $taskId, 'event_id' => $e->id])->exists(), 404);
        $c = DB::table('event_task_comments')->where('task_id', $taskId)->orderBy('id')->get();
        $names = User::whereIn('id', $c->pluck('user_id')->filter())->pluck('name', 'id');

        return $c->map(fn ($x) => ['id' => (int) $x->id, 'body' => $x->body, 'by' => $names[$x->user_id] ?? null, 'at' => (string) $x->created_at])->all();
    }

    public function addComment(Event $e, int $taskId, string $body, ?User $by): array
    {
        abort_unless(DB::table('event_tasks')->where(['id' => $taskId, 'event_id' => $e->id])->exists(), 404);
        if (trim($body) === '') {
            throw ValidationException::withMessages(['body' => 'Write something.']);
        }
        DB::table('event_task_comments')->insert(['task_id' => $taskId, 'user_id' => $by?->id, 'body' => mb_substr(trim($body), 0, 1000), 'created_at' => now()]);

        return $this->comments($e, $taskId);
    }

    // ── milestones ───────────────────────────────────────────────────────

    public function milestones(Event $e, bool $clientOnly = false): array
    {
        return DB::table('event_milestones')->where('event_id', $e->id)->when($clientOnly, fn ($q) => $q->where('client_visible', 1))->orderBy('due_on')->orderBy('sort_order')->get()->map(fn ($m) => (array) $m)->all();
    }

    public function saveMilestone(Event $e, array $in, ?int $id): array
    {
        $row = $this->clean($in, ['title', 'due_on', 'client_visible', 'sort_order']);
        if (array_key_exists('done', $in)) {
            $row['done_at'] = $in['done'] ? now() : null;
        }
        if (! $id && trim((string) ($row['title'] ?? '')) === '') {
            throw ValidationException::withMessages(['title' => 'Give the milestone a title.']);
        }
        if ($id) {
            abort_unless(DB::table('event_milestones')->where(['id' => $id, 'event_id' => $e->id])->update($row + ['updated_at' => now()]) !== null, 404);
        } else {
            $id = DB::table('event_milestones')->insertGetId($row + ['event_id' => $e->id] + $this->now());
        }

        return (array) DB::table('event_milestones')->find($id);
    }

    public function deleteMilestone(Event $e, int $id): void
    {
        DB::table('event_milestones')->where(['id' => $id, 'event_id' => $e->id])->delete();
    }

    // ── programme ────────────────────────────────────────────────────────

    public function programme(Event $e): array
    {
        return DB::table('event_programme')->where('event_id', $e->id)->orderBy('day_on')->orderBy('starts_at')->orderBy('sort_order')->get()->map(fn ($p) => (array) $p)->all();
    }

    public function saveProgramme(Event $e, array $in, ?int $id): array
    {
        $row = $this->clean($in, ['day_on', 'starts_at', 'ends_at', 'title', 'location', 'responsible', 'equipment', 'notes', 'sort_order']);
        foreach (['starts_at', 'ends_at'] as $k) {
            if (! empty($row[$k]) && ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $row[$k])) {
                throw ValidationException::withMessages([$k => 'Use a time like 14:30.']);
            }
        }
        if (! empty($row['starts_at']) && ! empty($row['ends_at']) && $row['ends_at'] < $row['starts_at']) {
            throw ValidationException::withMessages(['ends_at' => 'It ends before it starts.']);
        }
        if (! $id && trim((string) ($row['title'] ?? '')) === '') {
            throw ValidationException::withMessages(['title' => 'Say what happens.']);
        }
        if ($id) {
            DB::table('event_programme')->where(['id' => $id, 'event_id' => $e->id])->update($row + ['updated_at' => now()]);
        } else {
            $id = DB::table('event_programme')->insertGetId($row + ['event_id' => $e->id] + $this->now());
        }

        return (array) DB::table('event_programme')->find($id);
    }

    public function deleteProgramme(Event $e, int $id): void
    {
        DB::table('event_programme')->where(['id' => $id, 'event_id' => $e->id])->delete();
    }

    // ── budget ───────────────────────────────────────────────────────────

    public function budget(Event $e): array
    {
        return ['lines' => DB::table('event_budget_lines')->where('event_id', $e->id)->orderBy('category')->orderBy('id')->get()->map(fn ($l) => (array) $l)->all(), 'totals' => $this->budgetTotals($e)];
    }

    public function budgetTotals(Event $e): array
    {
        $t = DB::table('event_budget_lines')->where('event_id', $e->id)->selectRaw('COALESCE(SUM(estimated),0) estimated, COALESCE(SUM(approved),0) approved, COALESCE(SUM(committed),0) committed, COALESCE(SUM(actual),0) actual')->first();
        $approved = (float) $t->approved;
        $spent = max((float) $t->committed, (float) $t->actual);

        return ['estimated' => (float) $t->estimated, 'approved' => $approved, 'committed' => (float) $t->committed, 'actual' => (float) $t->actual, 'remaining' => round($approved - $spent, 2),
            'warning' => $approved > 0 && $spent >= $approved * 0.9 ? ($spent > $approved ? 'over' : 'near') : null];
    }

    public function saveBudgetLine(Event $e, array $in, ?int $id): array
    {
        $row = $this->clean($in, ['category', 'item', 'supplier', 'estimated', 'approved', 'committed', 'actual', 'notes']);
        foreach (['estimated', 'approved', 'committed', 'actual'] as $k) {
            if (isset($row[$k]) && (float) $row[$k] < 0) {
                throw ValidationException::withMessages([$k => 'An amount cannot be negative.']);
            }
        }
        if (! $id && (trim((string) ($row['category'] ?? '')) === '' || trim((string) ($row['item'] ?? '')) === '')) {
            throw ValidationException::withMessages(['item' => 'Give the category and what it is for.']);
        }
        if ($id) {
            DB::table('event_budget_lines')->where(['id' => $id, 'event_id' => $e->id])->update($row + ['updated_at' => now()]);
        } else {
            $id = DB::table('event_budget_lines')->insertGetId($row + ['event_id' => $e->id] + $this->now());
        }

        return (array) DB::table('event_budget_lines')->find($id);
    }

    public function deleteBudgetLine(Event $e, int $id): void
    {
        DB::table('event_budget_lines')->where(['id' => $id, 'event_id' => $e->id])->delete();
    }

    // ── team ─────────────────────────────────────────────────────────────

    public function team(Event $e): array
    {
        return DB::table('event_team')->where('event_id', $e->id)->orderBy('id')->get()->map(fn ($t) => (array) $t + ['sees_budget' => (bool) $t->sees_budget])->all();
    }

    public function saveTeam(Event $e, array $in, ?int $id): array
    {
        $row = $this->clean($in, ['user_id', 'name', 'role', 'phone', 'sees_budget']);
        if (! empty($in['email'])) {
            $u = User::where('email', $in['email'])->first() ?? throw ValidationException::withMessages(['email' => 'There is no account with that email.']);
            $row['user_id'] = $u->id;
            $row['name'] = $row['name'] ?? $u->name;
        }
        if (! $id && (trim((string) ($row['name'] ?? '')) === '' || trim((string) ($row['role'] ?? '')) === '')) {
            throw ValidationException::withMessages(['name' => 'Give a name and a role.']);
        }
        if ($id) {
            DB::table('event_team')->where(['id' => $id, 'event_id' => $e->id])->update($row + ['updated_at' => now()]);
        } else {
            $id = DB::table('event_team')->insertGetId($row + ['event_id' => $e->id] + $this->now());
        }

        return (array) DB::table('event_team')->find($id);
    }

    public function deleteTeam(Event $e, int $id): void
    {
        DB::table('event_team')->where(['id' => $id, 'event_id' => $e->id])->delete();
    }

    // ── templates ────────────────────────────────────────────────────────

    public const STANDARD_TEMPLATES = [
        'Wedding' => ['tasks' => [['Book the venue', 'Venue', 'urgent', -180], ['Book the caterer', 'Catering', 'high', -150], ['Book photographer and videographer', 'Media', 'high', -140], ['Send invitations', 'Guests', 'high', -60], ['Confirm the guest list and seating', 'Guests', 'normal', -14], ['Final walkthrough at the venue', 'Venue', 'high', -3], ['Thank-you messages', 'Guests', 'low', 7]],
            'milestones' => [['Venue and date confirmed', -170], ['Invitations sent', -60], ['Final numbers to caterer', -10], ['Wedding day', 0]],
            'budget' => [['Venue', 'Hall hire'], ['Catering', 'Food and drink'], ['Media', 'Photography and video'], ['Decor', 'Flowers and styling'], ['Entertainment', 'Music / MC'], ['Attire', 'Outfits'], ['Contingency', 'Unplanned costs']],
            'programme' => [['10:00', 'Guests arrive and are seated'], ['11:00', 'Ceremony'], ['13:00', 'Lunch'], ['15:00', 'Speeches and cake'], ['17:00', 'Send-off']],
            'team' => ['Coordinator', 'Photographer', 'Ushers']],
        'Conference' => ['tasks' => [['Confirm venue and dates', 'Venue', 'urgent', -120], ['Call for speakers', 'Programme', 'high', -100], ['Open registration', 'Registration', 'high', -90], ['Book AV and streaming', 'Technical', 'high', -45], ['Print badges and signage', 'Logistics', 'normal', -7], ['Speaker briefing', 'Programme', 'normal', -3], ['Send feedback survey', 'Follow-up', 'low', 2]],
            'milestones' => [['Speakers confirmed', -60], ['Registration closes', -5], ['Conference day', 0]],
            'budget' => [['Venue', 'Hall and rooms'], ['Catering', 'Tea and lunches'], ['Technical', 'AV and streaming'], ['Marketing', 'Promotion'], ['Speakers', 'Fees and travel'], ['Contingency', 'Unplanned costs']],
            'programme' => [['08:00', 'Registration'], ['09:00', 'Opening and keynote'], ['10:30', 'Break'], ['11:00', 'Sessions'], ['13:00', 'Lunch'], ['14:00', 'Afternoon sessions'], ['16:30', 'Close']],
            'team' => ['Coordinator', 'Registration desk', 'Technical lead']],
        'Birthday party' => ['tasks' => [['Choose venue', 'Venue', 'high', -30], ['Order cake', 'Catering', 'normal', -14], ['Send invitations', 'Guests', 'normal', -21], ['Book entertainment', 'Entertainment', 'normal', -21], ['Decorate', 'Decor', 'normal', -1]],
            'milestones' => [['Invitations sent', -21], ['The party', 0]], 'budget' => [['Venue', 'Hire'], ['Catering', 'Food, drink, cake'], ['Entertainment', 'DJ / activities'], ['Decor', 'Decorations']],
            'programme' => [['15:00', 'Guests arrive'], ['16:00', 'Activities'], ['17:00', 'Cake'], ['18:00', 'Close']], 'team' => ['Coordinator']],
    ];

    public function templates(bool $withInactive = false): array
    {
        return DB::table('event_templates')->when(! $withInactive, fn ($q) => $q->where('is_active', 1))->orderBy('name')->get()->map(function ($t) {
            $b = json_decode((string) $t->body, true) ?: [];

            return ['id' => (int) $t->id, 'name' => $t->name, 'description' => $t->description, 'category_id' => $t->category_id, 'is_active' => (bool) $t->is_active, 'body' => $b,
                'counts' => ['tasks' => count($b['tasks'] ?? []), 'milestones' => count($b['milestones'] ?? []), 'budget' => count($b['budget'] ?? []), 'programme' => count($b['programme'] ?? [])]];
        })->all();
    }

    public function saveTemplate(array $in, ?int $id): array
    {
        $name = trim((string) ($in['name'] ?? ''));
        if ($name === '') {
            throw ValidationException::withMessages(['name' => 'Give the template a name.']);
        }
        $body = is_array($in['body'] ?? null) ? $in['body'] : [];
        $row = ['name' => mb_substr($name, 0, 120), 'description' => $in['description'] ?? null, 'category_id' => $in['category_id'] ?? null, 'body' => json_encode($body), 'is_active' => (bool) ($in['is_active'] ?? true), 'updated_at' => now()];
        if (DB::table('event_templates')->where('name', $row['name'])->when($id, fn ($q) => $q->where('id', '!=', $id))->exists()) {
            throw ValidationException::withMessages(['name' => 'A template with that name exists.']);
        }
        if ($id) {
            DB::table('event_templates')->where('id', $id)->update($row);
        } else {
            $id = DB::table('event_templates')->insertGetId($row + ['created_at' => now()]);
        }

        return collect($this->templates(true))->firstWhere('id', $id);
    }

    public function deleteTemplate(int $id): void
    {
        DB::table('event_templates')->where('id', $id)->delete();
    }

    public function addStandardTemplates(): int
    {
        $n = 0;
        foreach (self::STANDARD_TEMPLATES as $name => $t) {
            if (DB::table('event_templates')->where('name', $name)->exists()) {
                continue;
            }
            $this->saveTemplate(['name' => $name, 'description' => 'Standard checklist, budget lines and running order.', 'body' => [
                'tasks' => array_map(fn ($x) => ['title' => $x[0], 'department' => $x[1], 'priority' => $x[2], 'offset_days' => $x[3]], $t['tasks']),
                'milestones' => array_map(fn ($x) => ['title' => $x[0], 'offset_days' => $x[1]], $t['milestones']),
                'budget' => array_map(fn ($x) => ['category' => $x[0], 'item' => $x[1]], $t['budget']),
                'programme' => array_map(fn ($x) => ['starts_at' => $x[0], 'title' => $x[1]], $t['programme']),
                'team' => array_map(fn ($x) => ['role' => $x], $t['team'])]], null);
            $n++;
        }

        return $n;
    }

    /** Fill an event's workspace from a template. Dates count from the event's first date (tasks that fall before today are left undated). */
    public function applyTemplate(Event $e, int $templateId, ?string $eventDate, ?User $by): array
    {
        $t = DB::table('event_templates')->where('id', $templateId)->first() ?? abort(404);
        $b = json_decode((string) $t->body, true) ?: [];
        $day = $eventDate ?: DB::table('event_sessions')->where('event_id', $e->id)->min('starts_at');
        $base = $day ? \Illuminate\Support\Carbon::parse($day)->startOfDay() : null;
        $when = fn ($off) => $base && $off !== null ? $base->copy()->addDays((int) $off)->toDateString() : null;
        $made = ['tasks' => 0, 'milestones' => 0, 'budget' => 0, 'programme' => 0, 'team' => 0];
        DB::transaction(function () use ($e, $b, $when, $by, $base, &$made) {
            foreach ($b['tasks'] ?? [] as $i => $x) {
                DB::table('event_tasks')->insert(['event_id' => $e->id, 'title' => mb_substr((string) $x['title'], 0, 200), 'department' => $x['department'] ?? null, 'priority' => $x['priority'] ?? 'normal', 'due_on' => $when($x['offset_days'] ?? null),
                    'status' => 'todo', 'sort_order' => $i, 'created_by' => $by?->id] + $this->now());
                $made['tasks']++;
            }
            foreach ($b['milestones'] ?? [] as $i => $x) {
                DB::table('event_milestones')->insert(['event_id' => $e->id, 'title' => mb_substr((string) $x['title'], 0, 160), 'due_on' => $when($x['offset_days'] ?? null), 'sort_order' => $i] + $this->now());
                $made['milestones']++;
            }
            foreach ($b['budget'] ?? [] as $x) {
                DB::table('event_budget_lines')->insert(['event_id' => $e->id, 'category' => mb_substr((string) $x['category'], 0, 80), 'item' => mb_substr((string) $x['item'], 0, 200)] + $this->now());
                $made['budget']++;
            }
            foreach ($b['programme'] ?? [] as $i => $x) {
                DB::table('event_programme')->insert(['event_id' => $e->id, 'day_on' => $when(0), 'starts_at' => $x['starts_at'] ?? null, 'ends_at' => $x['ends_at'] ?? null, 'title' => mb_substr((string) $x['title'], 0, 200), 'sort_order' => $i] + $this->now());
                $made['programme']++;
            }
            foreach ($b['team'] ?? [] as $x) {
                DB::table('event_team')->insert(['event_id' => $e->id, 'name' => 'To be named', 'role' => mb_substr((string) $x['role'], 0, 80)] + $this->now());
                $made['team']++;
            }
        });

        return $made;
    }
}
