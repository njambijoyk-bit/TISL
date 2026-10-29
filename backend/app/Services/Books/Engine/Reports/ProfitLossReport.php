<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\LedgerBalances;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Books\Engine\StatementBuilder;
use App\Services\Books\ReportSettings;

/**
 * Profit and loss: the income statement, built from the statement lines (Revenue, Cost of sales, Other income, Operating expenses, Finance income,
 * Finance costs, Income tax and any line added under the Income statement), each opening to the ledgers on it.
 *
 *   Gross profit     = revenue − cost of sales
 *   Operating profit = gross profit + other income − operating expenses (and any other line)
 *   Profit before tax = operating profit + finance income − finance costs
 *   Net profit       = profit before tax − income tax
 *
 * A ledger on no line of the income statement is shown under "not on a statement line" in the operating tier, so the profit is never short of it.
 * `columns` = `months` shows every month of the period beside the total.
 */
final class ProfitLossReport extends ReportDefinition
{
    /** Tier of a line, by its code (1 trading, 2 operating, 3 finance, 4 tax). Any other line is operating. */
    private const TIERS = ['IS.REV' => 1, 'IS.COGS' => 1, 'IS.FININC' => 3, 'IS.FINCOST' => 3, 'IS.TAX' => 4];

    public function key(): string
    {
        return 'profit-loss';
    }

    public function title(): string
    {
        return 'Profit & loss';
    }

    public function supportsComparison(): bool
    {
        return true;
    }

    public function options(): array
    {
        return [['key' => 'columns', 'label' => 'Show', 'choices' => ['total' => 'The period', 'months' => 'Month by month'], 'default' => 'total']];
    }

    public function run(Scope $scope, array $options): array
    {
        if (! StatementBuilder::available() || ! LedgerBalances::hasColumn('ledger_groups', 'statement_id')) {
            return ['ready' => false, 'message' => 'Run database script 227_statements.sql to build the statements.', 'columns' => ['total'], 'rows' => []];
        }
        $balances = app(LedgerBalances::class);
        $builder = new StatementBuilder();
        $showZero = (bool) app(ReportSettings::class)->get('show_zero_balances');
        $cols = StatementBuilder::columns(($options['columns'] ?? 'total') === 'months', $scope->from, $scope->to);
        $byMonth = count($cols) > 1;

        $total = $balances->movement($scope, $scope->from, $scope->to);
        $monthly = $byMonth ? $balances->movementByMonth($scope, $scope->from, $scope->to) : [];
        $ledgers = [];
        foreach ($balances->ledgers() as $l) {
            if (! in_array($l->nature, ['income', 'expense'], true)) {
                continue;
            }
            $sign = $l->nature === 'income' ? -1 : 1;   // the natural side positive
            $v = ['total' => round($sign * (($total[$l->id]['dr'] ?? 0) - ($total[$l->id]['cr'] ?? 0)), 2)];
            foreach (array_slice($cols, 1) as $m) {
                $v[$m] = round($sign * (($monthly[$l->id][$m]['dr'] ?? 0) - ($monthly[$l->id][$m]['cr'] ?? 0)), 2);
            }
            $ledgers[] = ['id' => (int) $l->id, 'name' => $l->name, 'group' => $l->group_name, 'nature' => $l->nature, 'statement_id' => $l->statement_id ? (int) $l->statement_id : null, 'amounts' => $v];
        }
        $placed = $builder->place('IS', $ledgers);
        $byLine = $placed['by_line'];

        // the lines, with the ledgers that are on no line added as two lines of their own in the operating tier
        $lines = [];
        $root = $builder->rootId('IS');
        foreach ($root ? $builder->linesUnder($root) : [] as $id) {
            $n = $builder->node($id);
            $lines[] = ['tier' => self::TIERS[$n->code] ?? 2, 'node' => $n, 'ledgers' => $byLine[$id] ?? []];
        }
        $loose = ['income' => [], 'expense' => []];
        foreach ($placed['loose'] as $l) {
            $loose[$l['nature']][] = $l;
        }
        $unclassified = 0;
        foreach (['income' => 'Income not on a statement line', 'expense' => 'Expenses not on a statement line'] as $nature => $label) {
            if ($loose[$nature]) {
                $lines[] = ['tier' => 2, 'node' => (object) ['code' => 'IS.LOOSE.' . strtoupper($nature), 'name' => $label, 'nature' => $nature], 'ledgers' => $loose[$nature]];
                $unclassified += count(array_filter($loose[$nature], fn ($l) => ! StatementBuilder::isZero($l['amounts'])));
            }
        }
        usort($lines, fn ($a, $b) => $a['tier'] <=> $b['tier']);   // stable: the tree's order within a tier

        $zero = StatementBuilder::zero($cols);
        $tier = [1 => ['rows' => [], 'profit' => $zero, 'income' => $zero, 'expense' => $zero], 2 => ['rows' => [], 'profit' => $zero, 'income' => $zero, 'expense' => $zero],
            3 => ['rows' => [], 'profit' => $zero, 'income' => $zero, 'expense' => $zero], 4 => ['rows' => [], 'profit' => $zero, 'income' => $zero, 'expense' => $zero]];
        $sections = ['income_direct' => [], 'expense_direct' => [], 'income_indirect' => [], 'expense_indirect' => []];   // the ledgers behind the totals, for other modules that list the biggest
        foreach ($lines as $ln) {
            foreach ($ln['ledgers'] as $l) {
                if (! StatementBuilder::isZero($l['amounts'])) {
                    $sections[($ln['node']->nature === 'income' ? 'income_' : 'expense_') . ($ln['tier'] === 1 ? 'direct' : 'indirect')][] = ['ledger_id' => $l['id'], 'ledger' => $l['name'], 'amount' => $l['amounts']['total']];
                }
            }
            $block = $builder->lineBlock($ln['node'], $ln['ledgers'], $cols, $showZero, 0, '');
            $t = &$tier[$ln['tier']];
            $t['rows'] = array_merge($t['rows'], $block['rows']);
            if ($ln['node']->nature === 'income') {
                $t['income'] = StatementBuilder::plus($t['income'], $block['total']);
                $t['profit'] = StatementBuilder::plus($t['profit'], $block['total']);
            } else {
                $t['expense'] = StatementBuilder::plus($t['expense'], $block['total']);
                $t['profit'] = StatementBuilder::minus($t['profit'], $block['total']);
            }
            unset($t);
        }

        $gross = $tier[1]['profit'];
        $operating = StatementBuilder::plus($gross, $tier[2]['profit']);
        $beforeTax = StatementBuilder::plus($operating, $tier[3]['profit']);
        $net = StatementBuilder::plus($beforeTax, $tier[4]['profit']);

        $rows = $tier[1]['rows'];
        $rows[] = $this->subtotal('gross_profit', 'Gross profit', $gross);
        $rows = array_merge($rows, $tier[2]['rows']);
        if ($tier[3]['rows'] || $tier[4]['rows']) {
            $rows[] = $this->subtotal('operating_profit', 'Operating profit', $operating);
        }
        $rows = array_merge($rows, $tier[3]['rows']);
        if ($tier[4]['rows']) {
            $rows[] = $this->subtotal('profit_before_tax', 'Profit before tax', $beforeTax);
        }
        $rows = array_merge($rows, $tier[4]['rows']);
        $rows[] = $this->subtotal('net_profit', 'Net profit', $net, true);

        $revenue = $tier[1]['income'];
        $margin = function (array $profit) use ($revenue, $cols) {
            $out = [];
            foreach ($cols as $c) {
                $out[$c] = abs($revenue[$c]) >= 0.005 ? round($profit[$c] / $revenue[$c] * 100, 2) : null;
            }

            return $out;
        };
        $pre = \App\Services\Preorders\PreorderService::ready() && ! $scope->dimensional() ? app(\App\Services\Preorders\PreorderService::class)->paidNotDelivered() : null;
        $sum = fn (array $a, array $b) => round(StatementBuilder::plus($a, $b)['total'], 2);

        return [
            'ready' => true, 'columns' => $cols, 'rows' => $rows, 'unclassified' => $unclassified, 'sections' => $sections,
            // the headline figures, for the dashboard, the insight packs and anything else that needs only the totals
            'totals' => [
                'direct_income' => round($tier[1]['income']['total'], 2), 'direct_expense' => round($tier[1]['expense']['total'], 2), 'gross_profit' => round($gross['total'], 2),
                'indirect_income' => $sum(StatementBuilder::plus($tier[2]['income'], $tier[3]['income']), $tier[4]['income']),
                'indirect_expense' => $sum(StatementBuilder::plus($tier[2]['expense'], $tier[3]['expense']), $tier[4]['expense']),
                'net_profit' => round($net['total'], 2),
            ],
            'profit' => ['gross' => StatementBuilder::round($gross), 'operating' => StatementBuilder::round($operating), 'before_tax' => StatementBuilder::round($beforeTax), 'net' => StatementBuilder::round($net)],
            'revenue' => StatementBuilder::round($revenue),
            'margins' => ['gross' => $margin($gross), 'net' => $margin($net)],
            'paid_not_delivered' => $pre && $pre['lines'] > 0 ? $pre : null,
        ];
    }

    private function subtotal(string $key, string $name, array $amounts, bool $grand = false): array
    {
        return ['key' => 'subtotal:' . $key, 'parent' => '', 'type' => $grand ? 'total' : 'subtotal', 'depth' => 0, 'code' => $key, 'name' => $name, 'amounts' => StatementBuilder::round($amounts)];
    }

    public function table(array $data, Scope $scope): array
    {
        $cols = ['name' => 'Particulars'] + array_combine($data['columns'], array_map(fn ($c) => $c === 'total' ? 'Total' : $c, $data['columns']));
        $rows = [];
        foreach ($data['rows'] ?? [] as $r) {
            $rows[] = ['name' => str_repeat('    ', $r['depth']) . $r['name']] + $r['amounts'];
        }

        return ['title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => $cols, 'rows' => $rows];
    }
}
