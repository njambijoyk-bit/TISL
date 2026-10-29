<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\CashFlowCategories;
use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;

/**
 * The cash flow statement (docs/BOOKS_REPORTS_PLAN.md, step 8). Cash is every ledger in the money account groups (Reports settings; Bank Accounts and Cash-in-hand
 * when none is chosen), so the statement agrees with the cash and bank balances: opening cash + net cash flow = closing cash.
 *
 * Indirect method: the profit of the period, with non-cash items added back, and the change in every other balance-sheet ledger, each put in operating, investing
 * or financing by its statement line (CashFlowCategories). Because every voucher balances, what the other ledgers moved is exactly what cash moved, so the sections
 * always add up to the change in cash; if a non-cash category is set on only one side of an entry the difference is shown on its own line and the statement says so.
 *
 * Direct method: the money received and paid, by the group of the ledger on the other side, from the money flow report (transfers between our own accounts left out).
 */
final class CashFlowReport extends ReportDefinition
{
    public function key(): string
    {
        return 'cash-flow';
    }

    public function title(): string
    {
        return 'Cash flow statement';
    }

    public function filters(): array
    {
        return [];
    }

    public function options(): array
    {
        return [['key' => 'method', 'label' => 'Method', 'choices' => ['indirect' => 'Indirect (from the profit)', 'direct' => 'Direct (money received and paid)'], 'default' => 'indirect']];
    }

    public function run(Scope $scope, array $options): array
    {
        $to = $scope->to ?: now()->toDateString();
        $from = $scope->from;
        $balances = app(LedgerBalances::class);
        $whole = Scope::dates(null, $to, $scope->area);
        $cashIds = (new MoneyFlowReport())->moneyLedgerIds();
        $cash = array_flip($cashIds);

        $openCash = 0.0;
        $closeCash = 0.0;
        foreach ($cashIds as $id) {
            $closeCash += $balances->balance($id, $to, $whole);
            $openCash += $from ? $balances->balance($id, date('Y-m-d', strtotime($from . ' -1 day')), $whole) : 0.0;
        }
        if (! $from) {   // from the start: the opening balances only
            foreach ($balances->ledgers() as $l) {
                if (isset($cash[$l->id])) {
                    $openCash += $balances->opening($l, $whole);
                }
            }
        }
        $openCash = round($openCash, 2);
        $closeCash = round($closeCash, 2);
        $net = round($closeCash - $openCash, 2);
        $head = ['ready' => true, 'from' => $from, 'to' => $to, 'method' => ($options['method'] ?? 'indirect') === 'direct' ? 'direct' : 'indirect', 'opening_cash' => $openCash, 'closing_cash' => $closeCash, 'net_change' => $net];

        return $head['method'] === 'direct' ? $head + $this->direct($scope, $options, $net) : $head + $this->indirect($scope, $balances, $cash, $net);
    }

    private function indirect(Scope $scope, LedgerBalances $balances, array $cash, float $net): array
    {
        $cats = new CashFlowCategories();
        $mv = $balances->movement(Scope::dates($scope->from, $scope->to, $scope->area), $scope->from, $scope->to);
        $sections = ['operating' => ['rows' => [], 'total' => 0.0], 'investing' => ['rows' => [], 'total' => 0.0], 'financing' => ['rows' => [], 'total' => 0.0]];
        $profit = 0.0;      // credit positive
        $addBack = 0.0;
        $lines = [];        // [category][label] => amount
        $put = function (string $cat, string $label, float $amount) use (&$lines) {
            $lines[$cat][$label] = ($lines[$cat][$label] ?? 0.0) + $amount;
        };
        $names = $this->lineNames();
        foreach ($balances->ledgers() as $l) {
            $m = ($mv[$l->id]['dr'] ?? 0.0) - ($mv[$l->id]['cr'] ?? 0.0);   // debit positive
            if (isset($cash[$l->id]) || abs($m) < 0.005) {
                continue;
            }
            $cat = $cats->of($l->statement_id ? (int) $l->statement_id : null);
            $line = $l->statement_id ? ($names[(int) $l->statement_id] ?? $l->group_name) : 'Other balances (not on a statement line)';
            if (in_array($l->nature, ['income', 'expense'], true)) {
                if ($cat === 'operating') {
                    $profit -= $m;
                } elseif ($cat === 'non_cash') {
                    $profit -= $m;
                    $addBack += $m;   // an expense is a debit: its cash was not spent
                } else {
                    $put($cat, $line . ' (income statement)', -$m);
                }
                continue;
            }
            if ($cat === 'non_cash') {
                continue;
            }
            $put($cat, ($m > 0 ? 'Increase in ' : 'Decrease in ') . mb_strtolower($line) . ($l->statement_id ? '' : ''), -$m);
        }
        $profit = round($profit, 2);
        $sections['operating']['rows'][] = ['key' => 'profit', 'name' => 'Profit (loss) for the period', 'amount' => $profit];
        if (abs($addBack) >= 0.005) {
            $sections['operating']['rows'][] = ['key' => 'non_cash', 'name' => 'Non-cash items added back', 'amount' => round($addBack, 2)];
        }
        foreach (['operating', 'investing', 'financing'] as $cat) {
            $found = $lines[$cat] ?? [];
            ksort($found);
            foreach ($found as $label => $amount) {
                if (abs($amount) >= 0.005) {
                    $sections[$cat]['rows'][] = ['key' => $cat . ':' . $label, 'name' => $label, 'amount' => round($amount, 2)];
                }
            }
            $sections[$cat]['total'] = round(array_sum(array_column($sections[$cat]['rows'], 'amount')), 2);
        }
        $sum = round($sections['operating']['total'] + $sections['investing']['total'] + $sections['financing']['total'], 2);
        $difference = round($net - $sum, 2);
        if (abs($difference) >= 0.01) {   // a non-cash category set on only one side of an entry
            $sections['operating']['rows'][] = ['key' => 'difference', 'name' => 'Difference: check the non-cash settings of the statement lines', 'amount' => $difference, 'flag' => true];
            $sections['operating']['total'] = round($sections['operating']['total'] + $difference, 2);
        }

        return ['sections' => $sections, 'totals' => ['operating' => $sections['operating']['total'], 'investing' => $sections['investing']['total'], 'financing' => $sections['financing']['total']],
            'reconciles' => true, 'difference' => $difference];
    }

    private function direct(Scope $scope, array $options, float $net): array
    {
        $flow = (new MoneyFlowReport())->run(Scope::dates($scope->from ?? '1970-01-01', $scope->to, $scope->area), []);   // from the start of the books when no date is given
        $group = function (array $rows) {
            $by = [];
            foreach ($rows as $r) {
                $by[$r['group']] = ($by[$r['group']] ?? 0.0) + $r['amount'];
            }
            arsort($by);

            return array_map(fn ($g, $a) => ['key' => $g, 'name' => $g, 'amount' => round($a, 2)], array_keys($by), $by);
        };
        $in = $group($flow['in']);
        $out = $group($flow['out']);
        $sections = ['receipts' => ['rows' => $in, 'total' => round(array_sum(array_column($in, 'amount')), 2)], 'payments' => ['rows' => $out, 'total' => round(-array_sum(array_column($out, 'amount')), 2)]];
        $sum = round($sections['receipts']['total'] + $sections['payments']['total'], 2);

        return ['sections' => $sections, 'totals' => ['receipts' => $sections['receipts']['total'], 'payments' => $sections['payments']['total']], 'reconciles' => abs($sum - $net) < 0.01, 'difference' => round($net - $sum, 2)];
    }

    /** @return array<int, string> statement id => name */
    private function lineNames(): array
    {
        return \Illuminate\Support\Facades\Schema::hasTable('statements') ? \Illuminate\Support\Facades\DB::table('statements')->pluck('name', 'id')->map(fn ($n) => (string) $n)->all() : [];
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = [];
        foreach ($data['sections'] ?? [] as $key => $s) {
            $rows[] = ['name' => ucfirst($key) . ' activities', 'amount' => ''];
            foreach ($s['rows'] as $r) {
                $rows[] = ['name' => '    ' . $r['name'], 'amount' => $r['amount']];
            }
            $rows[] = ['name' => 'Net cash from ' . $key . ' activities', 'amount' => $s['total']];
        }
        $rows[] = ['name' => 'Net change in cash', 'amount' => $data['net_change'] ?? 0];
        $rows[] = ['name' => 'Opening cash', 'amount' => $data['opening_cash'] ?? 0];
        $rows[] = ['name' => 'Closing cash', 'amount' => $data['closing_cash'] ?? 0];

        return ['title' => $this->title(), 'subtitle' => $this->period($scope) . ' · ' . ($data['method'] ?? 'indirect') . ' method', 'columns' => ['name' => 'Particulars', 'amount' => 'Amount'], 'rows' => $rows];
    }
}
