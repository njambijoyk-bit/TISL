<?php

namespace App\Services\Books;

use App\Models\User;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

/**
 * Budgets (database script 237): what a person plans to spend on an expense ledger group (and every group under it) or on one ledger, month by month, set against what
 * the books actually show. Read by the Visual reports "Budget against actual" chart; edited under Books -> Configuration -> Budgeting (books.planning).
 */
class BudgetService
{
    public static function ready(): bool
    {
        return Schema::hasTable('budget_lines');
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

    /** What can be budgeted: every expense ledger group, and every expense ledger. @return array{groups: array, ledgers: array} */
    public function choices(): array
    {
        $groups = collect(app(LedgerBalances::class)->groups())->where('nature', 'expense');
        $byId = $groups->keyBy('id');
        $path = function (array $g) use ($byId) {
            $names = [$g['name']];
            for ($n = 0; $g['parent_id'] && isset($byId[$g['parent_id']]) && $n < 12; $n++) {
                $g = $byId[$g['parent_id']];
                array_unshift($names, $g['name']);
            }

            return implode(' › ', $names);
        };
        $ledgers = collect(app(LedgerBalances::class)->ledgers())->where('nature', 'expense');

        return ['groups' => $groups->map(fn ($g) => ['id' => $g['id'], 'name' => $g['name'], 'path' => $path($g)])->sortBy('path')->values()->all(),
            'ledgers' => $ledgers->map(fn ($l) => ['id' => (int) $l->id, 'name' => $l->name, 'group' => $l->group_name])->sortBy('name')->values()->all()];
    }

    private function targetName(string $type, int $id): ?string
    {
        return $type === 'group' ? DB::table('ledger_groups')->where('id', $id)->value('name') : DB::table('ledgers')->where('id', $id)->value('name');
    }

    /**
     * The budget lines in a period, one row per target with its amounts by month.
     *
     * @return array<int, array{type: string, id: int, name: string, months: array<string, float>}>
     */
    public function lines(string $from, string $to): array
    {
        if (! self::ready()) {
            return [];
        }
        $rows = DB::table('budget_lines')->whereBetween('period', [substr($from, 0, 7), substr($to, 0, 7)])->orderBy('target_type')->orderBy('target_id')->orderBy('period')->get();
        $out = [];
        foreach ($rows as $r) {
            $k = "{$r->target_type}:{$r->target_id}";
            $out[$k] ??= ['type' => $r->target_type, 'id' => (int) $r->target_id, 'name' => $this->targetName($r->target_type, (int) $r->target_id) ?? "#{$r->target_id} (gone)", 'months' => []];
            $out[$k]['months'][$r->period] = (float) $r->amount;
        }

        return array_values($out);
    }

    /**
     * Save amounts: each row is a target and its amounts by month; an empty or zero amount removes that month. Nothing is written unless every row is valid.
     *
     * @param  array<int, array{type: string, id: int, months: array<string, mixed>}>  $rows
     */
    public function save(array $rows, ?User $by): void
    {
        abort_unless(self::ready(), 409, 'Run database script 237_planning.sql first.');
        $errors = [];
        $clean = [];
        foreach ($rows as $i => $r) {
            $type = (string) ($r['type'] ?? '');
            $id = (int) ($r['id'] ?? 0);
            if (! in_array($type, ['group', 'ledger'], true) || ! $this->targetName($type, $id)) {
                $errors["rows.{$i}"] = 'Choose a ledger group or ledger that exists.';
                continue;
            }
            $nature = $type === 'group' ? DB::table('ledger_groups')->where('id', $id)->value('nature') : DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->where('l.id', $id)->value('g.nature');
            if ($nature !== 'expense') {
                $errors["rows.{$i}"] = $this->targetName($type, $id) . ' is not an expense: budgets are for expenses.';
                continue;
            }
            foreach ((array) ($r['months'] ?? []) as $ym => $amount) {
                if (! preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', (string) $ym)) {
                    $errors["rows.{$i}.months"] = "{$ym} is not a month (use YYYY-MM).";
                    continue 2;
                }
                if ($amount !== null && $amount !== '' && (! is_numeric($amount) || (float) $amount < 0)) {
                    $errors["rows.{$i}.months.{$ym}"] = 'An amount cannot be negative.';
                    continue 2;
                }
                $clean[] = [$ym, $type, $id, $amount === null || $amount === '' ? 0.0 : round((float) $amount, 2)];
            }
        }
        if ($errors) {
            throw ValidationException::withMessages($errors);
        }
        DB::transaction(function () use ($clean, $by) {
            $now = now();
            foreach ($clean as [$ym, $type, $id, $amount]) {
                $where = ['period' => $ym, 'target_type' => $type, 'target_id' => $id];
                if ($amount <= 0) {
                    DB::table('budget_lines')->where($where)->delete();
                } elseif (DB::table('budget_lines')->where($where)->exists()) {
                    DB::table('budget_lines')->where($where)->update(['amount' => $amount, 'updated_at' => $now]);
                } else {
                    DB::table('budget_lines')->insert($where + ['amount' => $amount, 'created_by' => $by?->id, 'created_at' => $now, 'updated_at' => $now]);
                }
            }
        });
    }

    /** Remove a target's budget for a period (all its months). */
    public function remove(string $type, int $id, string $from, string $to): int
    {
        abort_unless(self::ready(), 409, 'Run database script 237_planning.sql first.');

        return DB::table('budget_lines')->where('target_type', $type)->where('target_id', $id)->whereBetween('period', [substr($from, 0, 7), substr($to, 0, 7)])->delete();
    }

    /**
     * Each budgeted target against what the books show in the same months: what was budgeted, what was spent, the gap, and the same by month. Spending is
     * what the target's ledgers (a group's include every group under it) were debited less credited.
     *
     * @return array{rows: array, months: array, totals: array}
     */
    public function against(Scope $scope, string $from, string $to): array
    {
        if (! self::ready()) {
            throw new \RuntimeException('Run database script 237_planning.sql, then set a budget under Books → Configuration → Budgeting.');
        }
        $lines = $this->lines($from, $to);
        $months = self::months($from, $to);
        $b = app(LedgerBalances::class);
        $settings = app(ReportSettings::class);
        $ledgerGroup = collect($b->ledgers())->pluck('group_id', 'id');
        $rows = [];
        $monthTotals = array_fill_keys($months, ['budget' => 0.0, 'actual' => 0.0]);
        foreach ($lines as $ln) {
            $ids = $ln['type'] === 'group'
                ? $ledgerGroup->filter(fn ($g) => in_array($g, $settings->withDescendants($ln['id']), true))->keys()->map(fn ($i) => (int) $i)->all()
                : [$ln['id']];
            $mv = $ids ? $b->movementByMonth($scope, $from, $to, $ids) : [];
            $per = [];
            foreach ($months as $ym) {
                $actual = 0.0;
                foreach ($ids as $id) {
                    $actual += ($mv[$id][$ym]['dr'] ?? 0) - ($mv[$id][$ym]['cr'] ?? 0);
                }
                $budget = (float) ($ln['months'][$ym] ?? 0);
                $per[] = ['month' => $ym, 'budget' => round($budget, 2), 'actual' => round($actual, 2)];
                $monthTotals[$ym]['budget'] += $budget;
                $monthTotals[$ym]['actual'] += $actual;
            }
            $budget = array_sum(array_column($per, 'budget'));
            $actual = array_sum(array_column($per, 'actual'));
            $rows[] = ['type' => $ln['type'], 'id' => $ln['id'], 'name' => $ln['name'], 'budget' => round($budget, 2), 'actual' => round($actual, 2), 'variance' => round($budget - $actual, 2),
                'used_pct' => $budget > 0.005 ? round($actual / $budget * 100, 1) : null, 'over' => $actual > $budget + 0.005, 'months' => $per];
        }
        usort($rows, fn ($x, $y) => $y['actual'] - $y['budget'] <=> $x['actual'] - $x['budget']);   // the biggest overspend first
        $tb = array_sum(array_column($rows, 'budget'));
        $ta = array_sum(array_column($rows, 'actual'));

        return ['rows' => $rows, 'months' => array_map(fn ($ym, $t) => ['month' => $ym, 'budget' => round($t['budget'], 2), 'actual' => round($t['actual'], 2)], array_keys($monthTotals), $monthTotals),
            'totals' => ['budget' => round($tb, 2), 'actual' => round($ta, 2), 'variance' => round($tb - $ta, 2), 'used_pct' => $tb > 0.005 ? round($ta / $tb * 100, 1) : null, 'over_count' => count(array_filter($rows, fn ($r) => $r['over']))]];
    }
}
