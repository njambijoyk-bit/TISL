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
            'groups' => $this->groups($t['rows']),
            'rows' => $rows, 'total_debit' => round($tDr, 2), 'total_credit' => round($tCr, 2), 'balanced' => abs($tDr - $tCr) < 0.01,
            'opening_difference' => $diff, 'opening_balances' => $diff != 0.0 ? $openings['rows'] : [], 'filtered' => $filtered,
        ];
    }

    /**
     * The same figures added up by ledger group: every group that holds a ledger with something in it, with the groups above it, each carrying the
     * total of everything under it, in the order of the chart. A ledger's own row is not repeated here.
     *
     * @param  array<int, array>  $ledgerRows  the ledger rows (without the placeholder)
     * @return array<int, array>
     */
    private function groups(array $ledgerRows): array
    {
        $groups = app(LedgerBalances::class)->groups();
        $sum = [];
        foreach ($ledgerRows as $r) {
            $id = $r['group_id'];
            for ($guard = 0; $id && isset($groups[$id]) && $guard < 20; $guard++, $id = $groups[$id]['parent_id']) {
                $sum[$id] ??= ['opening' => 0.0, 'debit' => 0.0, 'credit' => 0.0, 'closing' => 0.0];
                foreach (['opening', 'debit', 'credit', 'closing'] as $k) {
                    $sum[$id][$k] += $r[$k];
                }
            }
        }
        $children = [];
        foreach ($groups as $g) {
            $children[$g['parent_id'] ?? 0][] = $g['id'];
        }
        $out = [];
        $walk = function (int $parent, int $depth) use (&$walk, &$out, $children, $groups, $sum) {
            foreach ($children[$parent] ?? [] as $id) {
                if (! isset($sum[$id])) {
                    continue;
                }
                $out[] = ['group_id' => $id, 'parent_id' => $groups[$id]['parent_id'], 'group' => $groups[$id]['name'], 'depth' => $depth, 'nature' => $groups[$id]['nature'],
                    'opening' => round($sum[$id]['opening'], 2), 'debit' => round($sum[$id]['debit'], 2), 'credit' => round($sum[$id]['credit'], 2), 'closing' => round($sum[$id]['closing'], 2)];
                $walk($id, $depth + 1);
            }
        };
        $walk(0, 0);

        return $out;
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
