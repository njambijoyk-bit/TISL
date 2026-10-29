<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\ReportSettingDefinitions;
use App\Services\Books\ReportSettings;
use Illuminate\Support\Carbon;

/**
 * Ratio analysis on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.6): the principal figures (working capital, cash, bank, debtors, creditors, sales,
 * purchases, stock, net profit) and the principal ratios worked from them.
 *
 *  - Every figure is the sum of the ledgers the Reports settings name for it, by group or statement line. Nothing is found by name (decision 14, audit
 *    G1, G2). A figure that has not been chosen is shown as not set up, and the ratios that need it say which setting they are waiting for.
 *  - Balances are as at the end of the period, branch-aware; sales and purchases are the period's movement.
 *  - Profits come from the profit and loss on the engine, and equity from the balance sheet on the engine: capital plus retained earnings (earlier years
 *    and this year to date), not capital alone (G4). Nothing is worked out a second way (G5).
 *  - Receivable days use the bills still open, not the whole debtors balance with its advances (G6).
 *  - The period opens on the financial year, like the other reports (G3).
 */
final class RatioAnalysisReport extends ReportDefinition
{
    public function key(): string
    {
        return 'ratio-analysis';
    }

    public function title(): string
    {
        return 'Ratio analysis';
    }

    public function filters(): array
    {
        return [];
    }

    /** Debit-positive balance of a ratio input's ledgers on a date, or null when the input has not been chosen. */
    private function balance(string $input, array $balances): ?float
    {
        $ids = app(ReportSettings::class)->ratioLedgerIds($input);

        return $ids === null ? null : round(array_sum(array_map(fn ($id) => $balances[$id] ?? 0.0, $ids)), 2);
    }

    public function run(Scope $scope, array $options): array
    {
        $settings = app(ReportSettings::class);
        $labels = ReportSettingDefinitions::RATIO_INPUTS;
        $to = $scope->to ?: today()->toDateString();
        $from = $scope->from ?: Carbon::parse($to)->startOfYear()->toDateString();
        $days = max(1, Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1);
        $period = $scope->between($from, $to);
        $lb = app(LedgerBalances::class);

        // which inputs are chosen
        $inputs = [];
        foreach ($labels as $key => $label) {
            $ids = $settings->ratioLedgerIds($key);
            $inputs[] = ['key' => $key, 'label' => $label, 'set' => $ids !== null, 'ledgers' => $ids === null ? 0 : count($ids)];
        }
        $missing = array_values(array_map(fn ($i) => $i['label'], array_filter($inputs, fn ($i) => ! $i['set'])));

        // balances at the end of the period
        $balances = $lb->balances($scope->between(null, $to), $to);
        $dr = fn (string $k) => $this->balance($k, $balances);
        $cr = fn (string $k) => ($v = $this->balance($k, $balances)) === null ? null : round(-$v, 2);
        $ca = $dr('current_assets');
        $cl = $cr('current_liabilities');
        $cash = $dr('cash');
        $bank = $dr('bank');
        $bankOd = $cr('bank_overdraft');
        $debtors = $dr('debtors');
        $creditors = $cr('creditors');
        $stock = $dr('stock');
        $capital = $cr('capital');
        $loans = $cr('loans');

        // the period's sales and purchases
        $move = function (string $k) use ($settings, $lb, $period, $from, $to) {
            $ids = $settings->ratioLedgerIds($k);

            return $ids === null ? null : $lb->movement($period, $from, $to, null, $ids);
        };
        $salesMv = $move('sales');
        $sales = $salesMv === null ? null : round(array_sum(array_map(fn ($m) => $m['cr'] - $m['dr'], $salesMv)), 2);
        $purMv = $move('purchases');
        $purchases = $purMv === null ? null : round(array_sum(array_map(fn ($m) => $m['dr'] - $m['cr'], $purMv)), 2);

        // profit and equity from the engine's own statements
        $pl = (new ProfitLossReport())->run($period, []);
        $plReady = ($pl['ready'] ?? false) === true;
        $gross = $plReady ? (float) $pl['totals']['gross_profit'] : null;
        $net = $plReady ? (float) $pl['totals']['net_profit'] : null;
        $cost = $plReady ? (float) $pl['totals']['direct_expense'] + (float) $pl['totals']['indirect_expense'] - (float) $pl['totals']['indirect_income'] : null;
        $bs = (new BalanceSheetReport())->run($scope->between(null, $to), []);
        $retained = ($bs['ready'] ?? false) === true ? $bs['retained'] : null;
        $equity = $capital === null || $retained === null ? null : round($capital + $retained['prior'] + $retained['current'], 2);

        // the bills still open, from the ageing on the engine
        $age = fn (string $side) => (new ($side === 'payables' ? PayablesAgeingReport::class : ReceivablesAgeingReport::class))->run($scope->between(null, $to), ['basis' => 'due_date']);
        $ar = $age('receivables');
        $ap = $age('payables');
        $openBills = $ar['totals']['total'];
        $overdueR = round($ar['totals']['total'] - $ar['totals']['b0'], 2);
        $overdueP = round($ap['totals']['total'] - $ap['totals']['b0'], 2);

        $wc = $ca === null || $cl === null ? null : round($ca - $cl, 2);
        $div = fn (?float $a, ?float $b, int $dp = 2) => $a === null || $b === null || abs($b) < 0.005 ? null : round($a / $b, $dp);
        $pct = fn (?float $a, ?float $b) => $a === null || $b === null || abs($b) < 0.005 ? null : round($a / $b * 100, 2);
        $minus = fn (?float $a, ?float $b) => $a === null || $b === null ? null : $a - $b;
        $side = fn (?float $v, string $positive) => $v === null || $v >= 0 ? $positive : ($positive === 'Dr' ? 'Cr' : 'Dr');
        $amount = fn (?float $v) => $v === null ? null : abs($v);

        $groups = [
            ['key' => 'working_capital', 'label' => 'Working capital', 'note' => 'Current assets − current liabilities', 'amount' => $amount($wc), 'side' => $side($wc, 'Dr'), 'bold' => true],
            ['key' => 'cash', 'label' => $labels['cash'], 'amount' => $amount($cash), 'side' => $side($cash, 'Dr')],
            ['key' => 'bank', 'label' => $labels['bank'], 'amount' => $amount($bank), 'side' => $side($bank, 'Dr')],
            ['key' => 'bank_overdraft', 'label' => $labels['bank_overdraft'], 'amount' => $amount($bankOd), 'side' => $side($bankOd, 'Cr')],
            ['key' => 'debtors', 'label' => $labels['debtors'], 'amount' => $amount($debtors), 'side' => $side($debtors, 'Dr')],
            ['key' => 'debtors_due', 'label' => '(overdue bills)', 'amount' => $overdueR, 'side' => 'Dr', 'sub' => true],
            ['key' => 'creditors', 'label' => $labels['creditors'], 'amount' => $amount($creditors), 'side' => $side($creditors, 'Cr')],
            ['key' => 'creditors_due', 'label' => '(overdue bills)', 'amount' => $overdueP, 'side' => 'Cr', 'sub' => true],
            ['key' => 'sales', 'label' => $labels['sales'], 'amount' => $sales, 'side' => 'Cr'],
            ['key' => 'purchases', 'label' => $labels['purchases'], 'amount' => $purchases, 'side' => 'Dr'],
            ['key' => 'stock', 'label' => $labels['stock'], 'amount' => $amount($stock), 'side' => $side($stock, 'Dr')],
            ['key' => 'net_profit', 'label' => 'Net profit', 'amount' => $amount($net), 'side' => $net === null || $net >= 0 ? 'Cr' : 'Dr'],
            ['key' => 'wc_turnover', 'label' => 'Working capital turnover', 'note' => 'Sales ÷ working capital', 'value' => $div($sales, $wc)],
            ['key' => 'inv_turnover', 'label' => 'Inventory turnover', 'note' => 'Sales ÷ closing stock', 'value' => $div($sales, $stock === null ? null : abs($stock))],
        ];
        $ratios = [
            ['key' => 'current', 'label' => 'Current ratio', 'note' => 'Current assets : current liabilities', 'value' => $div($ca, $cl), 'kind' => 'ratio', 'needs' => ['current_assets', 'current_liabilities']],
            ['key' => 'quick', 'label' => 'Quick ratio', 'note' => 'Current assets − stock : current liabilities', 'value' => $div($minus($ca, $stock), $cl), 'kind' => 'ratio', 'needs' => ['current_assets', 'stock', 'current_liabilities']],
            ['key' => 'debt_equity', 'label' => 'Debt/equity ratio', 'note' => 'Loans : capital plus retained earnings', 'value' => $div($loans, $equity), 'kind' => 'ratio', 'needs' => ['loans', 'capital']],
            ['key' => 'gross_pct', 'label' => 'Gross profit %', 'value' => $pct($gross, $sales), 'kind' => 'pct', 'needs' => ['sales']],
            ['key' => 'net_pct', 'label' => 'Net profit %', 'value' => $pct($net, $sales), 'kind' => 'pct', 'needs' => ['sales']],
            ['key' => 'op_cost_pct', 'label' => 'Operating cost %', 'note' => 'as a percentage of sales', 'value' => $pct($cost, $sales), 'kind' => 'pct', 'needs' => ['sales']],
            ['key' => 'recv_days', 'label' => 'Receivable days', 'note' => "open bills ÷ sales × {$days} days", 'value' => $sales !== null && $sales > 0.005 ? round($openBills / $sales * $days, 2) : null, 'kind' => 'days', 'needs' => ['sales']],
            ['key' => 'roi', 'label' => 'Return on investment %', 'note' => 'Net profit ÷ (capital plus retained earnings)', 'value' => $pct($net, $equity), 'kind' => 'pct', 'needs' => ['capital']],
            ['key' => 'rowc', 'label' => 'Return on working capital %', 'note' => 'Net profit ÷ working capital', 'value' => $pct($net, $wc), 'kind' => 'pct', 'needs' => ['current_assets', 'current_liabilities']],
        ];
        $set = array_column($inputs, 'set', 'key');
        foreach ($ratios as &$r) {   // a ratio that cannot be worked out says which setting it is waiting for
            $r['waiting_for'] = $r['value'] === null ? array_values(array_map(fn ($k) => $labels[$k], array_filter($r['needs'], fn ($k) => ! $set[$k]))) : [];
            unset($r['needs']);
        }
        unset($r);

        return [
            'ready' => true, 'from' => $from, 'to' => $to, 'days' => $days, 'groups' => $groups, 'ratios' => $ratios, 'inputs' => $inputs, 'missing' => $missing,
            'equity' => ['capital' => $capital, 'retained_earlier_years' => $retained['prior'] ?? null, 'retained_this_year' => $retained['current'] ?? null, 'total' => $equity],
            'figures' => ['current_assets' => $ca, 'current_liabilities' => $cl, 'capital' => $capital, 'loans' => $loans, 'gross_profit' => $gross === null ? null : round($gross, 2), 'open_bills' => $openBills],
        ];
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = [];
        foreach ($data['groups'] as $g) {
            $rows[] = ['part' => 'Principal figure', 'name' => $g['label'], 'figure' => isset($g['amount']) ? number_format((float) $g['amount'], 2) . ' ' . $g['side'] : (array_key_exists('value', $g) ? ($g['value'] === null ? 'Not available' : number_format($g['value'], 2)) : 'Not set up')];
        }
        foreach ($data['ratios'] as $g) {
            $rows[] = ['part' => 'Principal ratio', 'name' => $g['label'], 'figure' => $g['value'] === null ? 'Not available' : ($g['kind'] === 'ratio' ? number_format($g['value'], 2) . ' : 1' : ($g['kind'] === 'pct' ? number_format($g['value'], 2) . ' %' : number_format($g['value'], 2) . ' days'))];
        }

        return ['title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => ['part' => 'Part', 'name' => 'Item', 'figure' => 'Figure'], 'rows' => $rows];
    }
}
