<?php

namespace App\Services\Books\Engine\Reports;

use App\Services\Books\Engine\Scope;

/** The vouchers behind one item's movement in a period (one month when drilling in from the monthly view). */
final class StockItemMovementsReport extends StockReportDefinition
{
    public function key(): string
    {
        return 'stock-item-movements';
    }

    public function title(): string
    {
        return 'Stock item movements';
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

        return ['ready' => true] + $this->service()->movements($type, $id, $this->filterArray($scope, []));
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = array_map(fn ($r) => ['date' => $r['date'], 'label' => $r['label'], 'party' => $r['party'], 'location' => $r['location'], 'batch' => $r['batch_no'], 'qty' => $r['quantity'], 'rate' => $r['rate'], 'value' => $r['value'], 'voucher' => $r['voucher_number']], $data['rows'] ?? []);

        return ['title' => $this->title(), 'subtitle' => $this->period($scope), 'columns' => ['date' => 'Date', 'label' => 'Kind', 'party' => 'Party', 'location' => 'Branch', 'batch' => 'Batch', 'qty' => 'Quantity', 'rate' => 'Rate', 'value' => 'Value', 'voucher' => 'Voucher'], 'rows' => $rows];
    }
}
