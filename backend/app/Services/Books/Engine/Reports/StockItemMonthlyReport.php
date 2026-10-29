<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\Scope;

/** One item's month-by-month movement: opening, inwards, outwards, closing for each month (the drill-down of the stock summary). */
final class StockItemMonthlyReport extends StockReportDefinition
{
    public function key(): string
    {
        return 'stock-item-monthly';
    }

    public function title(): string
    {
        return 'Stock item by month';
    }

    public function options(): array
    {
        return [$this->itemOption()];
    }

    public function run(Scope $scope, array $options): array
    {
        [$type, $id] = $this->parseItem((string) ($options['item'] ?? ''));
        if (! $id) {
            return $this->needsItem();
        }

        return ['ready' => true] + $this->service()->monthly($type, $id, $this->filterArray($scope, []));
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = array_map(fn ($m) => ['month' => $m['month'], 'open' => $m['opening']['qty'], 'in_q' => $m['inward']['qty'], 'in_v' => $m['inward']['value'], 'out_q' => $m['outward']['qty'],
            'out_v' => $m['outward']['value'], 'close_q' => $m['closing']['qty'], 'close_v' => $m['closing']['value']], $data['months'] ?? []);

        return ['title' => $this->title() . ': ' . ($data['item']['name'] ?? ''), 'subtitle' => $this->period($scope),
            'columns' => ['month' => 'Month', 'open' => 'Opening qty', 'in_q' => 'Inwards qty', 'in_v' => 'Inwards value', 'out_q' => 'Outwards qty', 'out_v' => 'Outwards value', 'close_q' => 'Closing qty', 'close_v' => 'Closing value'], 'rows' => $rows];
    }
}
