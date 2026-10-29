<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\BooksHealth;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;

/**
 * The Books health panel on the engine (docs/BOOKS_REPORTS_PLAN.md, step 10). The checks are BooksHealth's; the engine adds the dates, the frame and the export.
 */
final class BooksHealthReport extends ReportDefinition
{
    private const STATUS = ['pass' => 'Pass', 'warn' => 'Check', 'fail' => 'Fail', 'setup' => 'Not set up'];

    public function key(): string
    {
        return 'books-health';
    }

    public function title(): string
    {
        return 'Books health';
    }

    public function filters(): array
    {
        return [];
    }

    public function run(Scope $scope, array $options): array
    {
        return ['ready' => true] + app(BooksHealth::class)->run($scope);
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = [];
        foreach ($data['checks'] ?? [] as $c) {
            $rows[] = ['title' => $c['title'], 'status' => self::STATUS[$c['status']] ?? $c['status'], 'summary' => $c['summary']];
            foreach ($c['items'] as $i) {
                $rows[] = ['title' => '    ' . $i['label'], 'status' => '', 'summary' => trim($i['detail'] . ($i['amount'] !== null ? ' · ' . number_format($i['amount'], 2) : ''))];
            }
        }

        return ['title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => ['title' => 'Check', 'status' => 'Result', 'summary' => 'What it found'], 'rows' => $rows];
    }
}
