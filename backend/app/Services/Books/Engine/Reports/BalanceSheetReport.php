<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\Engine\StatementBuilder;
use App\Services\Books\ReportSettings;

/**
 * Balance sheet at a date: Assets, Equity and Liabilities, built from the statement lines, each opening to the ledgers on it.
 *
 * The books are not closed at year end, so the profit and loss ledgers still hold everything since the business began. They are shown in Equity as
 * two lines: "Retained earnings: previous years" (everything before the financial year the date falls in, with any opening balance on those ledgers)
 * and "Profit for the year" (from the start of that year to the date). Together they are what the old report showed as one "Profit & Loss (to date)".
 *
 * Ledgers on no line of the balance sheet are shown under "not on a statement line", and a difference in opening balances is carried on the
 * lighter side, as the old report did, so the two sides always add up to what the books hold.
 *
 * It ignores a cost centre or branch (opening balances belong to the whole business); a person's branch limit still applies.
 */
final class BalanceSheetReport extends ReportDefinition
{
    public function key(): string
    {
        return 'balance-sheet';
    }

    public function title(): string
    {
        return 'Balance sheet';
    }

    public function kind(): string
    {
        return 'asof';
    }

    public function supportsComparison(): bool
    {
        return true;
    }

    public function filters(): array
    {
        return [];
    }

    public function run(Scope $scope, array $options): array
    {
        if (! StatementBuilder::available() || ! LedgerBalances::hasColumn('ledger_groups', 'statement_id')) {
            return ['ready' => false, 'message' => 'Run database script 227_statements.sql to build the statements.', 'columns' => ['total'], 'rows' => []];
        }
        $asOf = $scope->to ?: now()->toDateString();
        $whole = Scope::dates(null, $asOf, $scope->area);
        $balances = app(LedgerBalances::class);
        $builder = new StatementBuilder();
        $showZero = (bool) app(ReportSettings::class)->get('show_zero_balances');
        $cols = ['total'];

        $yearStart = $balances->yearStart($asOf);
        $upTo = $balances->movement($whole, null, $asOf);
        $before = $balances->movement($whole, null, null, $yearStart);
        $thisYear = $balances->movement($whole, $yearStart, $asOf);

        $ledgers = [];
        $priorProfit = $yearProfit = 0.0;   // credit-positive, the profit and loss ledgers added up
        foreach ($balances->ledgers() as $l) {
            $open = $balances->opening($l, $whole);
            if (in_array($l->nature, ['income', 'expense'], true)) {
                $priorProfit -= $open + ($before[$l->id]['dr'] ?? 0) - ($before[$l->id]['cr'] ?? 0);
                $yearProfit -= ($thisYear[$l->id]['dr'] ?? 0) - ($thisYear[$l->id]['cr'] ?? 0);
                continue;
            }
            $bal = $open + ($upTo[$l->id]['dr'] ?? 0) - ($upTo[$l->id]['cr'] ?? 0);
            $amount = round($l->nature === 'asset' ? $bal : -$bal, 2);
            $ledgers[] = ['id' => (int) $l->id, 'name' => $l->name, 'group' => $l->group_name, 'nature' => $l->nature, 'statement_id' => $l->statement_id ? (int) $l->statement_id : null, 'amounts' => ['total' => $amount]];
        }
        $priorProfit = round($priorProfit, 2);
        $yearProfit = round($yearProfit, 2);

        $placed = $builder->place('BS', $ledgers);
        $equityLines = [];   // the lines under Equity, to total it from the ledgers
        $rootId = $builder->rootId('BS');
        foreach ($rootId ? $builder->childrenOf($rootId) : [] as $id) {
            if ($builder->node($id)->code === 'BS.E') {
                $equityLines = array_flip($builder->linesUnder($id));
            }
        }
        $loose = ['asset' => [], 'liability' => []];
        foreach ($placed['loose'] as $l) {
            $loose[$l['nature']][] = $l;
        }
        $unclassified = 0;
        $extra = [];
        $add = function (string $heading, array $rows, array $total) use (&$extra) {
            $extra[$heading]['rows'] = array_merge($extra[$heading]['rows'] ?? [], $rows);
            $extra[$heading]['total'] = StatementBuilder::plus($extra[$heading]['total'] ?? ['total' => 0.0], $total);
        };
        foreach (['asset' => ['BS.A', 'Assets not on a statement line'], 'liability' => ['BS.L', 'Liabilities not on a statement line']] as $nature => [$heading, $label]) {
            if ($loose[$nature]) {
                $block = $builder->lineBlock((object) ['code' => 'BS.LOOSE.' . strtoupper($nature), 'name' => $label, 'nature' => $nature], $loose[$nature], $cols, $showZero, 1, 'heading:' . $heading);
                $add($heading, $block['rows'], $block['total']);
                $unclassified += count(array_filter($loose[$nature], fn ($l) => ! StatementBuilder::isZero($l['amounts'])));
            }
        }

        // retained earnings, in Equity
        $retained = [];
        foreach ([['prior', 'Retained earnings: previous years', $priorProfit], ['current', 'Profit (loss) for the year', $yearProfit]] as [$k, $name, $amount]) {
            if ($showZero || abs($amount) >= 0.005) {
                $retained[] = ['key' => 'retained:' . $k, 'type' => 'line', 'code' => 'retained.' . $k, 'name' => $name, 'amounts' => ['total' => $amount], 'expandable' => false];
            }
        }
        $add('BS.E', $retained, ['total' => $priorProfit + $yearProfit]);

        // a difference in opening balances sits on the lighter side
        $net = $balances->openings()['net'];
        $diff = abs($net) < 0.01 ? 0.0 : round($net, 2);
        if ($diff != 0.0) {
            $side = $diff > 0 ? 'BS.L' : 'BS.A';
            $amount = abs($diff);
            $add($side, [['key' => 'placeholder:opening', 'type' => 'line', 'code' => 'placeholder.opening', 'name' => 'Difference in opening balances', 'placeholder' => true, 'amounts' => ['total' => $amount], 'expandable' => false]], ['total' => $amount]);
        }

        $rows = [];
        $heads = [];
        $root = $builder->rootId('BS');
        foreach ($root ? $builder->childrenOf($root) : [] as $id) {
            $node = $builder->node($id);
            $block = $node->kind === 'line'
                ? $builder->lineBlock($node, $placed['by_line'][$id] ?? [], $cols, $showZero, 0, '')
                : $builder->headingBlock($id, $placed['by_line'], $cols, $showZero, 0, '', $extra);
            $rows = array_merge($rows, $block['rows']);
            $heads[$node->code] = $block['total']['total'];
        }

        // the totals come from the ledgers themselves, so a statement line that has gone missing cannot lose an amount
        $totalAssets = round(array_sum(array_map(fn ($l) => $l['nature'] === 'asset' ? $l['amounts']['total'] : 0, $ledgers)) + ($diff < 0 ? abs($diff) : 0), 2);
        $totalLiabilities = round(array_sum(array_map(fn ($l) => $l['nature'] === 'liability' ? $l['amounts']['total'] : 0, $ledgers)) + ($diff > 0 ? $diff : 0), 2);
        $equity = round($priorProfit + $yearProfit + array_sum(array_map(fn ($l) => $l['statement_id'] && isset($equityLines[$l['statement_id']]) ? $l['amounts']['total'] : 0, $ledgers)), 2);
        $liabilitiesAndEquity = round($totalLiabilities + $priorProfit + $yearProfit, 2);

        return [
            'ready' => true, 'as_of' => $asOf, 'columns' => $cols, 'rows' => $rows, 'unclassified' => $unclassified, 'year_start' => $yearStart,
            'opening_difference' => $diff, 'retained' => ['prior' => $priorProfit, 'current' => $yearProfit],
            'totals' => ['assets' => $totalAssets, 'equity' => $equity, 'liabilities' => round($liabilitiesAndEquity - $equity, 2), 'liabilities_and_equity' => $liabilitiesAndEquity],
            // the figures the old report gave
            'total_assets' => $totalAssets, 'total_liabilities' => $liabilitiesAndEquity, 'balanced' => abs($totalAssets - $liabilitiesAndEquity) < 0.01,
            'headings' => array_map(fn ($v) => round($v, 2), $heads),
        ];
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = [];
        foreach ($data['rows'] ?? [] as $r) {
            $rows[] = ['name' => str_repeat('    ', $r['depth']) . $r['name'], 'total' => $r['amounts']['total']];
        }

        return ['title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => ['name' => 'Particulars', 'total' => 'Amount'], 'rows' => $rows,
            'totals' => ['name' => 'Total assets / total equity and liabilities', 'total' => number_format($data['total_assets'] ?? 0, 2) . ' / ' . number_format($data['total_liabilities'] ?? 0, 2)]];
    }
}
