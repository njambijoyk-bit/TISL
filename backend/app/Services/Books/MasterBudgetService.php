<?php

namespace App\Services\Books;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\Reports\MoneyFlowReport;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The master budget and the cash budget (docs/BOOKS_BUDGETING_PLAN.md, step 7). The master budget brings every budget that covers the months (operating, sales, payroll, capital ...,
 * each at its current version, approved transfers included) into one plan: income, expenses and the result by month and by ledger group. The cash budget then asks the question the
 * rest of the plan cannot: does the business have the cash to do all this? From the cash it will start with, income arrives after the customers' delay (and only the share expected to
 * be collected), expenses leave after the suppliers' terms (non-cash ones such as depreciation never do), assets bought and loans repaid take cash out, loans drawn and capital put in
 * bring it in. The timing comes from the cash-forecast assumptions in Reports settings, so the two always agree.
 *
 * A balance-sheet line is read as the MOVEMENT planned for the month, not a balance: an asset line is cash spent on it (a reduction is one sold), a liability or equity line is cash
 * raised (a reduction is one repaid).
 */
class MasterBudgetService
{
    public function __construct(private BudgetService $budgets) {}

    /** @return array<string, mixed> */
    public function build(string $fromMonth, string $toMonth, ?int $onlyBudget = null): array
    {
        $months = BudgetService::months($fromMonth . '-01', $toMonth . '-01');
        $from = $fromMonth . '-01';
        $to = Carbon::parse($toMonth . '-01')->endOfMonth()->toDateString();
        $zero = array_fill_keys($months, 0.0);
        $groups = collect(app(LedgerBalances::class)->groups());
        $ledgerGroup = collect(app(LedgerBalances::class)->ledgers())->pluck('group_id', 'id');
        $top = function (int $groupId) use ($groups) {
            $g = $groups[$groupId] ?? null;
            for ($n = 0; $g && $g['parent_id'] && isset($groups[$g['parent_id']]) && $n < 12; $n++) {
                $g = $groups[$g['parent_id']];
            }

            return $g['name'] ?? 'Other';
        };
        $settings = ReportSettings::ready() ? app(ReportSettings::class) : null;
        $values = $settings ? $settings->values() : [];
        $noncash = [];
        foreach (array_map('intval', (array) ($values['budget_noncash_groups'] ?? [])) as $gid) {
            $noncash = array_merge($noncash, $settings->withDescendants($gid));
        }

        $series = ['income' => $zero, 'expense' => $zero, 'noncash' => $zero, 'asset_out' => $zero, 'financing_in' => $zero];
        $byGroup = ['income' => [], 'expense' => []];
        $included = [];
        $notApproved = false;
        foreach (DB::table('budgets')->where('is_active', 1)->where('from_month', '<=', $toMonth)->where('to_month', '>=', $fromMonth)->when($onlyBudget, fn ($q) => $q->where('id', $onlyBudget))->orderBy('from_month')->orderBy('id')->get() as $b) {
            $version = $this->budgets->currentVersion((int) $b->id);
            if (! $version) {
                continue;
            }
            $v = DB::table('budget_versions')->where('id', $version)->first(['name', 'status']);
            $totals = ['income' => 0.0, 'expense' => 0.0];
            foreach ($this->budgets->lines($from, $to, $version, true) as $row) {
                $sign = $row['is_recovery'] ? -1 : 1;
                $gid = $row['type'] === 'group' ? (int) $row['target_id'] : (int) ($ledgerGroup[(int) $row['target_id']] ?? 0);
                $isNonCash = in_array($gid, $noncash, true);
                foreach ($row['months'] as $ym => $amt) {
                    if (! isset($zero[$ym])) {
                        continue;
                    }
                    $a = $sign * (float) $amt;
                    if ($row['section'] === 'income') {
                        $series['income'][$ym] += $a;
                        $totals['income'] += $a;
                        $byGroup['income'][$top($gid)][$ym] = ($byGroup['income'][$top($gid)][$ym] ?? 0) + $a;
                    } elseif ($row['section'] === 'expense') {
                        $series['expense'][$ym] += $a;
                        if ($isNonCash) {
                            $series['noncash'][$ym] += $a;
                        }
                        $totals['expense'] += $a;
                        $byGroup['expense'][$top($gid)][$ym] = ($byGroup['expense'][$top($gid)][$ym] ?? 0) + $a;
                    } elseif (in_array($row['nature'], ['asset'], true)) {
                        $series['asset_out'][$ym] += $a;
                    } else {
                        $series['financing_in'][$ym] += $a;
                    }
                }
            }
            $notApproved = $notApproved || ! in_array($v->status, ['approved', 'locked'], true);
            $included[] = ['id' => (int) $b->id, 'name' => $b->name, 'type' => $b->budget_type, 'version' => $v->name, 'status' => $v->status, 'income' => round($totals['income'], 2), 'expense' => round($totals['expense'], 2), 'result' => round($totals['income'] - $totals['expense'], 2)];
        }

        // cash: timing from the forecast assumptions
        $delayIn = (int) round(max(0, (int) ($values['forecast_collection_delay_days'] ?? 0)) / 30);
        $delayOut = (int) round(max(0, (int) ($values['forecast_supplier_terms_days'] ?? 0)) / 30);
        $pct = max(0.0, min(100.0, (float) ($values['forecast_collect_percent'] ?? 100))) / 100;
        $receipts = $zero;
        $payments = $zero;
        $after = ['receipts' => 0.0, 'payments' => 0.0];
        $idx = array_flip($months);
        foreach ($months as $ym) {
            $in = $series['income'][$ym] * $pct;
            $out = $series['expense'][$ym] - $series['noncash'][$ym];
            $ti = $idx[$ym] + $delayIn;
            $to2 = $idx[$ym] + $delayOut;
            if (isset($months[$ti])) {
                $receipts[$months[$ti]] += $in;
            } else {
                $after['receipts'] += $in;
            }
            if (isset($months[$to2])) {
                $payments[$months[$to2]] += $out;
            } else {
                $after['payments'] += $out;
            }
        }
        $opening = $this->openingCash($from);
        $rows = [];
        $cash = $opening['amount'];
        $lowest = null;
        $short = [];
        foreach ($months as $ym) {
            $net = $receipts[$ym] - $payments[$ym] - $series['asset_out'][$ym] + $series['financing_in'][$ym];
            $closing = $cash + $net;
            $rows[] = ['month' => $ym, 'income' => round($series['income'][$ym], 2), 'expense' => round($series['expense'][$ym], 2), 'result' => round($series['income'][$ym] - $series['expense'][$ym], 2),
                'receipts' => round($receipts[$ym], 2), 'payments' => round($payments[$ym], 2), 'assets' => round($series['asset_out'][$ym], 2), 'financing' => round($series['financing_in'][$ym], 2),
                'net_cash' => round($net, 2), 'opening' => round($cash, 2), 'closing' => round($closing, 2)];
            if ($lowest === null || $closing < $lowest['balance']) {
                $lowest = ['month' => $ym, 'balance' => round($closing, 2)];
            }
            if ($closing < -0.005) {
                $short[] = $ym;
            }
            $cash = $closing;
        }
        $sum = fn (string $k) => round(array_sum(array_column($rows, $k)), 2);
        $lines = fn (array $g) => array_map(fn ($name, $by) => ['name' => $name, 'total' => round(array_sum($by), 2), 'months' => array_map(fn ($ym) => round($by[$ym] ?? 0, 2), $months)], array_keys($g), $g);
        $incomeLines = $lines($byGroup['income']);
        $expenseLines = $lines($byGroup['expense']);
        usort($incomeLines, fn ($a, $b) => $b['total'] <=> $a['total']);
        usort($expenseLines, fn ($a, $b) => $b['total'] <=> $a['total']);

        return ['months' => $rows, 'month_names' => $months, 'budgets' => $included, 'not_approved' => $notApproved, 'income_lines' => $incomeLines, 'expense_lines' => $expenseLines,
            'totals' => ['income' => $sum('income'), 'expense' => $sum('expense'), 'result' => $sum('result'), 'receipts' => $sum('receipts'), 'payments' => $sum('payments'), 'assets' => $sum('assets'), 'financing' => $sum('financing'), 'net_cash' => $sum('net_cash')],
            'cash' => ['opening' => round($opening['amount'], 2), 'opening_note' => $opening['note'], 'closing' => round($cash, 2), 'lowest' => $lowest, 'short_months' => $short, 'can_finance' => $short === [],
                'after_budget' => ['receipts' => round($after['receipts'], 2), 'payments' => round($after['payments'], 2)]],
            'assumptions' => [
                ['label' => 'Opening cash', 'value' => number_format($opening['amount'], 2), 'detail' => $opening['note']],
                ['label' => 'Customers pay', 'value' => $delayIn . ' month(s) after the sale', 'detail' => round($pct * 100, 1) . '% of income is expected to be collected (Reports settings, Cash forecast assumptions).'],
                ['label' => 'Suppliers are paid', 'value' => $delayOut . ' month(s) after the expense', 'detail' => 'From the supplier terms in the same settings.'],
                ['label' => 'Not cash', 'value' => $noncash ? 'Left out' : 'None set', 'detail' => $noncash ? 'Expenses in the ledger groups chosen under Budget controls use no cash.' : 'Every expense uses cash. Choose the groups that do not (depreciation) under Budget controls.'],
                ['label' => 'Balance-sheet lines', 'value' => 'A movement', 'detail' => 'An asset line is cash spent on it; a liability or equity line is cash raised. A reduction is one sold or repaid.'],
            ]];
    }

    /** The cash held at the start of the budget (the day before it), or today's cash when the budget starts in the future. @return array{amount: float, note: string} */
    private function openingCash(string $start): array
    {
        $ids = app(MoneyFlowReport::class)->moneyLedgerIds();
        $day = Carbon::parse($start)->subDay()->toDateString();
        $future = $day > today()->toDateString();
        $on = $future ? today()->toDateString() : $day;
        $total = 0.0;
        foreach ($ids as $id) {
            $total += app(LedgerBalances::class)->balance($id, $on);
        }

        return ['amount' => round($total, 2), 'note' => $future ? "The budget starts in the future, so it starts from today's cash ({$on})." : "What the cash and bank accounts held on {$on}."];
    }
}
