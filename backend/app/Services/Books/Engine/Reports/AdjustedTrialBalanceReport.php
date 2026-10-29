<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;

/**
 * Adjusted (post-closing) trial balance at a date (docs/BOOKS_REPORTS_PLAN.md, step 7): the balance-sheet ledgers with what the income and expense ledgers hold moved
 * into one retained earnings line, as a year-end close leaves them. Income and expense ledgers do not appear; debits equal credits. A difference in opening
 * balances is shown on its own line so the two sides still agree with what the books hold.
 */
final class AdjustedTrialBalanceReport extends ReportDefinition
{
    public function key(): string
    {
        return 'adjusted-trial-balance';
    }

    public function title(): string
    {
        return 'Adjusted trial balance';
    }

    public function kind(): string
    {
        return 'asof';
    }

    public function filters(): array
    {
        return [];
    }

    public function run(Scope $scope, array $options): array
    {
        $asOf = $scope->to ?: now()->toDateString();
        $whole = Scope::dates(null, $asOf, $scope->area);
        $balances = app(LedgerBalances::class);
        $upTo = $balances->movement($whole, null, $asOf);
        $rows = [];
        $retained = 0.0;   // credit positive
        foreach ($balances->ledgers() as $l) {
            $bal = $balances->opening($l, $whole) + ($upTo[$l->id]['dr'] ?? 0) - ($upTo[$l->id]['cr'] ?? 0);   // debit positive
            if (in_array($l->nature, ['income', 'expense'], true)) {
                $retained -= $bal;
                continue;
            }
            if (abs($bal) < 0.005) {
                continue;
            }
            $rows[] = ['ledger_id' => (int) $l->id, 'name' => $l->name, 'group' => $l->group_name, 'debit' => $bal > 0 ? round($bal, 2) : 0.0, 'credit' => $bal < 0 ? round(-$bal, 2) : 0.0];
        }
        $retained = round($retained, 2);
        if (abs($retained) >= 0.005) {
            $rows[] = ['ledger_id' => null, 'name' => 'Retained earnings (profit and loss of all years)', 'group' => 'Equity', 'debit' => $retained < 0 ? -$retained : 0.0, 'credit' => $retained > 0 ? $retained : 0.0];
        }
        $dr = array_sum(array_column($rows, 'debit'));
        $cr = array_sum(array_column($rows, 'credit'));
        $diff = round($dr - $cr, 2);   // what the opening balances were out by, if they were
        if (abs($diff) >= 0.01) {
            $rows[] = ['ledger_id' => null, 'name' => 'Difference in opening balances', 'group' => '', 'debit' => $diff < 0 ? -$diff : 0.0, 'credit' => $diff > 0 ? $diff : 0.0, 'placeholder' => true];
            $dr += $diff < 0 ? -$diff : 0.0;
            $cr += $diff > 0 ? $diff : 0.0;
        }

        return ['ready' => true, 'as_of' => $asOf, 'rows' => $rows, 'totals' => ['debit' => round($dr, 2), 'credit' => round($cr, 2)], 'balanced' => abs($dr - $cr) < 0.01, 'opening_difference' => $diff];
    }

    public function table(array $data, Scope $scope): array
    {
        return ['title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => ['name' => 'Ledger', 'group' => 'Group', 'debit' => 'Debit', 'credit' => 'Credit'],
            'rows' => array_map(fn ($r) => ['name' => $r['name'], 'group' => $r['group'], 'debit' => $r['debit'], 'credit' => $r['credit']], $data['rows'] ?? []),
            'totals' => ['name' => 'Total', 'debit' => $data['totals']['debit'] ?? 0, 'credit' => $data['totals']['credit'] ?? 0]];
    }
}
