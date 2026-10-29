<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\Scope;

/** Location summary: the stock summary for one branch (a branch must be chosen). */
final class StockLocationSummaryReport extends StockSummaryReport
{
    public function key(): string
    {
        return 'stock-location-summary';
    }

    public function title(): string
    {
        return 'Location summary';
    }

    public function run(Scope $scope, array $options): array
    {
        if ($scope->locationId === null) {
            return ['ready' => false, 'needs' => 'branch', 'message' => 'Choose a branch to see its stock.', 'rows' => [], 'groups' => []];
        }

        return parent::run($scope, $options);
    }
}
