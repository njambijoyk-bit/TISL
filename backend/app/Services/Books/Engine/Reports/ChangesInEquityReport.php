<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\Engine\StatementBuilder;

/**
 * Statement of changes in equity for a period (docs/BOOKS_REPORTS_PLAN.md, step 7): for each equity ledger and for retained earnings, what it was at the start
 * of the period, the profit or loss of the period, other movements (capital introduced, drawings) and what it is at the end. The closing figures are the balance
 * sheet's: total equity at the end date is the same number the balance sheet shows.
 *
 * Retained earnings is what the income and expense ledgers hold: everything before the period at the start, the period's profit in the profit column. It
 * ignores a cost centre or branch (equity belongs to the whole business); a person's branch limit still applies.
 */
final class ChangesInEquityReport extends ReportDefinition
{
    public function key(): string
    {
        return 'changes-in-equity';
    }

    public function title(): string
    {
        return 'Changes in equity';
    }

    public function filters(): array
    {
        return [];
    }

    public function run(Scope $scope, array $options): array
    {
        if (! StatementBuilder::available() || ! LedgerBalances::hasColumn('ledger_groups', 'statement_id')) {
            return ['ready' => false, 'message' => 'Run database script 227_statements.sql to build the statements.', 'rows' => []];
        }
        $from = $scope->from;
        $to = $scope->to ?: now()->toDateString();
        $whole = Scope::dates(null, $to, $scope->area);
        $balances = app(LedgerBalances::class);
        $builder = new StatementBuilder();

        $equity = [];   // statement line id => true: the lines under the Equity heading
        $root = $builder->rootId('BS');
        foreach ($root ? $builder->childrenOf($root) : [] as $id) {
            if ($builder->node($id)->code === 'BS.E') {
                $equity = array_flip($builder->linesUnder($id));
            }
        }

        $upTo = $balances->movement($whole, null, $to);                         // everything up to the end
        $before = $from ? $balances->movement($whole, null, null, $from) : []; // everything before the start
        $period = $from ? $balances->movement($whole, $from, $to) : $upTo;
        $rows = [];
        $retainedOpen = 0.0;   // credit positive
        $profit = 0.0;
        foreach ($balances->ledgers() as $l) {
            $open = $balances->opening($l, $whole);
            if (in_array($l->nature, ['income', 'expense'], true)) {
                $retainedOpen -= $open + ($before[$l->id]['dr'] ?? 0) - ($before[$l->id]['cr'] ?? 0);
                $profit -= ($period[$l->id]['dr'] ?? 0) - ($period[$l->id]['cr'] ?? 0);
                continue;
            }
            if (! ($l->statement_id && isset($equity[$l->statement_id]))) {
                continue;
            }
            $start = -($open + ($before[$l->id]['dr'] ?? 0) - ($before[$l->id]['cr'] ?? 0));   // credit positive
            $move = -(($period[$l->id]['dr'] ?? 0) - ($period[$l->id]['cr'] ?? 0));
            if (abs($start) < 0.005 && abs($move) < 0.005) {
                continue;
            }
            $rows[] = ['key' => 'ledger:' . $l->id, 'ledger_id' => (int) $l->id, 'name' => $l->name, 'opening' => round($start, 2), 'profit' => 0.0, 'other' => round($move, 2), 'closing' => round($start + $move, 2)];
        }
        $rows[] = ['key' => 'retained', 'ledger_id' => null, 'name' => 'Retained earnings', 'opening' => round($retainedOpen, 2), 'profit' => round($profit, 2), 'other' => 0.0, 'closing' => round($retainedOpen + $profit, 2)];
        $total = ['opening' => 0.0, 'profit' => 0.0, 'other' => 0.0, 'closing' => 0.0];
        foreach ($rows as $r) {
            foreach ($total as $k => $_) {
                $total[$k] += $r[$k];
            }
        }

        return ['ready' => true, 'from' => $from, 'to' => $to, 'rows' => $rows, 'totals' => array_map(fn ($v) => round($v, 2), $total)];
    }

    public function table(array $data, Scope $scope): array
    {
        return ['title' => $this->title(), 'subtitle' => $this->period($scope),
            'columns' => ['name' => 'Particulars', 'opening' => 'Opening', 'profit' => 'Profit (loss) for the period', 'other' => 'Other movements', 'closing' => 'Closing'],
            'rows' => array_map(fn ($r) => ['name' => $r['name'], 'opening' => $r['opening'], 'profit' => $r['profit'], 'other' => $r['other'], 'closing' => $r['closing']], $data['rows'] ?? []),
            'totals' => ['name' => 'Total equity'] + ($data['totals'] ?? [])];
    }
}
