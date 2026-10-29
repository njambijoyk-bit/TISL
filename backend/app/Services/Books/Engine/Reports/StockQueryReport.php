<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\Scope;

/** Stock query: one item's card: closing, cost price and costing method, last purchase and sale, recent purchases and sales, where it sits, the other items of its group. */
final class StockQueryReport extends StockReportDefinition
{
    public function key(): string
    {
        return 'stock-query';
    }

    public function title(): string
    {
        return 'Stock query';
    }

    public function kind(): string
    {
        return 'asof';
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

        return ['ready' => true] + $this->service()->query($type, $id, $this->filterArray($scope, []));
    }

    public function table(array $data, Scope $scope): array
    {
        if (($data['ready'] ?? true) === false) {
            return ['title' => $this->title(), 'subtitle' => '', 'columns' => ['name' => 'Item'], 'rows' => []];
        }
        $rows = [['section' => 'Item', 'a' => $data['item']['name'], 'b' => $data['item']['sku'] ?? '', 'c' => '', 'd' => ''],
            ['section' => 'Closing', 'a' => $data['closing']['qty'], 'b' => $data['closing']['value'], 'c' => 'Cost price', 'd' => $data['cost_price']]];
        foreach ($data['purchases'] as $r) {
            $rows[] = ['section' => 'Purchase', 'a' => $r['date'], 'b' => $r['party'], 'c' => $r['quantity'], 'd' => $r['amount']];
        }
        foreach ($data['sales'] as $r) {
            $rows[] = ['section' => 'Sale', 'a' => $r['date'], 'b' => $r['party'], 'c' => $r['quantity'], 'd' => $r['amount']];
        }
        foreach ($data['places'] as $r) {
            $rows[] = ['section' => 'Where', 'a' => $r['location'], 'b' => $r['batch_no'], 'c' => $r['quantity'], 'd' => $r['expiry_date']];
        }

        return ['title' => $this->title() . ': ' . $data['item']['name'], 'subtitle' => '', 'columns' => ['section' => '', 'a' => '', 'b' => '', 'c' => '', 'd' => ''], 'rows' => $rows];
    }
}
