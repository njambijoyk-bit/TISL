<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\ControlAccountChecks;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;

/**
 * Control-account checks on the engine (docs/BOOKS_REPORTS_PLAN.md, step 9): each control ledger against the register that explains it (trial balance, gift vouchers,
 * loyalty points, withholding credits, stock and stock units, receivables, payables). The checks themselves are ControlAccountChecks, the one home of them; the engine
 * adds the date, the frame, the export and the restated banner. Receivables and payables use the groups chosen in the Reports settings; when none is chosen the report says so.
 */
final class ControlAccountsReport extends ReportDefinition
{
    public function key(): string
    {
        return 'control-accounts';
    }

    public function title(): string
    {
        return 'Control-account checks';
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
        return ['ready' => true] + app(ControlAccountChecks::class)->checks($scope->to);
    }

    public function table(array $data, Scope $scope): array
    {
        return ['title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => ['title' => 'Check', 'book' => 'Books', 'register' => 'Register', 'difference' => 'Difference', 'explained' => 'Explained', 'ok' => 'Agrees'],
            'rows' => array_merge(array_map(fn ($c) => ['title' => $c['title'], 'book' => $c['book'], 'register' => $c['register'], 'difference' => $c['difference'], 'explained' => $c['explained'], 'ok' => $c['ok'] ? 'Yes' : 'No'], $data['checks'] ?? []),
                array_map(fn ($c) => ['title' => $c['title'], 'book' => '', 'register' => '', 'difference' => '', 'explained' => '', 'ok' => 'Not set up: ' . $c['message']], $data['not_set_up'] ?? []))];
    }
}
