<?php

namespace App\Services\Projects;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Scope lines (docs/PROJECTS_STAGE5_SPEC.md, build 5.3): what is agreed on a piece of work, named per industry (fee schedule, bill of quantities,
 * deliverables, job card). Code, description, unit, quantity, phase, and progress: a quantity done, or a percentage for a line with no unit.
 *
 * A line can point at the line of a linked Books sales order (or quotation) that prices it. Projects keeps only that link; the price shown is
 * read from Books each time. The lines of a linked order can be copied in as scope lines in one step.
 *
 * Reading needs only to open the work; adding, changing, progress and deleting need `projects.scope` and a project role that works on tasks.
 */
class ProjectScope
{
    public function __construct(private ProjectAccess $access) {}

    /** @return array<string, mixed> */
    public function list(object $project, User $user): array
    {
        $this->needReady();
        $rows = DB::table('project_scope_lines')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->get();
        $items = $this->items($rows->pluck('voucher_item_id')->filter()->all());
        $tasks = DB::table('project_work_tasks')->where('project_id', $project->id)->whereNull('deleted_at')->whereNotNull('scope_line_id')
            ->groupBy('scope_line_id')->selectRaw("scope_line_id, COUNT(*) as n, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as d")->get()->keyBy('scope_line_id');
        $phases = DB::table('project_phases')->where('project_id', $project->id)->whereNull('deleted_at')->orderBy('sort_order')->orderBy('id')->get(['id', 'name']);
        $manage = $this->access->decide($user, 'scope', $project)['allowed'];
        $lines = $rows->map(fn ($l) => [
            'id' => (int) $l->id, 'code' => $l->code, 'description' => $l->description, 'unit' => $l->unit,
            'quantity' => $l->quantity !== null ? (float) $l->quantity : null, 'done_quantity' => (float) $l->done_quantity, 'done_percent' => $l->done_percent !== null ? (float) $l->done_percent : null,
            'progress' => $this->percent($l), 'phase_id' => $l->phase_id ? (int) $l->phase_id : null,
            'priced_by' => $l->voucher_item_id ? ($items[(int) $l->voucher_item_id] ?? ['id' => (int) $l->voucher_item_id, 'gone' => true]) : null,
            'tasks' => ['total' => (int) ($tasks[$l->id]->n ?? 0), 'done' => (int) ($tasks[$l->id]->d ?? 0)],
            'change_id' => $l->change_id ? (int) $l->change_id : null,
        ])->values();

        return [
            'ready' => true, 'lines' => $lines->all(),
            'overall' => $this->overall($rows),
            'phases' => $phases->map(fn ($p) => ['id' => (int) $p->id, 'name' => $p->name])->all(),
            'orders' => $manage ? $this->orders($project) : [],
            'can' => ['manage' => $manage],
        ];
    }

    /** @param array<string, mixed> $d code, description, unit, quantity, phase_id, voucher_item_id */
    public function create(object $project, array $d, User $by): int
    {
        $this->needReady();
        $this->access->authorize($by, 'scope', $project);
        $row = $this->fields($project, $d, null);
        $id = DB::table('project_scope_lines')->insertGetId($row + ['project_id' => $project->id, 'done_quantity' => 0,
            'sort_order' => (int) DB::table('project_scope_lines')->where('project_id', $project->id)->max('sort_order') + 1, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'scope.added', 'scope_line', $id, null, ['line' => trim(($row['code'] ?? '') . ' ' . $row['description'])]);

        return $id;
    }

    public function update(object $project, int $lineId, array $d, User $by): void
    {
        $l = $this->find($project, $lineId);
        $this->access->authorize($by, 'scope', $project);
        unset($d['done_quantity'], $d['done_percent']);
        $row = $this->fields($project, $d, $l);
        if (! $row) {
            return;
        }
        if (array_key_exists('unit', $row) && ($row['unit'] === null) !== ($l->unit === null)) {
            $row += ['done_quantity' => 0, 'done_percent' => null];   // from quantities to a percentage or back: progress starts again
        }
        DB::table('project_scope_lines')->where('id', $l->id)->update($row + ['updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'scope.changed', 'scope_line', (int) $l->id, array_intersect_key((array) $l, $row), $row);
    }

    /** Progress: a quantity done (a line with a unit) or a percentage (a line without). Each change is logged with who and what it was. */
    public function progress(object $project, int $lineId, mixed $value, User $by, ?string $note = null): void
    {
        $l = $this->find($project, $lineId);
        $this->access->authorize($by, 'scope', $project);
        $v = round((float) $value, 4);
        if ($v < 0) {
            throw new ProjectException('Progress cannot be below nothing.');
        }
        if ($l->unit === null) {
            if ($v > 100) {
                throw new ProjectException('A percentage is from 0 to 100.');
            }
            $row = ['done_percent' => round($v, 2)];
            $old = ['done_percent' => $l->done_percent];
        } else {
            if ($l->quantity !== null && $v > (float) $l->quantity * 1.5) {
                throw new ProjectException("That is far more than the {$this->num((float) $l->quantity)} {$l->unit} agreed. If the scope grew, raise a change.");
            }
            $row = ['done_quantity' => $v];
            $old = ['done_quantity' => (float) $l->done_quantity];
        }
        DB::table('project_scope_lines')->where('id', $l->id)->update($row + ['updated_at' => now()]);
        ProjectLog::record((int) $project->id, $by, 'scope.progress', 'scope_line', (int) $l->id, $old, $row, ProjectLog::DONE, trim((string) $note) ?: null);
    }

    public function delete(object $project, int $lineId, User $by): void
    {
        $l = $this->find($project, $lineId);
        $this->access->authorize($by, 'scope', $project);
        DB::transaction(function () use ($project, $l, $by) {
            DB::table('project_scope_lines')->where('id', $l->id)->update(['deleted_at' => now(), 'deleted_by' => $by->id]);
            DB::table('project_work_tasks')->where('scope_line_id', $l->id)->update(['scope_line_id' => null]);
            ProjectLog::record((int) $project->id, $by, 'scope.deleted', 'scope_line', (int) $l->id, ['line' => trim(($l->code ?? '') . ' ' . $l->description)], null);
        });
    }

    /** Copy the lines of a linked Books sales order or quotation in as scope lines, each pointing at the line it came from. Lines already copied are skipped. @return int lines added */
    public function copyOrder(object $project, int $voucherId, User $by): int
    {
        $this->needReady();
        $this->access->authorize($by, 'scope', $project);
        $order = collect($this->orders($project))->firstWhere('id', $voucherId);
        if (! $order) {
            throw new ProjectException('Choose a quotation or sales order linked to this work.');
        }
        $have = DB::table('project_scope_lines')->where('project_id', $project->id)->whereNull('deleted_at')->whereNotNull('voucher_item_id')->pluck('voucher_item_id')->map(fn ($v) => (int) $v)->all();
        $added = 0;
        DB::transaction(function () use ($project, $order, $have, $by, &$added) {
            $order_ = (int) DB::table('project_scope_lines')->where('project_id', $project->id)->max('sort_order');
            foreach ($order['lines'] as $i => $it) {
                if (in_array($it['id'], $have, true)) {
                    continue;
                }
                DB::table('project_scope_lines')->insert(['project_id' => $project->id, 'code' => (string) ($i + 1), 'description' => mb_substr($it['description'] ?: 'Line ' . ($i + 1), 0, 300),
                    'unit' => $it['unit'] ? mb_substr($it['unit'], 0, 20) : null, 'quantity' => $it['quantity'], 'done_quantity' => 0, 'voucher_item_id' => $it['id'],
                    'sort_order' => ++$order_, 'created_by' => $by->id, 'created_at' => now(), 'updated_at' => now()]);
                $added++;
            }
            ProjectLog::record((int) $project->id, $by, 'scope.copied', 'project', (int) $project->id, null, ['from' => $order['number'], 'lines' => $added]);
        });

        return $added;
    }

    // ------------------------------------------------------------------ inside

    private function find(object $project, int $lineId): object
    {
        $this->needReady();

        return DB::table('project_scope_lines')->where('id', $lineId)->where('project_id', $project->id)->whereNull('deleted_at')->first() ?? throw new ProjectException('Not found.', 404);
    }

    /** @return array<string, mixed> */
    private function fields(object $project, array $d, ?object $l): array
    {
        $row = [];
        if ($l === null || array_key_exists('description', $d)) {
            $text = trim(preg_replace('/\s+/', ' ', (string) ($d['description'] ?? '')));
            if ($text === '') {
                throw new ProjectException('Describe the line.');
            }
            $row['description'] = mb_substr($text, 0, 300);
        }
        if (array_key_exists('code', $d)) {
            $row['code'] = trim((string) $d['code']) === '' ? null : mb_substr(trim((string) $d['code']), 0, 30);
        }
        if (array_key_exists('unit', $d)) {
            $row['unit'] = trim((string) $d['unit']) === '' ? null : mb_substr(trim((string) $d['unit']), 0, 20);
        }
        if (array_key_exists('quantity', $d)) {
            $q = $d['quantity'];
            if ($q !== null && $q !== '' && (float) $q < 0) {
                throw new ProjectException('A quantity cannot be below nothing.');
            }
            $row['quantity'] = $q === null || $q === '' ? null : round((float) $q, 4);
        }
        $unit = array_key_exists('unit', $row) ? $row['unit'] : ($l->unit ?? null);
        $qty = array_key_exists('quantity', $row) ? $row['quantity'] : ($l->quantity ?? null);
        if ($unit !== null && $qty === null) {
            throw new ProjectException('A line measured in a unit needs its quantity.');
        }
        if (array_key_exists('phase_id', $d)) {
            $phase = $d['phase_id'] ? (int) $d['phase_id'] : null;
            if ($phase && ! DB::table('project_phases')->where('id', $phase)->where('project_id', $project->id)->whereNull('deleted_at')->exists()) {
                throw new ProjectException("Choose one of this work's phases.");
            }
            $row['phase_id'] = $phase;
        }
        if (array_key_exists('voucher_item_id', $d)) {
            $item = $d['voucher_item_id'] ? (int) $d['voucher_item_id'] : null;
            if ($item && ! in_array($item, collect($this->orders($project))->flatMap(fn ($o) => array_column($o['lines'], 'id'))->all(), true)) {
                throw new ProjectException('Choose a line of a quotation or sales order linked to this work.');
            }
            $row['voucher_item_id'] = $item;
        }

        return $row;
    }

    private function percent(object $l): ?float
    {
        if ($l->unit === null) {
            return $l->done_percent !== null ? round((float) $l->done_percent, 1) : 0.0;
        }

        return $l->quantity !== null && (float) $l->quantity > 0 ? round(min(100, (float) $l->done_quantity / (float) $l->quantity * 100), 1) : null;
    }

    /** Overall progress: each line counts equally (no prices are kept here to weigh them). */
    private function overall($rows): ?float
    {
        $p = $rows->map(fn ($l) => $this->percent($l))->filter(fn ($v) => $v !== null);

        return $p->isEmpty() ? null : round($p->avg(), 1);
    }

    /** The quotations and sales orders linked to the work, with their lines, read from Books. @return array<int, array<string, mixed>> */
    private function orders(object $project): array
    {
        if (! Schema::hasTable('project_links') || ! Schema::hasTable('vouchers') || ! Schema::hasTable('voucher_items') || ! Schema::hasTable('voucher_types')) {
            return [];
        }
        $vouchers = DB::table('project_links as l')->join('vouchers as v', 'v.id', '=', 'l.linked_id')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id')
            ->where('l.project_id', $project->id)->where('l.module', 'books')->where('l.link_type', 'voucher')->whereNull('l.deleted_at')->where('v.status', '!=', 'cancelled')
            ->whereIn('t.base_type', ['sales_order', 'quotation'])->orderBy('v.id')->get(['v.id', 'v.voucher_number', 't.base_type']);
        $items = DB::table('voucher_items')->whereIn('voucher_id', $vouchers->pluck('id')->all() ?: [0])->where(fn ($q) => $q->whereNull('is_header')->orWhere('is_header', 0))
            ->orderBy('voucher_id')->orderBy('id')->get()->groupBy('voucher_id');

        return $vouchers->map(fn ($v) => ['id' => (int) $v->id, 'number' => $v->voucher_number, 'kind' => $v->base_type === 'sales_order' ? 'Sales order' : 'Quotation',
            'lines' => ($items[$v->id] ?? collect())->map(fn ($i) => $this->shapeItem($i, $v->voucher_number))->values()->all()])->all();
    }

    /** @return array<int, array<string, mixed>> */
    private function items(array $ids): array
    {
        if (! $ids || ! Schema::hasTable('voucher_items')) {
            return [];
        }
        $rows = DB::table('voucher_items as i')->join('vouchers as v', 'v.id', '=', 'i.voucher_id')->whereIn('i.id', $ids)->get(['i.*', 'v.voucher_number', 'v.status as voucher_status']);

        return $rows->mapWithKeys(fn ($i) => [(int) $i->id => $this->shapeItem($i, $i->voucher_number) + ['cancelled' => $i->voucher_status === 'cancelled']])->all();
    }

    /** @return array<string, mixed> */
    private function shapeItem(object $i, string $number): array
    {
        return ['id' => (int) $i->id, 'voucher' => $number, 'description' => $i->description ?? null, 'unit' => $i->unit_code ?? null,
            'quantity' => isset($i->quantity) ? (float) $i->quantity : null, 'rate' => isset($i->rate) ? (float) $i->rate : null, 'amount' => isset($i->amount) ? (float) $i->amount : null];
    }

    private function num(float $n): string
    {
        return rtrim(rtrim(number_format($n, 4, '.', ','), '0'), '.');
    }

    private function needReady(): void
    {
        if (! ProjectsSetup::work()) {
            throw new ProjectException('Scope lines need database script 261. Run it first.', 409);
        }
    }
}
