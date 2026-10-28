<?php

namespace App\Services\Books\Engine;

use App\Models\Books\Voucher;
use App\Services\Access\BranchFilter;
use App\Services\Books\RestatedBase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The one place that adds up ledger balances for the reports.
 *
 *  - Dated: every figure is "as of" or "from to"; nothing means "today" unless asked to.
 *  - Branch-aware: the person's branch limit applies the same way to every figure, so two figures never come from different bases.
 *  - Dimensions on entry lines: a cost centre or branch narrows `voucher_entries`, never the voucher header (see Scope).
 *  - One currency rule: every amount is in today's base currency (RestatedBase).
 *
 * Balances are signed: debit positive, credit negative. Only posted vouchers count.
 */
final class LedgerBalances
{
    /** @var array<string, bool> */
    private static array $has = [];

    /** Does a column exist yet? (script 227 adds ledgers.statement_id; the engine must not break before it is run.) Remembered for the process. */
    public static function hasColumn(string $table, string $column): bool
    {
        return self::$has["{$table}.{$column}"] ??= Schema::hasColumn($table, $column);
    }

    /** Forget what was learnt about the schema (tests build their tables after the first look). */
    public static function forget(): void
    {
        self::$has = [];
    }

    /**
     * Every ledger with its group and statement line.
     * `statement_id` is the ledger's own line, or its group's when it has none; null until script 227 has been run.
     *
     * @return array<int, object>
     */
    public function ledgers(): array
    {
        $own = self::hasColumn('ledgers', 'statement_id');
        $grp = self::hasColumn('ledger_groups', 'statement_id');
        $cols = ['l.id', 'l.name', 'l.group_id', 'l.opening_balance', 'l.opening_side', 'g.name as group_name', 'g.nature', 'g.affects_gross_profit', 'g.parent_id']
            + ($own ? [9 => 'l.statement_id as own_statement_id'] : []) + ($grp ? [10 => 'g.statement_id as group_statement_id'] : []);
        $rows = DB::table('ledgers as l')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')->select(array_values($cols))->orderBy('g.name')->orderBy('l.name')->get();

        return $rows->map(function ($r) {
            $r->statement_id = ($r->own_statement_id ?? null) ?: ($r->group_statement_id ?? null);

            return $r;
        })->all();
    }

    /** A ledger's opening balance, signed (debit positive). A cost centre or branch is chosen: the opening belongs to the whole business, so 0. */
    public function opening(object $ledger, Scope $scope): float
    {
        if ($scope->dimensional()) {
            return 0.0;
        }
        $o = (float) $ledger->opening_balance;

        return $ledger->opening_side === 'C' ? -$o : $o;
    }

    /**
     * What each ledger moved inside a period, from posted vouchers.
     * `$from`/`$to` are inclusive; `$before` counts only vouchers dated before it (used to roll an opening balance forward).
     *
     * @param  int[]|null  $ledgerIds  only these ledgers
     * @return array<int, array{dr: float, cr: float}> by ledger id
     */
    public function movement(Scope $scope, ?string $from, ?string $to, ?string $before = null, ?array $ledgerIds = null): array
    {
        $b = RestatedBase::entry();
        $q = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))
            ->where('v.status', Voucher::POSTED)
            ->selectRaw("e.ledger_id, SUM(CASE WHEN e.side='D' THEN {$b} ELSE 0 END) AS dr, SUM(CASE WHEN e.side='C' THEN {$b} ELSE 0 END) AS cr")
            ->groupBy('e.ledger_id');
        if ($ledgerIds !== null) {
            $q->whereIn('e.ledger_id', $ledgerIds ?: [0]);
        }
        if ($from) {
            $q->where('v.date', '>=', $from);
        }
        if ($to) {
            $q->where('v.date', '<=', $to);
        }
        if ($before) {
            $q->where('v.date', '<', $before);
        }
        if ($scope->costCentreIds !== null) {
            $q->whereIn('e.cost_centre_id', $scope->costCentreIds);
        }
        if ($scope->locationId !== null) {
            $q->where('e.location_id', $scope->locationId);
        }
        app(BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'engine');

        return $q->get()->keyBy('ledger_id')->map(fn ($r) => ['dr' => (float) $r->dr, 'cr' => (float) $r->cr])->all();
    }

    /**
     * What each ledger moved in each month of a period (same rules as movement()).
     *
     * @param  int[]|null  $ledgerIds
     * @return array<int, array<string, array{dr: float, cr: float}>> by ledger id, then 'YYYY-MM'
     */
    public function movementByMonth(Scope $scope, ?string $from, ?string $to, ?array $ledgerIds = null): array
    {
        $b = RestatedBase::entry();
        $q = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))
            ->where('v.status', Voucher::POSTED)
            ->selectRaw("e.ledger_id, SUBSTR(v.date, 1, 7) AS ym, SUM(CASE WHEN e.side='D' THEN {$b} ELSE 0 END) AS dr, SUM(CASE WHEN e.side='C' THEN {$b} ELSE 0 END) AS cr")
            ->groupBy('e.ledger_id', DB::raw('SUBSTR(v.date, 1, 7)'));
        if ($ledgerIds !== null) {
            $q->whereIn('e.ledger_id', $ledgerIds ?: [0]);
        }
        if ($from) {
            $q->where('v.date', '>=', $from);
        }
        if ($to) {
            $q->where('v.date', '<=', $to);
        }
        if ($scope->costCentreIds !== null) {
            $q->whereIn('e.cost_centre_id', $scope->costCentreIds);
        }
        if ($scope->locationId !== null) {
            $q->where('e.location_id', $scope->locationId);
        }
        app(BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'engine');
        $out = [];
        foreach ($q->get() as $r) {
            $out[(int) $r->ledger_id][(string) $r->ym] = ['dr' => (float) $r->dr, 'cr' => (float) $r->cr];
        }

        return $out;
    }

    /** The first day of the financial year a date falls in; the first of January of its year when no financial year covers it. */
    public function yearStart(string $date): string
    {
        $start = DB::table('financial_years')->where('start_date', '<=', $date)->where('end_date', '>=', $date)->orderByDesc('start_date')->value('start_date');

        return $start ? substr((string) $start, 0, 10) : substr($date, 0, 4) . '-01-01';
    }

    /**
     * The ledger groups, for views that add ledgers up by group.
     *
     * @return array<int, array{id: int, parent_id: ?int, name: string, nature: string}> by id, in the order of the chart
     */
    public function groups(): array
    {
        $out = [];
        foreach (DB::table('ledger_groups')->orderBy('sort_order')->orderBy('name')->get(['id', 'parent_id', 'name', 'nature']) as $g) {
            $out[(int) $g->id] = ['id' => (int) $g->id, 'parent_id' => $g->parent_id ? (int) $g->parent_id : null, 'name' => $g->name, 'nature' => $g->nature];
        }

        return $out;
    }

    /**
     * One ledger's balance as of a date: its opening balance plus every posted entry up to and including that date.
     * Unlike the old LedgerService::balance(), the person's branch limit applies.
     */
    public function balance(int $ledgerId, ?string $asOf = null, ?Scope $scope = null): float
    {
        $scope ??= Scope::dates(null, null);
        $ledger = DB::table('ledgers')->where('id', $ledgerId)->first(['id', 'opening_balance', 'opening_side']);
        if (! $ledger) {
            return 0.0;
        }
        $m = $this->movement($scope, null, $asOf, null, [$ledgerId])[$ledgerId] ?? ['dr' => 0.0, 'cr' => 0.0];

        return round($this->opening($ledger, $scope) + $m['dr'] - $m['cr'], 2);
    }

    /**
     * Every ledger's balance as of a date, signed, with no zero rows left out.
     *
     * @return array<int, float> by ledger id
     */
    public function balances(Scope $scope, ?string $asOf): array
    {
        $mv = $this->movement($scope, null, $asOf);
        $out = [];
        foreach ($this->ledgers() as $l) {
            $out[(int) $l->id] = round($this->opening($l, $scope) + ($mv[$l->id]['dr'] ?? 0) - ($mv[$l->id]['cr'] ?? 0), 2);
        }

        return $out;
    }

    /**
     * The trial balance rows for the scope's period: each ledger's opening (its own plus everything before the start date), debit, credit and
     * closing. A ledger with no opening and no movement is left out.
     *
     * @return array{rows: array<int, array>, total_debit: float, total_credit: float}
     */
    public function trial(Scope $scope): array
    {
        $prior = $scope->from ? $this->movement($scope, null, null, $scope->from) : [];
        $mv = $this->movement($scope, $scope->from, $scope->to);
        $rows = [];
        $tDr = $tCr = 0.0;
        foreach ($this->ledgers() as $l) {
            $open = $this->opening($l, $scope) + (($prior[$l->id]['dr'] ?? 0) - ($prior[$l->id]['cr'] ?? 0));
            $dr = $mv[$l->id]['dr'] ?? 0;
            $cr = $mv[$l->id]['cr'] ?? 0;
            $close = $open + $dr - $cr;
            if (abs($open) < 0.005 && $dr < 0.005 && $cr < 0.005) {
                continue;
            }
            $rows[] = [
                'ledger_id' => (int) $l->id, 'ledger' => $l->name, 'group_id' => (int) $l->group_id, 'group' => $l->group_name, 'nature' => $l->nature, 'statement_id' => $l->statement_id ? (int) $l->statement_id : null,
                'opening' => round($open, 2), 'debit' => round($dr, 2), 'credit' => round($cr, 2), 'closing' => round($close, 2),
            ];
            $tDr += $close > 0 ? $close : 0;
            $tCr += $close < 0 ? -$close : 0;
        }

        return ['rows' => $rows, 'total_debit' => $tDr, 'total_credit' => $tCr];
    }

    /**
     * The ledgers that carry an opening balance, and what they add up to. Every opening needs an opposite one; when they do not net to nothing
     * the books can never balance, whatever is posted. Not affected by branch or cost centre: it is a fact about the whole business.
     *
     * @return array{net: float, rows: array<int, array>}
     */
    public function openings(): array
    {
        $net = 0.0;
        $rows = [];
        $whole = Scope::dates(null, null);
        foreach ($this->ledgers() as $l) {
            $o = $this->opening($l, $whole);
            if (abs($o) >= 0.005) {
                $net += $o;
                $rows[] = ['ledger_id' => (int) $l->id, 'ledger' => $l->name, 'group' => $l->group_name, 'amount' => round(abs($o), 2), 'side' => $o > 0 ? 'Dr' : 'Cr'];
            }
        }

        return ['net' => $net, 'rows' => $rows];
    }
}
