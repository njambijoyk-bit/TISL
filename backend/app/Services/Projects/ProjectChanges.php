<?php

namespace App\Services\Projects;

use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Change control (docs/PROJECTS_STAGE5_SPEC.md, build 5.5). A change says what and why, and what it does: adds or alters scope lines, moves key
 * dates or task dates, and whether it changes the price. Draft, Submitted, Approved, Rejected, Withdrawn.
 *
 * Raising needs `projects.changes` and a project role that works on tasks. Approving or rejecting needs `projects.changes.approve` and a project
 * role that may change the work (ability `edit`), never by whoever raised it, and approving follows the serious-action rules ("change.approve").
 * On approval its effects are applied in one step and logged. A change that alters the price opens Books' sales order form filled in; the saved
 * order is tied to the change and linked to the work, so the agreed value includes it. No amount is kept here.
 */
class ProjectChanges
{
    public const STATES = ['draft' => 'Draft', 'submitted' => 'Submitted', 'approved' => 'Approved', 'rejected' => 'Rejected', 'withdrawn' => 'Withdrawn'];

    public const KINDS = ['scope_add' => 'Adds a scope line', 'scope_alter' => 'Alters a scope line', 'date_move' => 'Moves a key date', 'task_move' => 'Moves a task'];

    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function list(object $project, User $user): array
    {
        $this->needReady();
        $rows = DB::table('project_changes')->where('project_id', $project->id)->orderByDesc('number')->get();
        $effects = DB::table('project_change_effects')->whereIn('change_id', $rows->pluck('id')->all() ?: [0])->orderBy('id')->get()->groupBy('change_id');
        $names = DB::table('users')->whereIn('id', $rows->pluck('raised_by')->merge($rows->pluck('decided_by'))->filter()->unique()->all() ?: [0])->pluck('name', 'id');
        $vouchers = Schema::hasTable('vouchers') ? DB::table('vouchers')->whereIn('id', $rows->pluck('voucher_id')->filter()->all() ?: [0])->get(['id', 'voucher_number', 'status'])->keyBy('id') : collect();
        $raise = $this->access->decide($user, 'changes', $project)['allowed'];
        $approve = $this->access->decide($user, 'changes_approve', $project)['allowed'];

        return [
            'ready' => true,
            'changes' => $rows->map(fn ($c) => [
                'id' => (int) $c->id, 'number' => (int) $c->number, 'ref' => sprintf('C-%02d', $c->number), 'title' => $c->title, 'reason' => $c->reason, 'state' => $c->state,
                'changes_price' => (bool) $c->changes_price, 'raised_by' => $names[$c->raised_by] ?? null, 'mine' => (int) $c->raised_by === (int) $user->id,
                'decided_by' => $c->decided_by ? ($names[$c->decided_by] ?? null) : null, 'decided_at' => $c->decided_at, 'decision_note' => $c->decision_note,
                'effects' => ($effects[$c->id] ?? collect())->map(fn ($e) => $this->describe($project, $e))->values()->all(),
                'order' => $c->voucher_id && isset($vouchers[$c->voucher_id]) ? ['id' => (int) $c->voucher_id, 'number' => $vouchers[$c->voucher_id]->voucher_number, 'status' => $vouchers[$c->voucher_id]->status] : null,
                'can' => ['edit' => $raise && $c->state === 'draft' && ((int) $c->raised_by === (int) $user->id || $approve),
                    'decide' => $approve && $c->state === 'submitted' && (int) $c->raised_by !== (int) $user->id,
                    'withdraw' => in_array($c->state, ['draft', 'submitted'], true) && ((int) $c->raised_by === (int) $user->id || $approve)],
            ])->values()->all(),
            'options' => $raise ? $this->options($project) : null,
            'kinds' => self::KINDS, 'states' => self::STATES,
            'can' => ['raise' => $raise, 'approve' => $approve],
        ];
    }

    /** @param array<string, mixed> $d title, reason, changes_price, effects [{kind, target_id, data}] */
    public function create(object $project, array $d, User $by): int
    {
        $this->needReady();
        $this->access->authorize($by, 'changes', $project);
        $row = $this->fields($d, null);
        $effects = $this->effects($project, (array) ($d['effects'] ?? []));

        return DB::transaction(function () use ($project, $row, $effects, $by) {
            $number = (int) DB::table('project_changes')->where('project_id', $project->id)->lockForUpdate()->max('number') + 1;
            $id = DB::table('project_changes')->insertGetId($row + ['project_id' => $project->id, 'number' => $number, 'state' => 'draft', 'raised_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
            $this->putEffects($id, $effects);
            ProjectLog::record((int) $project->id, $by, 'change.raised', 'change', $id, null, ['ref' => sprintf('C-%02d', $number), 'title' => $row['title']]);

            return $id;
        });
    }

    /** Change a draft (whoever raised it, or someone who may approve changes). */
    public function update(object $project, int $id, array $d, User $by): void
    {
        $c = $this->find($project, $id);
        $this->access->authorize($by, 'changes', $project);
        if ($c->state !== 'draft') {
            throw new ProjectException('Only a draft can be changed. Withdraw it and raise it again.');
        }
        $this->needOwnOrApprover($project, $c, $by);
        $row = $this->fields($d, $c);
        $effects = array_key_exists('effects', $d) ? $this->effects($project, (array) $d['effects']) : null;
        DB::transaction(function () use ($project, $c, $row, $effects, $by) {
            if ($row) {
                DB::table('project_changes')->where('id', $c->id)->update($row + ['updated_at' => now()]);
            }
            if ($effects !== null) {
                DB::table('project_change_effects')->where('change_id', $c->id)->delete();
                $this->putEffects((int) $c->id, $effects);
            }
            ProjectLog::record((int) $project->id, $by, 'change.edited', 'change', (int) $c->id, null, $row + ($effects !== null ? ['effects' => count($effects)] : []));
        });
    }

    public function submit(object $project, int $id, User $by): void
    {
        $c = $this->find($project, $id);
        $this->access->authorize($by, 'changes', $project);
        $this->needOwnOrApprover($project, $c, $by);
        if ($c->state !== 'draft') {
            throw new ProjectException('It is already ' . mb_strtolower(self::STATES[$c->state]) . '.');
        }
        if (! $c->changes_price && ! DB::table('project_change_effects')->where('change_id', $c->id)->exists()) {
            throw new ProjectException('Say what the change does (a scope line, a date) or that it changes the price, before sending it.');
        }
        DB::table('project_changes')->where('id', $c->id)->update(['state' => 'submitted', 'submitted_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'change.submitted', 'change', (int) $c->id, null, null);
    }

    public function withdraw(object $project, int $id, User $by): void
    {
        $c = $this->find($project, $id);
        if (! in_array($c->state, ['draft', 'submitted'], true)) {
            throw new ProjectException('It is already ' . mb_strtolower(self::STATES[$c->state]) . '.');
        }
        $this->needOwnOrApprover($project, $c, $by);
        DB::table('project_changes')->where('id', $c->id)->update(['state' => 'withdrawn', 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'change.withdrawn', 'change', (int) $c->id, null, null);
    }

    /** Reject a submitted change, with a note. */
    public function reject(object $project, int $id, ?string $note, User $by): void
    {
        $c = $this->decidable($project, $id, $by);
        DB::table('project_changes')->where('id', $c->id)->update(['state' => 'rejected', 'decided_by' => $by->id, 'decided_at' => now(), 'decision_note' => $this->note($note), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'change.rejected', 'change', (int) $c->id, null, null, ProjectLog::DONE, $this->note($note));
    }

    /**
     * Approve a submitted change: its effects are applied in one step (all or nothing) and logged. The caller has asked the serious-action rules.
     * @return array{order_needed: bool} whether Books' sales order form should open for its price
     */
    public function approve(object $project, int $id, ?string $note, User $by): array
    {
        $c = $this->decidable($project, $id, $by);
        $ref = sprintf('C-%02d', $c->number);
        DB::transaction(function () use ($project, $c, $note, $by, $ref) {
            foreach (DB::table('project_change_effects')->where('change_id', $c->id)->orderBy('id')->get() as $e) {
                $this->apply($project, $c, $e, $by, $ref);
            }
            DB::table('project_changes')->where('id', $c->id)->update(['state' => 'approved', 'decided_by' => $by->id, 'decided_at' => now(), 'decision_note' => $this->note($note), 'updated_at' => now()]);
            ProjectLog::record((int) $project->id, $by, 'change.approved', 'change', (int) $c->id, null, ['ref' => $ref], ProjectLog::DONE, $this->note($note));
        });
        foreach (DB::table('project_change_effects')->where('change_id', $c->id)->where('kind', 'date_move')->pluck('target_id') as $date) {
            app(ProjectKeyDates::class)->sync((int) $date);
        }
        foreach (DB::table('project_change_effects')->where('change_id', $c->id)->where('kind', 'task_move')->pluck('target_id') as $task) {
            app(ProjectTaskCalendar::class)->sync((int) $task);
        }

        return ['order_needed' => (bool) $c->changes_price && ! $c->voucher_id];
    }

    /** What Books' sales order form opens with for an approved change that alters the price. @return array<string, mixed> */
    public function orderForm(object $project, int $id, User $by): array
    {
        $c = $this->find($project, $id);
        $this->access->authorize($by, 'changes_approve', $project);
        if ($c->state !== 'approved' || ! $c->changes_price) {
            throw new ProjectException('Only an approved change that alters the price gets a sales order.');
        }
        if ($c->voucher_id) {
            throw new ProjectException('This change already has its sales order.');
        }
        if (! $project->customer_id || ! $project->cost_centre_id) {
            throw new ProjectException('This work needs its client and its cost centre in the books first.');
        }
        $type = Schema::hasTable('voucher_types') ? DB::table('voucher_types')->where('base_type', 'sales_order')->where('is_active', 1)->orderBy('id')->value('id') : null;
        if (! $type) {
            throw new ProjectException('The Sales order voucher type is switched off in Books. Switch it on first.', 409);
        }
        $ref = sprintf('C-%02d', $c->number);
        $ledger = app(ProjectBilling::class)->basis((int) $project->id)['ledger_id'] ?? null;

        return ['change_id' => (int) $c->id, 'voucher_type_id' => (int) $type, 'customer_id' => (int) $project->customer_id,
            'customer_name' => ($cu = DB::table('customers')->where('id', $project->customer_id)->first()) ? ProjectService::customerName($cu) : null,
            'cost_centre_id' => (int) $project->cost_centre_id, 'narration' => "{$project->number} change {$ref}: {$c->title}", 'reference_no' => mb_substr("{$project->number} {$ref}", 0, 60),
            'lines' => [['type' => 'custom', 'description' => "Change {$ref}: {$c->title}", 'quantity' => 1, 'rate' => null, 'ledger_id' => $ledger]]];
    }

    /**
     * From the Books voucher form: a sales order saved for an approved change is tied to it and linked to the work, when it is on the work's
     * cost centre (or a phase's) and the change has no order yet. Anything else is left alone.
     */
    public function tie(int $changeId, int $voucherId, ?int $costCentreId, ?User $by): void
    {
        if (! ProjectsSetup::work()) {
            return;
        }
        $c = DB::table('project_changes')->where('id', $changeId)->first();
        $on = app(VoucherProjects::class)->projectOf($costCentreId);
        if (! $c || $c->state !== 'approved' || $c->voucher_id || ! $on || $on['project_id'] !== (int) $c->project_id) {
            return;
        }
        DB::transaction(function () use ($c, $voucherId, $by) {
            DB::table('project_changes')->where('id', $c->id)->update(['voucher_id' => $voucherId, 'updated_at' => now()]);
            $link = DB::table('project_links')->where('project_id', $c->project_id)->where('module', 'books')->where('link_type', 'voucher')->where('linked_id', $voucherId)->first();
            if ($link) {
                DB::table('project_links')->where('id', $link->id)->update(['deleted_at' => null, 'deleted_by' => null, 'updated_at' => now()]);
            } else {
                DB::table('project_links')->insert(['project_id' => $c->project_id, 'module' => 'books', 'link_type' => 'voucher', 'linked_id' => $voucherId, 'note' => sprintf('Change C-%02d', $c->number),
                    'added_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
            }
            ProjectLog::record((int) $c->project_id, $by, 'change.ordered', 'change', (int) $c->id, null, ['voucher_id' => $voucherId]);
        });
    }

    // ------------------------------------------------------------------ inside

    private function apply(object $project, object $c, object $e, User $by, string $ref): void
    {
        $data = json_decode((string) $e->data, true) ?: [];
        switch ($e->kind) {
            case 'scope_add':
                $id = DB::table('project_scope_lines')->insertGetId(['project_id' => $project->id, 'phase_id' => $data['phase_id'] ?? null, 'code' => $data['code'] ?? null, 'description' => $data['description'],
                    'unit' => $data['unit'] ?? null, 'quantity' => $data['quantity'] ?? null, 'done_quantity' => 0, 'change_id' => $c->id,
                    'sort_order' => (int) DB::table('project_scope_lines')->where('project_id', $project->id)->max('sort_order') + 1, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
                ProjectLog::record((int) $project->id, $by, 'scope.added', 'scope_line', $id, null, ['line' => $data['description'], 'by_change' => $ref]);
                break;
            case 'scope_alter':
                $line = DB::table('project_scope_lines')->where('id', $e->target_id)->where('project_id', $project->id)->whereNull('deleted_at')->first()
                    ?? throw new ProjectException("{$ref} alters a scope line that is no longer there. Send it back and raise it again.");
                $row = array_intersect_key($data, array_flip(['description', 'quantity']));
                DB::table('project_scope_lines')->where('id', $line->id)->update($row + ['updated_at' => now()]);
                ProjectLog::record((int) $project->id, $by, 'scope.changed', 'scope_line', (int) $line->id, array_intersect_key((array) $line, $row), $row + ['by_change' => $ref]);
                break;
            case 'date_move':
                $k = DB::table('project_key_dates')->where('id', $e->target_id)->where('project_id', $project->id)->whereNull('deleted_at')->first()
                    ?? throw new ProjectException("{$ref} moves a key date that is no longer there. Send it back and raise it again.");
                DB::table('project_key_dates')->where('id', $k->id)->update(['starts_at' => $data['starts_at'], 'all_day' => (int) ($data['all_day'] ?? 1), 'moved_from' => $k->starts_at, 'move_reason' => mb_substr("Change {$ref}: {$c->title}", 0, 200),
                    'moved_by' => $by->id, 'warned' => null, 'state' => $k->state === 'done' ? 'done' : (Carbon::parse($data['starts_at'])->endOfDay()->isPast() ? $k->state : 'open'), 'updated_at' => now()]);
                ProjectLog::record((int) $project->id, $by, 'key_date.moved', 'key_date', (int) $k->id, ['when' => $k->starts_at], ['when' => $data['starts_at']], ProjectLog::DONE, "Change {$ref}");
                break;
            case 'task_move':
                $t = DB::table('project_work_tasks')->where('id', $e->target_id)->where('project_id', $project->id)->whereNull('deleted_at')->first()
                    ?? throw new ProjectException("{$ref} moves a task that is no longer there. Send it back and raise it again.");
                $row = array_intersect_key($data, array_flip(['start_date', 'due_date']));
                DB::table('project_work_tasks')->where('id', $t->id)->update($row + ['updated_at' => now()]);
                ProjectLog::record((int) $project->id, $by, 'task.changed', 'task', (int) $t->id, array_intersect_key((array) $t, $row), $row + ['by_change' => $ref]);
                break;
        }
        DB::table('project_change_effects')->where('id', $e->id)->update(['applied_at' => now()]);
    }

    /** @return array<string, mixed> how an effect reads on the screen */
    private function describe(object $project, object $e): array
    {
        $d = json_decode((string) $e->data, true) ?: [];
        $what = match ($e->kind) {
            'scope_add' => 'Adds ' . trim(($d['code'] ?? '') . ' ' . $d['description']) . (isset($d['unit']) && $d['unit'] ? " ({$this->num($d['quantity'])} {$d['unit']})" : ''),
            'scope_alter' => 'Alters ' . (DB::table('project_scope_lines')->where('id', $e->target_id)->value('description') ?? 'a scope line') . (isset($d['quantity']) ? " to {$this->num($d['quantity'])}" : '') . (isset($d['description']) ? " as \"{$d['description']}\"" : ''),
            'date_move' => 'Moves ' . (DB::table('project_key_dates')->where('id', $e->target_id)->value('title') ?? 'a key date') . ' to ' . Carbon::parse($d['starts_at'])->format(($d['all_day'] ?? 1) ? 'j M Y' : 'j M Y, H:i'),
            'task_move' => 'Moves ' . (($t = DB::table('project_work_tasks')->where('id', $e->target_id)->first()) ? "{$project->number}-T{$t->number} {$t->title}" : 'a task') . (isset($d['due_date']) && $d['due_date'] ? ' to be due ' . Carbon::parse($d['due_date'])->format('j M Y') : ''),
            default => $e->kind,
        };

        return ['id' => (int) $e->id, 'kind' => $e->kind, 'target_id' => $e->target_id ? (int) $e->target_id : null, 'data' => $d, 'what' => $what, 'applied' => $e->applied_at !== null];
    }

    /** Check each effect and turn it into what is kept. @return array<int, array{kind: string, target_id: ?int, data: array<string, mixed>}> */
    private function effects(object $project, array $raw): array
    {
        if (count($raw) > 30) {
            throw new ProjectException('A change can do up to 30 things. Split it.');
        }
        $out = [];
        foreach ($raw as $e) {
            $e = (array) $e;
            $kind = (string) ($e['kind'] ?? '');
            $d = (array) ($e['data'] ?? []);
            $target = ! empty($e['target_id']) ? (int) $e['target_id'] : null;
            switch ($kind) {
                case 'scope_add':
                    $desc = trim(preg_replace('/\s+/', ' ', (string) ($d['description'] ?? '')));
                    if ($desc === '') {
                        throw new ProjectException('Describe the scope line the change adds.');
                    }
                    $unit = trim((string) ($d['unit'] ?? '')) ?: null;
                    $qty = isset($d['quantity']) && $d['quantity'] !== '' ? round((float) $d['quantity'], 4) : null;
                    if ($unit && $qty === null) {
                        throw new ProjectException('A line measured in a unit needs its quantity.');
                    }
                    $phase = ! empty($d['phase_id']) ? (int) $d['phase_id'] : null;
                    if ($phase && ! DB::table('project_phases')->where('id', $phase)->where('project_id', $project->id)->exists()) {
                        throw new ProjectException("Choose one of this work's phases.");
                    }
                    $out[] = ['kind' => $kind, 'target_id' => null, 'data' => array_filter(['code' => trim((string) ($d['code'] ?? '')) ?: null, 'description' => mb_substr($desc, 0, 300), 'unit' => $unit ? mb_substr($unit, 0, 20) : null, 'quantity' => $qty, 'phase_id' => $phase], fn ($v) => $v !== null)];
                    break;
                case 'scope_alter':
                    if (! $target || ! DB::table('project_scope_lines')->where('id', $target)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                        throw new ProjectException("Choose one of this work's scope lines to alter.");
                    }
                    $row = [];
                    if (isset($d['quantity']) && $d['quantity'] !== '') {
                        $row['quantity'] = round(max(0, (float) $d['quantity']), 4);
                    }
                    if (isset($d['description']) && trim((string) $d['description']) !== '') {
                        $row['description'] = mb_substr(trim((string) $d['description']), 0, 300);
                    }
                    if (! $row) {
                        throw new ProjectException('Say what the scope line becomes: a new quantity or description.');
                    }
                    $out[] = ['kind' => $kind, 'target_id' => $target, 'data' => $row];
                    break;
                case 'date_move':
                    if (! $target || ! DB::table('project_key_dates')->where('id', $target)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                        throw new ProjectException("Choose one of this work's key dates to move.");
                    }
                    $day = $this->day($d['date'] ?? null, 'Give the new date.');
                    $time = trim((string) ($d['time'] ?? ''));
                    if ($time !== '' && ! preg_match('/^([01]?\d|2[0-3]):[0-5]\d$/', $time)) {
                        throw new ProjectException('Give the time as hours and minutes, like 09:30.');
                    }
                    $out[] = ['kind' => $kind, 'target_id' => $target, 'data' => ['starts_at' => "{$day} " . ($time !== '' ? str_pad($time, 5, '0', STR_PAD_LEFT) . ':00' : '00:00:00'), 'all_day' => $time === '' ? 1 : 0]];
                    break;
                case 'task_move':
                    if (! $target || ! DB::table('project_work_tasks')->where('id', $target)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                        throw new ProjectException("Choose one of this work's tasks to move.");
                    }
                    $row = array_filter(['start_date' => ! empty($d['start_date']) ? $this->day($d['start_date'], 'That is not a date.') : null, 'due_date' => ! empty($d['due_date']) ? $this->day($d['due_date'], 'That is not a date.') : null]);
                    if (! $row) {
                        throw new ProjectException('Give the task its new start or due date.');
                    }
                    if (isset($row['start_date'], $row['due_date']) && $row['start_date'] > $row['due_date']) {
                        throw new ProjectException('It cannot be due before it starts.');
                    }
                    $out[] = ['kind' => $kind, 'target_id' => $target, 'data' => $row];
                    break;
                default:
                    throw new ProjectException('Choose what the change does from the list.');
            }
        }

        return $out;
    }

    private function putEffects(int $changeId, array $effects): void
    {
        foreach ($effects as $e) {
            DB::table('project_change_effects')->insert(['change_id' => $changeId, 'kind' => $e['kind'], 'target_id' => $e['target_id'], 'data' => json_encode($e['data'])]);
        }
    }

    /** @return array<string, mixed> */
    private function fields(array $d, ?object $c): array
    {
        $row = [];
        if ($c === null || array_key_exists('title', $d)) {
            $title = trim(preg_replace('/\s+/', ' ', (string) ($d['title'] ?? '')));
            if ($title === '') {
                throw new ProjectException('Say what the change is.');
            }
            $row['title'] = mb_substr($title, 0, 200);
        }
        if (array_key_exists('reason', $d)) {
            $row['reason'] = trim((string) $d['reason']) === '' ? null : mb_substr(trim((string) $d['reason']), 0, 3000);
        }
        if ($c === null || array_key_exists('changes_price', $d)) {
            $row['changes_price'] = ! empty($d['changes_price']) ? 1 : 0;
        }

        return $row;
    }

    private function decidable(object $project, int $id, User $by): object
    {
        $c = $this->find($project, $id);
        $this->access->authorize($by, 'changes_approve', $project);
        if ($c->state !== 'submitted') {
            throw new ProjectException($c->state === 'draft' ? 'It has not been sent for a decision yet.' : 'It is already ' . mb_strtolower(self::STATES[$c->state]) . '.');
        }
        if ((int) $c->raised_by === (int) $by->id) {
            throw new ProjectException('Someone else decides on a change you raised.', 403);
        }

        return $c;
    }

    private function needOwnOrApprover(object $project, object $c, User $by): void
    {
        if ((int) $c->raised_by !== (int) $by->id && ! $this->access->decide($by, 'changes_approve', $project)['allowed']) {
            throw new ProjectException('Only whoever raised it, or someone who decides on changes, can do that.', 403);
        }
    }

    /** @return array<string, mixed> what the form offers */
    private function options(object $project): array
    {
        return [
            'scope_lines' => DB::table('project_scope_lines')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('sort_order')->get(['id', 'code', 'description', 'unit', 'quantity'])
                ->map(fn ($l) => ['id' => (int) $l->id, 'label' => trim(($l->code ?? '') . ' ' . $l->description), 'unit' => $l->unit, 'quantity' => $l->quantity !== null ? (float) $l->quantity : null])->all(),
            'key_dates' => DB::table('project_key_dates')->where('project_id', $project->id)->whereNull('deleted_at')->where('state', '!=', 'done')->orderBy('starts_at')->get(['id', 'title', 'starts_at'])
                ->map(fn ($k) => ['id' => (int) $k->id, 'label' => $k->title . ' (' . Carbon::parse($k->starts_at)->format('j M Y') . ')'])->all(),
            'tasks' => DB::table('project_work_tasks')->where('project_id', $project->id)->whereNull('deleted_at')->whereNotIn('status', ['done', 'cancelled'])->orderBy('number')->get(['id', 'number', 'title', 'due_date'])
                ->map(fn ($t) => ['id' => (int) $t->id, 'label' => "{$project->number}-T{$t->number} {$t->title}", 'due_date' => $t->due_date])->all(),
            'phases' => DB::table('project_phases')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('sort_order')->get(['id', 'name'])->map(fn ($p) => ['id' => (int) $p->id, 'name' => $p->name])->all(),
        ];
    }

    private function day(mixed $v, string $error): string
    {
        try {
            if (! $v) {
                throw new \InvalidArgumentException();
            }

            return Carbon::parse((string) $v)->toDateString();
        } catch (\Throwable) {
            throw new ProjectException($error);
        }
    }

    private function note(?string $note): ?string
    {
        $note = trim((string) $note);

        return $note === '' ? null : mb_substr($note, 0, 300);
    }

    private function num(mixed $n): string
    {
        return rtrim(rtrim(number_format((float) $n, 4, '.', ','), '0'), '.');
    }

    private function find(object $project, int $id): object
    {
        $this->needReady();

        return DB::table('project_changes')->where('id', $id)->where('project_id', $project->id)->first() ?? throw new ProjectException('Not found.', 404);
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::work()) {
            throw new ProjectException('Changes need database script 261. Run it first.', 409);
        }
    }
}
