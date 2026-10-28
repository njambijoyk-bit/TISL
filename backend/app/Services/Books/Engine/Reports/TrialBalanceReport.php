<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;

/**
 * Trial balance: every ledger with a balance or movement, its opening, debit, credit and closing. The ledger view; the group view, the adjusted
 * trial balance and comparisons arrive with step 5.
 *
 * Every opening balance needs an opposite one. When they do not net to nothing the trial balance can never balance, so, as Tally does, a placeholder
 * line "Difference in opening balances" carries the difference and the report says which ledgers hold the openings.
 */
final class TrialBalanceReport extends ReportDefinition
{
    public function key(): string
    {
        return 'trial-balance';
    }

    public function title(): string
    {
        return 'Trial balance';
    }

    public function run(Scope $scope, array $options): array
    {
        $balances = app(LedgerBalances::class);
        $t = $balances->trial($scope);
        $rows = $t['rows'];
        $tDr = $t['total_debit'];
        $tCr = $t['total_credit'];

        $openings = $balances->openings();
        $filtered = $scope->dimensional();
        $diff = ! $filtered && abs($openings['net']) >= 0.01 ? round($openings['net'], 2) : 0.0;
        if ($diff != 0.0) {
            $rows[] = ['ledger_id' => null, 'ledger' => 'Difference in opening balances', 'group_id' => null, 'group' => '', 'nature' => null, 'statement_id' => null, 'placeholder' => true,
                'opening' => -$diff, 'debit' => 0, 'credit' => 0, 'closing' => -$diff];
            $tDr += $diff < 0 ? -$diff : 0;
            $tCr += $diff > 0 ? $diff : 0;
        }

        return [
            'rows' => $rows, 'total_debit' => round($tDr, 2), 'total_credit' => round($tCr, 2), 'balanced' => abs($tDr - $tCr) < 0.01,
            'opening_difference' => $diff, 'opening_balances' => $diff != 0.0 ? $openings['rows'] : [], 'filtered' => $filtered,
        ];
    }

    public function table(array $data, Scope $scope): array
    {
        return [
            'title' => $this->title(), 'subtitle' => $this->period($scope),
            'columns' => ['group' => 'Group', 'ledger' => 'Ledger', 'opening' => 'Opening', 'debit' => 'Debit', 'credit' => 'Credit', 'closing' => 'Closing (Dr +)'],
            'rows' => array_map(fn ($r) => ['group' => $r['group'], 'ledger' => $r['ledger'], 'opening' => $r['opening'], 'debit' => $r['debit'], 'credit' => $r['credit'], 'closing' => $r['closing']], $data['rows']),
            'totals' => ['ledger' => 'Closing totals', 'debit' => 'Dr ' . number_format($data['total_debit'], 2), 'credit' => 'Cr ' . number_format($data['total_credit'], 2)],
        ];
    }
}
