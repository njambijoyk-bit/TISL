<?php

namespace App\Services\Books;

use App\Models\Department;
use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Scope;
use App\Services\CostCentres\CostCentreService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Budgets (database scripts 237 and 239): what a person plans for an income, expense or balance-sheet ledger group (and every group under it) or one ledger, month by
 * month, optionally for one cost centre, department, branch and initiative, set against what the books show. A budget ROW is the target and its dimensions; its months are
 * budget_lines. A row marked Recovery is an expense expected to be credited back (travel recharged to a customer): it lowers the net spend on that account.
 * Read by the Visual reports "Budget against actual" chart; edited under Books -> Configuration -> Budgeting (books.planning).
 *
 * Actuals: a row's figure is read through LedgerBalances with the row's cost centre (a department's own cost centre when one is chosen, and everything under it) and branch.
 * An initiative is not on the posted entries yet, so a row with an initiative has no actual (`actual_pending`) until the books carry it.
 */
class BudgetService
{
    public const METHODS = ['manual', 'fixed', 'annual', 'seasonal', 'percent', 'quantity', 'history', 'copy'];

    private const SECTION = ['income' => 'income', 'expense' => 'expense', 'asset' => 'balance', 'liability' => 'balance', 'equity' => 'balance'];

    public static function ready(): bool
    {
        return Schema::hasTable('budget_lines') && Schema::hasTable('budget_rows') && Schema::hasColumn('budget_lines', 'row_id');
    }

    /** Months of a period as 'YYYY-MM'. @return string[] */
    public static function months(string $from, string $to): array
    {
        $out = [];
        for ($d = Carbon::parse($from)->startOfMonth(); $d->lte(Carbon::parse($to)); $d->addMonth()) {
            $out[] = $d->format('Y-m');
        }

        return $out;
    }

    private static function path(array $g, \Illuminate\Support\Collection $byId): string
    {
        $names = [$g['name']];
        for ($n = 0; $g['parent_id'] && isset($byId[$g['parent_id']]) && $n < 12; $n++) {
            $g = $byId[$g['parent_id']];
            array_unshift($names, $g['name']);
        }

        return implode(' › ', $names);
    }

    /** What can be budgeted and every dimension a row can carry. */
    public function choices(): array
    {
        $groups = collect(app(LedgerBalances::class)->groups());
        $ledgers = collect(app(LedgerBalances::class)->ledgers());
        $cc = app(CostCentreService::class);

        return [
            'groups' => $groups->map(fn ($g) => ['id' => $g['id'], 'name' => $g['name'], 'path' => self::path($g, $groups), 'nature' => $g['nature'], 'section' => self::SECTION[$g['nature']] ?? 'balance'])->sortBy('path')->values()->all(),
            'ledgers' => $ledgers->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name, 'group' => $l->group_name, 'nature' => $l->nature, 'section' => self::SECTION[$l->nature] ?? 'balance'])->sortBy('name')->values()->all(),
            'cost_centres' => $cc->booksReady() ? array_map(fn ($c) => ['id' => (int) $c['id'], 'name' => $c['name'], 'path' => $c['path'], 'depth' => $c['depth'], 'is_active' => (bool) ($c['is_active'] ?? true)], $cc->tree()) : [],
            'departments' => Department::ready() ? DB::table('departments as d')->leftJoin('locations as l', 'l.id', '=', 'd.location_id')->orderBy('l.name')->orderBy('d.name')
                ->get(['d.id', 'd.name', 'd.location_id', 'd.cost_centre_id', 'd.is_active', 'l.name as location'])->map(fn ($d) => ['id' => (int) $d->id, 'name' => $d->name, 'location_id' => $d->location_id ? (int) $d->location_id : null, 'location' => $d->location, 'cost_centre_id' => $d->cost_centre_id ? (int) $d->cost_centre_id : null, 'is_active' => (bool) $d->is_active])->all() : [],
            'locations' => Schema::hasTable('locations') ? DB::table('locations')->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name])->all() : [],
            'initiatives' => $this->initiatives(),
            'methods' => self::METHODS,
            'dimensions_ready' => $cc->booksReady(),
        ];
    }

    // ------------------------------------------------------------ initiatives

    /** Every initiative as a flat list in tree order, with its depth and path. @return array<int, array<string, mixed>> */
    public function initiatives(): array
    {
        if (! Schema::hasTable('budget_initiatives')) {
            return [];
        }
        $rows = DB::table('budget_initiatives')->orderBy('sort_order')->orderBy('name')->get();
        $used = DB::table('budget_rows')->whereNotNull('initiative_id')->pluck('initiative_id')->map(fn ($i) => (int) $i)->flip();
        $by = $rows->groupBy(fn ($r) => $r->parent_id ?? 0);
        $out = [];
        $walk = function ($parent, $depth, $path) use (&$walk, $by, &$out, $used) {
            foreach ($by[$parent] ?? [] as $r) {
                $full = $path ? $path . ' › ' . $r->name : $r->name;
                $out[] = ['id' => (int) $r->id, 'parent_id' => $r->parent_id ? (int) $r->parent_id : null, 'code' => $r->code, 'name' => $r->name, 'note' => $r->note, 'project_id' => $r->project_id ? (int) $r->project_id : null,
                    'is_active' => (bool) $r->is_active, 'depth' => $depth, 'path' => $full, 'has_children' => isset($by[$r->id]), 'in_use' => isset($used[(int) $r->id])];
                $walk($r->id, $depth + 1, $full);
            }
        };
        $walk(0, 0, '');

        return $out;
    }

    /** @return int[] an initiative and everything under it */
    public function initiativeWithDescendants(int $id): array
    {
        $ids = [$id];
        $frontier = [$id];
        for ($n = 0; $frontier && $n < 12; $n++) {
            $frontier = DB::table('budget_initiatives')->whereIn('parent_id', $frontier)->pluck('id')->map(fn ($i) => (int) $i)->all();
            $ids = array_merge($ids, $frontier);
        }

        return $ids;
    }

    public function saveInitiative(array $in, ?User $by, ?int $id = null): int
    {
        abort_unless(Schema::hasTable('budget_initiatives'), 409, 'Run database script 239_budgeting.sql first.');
        $name = trim((string) ($in['name'] ?? ''));
        $errors = [];
        if ($name === '' || mb_strlen($name) > 120) {
            $errors['name'] = 'Give the initiative a name (up to 120 characters).';
        }
        $parent = ! empty($in['parent_id']) ? (int) $in['parent_id'] : null;
        if ($parent !== null && ! DB::table('budget_initiatives')->where('id', $parent)->exists()) {
            $errors['parent_id'] = 'That parent initiative does not exist.';
        }
        if ($parent !== null && $id !== null && in_array($parent, $this->initiativeWithDescendants($id), true)) {
            $errors['parent_id'] = 'An initiative cannot sit under itself.';
        }
        $project = ! empty($in['project_id']) ? (int) $in['project_id'] : null;
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
        $row = ['parent_id' => $parent, 'code' => ($in['code'] ?? '') !== '' ? mb_substr((string) $in['code'], 0, 30) : null, 'name' => $name, 'note' => ($in['note'] ?? '') !== '' ? mb_substr((string) $in['note'], 0, 255) : null,
            'project_id' => $project, 'is_active' => array_key_exists('is_active', $in) ? (int) (bool) $in['is_active'] : 1, 'updated_at' => now()];
        if ($id !== null) {
            abort_unless(DB::table('budget_initiatives')->where('id', $id)->exists(), 404);
            DB::table('budget_initiatives')->where('id', $id)->update($row);

            return $id;
        }

        return (int) DB::table('budget_initiatives')->insertGetId($row + ['created_by' => $by?->id, 'created_at' => now()]);
    }

    /** Remove an initiative nobody uses and nothing sits under; one that is in use is switched off instead. @return string 'removed'|'switched_off' */
    public function removeInitiative(int $id): string
    {
        abort_unless(DB::table('budget_initiatives')->where('id', $id)->exists(), 404);
        if (DB::table('budget_initiatives')->where('parent_id', $id)->exists()) {
            throw ValidationException::withMessages(['id' => 'Move or remove the initiatives under it first.']);
        }
        if (DB::table('budget_rows')->where('initiative_id', $id)->exists()) {
            DB::table('budget_initiatives')->where('id', $id)->update(['is_active' => 0, 'updated_at' => now()]);

            return 'switched_off';
        }
        DB::table('budget_initiatives')->where('id', $id)->delete();

        return 'removed';
    }

    // ------------------------------------------------------------ rows

    private function targetInfo(string $type, int $id): ?array
    {
        $r = $type === 'group'
            ? DB::table('ledger_groups')->where('id', $id)->first(['name', 'nature'])
            : DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->where('l.id', $id)->first(['l.name', 'g.nature']);

        return $r ? ['name' => $r->name, 'nature' => $r->nature, 'section' => self::SECTION[$r->nature] ?? 'balance'] : null;
    }

    public static function dimKey(?int $cc, ?int $dep, ?int $loc, ?int $ini, bool $recovery): string
    {
        return implode('-', [(int) $cc, (int) $dep, (int) $loc, (int) $ini, (int) $recovery]);
    }

    /**
     * The budget rows with months in a period.
     *
     * @return array<int, array<string, mixed>>
     */
    public function lines(string $from, string $to): array
    {
        if (! self::ready()) {
            return [];
        }
        $rows = DB::table('budget_rows')->orderBy('target_type')->orderBy('target_id')->orderBy('id')->get();
        $withMonths = DB::table('budget_lines')->distinct()->pluck('row_id')->flip();   // rows that have amounts in some period
        $months = DB::table('budget_lines')->whereBetween('period', [substr($from, 0, 7), substr($to, 0, 7)])->orderBy('period')->get()->groupBy('row_id');
        $names = [];
        foreach (['cost_centres' => 'cost_centre_id', 'departments' => 'department_id', 'locations' => 'location_id', 'budget_initiatives' => 'initiative_id'] as $table => $col) {
            $ids = $rows->pluck($col)->filter()->unique()->all();
            $names[$col] = $ids && Schema::hasTable($table) ? DB::table($table)->whereIn('id', $ids)->pluck('name', 'id')->all() : [];
        }
        $out = [];
        foreach ($rows as $r) {
            $info = $this->targetInfo($r->target_type, (int) $r->target_id);
            $m = [];
            foreach ($months[$r->id] ?? [] as $ln) {
                $m[$ln->period] = (float) $ln->amount;
            }
            if (! isset($months[$r->id]) && isset($withMonths[$r->id])) {
                continue;   // it has amounts, but in other years: not part of this one (a row with no amounts anywhere is new, and is shown)
            }
            $out[] = ['id' => (int) $r->id, 'type' => $r->target_type, 'target_id' => (int) $r->target_id, 'name' => $info['name'] ?? "#{$r->target_id} (gone)", 'nature' => $info['nature'] ?? null, 'section' => $info['section'] ?? 'balance',
                'cost_centre_id' => $r->cost_centre_id ? (int) $r->cost_centre_id : null, 'department_id' => $r->department_id ? (int) $r->department_id : null, 'location_id' => $r->location_id ? (int) $r->location_id : null,
                'initiative_id' => $r->initiative_id ? (int) $r->initiative_id : null, 'is_recovery' => (bool) $r->is_recovery, 'method' => $r->method, 'method_params' => $r->method_params ? json_decode($r->method_params, true) : null, 'note' => $r->note,
                'dimensions' => array_values(array_filter([$names['cost_centre_id'][$r->cost_centre_id] ?? null, $names['department_id'][$r->department_id] ?? null, $names['location_id'][$r->location_id] ?? null, $names['initiative_id'][$r->initiative_id] ?? null])),
                'months' => $m];
        }

        return $out;
    }

    /**
     * Save rows: each is a target (group or ledger), its dimensions, whether it is a recovery, how it was filled and its amounts by month (an empty or zero amount removes that
     * month). A row with an id is updated; without one it is found by its combination or made. Nothing is written unless every row is valid.
     *
     * @param  array<int, array<string, mixed>>  $rows
     * @return int[] the ids of the rows saved, in order
     */
    public function save(array $rows, ?User $by): array
    {
        abort_unless(self::ready(), 409, 'Run database script 239_budgeting.sql first.');
        $errors = [];
        $clean = [];
        foreach ($rows as $i => $r) {
            $type = (string) ($r['type'] ?? '');
            $tid = (int) ($r['target_id'] ?? $r['id'] ?? 0);
            $rowId = ! empty($r['row_id']) ? (int) $r['row_id'] : null;
            $info = in_array($type, ['group', 'ledger'], true) ? $this->targetInfo($type, $tid) : null;
            if (! $info) {
                $errors["rows.{$i}"] = 'Choose a ledger group or ledger that exists.';
                continue;
            }
            $dim = [];
            foreach (['cost_centre_id' => 'cost_centres', 'department_id' => 'departments', 'location_id' => 'locations', 'initiative_id' => 'budget_initiatives'] as $col => $table) {
                $v = ! empty($r[$col]) ? (int) $r[$col] : null;
                if ($v !== null && (! Schema::hasTable($table) || ! DB::table($table)->where('id', $v)->exists())) {
                    $errors["rows.{$i}.{$col}"] = 'That choice no longer exists.';
                    continue 2;
                }
                $dim[$col] = $v;
            }
            $recovery = ! empty($r['is_recovery']);
            if ($recovery && $info['section'] !== 'expense') {
                $errors["rows.{$i}.is_recovery"] = 'Only an expense can be a recovery.';
                continue;
            }
            $method = (string) ($r['method'] ?? 'manual');
            if (! in_array($method, self::METHODS, true)) {
                $errors["rows.{$i}.method"] = 'Unknown way of filling the months.';
                continue;
            }
            $months = [];
            foreach ((array) ($r['months'] ?? []) as $ym => $amount) {
                if (! preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', (string) $ym)) {
                    $errors["rows.{$i}.months"] = "{$ym} is not a month (use YYYY-MM).";
                    continue 2;
                }
                if ($amount !== null && $amount !== '' && (! is_numeric($amount) || (float) $amount < 0)) {
                    $errors["rows.{$i}.months.{$ym}"] = 'An amount cannot be negative.';
                    continue 2;
                }
                $months[$ym] = $amount === null || $amount === '' ? 0.0 : round((float) $amount, 2);
            }
            $clean[$i] = ['row_id' => $rowId, 'type' => $type, 'target' => $tid, 'dim' => $dim, 'recovery' => $recovery, 'method' => $method, 'params' => isset($r['method_params']) && is_array($r['method_params']) ? json_encode($r['method_params']) : null,
                'note' => ($r['note'] ?? '') !== '' ? mb_substr((string) $r['note'], 0, 160) : null, 'months' => $months];
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
        $ids = [];
        DB::transaction(function () use ($clean, $by, &$ids) {
            $now = now();
            foreach ($clean as $c) {
                $key = self::dimKey($c['dim']['cost_centre_id'], $c['dim']['department_id'], $c['dim']['location_id'], $c['dim']['initiative_id'], $c['recovery']);
                $fields = ['target_type' => $c['type'], 'target_id' => $c['target']] + $c['dim'] + ['is_recovery' => (int) $c['recovery'], 'method' => $c['method'], 'method_params' => $c['params'], 'dim_key' => $key, 'note' => $c['note'], 'updated_at' => $now];
                $existing = $c['row_id'] ?? DB::table('budget_rows')->where(['target_type' => $c['type'], 'target_id' => $c['target'], 'dim_key' => $key])->value('id');
                if ($existing) {
                    $clash = DB::table('budget_rows')->where(['target_type' => $c['type'], 'target_id' => $c['target'], 'dim_key' => $key])->where('id', '!=', $existing)->exists();
                    if ($clash) {
                        throw ValidationException::withMessages(['rows' => 'There is already a row for that account with the same cost centre, department, branch, initiative and recovery setting.']);
                    }
                    DB::table('budget_rows')->where('id', $existing)->update($fields);
                    $rowId = (int) $existing;
                } else {
                    $rowId = (int) DB::table('budget_rows')->insertGetId($fields + ['created_by' => $by?->id, 'created_at' => $now]);
                }
                $ids[] = $rowId;
                foreach ($c['months'] as $ym => $amount) {
                    $where = ['row_id' => $rowId, 'period' => $ym];
                    if ($amount <= 0) {
                        DB::table('budget_lines')->where($where)->delete();
                    } elseif (DB::table('budget_lines')->where($where)->exists()) {
                        DB::table('budget_lines')->where($where)->update(['amount' => $amount, 'updated_at' => $now]);
                    } else {
                        DB::table('budget_lines')->insert($where + ['target_type' => $c['type'], 'target_id' => $c['target'], 'amount' => $amount, 'created_by' => $by?->id, 'created_at' => $now, 'updated_at' => $now]);
                    }
                }
            }
        });

        return $ids;
    }

    /** Remove a row and all its months. */
    public function remove(int $rowId): int
    {
        abort_unless(self::ready(), 409, 'Run database script 239_budgeting.sql first.');
        $n = DB::table('budget_lines')->where('row_id', $rowId)->delete();
        DB::table('budget_rows')->where('id', $rowId)->delete();

        return $n;
    }

    // ------------------------------------------------------------ actuals

    /** The sign that makes an account's movement read as the figure a person budgets: spend and assets are debits less credits, earnings and liabilities credits less debits. */
    private static function sign(?string $nature): int
    {
        return in_array($nature, ['income', 'liability', 'equity'], true) ? -1 : 1;
    }

    /** The ledgers a row covers (a group's include every group under it). @return int[] */
    private function ledgerIds(string $type, int $id, \Illuminate\Support\Collection $ledgerGroup): array
    {
        return $type === 'group'
            ? $ledgerGroup->filter(fn ($g) => in_array($g, app(ReportSettings::class)->withDescendants($id), true))->keys()->map(fn ($i) => (int) $i)->all()
            : [$id];
    }

    /** The scope a row's figures are read in: its cost centre (a department's own wins) and branch. */
    private function scopeFor(array $row, string $from, string $to): Scope
    {
        $cc = null;
        if (! empty($row['department_id']) && Department::ready()) {
            $cc = DB::table('departments')->where('id', $row['department_id'])->value('cost_centre_id');
        }
        $cc ??= $row['cost_centre_id'] ?? null;

        return Scope::fromInput(['from' => $from, 'to' => $to, 'cost_centre_id' => $cc, 'location_id' => $row['location_id'] ?? null]);
    }

    /** What a row's account actually did in each month, as the figure a person budgets. @return array<string, float> */
    public function actualMonths(array $row, string $from, string $to): array
    {
        $b = app(LedgerBalances::class);
        $ids = $this->ledgerIds($row['type'], (int) $row['target_id'], collect($b->ledgers())->pluck('group_id', 'id'));
        $mv = $ids ? $b->movementByMonth($this->scopeFor($row, $from, $to), $from, $to, $ids) : [];
        $sign = self::sign($row['nature'] ?? null);
        $out = [];
        foreach (self::months($from, $to) as $ym) {
            $v = 0.0;
            foreach ($ids as $id) {
                $v += $sign * (($mv[$id][$ym]['dr'] ?? 0) - ($mv[$id][$ym]['cr'] ?? 0));
            }
            $out[$ym] = round($v, 2);
        }

        return $out;
    }

    /** Last year's actuals by month for a row, to start "last year plus growth" from. @return array<string, float> keyed by the month of the year asked for */
    public function history(array $row, int $year): array
    {
        $info = $this->targetInfo((string) $row['type'], (int) $row['target_id']);
        abort_unless($info, 422, 'Choose a ledger group or ledger that exists.');
        $prev = $year - 1;
        $actual = $this->actualMonths($row + ['nature' => $info['nature']], "{$prev}-01-01", "{$prev}-12-31");
        $out = [];
        foreach ($actual as $ym => $v) {
            $out[$year . substr($ym, 4)] = $v;
        }

        return $out;
    }

    /**
     * Each budgeted account (with the same dimensions) against what the books show in the same months: what was budgeted, what happened, the gap and the same by month.
     * Rows on the same account and dimensions, an expense and its recovery, are one line whose budget is the expense less the recovery.
     * `$sections` limits it to some of income, expense and balance.
     *
     * @param  string[]|null  $sections
     * @return array{rows: array, months: array, totals: array}
     */
    public function against(Scope $scope, string $from, string $to, ?array $sections = null): array
    {
        if (! self::ready()) {
            throw new \RuntimeException('Run database script 239_budgeting.sql, then set a budget under Books → Configuration → Budgeting.');
        }
        $lines = collect($this->lines($from, $to))->when($sections, fn ($c) => $c->whereIn('section', $sections));
        $months = self::months($from, $to);
        $rows = [];
        $monthTotals = array_fill_keys($months, ['budget' => 0.0, 'actual' => 0.0]);
        $groups = $lines->groupBy(fn ($l) => implode('|', [$l['type'], $l['target_id'], $l['cost_centre_id'], $l['department_id'], $l['location_id'], $l['initiative_id']]));
        foreach ($groups as $set) {
            $ln = $set->first();
            $pending = $ln['initiative_id'] !== null;
            $actualByMonth = $pending ? array_fill_keys($months, 0.0) : $this->actualMonths($ln, $from, $to);
            $per = [];
            foreach ($months as $ym) {
                $budget = 0.0;
                foreach ($set as $s) {
                    $budget += ($s['is_recovery'] ? -1 : 1) * (float) ($s['months'][$ym] ?? 0);
                }
                $actual = (float) $actualByMonth[$ym];
                $per[] = ['month' => $ym, 'budget' => round($budget, 2), 'actual' => round($actual, 2)];
                $monthTotals[$ym]['budget'] += $budget;
                $monthTotals[$ym]['actual'] += $actual;
            }
            $budget = array_sum(array_column($per, 'budget'));
            $actual = array_sum(array_column($per, 'actual'));
            $expense = $ln['section'] === 'expense';
            $rows[] = ['type' => $ln['type'], 'id' => $ln['target_id'], 'name' => $ln['name'], 'section' => $ln['section'], 'dimensions' => $ln['dimensions'], 'has_recovery' => $set->contains('is_recovery', true),
                'budget' => round($budget, 2), 'actual' => round($actual, 2), 'variance' => round($budget - $actual, 2), 'used_pct' => abs($budget) > 0.005 ? round($actual / $budget * 100, 1) : null,
                'over' => $expense && $actual > $budget + 0.005, 'actual_pending' => $pending, 'months' => $per];
        }
        usort($rows, fn ($x, $y) => $y['actual'] - $y['budget'] <=> $x['actual'] - $x['budget']);   // the biggest overspend first
        $tb = array_sum(array_column($rows, 'budget'));
        $ta = array_sum(array_column($rows, 'actual'));

        return ['rows' => $rows, 'months' => array_map(fn ($ym, $t) => ['month' => $ym, 'budget' => round($t['budget'], 2), 'actual' => round($t['actual'], 2)], array_keys($monthTotals), $monthTotals),
            'totals' => ['budget' => round($tb, 2), 'actual' => round($ta, 2), 'variance' => round($tb - $ta, 2), 'used_pct' => $tb > 0.005 ? round($ta / $tb * 100, 1) : null, 'over_count' => count(array_filter($rows, fn ($r) => $r['over']))]];
    }
}
