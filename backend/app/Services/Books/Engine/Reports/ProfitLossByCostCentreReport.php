<?php

namespace App\Services\Books\Engine\Reports;

use App\Models\Books\Voucher;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\RestatedBase;
use App\Services\CostCentres\CostCentreService;
use Illuminate\Support\Facades\DB;

/**
 * Profit and loss by cost centre on the engine (docs/BOOKS_REPORTS_PLAN.md, step 12): what each cost centre earned and spent on its own, and in total with everything
 * beneath it (a branch's total adds up its utilities, stock, payroll and departments). Only entry lines that carry a cost centre are counted; the rest of the business
 * is not in this report. Amounts are in today's base currency, like every report.
 */
final class ProfitLossByCostCentreReport extends ReportDefinition
{
    public function key(): string
    {
        return 'profit-loss-by-cost-centre';
    }

    public function title(): string
    {
        return 'Profit & loss by cost centre';
    }

    public function filters(): array
    {
        return ['branch'];
    }

    public function run(Scope $scope, array $options): array
    {
        $svc = app(CostCentreService::class);
        if (! $svc->booksReady()) {
            return ['ready' => false, 'message' => 'Run database script 102_books_dimensions.sql to give the books their cost centres.', 'rows' => [], 'totals' => ['income' => 0, 'expense' => 0, 'profit' => 0]];
        }
        $b = RestatedBase::entry();
        $q = RestatedBase::join(DB::table('voucher_entries as e')->join('vouchers as v', 'v.id', '=', 'e.voucher_id'))
            ->join('ledgers as l', 'l.id', '=', 'e.ledger_id')->join('ledger_groups as g', 'g.id', '=', 'l.group_id')
            ->where('v.status', Voucher::POSTED)->whereIn('g.nature', ['income', 'expense'])->whereNotNull('e.cost_centre_id')
            ->selectRaw("e.cost_centre_id, g.nature, SUM(CASE WHEN e.side='D' THEN {$b} ELSE 0 END) AS dr, SUM(CASE WHEN e.side='C' THEN {$b} ELSE 0 END) AS cr")
            ->groupBy('e.cost_centre_id', 'g.nature');
        if ($scope->from) {
            $q->where('v.date', '>=', $scope->from);
        }
        if ($scope->to) {
            $q->where('v.date', '<=', $scope->to);
        }
        if ($scope->locationId !== null) {
            $q->where('e.location_id', $scope->locationId);
        }
        app(BranchFilter::class)->apply($q, 'v.location_id', 'books', 'reports');
        $own = [];
        foreach ($q->get() as $r) {
            $o = &$own[(int) $r->cost_centre_id];
            $o ??= ['income' => 0.0, 'expense' => 0.0];
            if ($r->nature === 'income') {
                $o['income'] += (float) $r->cr - (float) $r->dr;
            } else {
                $o['expense'] += (float) $r->dr - (float) $r->cr;
            }
            unset($o);
        }

        $tree = $svc->tree();
        $children = [];
        foreach ($tree as $r) {
            $children[$r['parent_id'] ?? 0][] = $r['id'];
        }
        $total = [];
        $sum = function ($id) use (&$sum, &$total, $own, $children) {
            $t = ($own[$id] ?? ['income' => 0.0, 'expense' => 0.0]);
            foreach ($children[$id] ?? [] as $c) {
                $ct = $sum($c);
                $t['income'] += $ct['income'];
                $t['expense'] += $ct['expense'];
            }

            return $total[$id] = $t;
        };
        foreach ($children[0] ?? [] as $root) {
            $sum($root);
        }

        $rows = [];
        foreach ($tree as $r) {
            $t = $total[$r['id']] ?? ['income' => 0.0, 'expense' => 0.0];
            if (abs($t['income']) < 0.005 && abs($t['expense']) < 0.005) {
                continue;
            }
            $o = $own[$r['id']] ?? ['income' => 0.0, 'expense' => 0.0];
            $rows[] = ['cost_centre_id' => $r['id'], 'name' => $r['name'], 'code' => $r['code'], 'purpose' => $r['purpose'], 'depth' => $r['depth'], 'path' => $r['path'],
                'own_income' => round($o['income'], 2), 'own_expense' => round($o['expense'], 2), 'own_profit' => round($o['income'] - $o['expense'], 2),
                'income' => round($t['income'], 2), 'expense' => round($t['expense'], 2), 'profit' => round($t['income'] - $t['expense'], 2)];
        }
        $inc = round(array_sum(array_column($own, 'income')), 2);
        $exp = round(array_sum(array_column($own, 'expense')), 2);

        return ['ready' => true, 'rows' => $rows, 'totals' => ['income' => $inc, 'expense' => $exp, 'profit' => round($inc - $exp, 2)]];
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = array_map(fn ($x) => ['name' => str_repeat('  ', $x['depth']) . $x['name'], 'own_income' => $x['own_income'], 'own_expense' => $x['own_expense'], 'income' => $x['income'], 'expense' => $x['expense'], 'profit' => $x['profit']], $data['rows'] ?? []);

        return ['title' => $this->title(), 'subtitle' => $this->period($scope),
            'columns' => ['name' => 'Cost centre', 'own_income' => 'Own income', 'own_expense' => 'Own expenses', 'income' => 'Income (with sub-centres)', 'expense' => 'Expenses (with sub-centres)', 'profit' => 'Profit'],
            'rows' => $rows, 'totals' => ['name' => 'Whole company', 'income' => $data['totals']['income'], 'expense' => $data['totals']['expense'], 'profit' => $data['totals']['profit']]];
    }
}
