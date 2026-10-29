<?php

namespace App\Services\Books;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\BalanceSheetReport;
use App\Services\Books\Engine\Reports\MoneyFlowReport;
use App\Services\Books\Engine\Reports\PayablesAgeingReport;
use App\Services\Books\Engine\Reports\ProfitLossReport;
use App\Services\Books\Engine\Reports\ReceivablesAgeingReport;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The figures behind the Extras "Visual reports" page (docs/BOOKS_REPORTS_PLAN.md, section 11). Every chart is drawn from the same engine the reports use, so a chart
 * and the report it summarises never disagree. A chart that cannot be worked out (a script not yet run, a setting not chosen) says why instead of failing the page.
 * Read-only.
 */
class VisualsService
{
    private LedgerBalances $b;

    public function __construct()
    {
        $this->b = app(LedgerBalances::class);
    }

    /**
     * The charts the page can show. `source` is the figures a chart draws (several cards can share one), `compare` says how a second period is drawn:
     * overlay (a ghost series beside the main one), delta (a column of change) or none.
     */
    public const CATALOG = [
        'cash' => ['title' => 'Cash and bank balance', 'note' => 'The running balance of all cash and bank accounts.', 'source' => 'money', 'compare' => 'overlay'],
        'inout' => ['title' => 'Money in and out', 'note' => 'What came into the cash and bank accounts and what went out.', 'source' => 'money', 'compare' => 'overlay'],
        'accounts' => ['title' => 'Each account', 'note' => 'In, out and the balance at the end, per cash and bank account.', 'source' => 'money', 'compare' => 'none'],
        'expense-donut' => ['title' => 'Where the money went', 'note' => 'The biggest groups of expenses in the period. Click a slice to open it.', 'source' => 'expenses', 'compare' => 'delta'],
        'expense-tree' => ['title' => 'Expenses by group', 'note' => 'Every expense group and ledger; bigger is more.', 'source' => 'expenses', 'wide' => true, 'compare' => 'none'],
        'customers' => ['title' => 'Top customers', 'note' => 'The ten customers who bought the most in the period.', 'source' => 'top_customers', 'compare' => 'overlay'],
        'sales-purchases' => ['title' => 'Sales against purchases', 'note' => 'By month. A cash sale is cash; any other sale or purchase that left an open bill is credit, and one that did not is cash.', 'source' => 'sales_purchases', 'wide' => true, 'compare' => 'none'],
        'composition' => ['title' => 'What we own', 'note' => 'Assets on the last day, by group.', 'source' => 'composition', 'wide' => true, 'compare' => 'none'],
        'build' => ['title' => 'Owed to us and by us', 'note' => 'Receivables, payables and the net position they leave.', 'source' => 'outstanding', 'compare' => 'none'],
        'ageing' => ['title' => 'How old the debts are', 'note' => 'Receivables and payables by age.', 'source' => 'outstanding', 'compare' => 'none'],
        'bubbles' => ['title' => 'Who is late', 'note' => 'Each customer: how long their bills have been open (across), how much they owe (up) and how many bills (size).', 'source' => 'outstanding', 'wide' => true, 'compare' => 'none'],
        'calendar' => ['title' => 'Activity', 'note' => 'Vouchers posted each day over the last year.', 'source' => 'heatmap', 'wide' => true, 'compare' => 'none'],
        'waterfall' => ['title' => 'From income to profit', 'note' => 'How the income of the period turns into profit.', 'source' => 'waterfall', 'compare' => 'delta'],
        'balance' => ['title' => 'Assets against liabilities and equity', 'note' => 'What the business has against who it belongs to.', 'source' => 'balance', 'compare' => 'delta'],
        'trend' => ['title' => 'Profit month by month', 'note' => 'Income and expenses as bars, profit as the line.', 'source' => 'profit_trend', 'wide' => true, 'compare' => 'overlay'],
        'recon' => ['title' => 'Reconciliation', 'note' => 'How far each account has been reconciled with its statement.', 'source' => 'recon', 'compare' => 'none'],
    ];

    /** The cards for the page, in order: key, title, note, width and how a comparison is drawn. */
    public function catalog(): array
    {
        return array_map(fn ($k, $c) => ['key' => $k, 'title' => $c['title'], 'note' => $c['note'], 'wide' => (bool) ($c['wide'] ?? false), 'compare' => $c['compare']], array_keys(self::CATALOG), self::CATALOG);
    }

    /** The financial years, for the period presets on the page. */
    public function years(): array
    {
        return \App\Models\Books\FinancialYear::orderBy('start_date')->get(['name', 'start_date', 'end_date'])
            ->map(fn ($y) => ['name' => $y->name, 'from' => $y->start_date->toDateString(), 'to' => $y->end_date->toDateString()])->all();
    }

    /**
     * One chart for a period, and for a second period when one is asked for. A chart that cannot be worked out says why instead of failing.
     *
     * @param  array{from: string, to: string}|null  $compare
     */
    public function chart(string $key, Scope $scope, ?array $compare = null): array
    {
        abort_unless(isset(self::CATALOG[$key]), 404, 'There is no such chart.');
        $to = $scope->to ?: today()->toDateString();
        $from = $scope->from ?: $this->b->yearStart($to);
        $one = fn (string $f, string $t) => $this->run(self::CATALOG[$key]['source'], $scope->between($f, $t), $f, $t);
        $out = ['key' => $key, 'from' => $from, 'to' => $to, 'data' => $one($from, $to), 'compare' => null];
        if ($compare && self::CATALOG[$key]['compare'] !== 'none') {
            $out['compare'] = ['from' => $compare['from'], 'to' => $compare['to'], 'data' => $one($compare['from'], $compare['to'])];
        }

        return $out;
    }

    private function run(string $source, Scope $scope, string $from, string $to): array
    {
        try {
            return array_merge(['ready' => true], $this->{'chart' . str_replace('_', '', ucwords($source, '_'))}($scope, $from, $to));
        } catch (Throwable $e) {
            return ['ready' => false, 'message' => 'This chart could not be worked out: ' . $e->getMessage()];
        }
    }

    /** Cash and bank: money in and out per day/week/month, the running balance, and each account. */
    private function chartMoney(Scope $scope, string $from, string $to): array
    {
        $flow = app(MoneyFlowReport::class);
        $r = $flow->run($scope, []);
        $ids = $flow->moneyLedgerIds();
        $before = Carbon::parse($from)->subDay()->toDateString();
        $opening = $scope->dimensional() ? 0.0 : array_sum(array_map(fn ($id) => $this->b->balance($id, $before), $ids));
        $run = $opening;
        $series = [];
        foreach ($r['series'] as $s) {
            $run = round($run + $s['in'] - $s['out'], 2);
            $series[] = $s + ['balance' => $run];
        }
        $closing = array_column(array_map(fn ($id) => ['id' => $id, 'v' => $this->b->balance($id, $to)], $ids), 'v', 'id');

        return ['bucket' => $r['bucket'], 'opening' => round($opening, 2), 'series' => $series,
            'accounts' => array_map(fn ($a) => ['name' => $a['name'], 'in' => $a['in'], 'out' => $a['out'], 'net' => $a['net'], 'closing' => round($closing[$a['ledger_id']] ?? 0, 2)], $r['accounts'])];
    }

    /** Expenses of the period: the biggest groups for a donut and the whole group hierarchy for a treemap. */
    private function chartExpenses(Scope $scope, string $from, string $to): array
    {
        $mv = $this->b->movement($scope, $from, $to);
        $values = [];
        foreach ($this->b->ledgers() as $l) {
            if ($l->nature === 'expense') {
                $v = ($mv[$l->id]['dr'] ?? 0) - ($mv[$l->id]['cr'] ?? 0);
                if ($v > 0.005) {
                    $values[(int) $l->id] = round($v, 2);
                }
            }
        }
        $byGroup = [];
        foreach ($this->b->ledgers() as $l) {
            if (isset($values[$l->id])) {
                $byGroup[$l->group_name] = ($byGroup[$l->group_name] ?? 0) + $values[$l->id];
            }
        }
        arsort($byGroup);
        $top = array_slice($byGroup, 0, 8, true);
        $other = round(array_sum($byGroup) - array_sum($top), 2);
        $donut = array_map(fn ($n, $v) => ['name' => $n, 'value' => round($v, 2)], array_keys($top), $top);
        if ($other > 0.005) {
            $donut[] = ['name' => 'Everything else', 'value' => $other];
        }

        return ['total' => round(array_sum($values), 2), 'donut' => $donut, 'tree' => $this->tree($values)];
    }

    /** Assets as they stand on the last day, by group, as a treemap. */
    private function chartComposition(Scope $scope, string $from, string $to): array
    {
        $bal = $this->b->balances($scope->between(null, $to), $to);
        $values = [];
        foreach ($this->b->ledgers() as $l) {
            if ($l->nature === 'asset' && ($bal[$l->id] ?? 0) > 0.005) {
                $values[(int) $l->id] = $bal[$l->id];
            }
        }

        return ['total' => round(array_sum($values), 2), 'tree' => $this->tree($values)];
    }

    /** Ledger values (id => amount) as nested groups: [{name, children: [...]}] and leaves [{name, size}]; empty groups left out. */
    private function tree(array $values): array
    {
        $groups = $this->b->groups();
        $leaves = [];
        foreach ($this->b->ledgers() as $l) {
            if (isset($values[$l->id])) {
                $leaves[(int) $l->group_id][] = ['name' => $l->name, 'size' => $values[$l->id], 'ledger_id' => (int) $l->id];
            }
        }
        $kids = [];
        foreach ($groups as $g) {
            $kids[$g['parent_id'] ?? 0][] = $g['id'];
        }
        $build = function (int $id, int $depth = 0) use (&$build, $groups, $kids, $leaves) {
            $children = $leaves[$id] ?? [];
            foreach ($kids[$id] ?? [] as $c) {
                if ($depth < 8 && ($n = $build($c, $depth + 1))) {
                    $children[] = $n;
                }
            }

            return $children ? ['name' => $groups[$id]['name'], 'group_id' => $id, 'children' => $children] : null;
        };
        $out = [];
        foreach ($kids[0] ?? [] as $root) {
            if ($n = $build($root)) {
                $out[] = $n;
            }
        }

        return $out;
    }

    private function vouchers(Scope $scope, string $from, string $to, array $bases)
    {
        $q = RestatedBase::join(DB::table('vouchers as v')->join('voucher_types as t', 't.id', '=', 'v.voucher_type_id'))
            ->where('v.status', 'posted')->whereIn('t.base_type', $bases)->whereBetween('v.date', [$from, $to])
            ->when($scope->locationId !== null, fn ($x) => $x->where('v.location_id', $scope->locationId));

        return app(\App\Services\Access\BranchFilter::class)->apply($q, 'v.location_id', $scope->area, 'engine');
    }

    private function chartTopCustomers(Scope $scope, string $from, string $to): array
    {
        $rows = $this->vouchers($scope, $from, $to, ['sales', 'cash_sale'])->leftJoin('ledgers as l', 'l.id', '=', 'v.party_ledger_id')
            ->selectRaw('COALESCE(l.name, ?) as party, SUM(' . RestatedBase::total() . ') as total, COUNT(*) as n', ['Walk-in / cash customers'])->groupBy('party')->orderByDesc('total')->limit(10)->get();

        return ['rows' => $rows->map(fn ($r) => ['name' => $r->party, 'value' => round((float) $r->total, 2), 'invoices' => (int) $r->n])->all()];
    }

    /**
     * Sales and purchases by month. A cash sale is cash. Any other sale or purchase is "credit" when it left an open bill (it was not settled on the spot) and "cash"
     * when it did not, whether or not it names a customer or supplier account (a cash sale to a walk-in customer still has an account).
     */
    private function chartSalesPurchases(Scope $scope, string $from, string $to): array
    {
        $hasBills = \Illuminate\Support\Facades\Schema::hasTable('voucher_bill_refs');
        $credit = $hasBills ? "EXISTS (SELECT 1 FROM voucher_bill_refs br WHERE br.voucher_id = v.id AND br.ref_type = 'new')" : 'v.party_ledger_id IS NOT NULL';
        $rows = $this->vouchers($scope, $from, $to, ['sales', 'cash_sale', 'purchase'])
            ->selectRaw("SUBSTR(v.date, 1, 7) as ym, CASE WHEN t.base_type = 'purchase' THEN 'purchases' ELSE 'sales' END as kind, CASE WHEN t.base_type = 'cash_sale' THEN 'cash' WHEN {$credit} THEN 'credit' ELSE 'cash' END as how, SUM(" . RestatedBase::total() . ') as total')
            ->groupBy('ym', 'kind', 'how')->get();
        $months = [];
        for ($d = Carbon::parse($from)->startOfMonth(); $d->lte(Carbon::parse($to)); $d->addMonth()) {
            $months[$d->format('Y-m')] = ['month' => $d->format('Y-m'), 'sales_cash' => 0.0, 'sales_credit' => 0.0, 'purchases_cash' => 0.0, 'purchases_credit' => 0.0];
        }
        foreach ($rows as $r) {
            $k = $r->kind . '_' . $r->how;
            if (isset($months[$r->ym])) {
                $months[$r->ym][$k] = round((float) $r->total, 2);
            }
        }

        return ['months' => array_values($months)];
    }

    /** Receivables and payables: the amounts by age, the build-up to a net position, and each customer as a bubble (how late, how much, how many bills). */
    private function chartOutstanding(Scope $scope, string $from, string $to): array
    {
        $whole = Scope::dates(null, $to, $scope->area);
        $sides = [];
        foreach (['receivables' => ReceivablesAgeingReport::class, 'payables' => PayablesAgeingReport::class] as $side => $class) {
            $r = app($class)->run($whole, []);
            $sides[$side] = $r;
        }
        $buckets = array_map(fn ($x) => ['key' => $x['key'], 'label' => $x['label'] ?? $x['key']], $sides['receivables']['buckets']);
        $ageing = array_map(fn ($x) => ['bucket' => $x['label'], 'receivables' => $sides['receivables']['totals'][$x['key']] ?? 0, 'payables' => $sides['payables']['totals'][$x['key']] ?? 0], $buckets);
        $bubbles = [];
        foreach ($sides['receivables']['rows'] as $p) {
            $open = array_sum(array_column($p['bills'], 'open'));
            if ($open > 0.005) {
                $weighted = array_sum(array_map(fn ($b) => $b['open'] * $b['days'], $p['bills'])) / $open;
                $bubbles[] = ['name' => $p['party'], 'days' => round($weighted, 1), 'amount' => round($open, 2), 'bills' => count($p['bills'])];
            }
        }

        return ['ageing' => $ageing, 'bubbles' => array_slice($bubbles, 0, 60),
            'build' => [['name' => 'Customers owe us', 'value' => $sides['receivables']['totals']['total'] ?? 0], ['name' => 'We owe suppliers', 'value' => -($sides['payables']['totals']['total'] ?? 0)],
                ['name' => 'Net position', 'value' => round(($sides['receivables']['net'] ?? 0) - ($sides['payables']['net'] ?? 0), 2), 'total' => true]]];
    }

    /** Postings per day over the last year up to the end date: how many vouchers and how much. */
    private function chartHeatmap(Scope $scope, string $from, string $to): array
    {
        $start = Carbon::parse($to)->subYear()->addDay()->toDateString();
        $rows = $this->vouchers($scope, $start, $to, ['sales', 'purchase', 'receipt', 'payment', 'journal', 'contra', 'credit_note', 'debit_note'])
            ->selectRaw('v.date as d, COUNT(*) as n, SUM(' . RestatedBase::total() . ') as total')->groupBy('v.date')->get();

        return ['from' => $start, 'to' => $to, 'days' => $rows->map(fn ($r) => ['date' => substr((string) $r->d, 0, 10), 'count' => (int) $r->n, 'amount' => round((float) $r->total, 2)])->all()];
    }

    /** From income to profit, step by step. */
    private function chartWaterfall(Scope $scope, string $from, string $to): array
    {
        $r = app(ProfitLossReport::class)->run($scope, []);
        if (empty($r['ready'])) {
            return ['ready' => false, 'message' => $r['message'] ?? 'The statements are not set up.'];
        }
        $t = $r['totals'];

        return ['steps' => [['name' => 'Direct income', 'value' => $t['direct_income']], ['name' => 'Direct costs', 'value' => -$t['direct_expense']], ['name' => 'Gross profit', 'value' => $t['gross_profit'], 'total' => true],
            ['name' => 'Other income', 'value' => $t['indirect_income']], ['name' => 'Expenses', 'value' => -$t['indirect_expense']], ['name' => 'Net profit', 'value' => $t['net_profit'], 'total' => true]]];
    }

    private function chartBalance(Scope $scope, string $from, string $to): array
    {
        $r = app(BalanceSheetReport::class)->run(Scope::dates(null, $to, $scope->area), []);
        if (empty($r['ready'])) {
            return ['ready' => false, 'message' => $r['message'] ?? 'The statements are not set up.'];
        }

        return ['assets' => $r['totals']['assets'], 'liabilities' => $r['totals']['liabilities'], 'equity' => $r['totals']['equity'], 'balanced' => $r['balanced']];
    }

    /** Income, expenses and profit month by month. */
    private function chartProfitTrend(Scope $scope, string $from, string $to): array
    {
        $by = $this->b->movementByMonth($scope, $from, $to);
        $months = [];
        for ($d = Carbon::parse($from)->startOfMonth(); $d->lte(Carbon::parse($to)); $d->addMonth()) {
            $months[$d->format('Y-m')] = ['month' => $d->format('Y-m'), 'income' => 0.0, 'expenses' => 0.0];
        }
        foreach ($this->b->ledgers() as $l) {
            foreach ($by[$l->id] ?? [] as $ym => $m) {
                if (! isset($months[$ym])) {
                    continue;
                }
                if ($l->nature === 'income') {
                    $months[$ym]['income'] += $m['cr'] - $m['dr'];
                } elseif ($l->nature === 'expense') {
                    $months[$ym]['expenses'] += $m['dr'] - $m['cr'];
                }
            }
        }

        return ['months' => array_values(array_map(fn ($m) => ['month' => $m['month'], 'income' => round($m['income'], 2), 'expenses' => round($m['expenses'], 2), 'profit' => round($m['income'] - $m['expenses'], 2)], $months))];
    }

    /** Where each reconcilable account stands: locked up to, and what is still open. */
    private function chartRecon(Scope $scope, string $from, string $to): array
    {
        if (! ReconService::ready()) {
            return ['ready' => false, 'message' => 'Run database script 233_reconciliation.sql.'];
        }
        $recon = app(ReconService::class);
        $rows = [];
        foreach ($recon->ledgers() as $l) {
            $open = DB::table('recon_statement_lines as x')->join('recon_sessions as s', 's.id', '=', 'x.session_id')->where('s.ledger_id', $l['id'])->whereNull('x.matched_entry_id')
                ->whereNotIn('s.status', ['locked', 'superseded', 'reopened'])->count();
            $locked = $recon->lockedUpTo((int) $l['id']);
            $rows[] = ['name' => $l['name'], 'locked_to' => $locked, 'days_behind' => $locked ? max(0, (int) Carbon::parse($locked)->diffInDays(Carbon::parse($to), false)) : null, 'unmatched' => $open];
        }

        return ['rows' => $rows];
    }
}
