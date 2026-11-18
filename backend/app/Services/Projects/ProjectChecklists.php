<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Joining and leaving checklists (docs/PROJECTS_STAGE8_SPEC.md, build 8.4). Templates are company lists in Configuration: steps, each with who
 * does it (the person, their manager in HR's line, someone named, or anyone holding a permission) and when (days from the start or leaving date).
 * Running one for a person turns each step into a to-do for whoever does it, reminded when due. A leaving checklist always has "Hand over their
 * work" (opens Stage 6's hand-over, filled in) and "Take them off their work" (ticking it ends their places on the leaving date).
 */
class ProjectChecklists
{
    public const KINDS = ['joining' => 'Joining', 'leaving' => 'Leaving'];
    public const WHO = ['person' => 'The person', 'manager' => 'Their manager', 'named' => 'Someone named', 'permission' => 'Anyone with a permission'];

    public function __construct(private ProjectTeam $team, private ProjectAccess $access) {}

    /** @return array<int, array<string, mixed>> */
    public function templates(bool $all = false): array
    {
        $this->needReady();
        $steps = DB::table('project_checklist_steps')->orderBy('sort_order')->orderBy('id')->get()->groupBy('template_id');
        $names = DB::table('users')->whereIn('id', DB::table('project_checklist_steps')->whereNotNull('who_user_id')->pluck('who_user_id')->all() ?: [0])->pluck('name', 'id');

        return DB::table('project_checklist_templates')->when(! $all, fn ($q) => $q->where('is_active', 1))->orderBy('kind')->orderBy('name')->get()
            ->map(fn ($t) => ['id' => (int) $t->id, 'kind' => $t->kind, 'name' => $t->name, 'is_active' => (bool) $t->is_active,
                'steps' => ($steps[$t->id] ?? collect())->map(fn ($s) => ['id' => (int) $s->id, 'text' => $s->text, 'who' => $s->who, 'who_user_id' => $s->who_user_id ? (int) $s->who_user_id : null,
                    'who_name' => $names[$s->who_user_id] ?? null, 'who_permission' => $s->who_permission, 'day_offset' => (int) $s->day_offset, 'action' => $s->action])->values()->all()])->all();
    }

    /** @param array<string, mixed> $d kind, name, is_active, steps [{text, who, who_user_id, who_permission, day_offset}] */
    public function saveTemplate(?int $id, array $d, User $by): void
    {
        $this->needReady();
        $kind = $id ? DB::table('project_checklist_templates')->where('id', $id)->value('kind') : ($d['kind'] ?? null);
        if (! isset(self::KINDS[$kind])) {
            throw new ProjectException($id ? 'Not found.' : 'Choose joining or leaving.', $id ? 404 : 422);
        }
        $name = trim((string) ($d['name'] ?? ''));
        if ($name === '') {
            throw new ProjectException('Give the checklist a name.');
        }
        $steps = [];
        foreach (array_values((array) ($d['steps'] ?? [])) as $i => $s) {
            $text = mb_substr(trim((string) ($s['text'] ?? '')), 0, 200);
            if ($text === '') {
                continue;
            }
            $who = (string) ($s['who'] ?? 'manager');
            if (! isset(self::WHO[$who])) {
                throw new ProjectException('Choose who does each step.');
            }
            if ($who === 'named' && ! DB::table('users')->where('id', (int) ($s['who_user_id'] ?? 0))->exists()) {
                throw new ProjectException("Choose who does \"{$text}\".");
            }
            if ($who === 'permission' && ! preg_match('/^[a-z_]+(\.[a-z_]+)+$/', (string) ($s['who_permission'] ?? ''))) {
                throw new ProjectException("Choose the permission for \"{$text}\".");
            }
            $action = in_array($s['action'] ?? null, ['handover', 'end_places'], true) && $kind === 'leaving' ? $s['action'] : null;
            $steps[] = ['text' => $text, 'who' => $who, 'who_user_id' => $who === 'named' ? (int) $s['who_user_id'] : null, 'who_permission' => $who === 'permission' ? $s['who_permission'] : null,
                'day_offset' => max(-365, min(365, (int) ($s['day_offset'] ?? 0))), 'action' => $action, 'sort_order' => $i];
        }
        if ($kind === 'leaving') {   // a leaving checklist always hands over the work and ends the places
            foreach (['handover' => ['Hand over their work', -7], 'end_places' => ['Take them off their work on the leaving date', 0]] as $act => [$text, $off]) {
                if (! in_array($act, array_column($steps, 'action'), true)) {
                    $steps[] = ['text' => $text, 'who' => 'manager', 'who_user_id' => null, 'who_permission' => null, 'day_offset' => $off, 'action' => $act, 'sort_order' => count($steps)];
                }
            }
        }
        DB::transaction(function () use ($id, $kind, $name, $d, $steps, $by) {
            $row = ['name' => mb_substr($name, 0, 120), 'is_active' => array_key_exists('is_active', $d) ? (int) (bool) $d['is_active'] : 1, 'updated_at' => now()];
            if ($id) {
                DB::table('project_checklist_templates')->where('id', $id)->update($row);
            } else {
                $id = DB::table('project_checklist_templates')->insertGetId($row + ['kind' => $kind, 'created_by' => $by->id, 'created_at' => now()]);
            }
            DB::table('project_checklist_steps')->where('template_id', $id)->delete();   // a running checklist keeps its own copy of the steps
            foreach ($steps as $s) {
                DB::table('project_checklist_steps')->insert($s + ['template_id' => $id]);
            }
            ProjectLog::record(null, $by, 'checklist_template.saved', 'checklist_template', $id, null, ['name' => $name, 'steps' => count($steps)]);
        });
    }

    /** Run a checklist for a person. @return int its id */
    public function start(User $by, int $userId, int $templateId, string $onDate): int
    {
        $this->needReady();
        $this->mayRun($by, $userId);
        $t = DB::table('project_checklist_templates')->where('id', $templateId)->where('is_active', 1)->first() ?? throw new ProjectException('Choose a checklist.');
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $onDate)) {
            throw new ProjectException($t->kind === 'joining' ? 'Choose the day they start.' : 'Choose their leaving day.');
        }
        if (DB::table('project_checklists')->where(['user_id' => $userId, 'kind' => $t->kind, 'state' => 'open'])->exists()) {
            throw new ProjectException('They already have an open ' . mb_strtolower(self::KINDS[$t->kind]) . ' checklist.');
        }
        $person = User::find($userId) ?? throw new ProjectException('Not found.', 404);
        $manager = $this->team->hr($userId)['manager_user_id'] ?? (int) $by->id;
        $id = DB::transaction(function () use ($t, $userId, $onDate, $by, $manager) {
            $id = DB::table('project_checklists')->insertGetId(['template_id' => $t->id, 'kind' => $t->kind, 'user_id' => $userId, 'on_date' => $onDate, 'state' => 'open', 'started_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            foreach (DB::table('project_checklist_steps')->where('template_id', $t->id)->orderBy('sort_order')->get() as $s) {
                $who = match ($s->who) { 'person' => $userId, 'manager' => $manager, 'named' => $s->who_user_id, default => null };
                DB::table('project_checklist_items')->insert(['checklist_id' => $id, 'text' => $s->text, 'who' => $s->who, 'who_user_id' => $who, 'who_permission' => $s->who_permission,
                    'due_on' => Carbon::parse($onDate)->addDays((int) $s->day_offset)->toDateString(), 'action' => $s->action, 'sort_order' => $s->sort_order]);
            }

            return $id;
        });
        $this->tellWhoDoes($id, "A {$t->name} checklist for {$person->name}", 'You have a step to do. It shows on My Work.');

        return $id;
    }

    /** A person's checklists, for their page. @return array<int, array<string, mixed>> */
    public function forPerson(User $viewer, int $userId): array
    {
        $this->needReady();
        $may = (int) $viewer->id === $userId || $viewer->hasPermission('projects.team.checklists') || $this->team->isAbove((int) $viewer->id, $userId);
        if (! $may) {
            return [];
        }

        return DB::table('project_checklists')->where('user_id', $userId)->orderByDesc('id')->limit(20)->get()->map(fn ($c) => $this->shape($c, $viewer))->all();
    }

    /** The steps waiting for this person, for My Work. @return array<int, array<string, mixed>> */
    public function mine(User $user): array
    {
        if (! ProjectsSetup::people()) {
            return [];
        }
        $perms = array_values(array_filter(DB::table('project_checklist_items')->whereNull('done_at')->whereNotNull('who_permission')->distinct()->pluck('who_permission')->all(), fn ($p) => $user->hasPermission($p)));

        return DB::table('project_checklist_items as i')->join('project_checklists as c', 'c.id', '=', 'i.checklist_id')->join('users as u', 'u.id', '=', 'c.user_id')
            ->where('c.state', 'open')->whereNull('i.done_at')->where(fn ($q) => $q->where('i.who_user_id', $user->id)->orWhereIn('i.who_permission', $perms ?: ['-']))
            ->orderBy('i.due_on')->limit(50)->get(['i.*', 'c.kind', 'c.user_id as person_id', 'u.name as person'])
            ->map(fn ($i) => ['id' => (int) $i->id, 'text' => $i->text, 'due_on' => $i->due_on, 'late' => $i->due_on && $i->due_on < now()->toDateString(), 'kind' => $i->kind,
                'person' => $i->person, 'person_id' => (int) $i->person_id, 'action' => $i->action])->all();
    }

    /** Tick a step (or untick it). "Take them off their work" ends their places when ticked. @return string|null something to say about it */
    public function tick(User $by, int $itemId, bool $done): ?string
    {
        $this->needReady();
        $i = DB::table('project_checklist_items')->where('id', $itemId)->first() ?? throw new ProjectException('Not found.', 404);
        $c = DB::table('project_checklists')->where('id', $i->checklist_id)->first();
        if (! ($i->who_user_id && (int) $i->who_user_id === (int) $by->id) && ! ($i->who_permission && $by->hasPermission($i->who_permission)) && ! $by->hasPermission('projects.team.checklists')) {
            throw new ProjectException('This step is someone else\'s.', 403);
        }
        if ($c->state !== 'open') {
            throw new ProjectException('This checklist is finished.');
        }
        $note = null;
        if ($done && $i->action === 'end_places' && ! $i->done_at) {
            $note = $this->endPlaces((int) $c->user_id, (string) $c->on_date, $by);
        }
        DB::table('project_checklist_items')->where('id', $i->id)->update(['done_at' => $done ? now() : null, 'done_by' => $done ? $by->id : null]);
        if ($done && ! DB::table('project_checklist_items')->where('checklist_id', $c->id)->whereNull('done_at')->exists()) {
            DB::table('project_checklists')->where('id', $c->id)->update(['state' => 'done', 'updated_at' => now()]);
            if ($c->started_by && (int) $c->started_by !== (int) $by->id) {
                ProjectNotices::tell(User::find($c->started_by), ProjectNotices::PEOPLE, 'A checklist is finished', 'Every step of the ' . mb_strtolower(self::KINDS[$c->kind]) . ' checklist for ' . DB::table('users')->where('id', $c->user_id)->value('name') . ' is done.', "/admin/projects/team/{$c->user_id}", 'Open their page');
            }
        }

        return $note;
    }

    public function cancel(User $by, int $checklistId): void
    {
        $c = DB::table('project_checklists')->where('id', $checklistId)->first() ?? throw new ProjectException('Not found.', 404);
        $this->mayRun($by, (int) $c->user_id);
        DB::table('project_checklists')->where('id', $c->id)->where('state', 'open')->update(['state' => 'cancelled', 'updated_at' => now()]);
    }

    /** Remind whoever does a step due today or late, once a day. @return int steps reminded */
    public function remind(?Carbon $today = null): int
    {
        if (! ProjectsSetup::people()) {
            return 0;
        }
        $today = ($today ?? now())->toDateString();
        $n = 0;
        foreach (DB::table('project_checklist_items as i')->join('project_checklists as c', 'c.id', '=', 'i.checklist_id')->join('users as u', 'u.id', '=', 'c.user_id')->where('c.state', 'open')->whereNull('i.done_at')
            ->where('i.due_on', '<=', $today)->where(fn ($q) => $q->whereNull('i.reminded_on')->orWhere('i.reminded_on', '<', $today))->get(['i.*', 'u.name as person']) as $i) {
            $people = $i->who_user_id ? User::whereIn('id', [$i->who_user_id])->get() : app(\App\Services\Notify\Staff::class)->holding((string) $i->who_permission);
            ProjectNotices::tell($people, ProjectNotices::PEOPLE, ($i->due_on < $today ? 'Late: ' : 'Today: ') . $i->text, "For {$i->person}.", '/admin/projects/my-work', 'Open My Work');
            DB::table('project_checklist_items')->where('id', $i->id)->update(['reminded_on' => $today]);
            $n++;
        }

        return $n;
    }

    // ------------------------------------------------------------------ inside

    /** End every place this person holds on work, on the leaving date. Leading a piece of work is handed over first (Stage 2), so those stay and are named. */
    private function endPlaces(int $userId, string $onDate, User $by): ?string
    {
        $rows = DB::table('project_members as m')->join('projects as p', 'p.id', '=', 'm.project_id')->where('m.user_id', $userId)->where('m.status', 'active')->whereNull('p.deleted_at')
            ->get(['m.id', 'm.project_id', 'p.number', 'p.lead_user_id']);
        $kept = [];
        foreach ($rows as $r) {
            if ((int) $r->lead_user_id === $userId) {
                $kept[] = $r->number;
                continue;
            }
            DB::table('project_members')->where('id', $r->id)->update(['ends_at' => Carbon::parse($onDate)->endOfDay(), 'updated_at' => now()]);
            ProjectLog::record((int) $r->project_id, $by, 'member.ends', 'member', (int) $r->id, null, ['ends_at' => $onDate, 'why' => 'leaving checklist']);
        }

        return $kept ? 'Done, except where they lead: ' . implode(', ', $kept) . '. Hand each to another lead on its People tab.' : null;
    }

    private function tellWhoDoes(int $checklistId, string $title, string $message): void
    {
        $items = DB::table('project_checklist_items')->where('checklist_id', $checklistId)->get();
        $people = User::whereIn('id', $items->pluck('who_user_id')->filter()->unique()->all() ?: [0])->get();
        foreach ($items->pluck('who_permission')->filter()->unique() as $perm) {
            $people = $people->merge(app(\App\Services\Notify\Staff::class)->holding((string) $perm));
        }
        ProjectNotices::tell($people->unique('id'), ProjectNotices::PEOPLE, $title, $message, '/admin/projects/my-work', 'Open My Work');
    }

    /** @return array<string, mixed> */
    private function shape(object $c, User $viewer): array
    {
        $names = DB::table('users')->pluck('name', 'id');
        $items = DB::table('project_checklist_items')->where('checklist_id', $c->id)->orderBy('sort_order')->orderBy('id')->get();

        return ['id' => (int) $c->id, 'kind' => $c->kind, 'name' => DB::table('project_checklist_templates')->where('id', $c->template_id)->value('name') ?? self::KINDS[$c->kind], 'on_date' => $c->on_date, 'state' => $c->state,
            'items' => $items->map(fn ($i) => ['id' => (int) $i->id, 'text' => $i->text, 'who' => $i->who_user_id ? ($names[$i->who_user_id] ?? 'someone') : "anyone with {$i->who_permission}", 'due_on' => $i->due_on,
                'late' => ! $i->done_at && $i->due_on && $i->due_on < now()->toDateString(), 'done' => $i->done_at !== null, 'done_by' => $i->done_by ? ($names[$i->done_by] ?? null) : null, 'action' => $i->action,
                'mine' => ($i->who_user_id && (int) $i->who_user_id === (int) $viewer->id) || ($i->who_permission && $viewer->hasPermission($i->who_permission)) || $viewer->hasPermission('projects.team.checklists')])->all(),
            'can' => ['cancel' => $c->state === 'open' && $viewer->hasPermission('projects.team.checklists')]];
    }

    private function mayRun(User $by, int $userId): void
    {
        if (! $by->hasPermission('projects.team.checklists')) {
            throw new ProjectException('You may not run checklists.', 403);
        }
        if ($userId === (int) $by->id) {
            throw new ProjectException('Someone else runs your own checklist.', 403);
        }
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::people()) {
            throw new ProjectException('Checklists need database script 265.', 409);
        }
    }
}
