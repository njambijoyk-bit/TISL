<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\Scope;

/** Stock summary: opening, inwards, outwards and closing, quantity and value, by item group (the service's summary, unchanged). With a branch chosen it is the location summary. */
class StockSummaryReport extends StockReportDefinition
{
    public function key(): string
    {
        return 'stock-summary';
    }

    public function title(): string
    {
        return 'Stock summary';
    }

    public function options(): array
    {
        return [$this->itemTypeOption(), ['key' => 'q', 'label' => 'Item or SKU', 'type' => 'text', 'choices' => [], 'default' => '']];
    }

    public function run(Scope $scope, array $options): array
    {
        return ['ready' => true] + $this->service()->summary($this->filterArray($scope, $options));
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = [];
        $cells = fn (array $r) => ['open_qty' => $r['opening']['qty'], 'open_value' => $r['opening']['value'], 'in_qty' => $r['inward']['qty'], 'in_value' => $r['inward']['value'],
            'out_qty' => $r['outward']['qty'], 'out_value' => $r['outward']['value'], 'close_qty' => $r['closing']['qty'], 'rate' => $r['rate'], 'close_value' => $r['closing']['value']];
        foreach ($data['groups'] ?? [] as $g) {
            $rows[] = ['name' => $g['name'], 'unit' => $g['unit']] + $cells($g);
            foreach ($g['items'] as $it) {
                $rows[] = ['name' => '    ' . $it['name'] . ($it['sku'] ? ' · ' . $it['sku'] : '') . ($it['negative'] ? ' (below zero)' : ($it['no_cost'] ? ' (no cost)' : '')), 'unit' => $it['unit']] + $cells($it);
            }
        }
        $t = $data['total'] ?? [];

        return ['title' => $this->title(), 'subtitle' => $this->period($scope),
            'columns' => ['name' => 'Particulars', 'unit' => 'Unit', 'open_qty' => 'Opening qty', 'open_value' => 'Opening value', 'in_qty' => 'Inwards qty', 'in_value' => 'Inwards value', 'out_qty' => 'Outwards qty',
                'out_value' => 'Outwards value', 'close_qty' => 'Closing qty', 'rate' => 'Rate', 'close_value' => 'Closing value'],
            'rows' => $rows, 'totals' => ['name' => 'Grand total', 'open_value' => $t['opening']['value'] ?? 0, 'in_value' => $t['inward']['value'] ?? 0, 'out_value' => $t['outward']['value'] ?? 0, 'close_value' => $t['closing']['value'] ?? 0]];
    }
}
