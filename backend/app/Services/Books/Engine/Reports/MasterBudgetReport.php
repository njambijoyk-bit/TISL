<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\BudgetService;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\MasterBudgetService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Master budget and cash (docs/BOOKS_BUDGETING_PLAN.md, step 7): every budget that covers the dates brought into one plan (income, expenses and the result by month and by ledger
 * group), and the cash budget under it: from the cash held at the start, month by month, does the plan leave the business with enough cash? See MasterBudgetService for the rules.
 */
final class MasterBudgetReport extends ReportDefinition
{
    public function key(): string
    {
        return 'master-budget';
    }

    public function title(): string
    {
        return 'Master budget and cash';
    }

    public function filters(): array
    {
        return [];
    }

    public function options(): array
    {
        $choices = ['0' => 'Every budget that covers these dates'];
        if (BudgetService::ready()) {
            foreach (DB::table('budgets')->where('is_active', 1)->orderBy('from_month', 'desc')->orderBy('id')->get(['id', 'name']) as $b) {
                $choices[(string) $b->id] = $b->name;
            }
        }

        return [['key' => 'budget', 'label' => 'Budget', 'choices' => $choices, 'default' => '0']];
    }

    public function run(Scope $scope, array $options): array
    {
        if (! BudgetService::ready()) {
            return ['ready' => false, 'message' => 'Run database scripts 237, 239 and 240 (budgets) to turn this report on.'];
        }
        $from = substr($scope->from ?? now()->startOfYear()->toDateString(), 0, 7);
        $to = substr($scope->to ?? now()->endOfYear()->toDateString(), 0, 7);
        if (abs(Carbon::parse($to . '-01')->diffInMonths(Carbon::parse($from . '-01'))) > 36) {
            return ['ready' => false, 'message' => 'Choose dates covering at most three years.'];
        }
        $only = ! empty($options['budget']) && $options['budget'] !== '0' ? (int) $options['budget'] : null;
        $r = app(MasterBudgetService::class)->build($from, $to, $only);
        if (! $r['budgets']) {
            return ['ready' => false, 'message' => 'There is no budget for these dates yet. Make one under Configuration → Budgeting.'];
        }

        return ['ready' => true] + $r;
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = array_map(fn ($m) => ['month' => $m['month'], 'income' => $m['income'], 'expense' => $m['expense'], 'result' => $m['result'], 'receipts' => $m['receipts'], 'payments' => $m['payments'], 'assets' => $m['assets'], 'financing' => $m['financing'], 'net_cash' => $m['net_cash'], 'closing' => $m['closing']], $data['months'] ?? []);
        $t = $data['totals'] ?? [];

        return ['title' => $this->title(), 'subtitle' => $this->period($scope),
            'columns' => ['month' => 'Month', 'income' => 'Planned income', 'expense' => 'Planned expenses', 'result' => 'Planned result', 'receipts' => 'Cash in from customers', 'payments' => 'Cash out to suppliers', 'assets' => 'Assets bought', 'financing' => 'Loans and capital', 'net_cash' => 'Net cash', 'closing' => 'Cash at month end'],
            'rows' => $rows, 'totals' => ['month' => 'Whole period', 'income' => $t['income'] ?? 0, 'expense' => $t['expense'] ?? 0, 'result' => $t['result'] ?? 0, 'receipts' => $t['receipts'] ?? 0, 'payments' => $t['payments'] ?? 0, 'assets' => $t['assets'] ?? 0, 'financing' => $t['financing'] ?? 0, 'net_cash' => $t['net_cash'] ?? 0]];
    }
}
