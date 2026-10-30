<?php

namespace App\Services\Books;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Budget templates (database script 241): a reusable structure made from a budget version and used to start a new budget. A template line is an account with its dimensions, whether
 * it is a recovery and HOW its months are filled; the months themselves are worked out for the new budget when it is made, so one template serves every year or branch.
 */
class BudgetTemplateService
{
    public function __construct(private BudgetService $budgets) {}

    public static function ready(): bool
    {
        return Schema::hasTable('budget_templates') && Schema::hasTable('budget_template_lines');
    }

    /** @return array<int, array<string, mixed>> */
    public function templates(): array
    {
        if (! self::ready()) {
            return [];
        }
        $counts = DB::table('budget_template_lines')->selectRaw('template_id, COUNT(*) AS n')->groupBy('template_id')->pluck('n', 'template_id');

        return DB::table('budget_templates')->where('is_active', 1)->orderBy('name')->get()->map(fn ($t) => ['id' => (int) $t->id, 'name' => $t->name, 'description' => $t->description, 'type' => $t->budget_type, 'lines' => (int) ($counts[$t->id] ?? 0)])->all();
    }

    /** The lines of a template, named. @return array<int, array<string, mixed>> */
    public function lines(int $templateId): array
    {
        abort_unless(DB::table('budget_templates')->where('id', $templateId)->exists(), 404, 'That template does not exist.');
        $ch = $this->budgets->choices();
        $groups = collect($ch['groups'])->keyBy('id');
        $ledgers = collect($ch['ledgers'])->keyBy('id');
        $dim = fn (string $key, array $list, ?int $id) => $id ? ($list[$id] ?? "#{$id} (gone)") : null;
        $cc = collect($ch['cost_centres'])->pluck('name', 'id')->all();
        $dep = collect($ch['departments'])->pluck('name', 'id')->all();
        $loc = collect($ch['locations'])->pluck('name', 'id')->all();
        $ini = collect($ch['initiatives'])->pluck('name', 'id')->all();

        return DB::table('budget_template_lines')->where('template_id', $templateId)->orderBy('sort_order')->orderBy('id')->get()->map(function ($l) use ($groups, $ledgers, $dim, $cc, $dep, $loc, $ini) {
            $t = $l->target_type === 'group' ? $groups->get((int) $l->target_id) : $ledgers->get((int) $l->target_id);

            return ['id' => (int) $l->id, 'type' => $l->target_type, 'target_id' => (int) $l->target_id, 'name' => $t ? ($t['path'] ?? $t['name']) : "#{$l->target_id} (gone)", 'section' => $t['section'] ?? 'balance', 'is_recovery' => (bool) $l->is_recovery,
                'method' => $l->method, 'method_params' => $l->method_params ? json_decode($l->method_params, true) : null, 'note' => $l->note,
                'dimensions' => array_values(array_filter([$dim('cc', $cc, $l->cost_centre_id), $dim('dep', $dep, $l->department_id), $dim('loc', $loc, $l->location_id), $dim('ini', $ini, $l->initiative_id)]))];
        })->all();
    }

    /** Save what is in a budget version as a template: every row, with how its months were filled (a hand-typed row keeps no amounts, a copy of another row cannot be repeated). */
    public function saveFromVersion(int $versionId, array $in, ?User $by): int
    {
        abort_unless(self::ready(), 409, 'Run database script 241_budget_templates.sql first.');
        abort_unless(DB::table('budget_versions')->where('id', $versionId)->exists(), 404, 'That budget version does not exist.');
        $name = trim((string) ($in['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 120) {
            throw ValidationException::withMessages(['name' => 'Give the template a name (up to 120 characters).']);
        }
        $rows = DB::table('budget_rows')->where('version_id', $versionId)->orderBy('id')->get();
        if ($rows->isEmpty()) {
            throw ValidationException::withMessages(['name' => 'There are no rows in this version to make a template from.']);
        }
        $type = (string) (DB::table('budgets as b')->join('budget_versions as v', 'v.budget_id', '=', 'b.id')->where('v.id', $versionId)->value('b.budget_type') ?? 'operating');

        return DB::transaction(function () use ($rows, $name, $in, $by, $type) {
            $tid = (int) DB::table('budget_templates')->insertGetId(['name' => $name, 'description' => ($in['description'] ?? '') !== '' ? mb_substr((string) $in['description'], 0, 255) : null, 'budget_type' => $type, 'created_by' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
            $map = [];   // budget row id -> template line id
            foreach ($rows as $i => $r) {
                $method = in_array($r->method, ['copy'], true) ? 'manual' : $r->method;
                $map[(int) $r->id] = (int) DB::table('budget_template_lines')->insertGetId(['template_id' => $tid, 'target_type' => $r->target_type, 'target_id' => $r->target_id, 'cost_centre_id' => $r->cost_centre_id, 'department_id' => $r->department_id,
                    'location_id' => $r->location_id, 'initiative_id' => $r->initiative_id, 'is_recovery' => $r->is_recovery, 'method' => $method, 'method_params' => $method === 'manual' ? null : $r->method_params, 'note' => $r->note, 'sort_order' => $i, 'created_at' => now(), 'updated_at' => now()]);
            }
            foreach (DB::table('budget_template_lines')->where('template_id', $tid)->where('method', 'percent')->get() as $l) {   // the row a percent was taken of is now a template line
                $p = json_decode((string) $l->method_params, true) ?: [];
                $of = isset($p['of']) ? (int) ltrim((string) $p['of'], 'r') : 0;
                unset($p['of']);
                if (isset($map[$of])) {
                    DB::table('budget_template_lines')->where('id', $l->id)->update(['method_params' => json_encode($p + ['of_line' => $map[$of]])]);
                } else {
                    DB::table('budget_template_lines')->where('id', $l->id)->update(['method' => 'manual', 'method_params' => null]);
                }
            }

            return $tid;
        });
    }

    public function update(int $id, array $in): void
    {
        abort_unless(DB::table('budget_templates')->where('id', $id)->exists(), 404, 'That template does not exist.');
        $name = trim((string) ($in['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 120) {
            throw ValidationException::withMessages(['name' => 'Give the template a name (up to 120 characters).']);
        }
        DB::table('budget_templates')->where('id', $id)->update(['name' => $name, 'description' => ($in['description'] ?? '') !== '' ? mb_substr((string) $in['description'], 0, 255) : null, 'updated_at' => now()]);
    }

    public function removeLine(int $templateId, int $lineId): void
    {
        abort_unless(DB::table('budget_template_lines')->where('id', $lineId)->where('template_id', $templateId)->delete(), 404, 'That line is not in this template.');
    }

    public function delete(int $id): void
    {
        abort_unless(DB::table('budget_templates')->where('id', $id)->exists(), 404, 'That template does not exist.');
        DB::transaction(function () use ($id) {
            DB::table('budget_template_lines')->where('template_id', $id)->delete();
            DB::table('budget_templates')->where('id', $id)->delete();
        });
    }

    /**
     * Make a new budget from a template: a budget and its draft Original, with a row for every template line and its months worked out over the new budget's months.
     * A percent line takes its percent of the line it names; a history line reads last year's actuals for each year the budget covers; a hand-typed line starts empty.
     */
    public function createBudget(int $templateId, array $in, ?User $by): int
    {
        abort_unless(self::ready(), 409, 'Run database script 241_budget_templates.sql first.');
        $t = DB::table('budget_templates')->where('id', $templateId)->first();
        abort_unless($t, 404, 'That template does not exist.');
        $lines = DB::table('budget_template_lines')->where('template_id', $templateId)->orderBy('sort_order')->orderBy('id')->get();

        return DB::transaction(function () use ($t, $lines, $in, $by) {
            $b = $this->budgets->createBudget(['budget_type' => $t->budget_type, 'note' => 'From the template ' . $t->name] + $in, $by);
            $version = (int) $this->budgets->currentVersion($b);
            $months = BudgetService::months($in['from_month'] . '-01', $in['to_month'] . '-01');
            $years = array_values(array_unique(array_map(fn ($m) => (int) substr($m, 0, 4), $months)));
            $done = [];   // template line id -> months
            $order = $lines->sortBy(fn ($l) => $l->method === 'percent' ? 1 : 0)->values();   // percents last, so what they are a percent of exists
            foreach ($order as $l) {
                $p = $l->method_params ? json_decode($l->method_params, true) : [];
                $history = null;
                if ($l->method === 'history') {
                    $history = [];
                    foreach ($years as $y) {
                        $history += $this->budgets->history(['type' => $l->target_type, 'target_id' => $l->target_id, 'cost_centre_id' => $l->cost_centre_id, 'department_id' => $l->department_id, 'location_id' => $l->location_id], $y);
                    }
                }
                $other = $l->method === 'percent' ? ($done[(int) ($p['of_line'] ?? 0)] ?? null) : null;
                $done[(int) $l->id] = BudgetMethods::fill($l->method, $p, $months, $other, $history) ?? [];
            }
            $ids = $this->budgets->save($lines->map(fn ($l) => ['type' => $l->target_type, 'target_id' => $l->target_id, 'cost_centre_id' => $l->cost_centre_id, 'department_id' => $l->department_id, 'location_id' => $l->location_id,
                'initiative_id' => $l->initiative_id, 'is_recovery' => (bool) $l->is_recovery, 'method' => $l->method, 'method_params' => $l->method_params ? json_decode($l->method_params, true) : null, 'note' => $l->note,
                'months' => $done[(int) $l->id] ?? []])->all(), $by, $version);
            $rowOf = [];   // template line id -> the new row's id, so a percent can point at its row on the screen
            foreach ($lines->values() as $i => $l) {
                $rowOf[(int) $l->id] = $ids[$i] ?? null;
            }
            foreach ($lines->values() as $i => $l) {
                if ($l->method !== 'percent' || ! isset($ids[$i])) {
                    continue;
                }
                $p = json_decode((string) $l->method_params, true) ?: [];
                $target = $rowOf[(int) ($p['of_line'] ?? 0)] ?? null;
                unset($p['of_line']);
                DB::table('budget_rows')->where('id', $ids[$i])->update(['method_params' => json_encode($target ? $p + ['of' => 'r' . $target] : $p)]);
            }

            return $b;
        });
    }
}
