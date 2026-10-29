<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Stock\Items\StockItemRegistry;
use App\Services\Stock\StockReportService;

/**
 * The stock reports on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.10). The queries stay where they were, in StockReportService, which is the one home
 * of them (the dashboard's Stock tab reads it too); the engine adds what it adds to every report: the financial year by default (audit L1), the branch filter,
 * the person's branch limit (the service applies it), the export, the same screen frame, and the stock permission (L5). Answers are the service's, field for field.
 */
abstract class StockReportDefinition extends ReportDefinition
{
    public function permission(): string
    {
        return 'stock.view';
    }

    public function area(): string
    {
        return 'stock';
    }

    public function filters(): array
    {
        return ['branch'];
    }

    protected function service(): StockReportService
    {
        return app(StockReportService::class);
    }

    /** The filters the service takes, from the scope and the options. */
    protected function filterArray(Scope $scope, array $o): array
    {
        return array_filter([
            'from' => $scope->from, 'to' => $scope->to, 'location_id' => $scope->locationId,
            'item_type' => ($o['item_type'] ?? '') !== '' ? $o['item_type'] : null, 'q' => trim((string) ($o['q'] ?? '')) !== '' ? trim((string) $o['q']) : null,
        ], fn ($v) => $v !== null);
    }

    /** "type:id" of an item option. @return array{0: string, 1: int} */
    protected function parseItem(string $v): array
    {
        $pos = strpos($v, ':');

        return $pos === false ? ['', 0] : [substr($v, 0, $pos), (int) substr($v, $pos + 1)];
    }

    protected function itemTypeOption(): array
    {
        $types = ['' => 'All stock'];
        foreach (StockItemRegistry::all() as $type => $src) {
            $types[$type] = $src->label();
        }

        return ['key' => 'item_type', 'label' => 'Type of stock', 'choices' => $types, 'default' => ''];
    }

    protected function itemOption(): array
    {
        return ['key' => 'item', 'label' => 'Item', 'type' => 'stock_item', 'choices' => [], 'default' => ''];
    }

    protected function needsItem(): array
    {
        return ['ready' => false, 'needs' => 'item', 'message' => 'Find an item to see this report for it.', 'rows' => []];
    }
}
