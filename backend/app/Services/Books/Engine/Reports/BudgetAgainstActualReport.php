<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\BudgetService;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use Illuminate\Support\Facades\DB;

/**
 * Budget against actual on the engine (docs/BOOKS_BUDGETING_PLAN.md, step 4): every budgeted account in a budget version set against what the books show in the period, with the
 * gap (positive is good news: spending under budget, earnings above it), the gap as a percent, how much of the budget is used and what remains. It can be grouped by account,
 * cost centre, department, branch or initiative; each group opens to what it is made of, and a group's ledgers are what the person follows into the ledger statement.
 * Actuals are read through the same engine as every report, with the row's own cost centre, department and branch; an initiative has none until the books carry it.
 */
final class BudgetAgainstActualReport extends ReportDefinition
{
    private const BY = ['account' => 'Account', 'cost_centre' => 'Cost centre', 'department' => 'Department', 'branch' => 'Branch', 'initiative' => 'Initiative'];

    public function key(): string
    {
        return 'budget-against-actual';
    }

    public function title(): string
    {
        return 'Budget against actual';
    }

    public function filters(): array
    {
        return [];   // each budget row carries its own cost centre, department and branch
    }

    public function options(): array
    {
        $versions = ['0' => 'The current version of the budget for these dates'];
        if (BudgetService::ready()) {
            foreach (DB::table('budget_versions as v')->join('budgets as b', 'b.id', '=', 'v.budget_id')->orderBy('b.from_month', 'desc')->orderBy('v.id', 'desc')->get(['v.id', 'v.name', 'v.status', 'b.name as budget']) as $v) {
                $versions[(string) $v->id] = "{$v->budget}: {$v->name} ({$v->status})";
            }
        }

        return [
            ['key' => 'version', 'label' => 'Budget version', 'choices' => $versions, 'default' => '0'],
            ['key' => 'by', 'label' => 'Group by', 'choices' => self::BY, 'default' => 'account'],
        ];
    }

    public function run(Scope $scope, array $options): array
    {
        if (! BudgetService::ready()) {
            return ['ready' => false, 'message' => 'Run database scripts 237, 239 and 240 (budgets) to turn this report on.', 'groups' => []];
        }
        $svc = app(BudgetService::class);
        $from = $scope->from ?? now()->startOfYear()->toDateString();
        $to = $scope->to ?? now()->endOfYear()->toDateString();
        $version = ! empty($options['version']) && $options['version'] !== '0' ? (int) $options['version'] : $svc->currentVersionFor($from, $to);
        if (! $version) {
            return ['ready' => false, 'message' => 'There is no budget for these dates yet. Make one under Books → Budgets.', 'groups' => []];
        }
        $by = isset(self::BY[$options['by'] ?? '']) ? $options['by'] : 'account';
        $info = DB::table('budget_versions as v')->join('budgets as b', 'b.id', '=', 'v.budget_id')->where('v.id', $version)->first(['b.name as budget', 'v.name as version', 'v.status']);
        $r = $svc->against($scope->undated(), $from, $to, null, $version);
        $choices = $svc->choices();
        $label = [
            'cost_centre' => collect($choices['cost_centres'])->pluck('name', 'id')->all(), 'department' => collect($choices['departments'])->pluck('name', 'id')->all(),
            'branch' => collect($choices['locations'])->pluck('name', 'id')->all(), 'initiative' => collect($choices['initiatives'])->pluck('name', 'id')->all(),
        ];
        $col = ['cost_centre' => 'cost_centre_id', 'department' => 'department_id', 'branch' => 'location_id', 'initiative' => 'initiative_id'];

        $groups = [];
        foreach ($r['rows'] as $row) {
            if ($by === 'account') {
                $key = $row['type'] . ':' . $row['id'];
                $name = $row['name'];
                $childName = $row['dimensions'] ? implode(' › ', $row['dimensions']) : 'Everything';
            } else {
                $id = $row[$col[$by]];
                $key = ($id ?? 0) . ':' . $row['section'];
                $name = $id ? ($label[$by][$id] ?? "#{$id}") : 'Not set';
                $childName = $row['name'] . ($row['has_recovery'] ? ' (net of recovery)' : '');
            }
            $g = &$groups["{$row['section']}|{$key}"];
            $g ??= ['name' => $name, 'section' => $row['section'], 'budget' => 0.0, 'actual' => 0.0, 'pending' => false, 'children' => [], 'months' => []];
            $g['budget'] += $row['budget'];
            $g['actual'] += $row['actual'];
            $g['pending'] = $g['pending'] || $row['actual_pending'];
            $g['children'][] = ['name' => $childName, 'type' => $row['type'], 'id' => $row['id'], 'budget' => $row['budget'], 'actual' => $row['actual'], 'variance' => $row['variance'], 'variance_pct' => $row['variance_pct'],
                'used_pct' => $row['used_pct'], 'remaining' => $row['remaining'], 'actual_pending' => $row['actual_pending'], 'ledgers' => $row['ledgers'], 'months' => $row['months']];
            foreach ($row['months'] as $m) {
                $g['months'][$m['month']]['budget'] = ($g['months'][$m['month']]['budget'] ?? 0) + $m['budget'];
                $g['months'][$m['month']]['actual'] = ($g['months'][$m['month']]['actual'] ?? 0) + $m['actual'];
                $g['months'][$m['month']]['carried_in'] = ($g['months'][$m['month']]['carried_in'] ?? 0) + ($m['carried_in'] ?? 0);
            }
            unset($g);
        }
        $order = ['income' => 0, 'expense' => 1, 'balance' => 2];
        $out = [];
        foreach ($groups as $g) {
            $var = BudgetService::variance($g['section'], $g['budget'], $g['actual']);
            $out[] = ['name' => $g['name'], 'section' => $g['section'], 'budget' => round($g['budget'], 2), 'actual' => round($g['actual'], 2), 'variance' => $var, 'variance_pct' => abs($g['budget']) > 0.005 ? round($var / abs($g['budget']) * 100, 1) : null,
                'used_pct' => abs($g['budget']) > 0.005 ? round($g['actual'] / $g['budget'] * 100, 1) : null, 'remaining' => round($g['budget'] - $g['actual'], 2), 'actual_pending' => $g['pending'],
                'children' => $g['children'], 'months' => array_map(fn ($ym, $m) => ['month' => $ym, 'budget' => round($m['budget'], 2), 'actual' => round($m['actual'], 2), 'carried_in' => round($m['carried_in'], 2), 'available' => round($m['budget'] + $m['carried_in'], 2)], array_keys($g['months']), $g['months'])];
        }
        usort($out, fn ($a, $b) => [$order[$a['section']], $a['name']] <=> [$order[$b['section']], $b['name']]);

        $sum = fn (string $section, string $k) => round(array_sum(array_column(array_filter($out, fn ($g) => $g['section'] === $section), $k)), 2);
        $totals = [];
        foreach (['income', 'expense', 'balance'] as $s) {
            $b = $sum($s, 'budget');
            $a = $sum($s, 'actual');
            $totals[$s] = ['budget' => $b, 'actual' => $a, 'variance' => BudgetService::variance($s, $b, $a)];
        }
        $totals['result'] = ['budget' => round($totals['income']['budget'] - $totals['expense']['budget'], 2), 'actual' => round($totals['income']['actual'] - $totals['expense']['actual'], 2)];
        $totals['result']['variance'] = round($totals['result']['actual'] - $totals['result']['budget'], 2);

        return ['ready' => true, 'budget' => $info->budget, 'version' => $info->version, 'status' => $info->status, 'by' => $by, 'by_label' => self::BY[$by], 'groups' => $out, 'totals' => $totals,
            'pending' => (bool) array_filter($out, fn ($g) => $g['actual_pending']), 'months' => $r['months']];
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = [];
        foreach ($data['groups'] ?? [] as $g) {
            $rows[] = ['name' => ucfirst($g['section']) . ': ' . $g['name'], 'budget' => $g['budget'], 'actual' => $g['actual'], 'variance' => $g['variance'], 'variance_pct' => $g['variance_pct'], 'used_pct' => $g['used_pct'], 'remaining' => $g['remaining']];
            if (count($g['children']) > 1) {
                foreach ($g['children'] as $c) {
                    $rows[] = ['name' => '    ' . $c['name'], 'budget' => $c['budget'], 'actual' => $c['actual'], 'variance' => $c['variance'], 'variance_pct' => $c['variance_pct'], 'used_pct' => $c['used_pct'], 'remaining' => $c['remaining']];
                }
            }
        }
        $t = $data['totals']['result'] ?? ['budget' => 0, 'actual' => 0, 'variance' => 0];

        return ['title' => $this->title() . (isset($data['budget']) ? ': ' . $data['budget'] . ', ' . $data['version'] : ''), 'subtitle' => $this->period($scope),
            'columns' => ['name' => 'Line', 'budget' => 'Budget', 'actual' => 'Actual', 'variance' => 'Variance (positive is good)', 'variance_pct' => 'Variance %', 'used_pct' => 'Used %', 'remaining' => 'Remaining'],
            'rows' => $rows, 'totals' => ['name' => 'Planned result (income less expenses)', 'budget' => $t['budget'], 'actual' => $t['actual'], 'variance' => $t['variance']]];
    }
}
