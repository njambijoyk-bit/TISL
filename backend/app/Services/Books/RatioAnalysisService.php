<?php

namespace App\Services\Books;

use App\Models\Books\AccountingSetting;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Ratio analysis, Tally-style: the principal groups (working capital, cash, bank, debtors, creditors, sales, purchases, stock, nett profit) and the principal
 * ratios worked from them (current, quick, debt/equity, gross and nett profit %, operating cost %, receivables turnover, return on investment and on working
 * capital, working capital and inventory turnover). Balances are as at the end of the period; sales, purchases and profit are for the period. Read-only.
 */
class RatioAnalysisService
{
    public function __construct(private BooksReportService $reports) {}

    /** Is this group the named group, or somewhere below it? */
    private function inTree(array $groups, int $startGroup, int $groupId): bool
    {
        $id = $startGroup;
        $guard = 0;
        while ($id && $guard++ < 20) {
            if ($id === $groupId) {
                return true;
            }
            $id = $groups[$id]['parent'] ?? null;
        }

        return false;
    }

    public function compute(?string $from, ?string $to): array
    {
        $to = $to ?: today()->toDateString();
        $from = $from ?: Carbon::parse($to)->startOfYear()->toDateString();
        $days = max(1, Carbon::parse($from)->diffInDays(Carbon::parse($to)) + 1);

        $groups = [];   // id => [name, parent]
        $byName = [];
        foreach (DB::table('ledger_groups')->get(['id', 'name', 'parent_id']) as $g) {
            $groups[(int) $g->id] = ['name' => $g->name, 'parent' => $g->parent_id ? (int) $g->parent_id : null];
            $byName[$g->name] ??= (int) $g->id;
        }
        $ledgerGroup = DB::table('ledgers')->pluck('group_id', 'id')->map(fn ($g) => (int) $g)->all();

        // closing balances as at the end of the period, by ledger (Dr +)
        $tb = $this->reports->trialBalance(null, $to);
        $closing = [];
        foreach ($tb['rows'] as $r) {
            $closing[(int) $r['ledger_id']] = (float) $r['closing'];
        }
        $balance = function (string $groupName) use ($groups, $ledgerGroup, $closing, $byName): ?float {
            if (! isset($byName[$groupName])) {
                return null;
            }
            $gid = $byName[$groupName];
            $sum = 0.0;
            foreach ($closing as $lid => $bal) {
                if ($this->inTree($groups, $ledgerGroup[$lid] ?? 0, $gid)) {
                    $sum += $bal;
                }
            }

            return round($sum, 2);
        };

        $caRaw = $balance('Current Assets');
        $clRaw = $balance('Current Liabilities');
        $cash = $balance('Cash-in-hand') ?? 0.0;
        $bank = $balance('Bank Accounts') ?? 0.0;
        $bankOd = $balance('Bank OD A/c');
        $debtors = $balance('Sundry Debtors') ?? 0.0;
        $creditors = $balance('Sundry Creditors') ?? 0.0;
        $stock = $balance('Stock-in-Hand');
        if ($stock === null || abs($stock) < 0.005) {
            $sl = AccountingSetting::current()->stock_ledger_id ?? null;
            $stock = $sl ? round($closing[(int) $sl] ?? 0.0, 2) : ($stock ?? 0.0);
        }
        $ca = $caRaw ?? round($cash + $bank + $debtors + $stock, 2);
        $cl = $clRaw !== null ? round(-$clRaw, 2) : round(-($creditors + ($bankOd ?? 0.0)), 2);   // liabilities are credit balances
        $capital = -($balance('Capital Account') ?? 0.0);
        $loans = -($balance('Loans (Liability)') ?? 0.0);

        $pl = $this->reports->profitLoss($from, $to);
        $sales = (float) $pl['totals']['direct_income'];
        $gross = (float) $pl['totals']['gross_profit'];
        $net = (float) $pl['totals']['net_profit'];
        $cost = (float) $pl['totals']['direct_expense'] + (float) $pl['totals']['indirect_expense'] - (float) $pl['totals']['indirect_income'];
        $purchases = 0.0;
        if (isset($byName['Purchase Accounts'])) {
            foreach ($pl['sections']['expense_direct'] as $x) {
                if ($this->inTree($groups, $ledgerGroup[(int) $x['ledger_id']] ?? 0, $byName['Purchase Accounts'])) {
                    $purchases += (float) $x['amount'];
                }
            }
        }
        $wc = round($ca - $cl, 2);
        $ageR = $this->reports->ageing('receivables', $to)['totals'];
        $ageP = $this->reports->ageing('payables', $to)['totals'];
        $overdueR = round((float) $ageR['total'] - (float) $ageR['current'], 2);
        $overdueP = round((float) $ageP['total'] - (float) $ageP['current'], 2);

        $div = fn (float $a, float $b, int $dp = 2) => abs($b) < 0.005 ? null : round($a / $b, $dp);
        $pct = fn (float $a, float $b) => abs($b) < 0.005 ? null : round($a / $b * 100, 2);
        $ratio = fn (float $a, float $b) => abs($b) < 0.005 ? null : round($a / $b, 2);

        return ['from' => $from, 'to' => $to, 'days' => $days,
            'groups' => [
                ['key' => 'working_capital', 'label' => 'Working Capital', 'note' => 'Current Assets − Current Liabilities', 'amount' => abs($wc), 'side' => $wc >= 0 ? 'Dr' : 'Cr', 'bold' => true],
                ['key' => 'cash', 'label' => 'Cash-in-Hand', 'amount' => abs($cash), 'side' => $cash >= 0 ? 'Dr' : 'Cr'],
                ['key' => 'bank', 'label' => 'Bank Accounts', 'amount' => abs($bank), 'side' => $bank >= 0 ? 'Dr' : 'Cr'],
                ['key' => 'bank_od', 'label' => 'Bank OD A/c', 'amount' => $bankOd === null ? null : abs($bankOd), 'side' => 'Cr'],
                ['key' => 'debtors', 'label' => 'Sundry Debtors', 'amount' => abs($debtors), 'side' => $debtors >= 0 ? 'Dr' : 'Cr'],
                ['key' => 'debtors_due', 'label' => '(overdue)', 'amount' => $overdueR, 'side' => 'Dr', 'sub' => true],
                ['key' => 'creditors', 'label' => 'Sundry Creditors', 'amount' => abs($creditors), 'side' => $creditors <= 0 ? 'Cr' : 'Dr'],
                ['key' => 'creditors_due', 'label' => '(overdue)', 'amount' => $overdueP, 'side' => 'Cr', 'sub' => true],
                ['key' => 'sales', 'label' => 'Sales (direct income)', 'amount' => round($sales, 2), 'side' => 'Cr'],
                ['key' => 'purchases', 'label' => 'Purchase Accounts', 'amount' => round($purchases, 2), 'side' => 'Dr'],
                ['key' => 'stock', 'label' => 'Stock-in-Hand', 'amount' => abs($stock), 'side' => $stock >= 0 ? 'Dr' : 'Cr'],
                ['key' => 'net_profit', 'label' => 'Nett Profit', 'amount' => abs($net), 'side' => $net >= 0 ? 'Cr' : 'Dr'],
                ['key' => 'wc_turnover', 'label' => 'Wkg. Capital Turnover', 'note' => 'Sales ÷ Working Capital', 'value' => $div($sales, $wc)],
                ['key' => 'inv_turnover', 'label' => 'Inventory Turnover', 'note' => 'Sales ÷ Closing Stock', 'value' => $div($sales, abs($stock))],
            ],
            'ratios' => [
                ['key' => 'current', 'label' => 'Current Ratio', 'note' => 'Current Assets : Current Liabilities', 'value' => $ratio($ca, $cl), 'kind' => 'ratio'],
                ['key' => 'quick', 'label' => 'Quick Ratio', 'note' => 'Current Assets − Stock-in-Hand : Current Liabilities', 'value' => $ratio($ca - $stock, $cl), 'kind' => 'ratio'],
                ['key' => 'debt_equity', 'label' => 'Debt/Equity Ratio', 'note' => 'Loans (Liability) : Capital Account + Nett Profit', 'value' => $ratio($loans, $capital + $net), 'kind' => 'ratio'],
                ['key' => 'gross_pct', 'label' => 'Gross Profit %', 'value' => $pct($gross, $sales), 'kind' => 'pct'],
                ['key' => 'net_pct', 'label' => 'Nett Profit %', 'value' => $pct($net, $sales), 'kind' => 'pct'],
                ['key' => 'op_cost_pct', 'label' => 'Operating Cost %', 'note' => 'as a percentage of Sales', 'value' => $pct($cost, $sales), 'kind' => 'pct'],
                ['key' => 'recv_days', 'label' => 'Recv. Turnover in days', 'note' => "payment performance of Debtors (Debtors ÷ Sales × {$days} days)", 'value' => $sales > 0.005 ? round($debtors / $sales * $days, 2) : null, 'kind' => 'days'],
                ['key' => 'roi', 'label' => 'Return on Investment %', 'note' => 'Nett Profit ÷ (Capital Account + Nett Profit)', 'value' => $pct($net, $capital + $net), 'kind' => 'pct'],
                ['key' => 'rowc', 'label' => 'Return on Wkg. Capital %', 'note' => 'Nett Profit ÷ Working Capital', 'value' => $pct($net, $wc), 'kind' => 'pct'],
            ],
            'figures' => ['current_assets' => $ca, 'current_liabilities' => $cl, 'capital' => round($capital, 2), 'loans' => round($loans, 2), 'gross_profit' => round($gross, 2)],
        ];
    }
}
