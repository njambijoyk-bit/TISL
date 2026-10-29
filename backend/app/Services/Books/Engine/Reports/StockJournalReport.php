<?php

namespace App\Services\Books\Engine\Reports;

use App\Models\Books\StockMovement;
use App\Services\Access\BranchFilter;
use App\Services\Books\Engine\ReportDefinition;
use App\Services\Books\Engine\Scope;
use App\Services\Stock\Items\ProductVariantSource;
use App\Services\Stock\Items\StockItemRegistry;
use App\Services\Stock\StockMovementLabels;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * The stock journal on the engine (docs/BOOKS_REPORTS_PLAN.md, step 6.9), ported from StockJournalController: every movement of stock in and out, newest
 * first, with what caused it. Filters: item search (item, SKU, batch, and now a voucher number, audit L4), kind of movement, kind of item, branch, dates.
 * 50 to a page; value is quantity × unit cost; reversed movements are left out. New: the financial year by default (L1), totals for the rows that match
 * (L4), an export (L3), the one list of movement labels (L2) and the permission of the stock area (L5).
 */
final class StockJournalReport extends ReportDefinition
{
    public const PER_PAGE = 50;

    public function key(): string
    {
        return 'stock-journal';
    }

    public function title(): string
    {
        return 'Stock journal';
    }

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

    public function options(): array
    {
        $kinds = ['' => 'All items'];
        foreach (StockItemRegistry::all() as $type => $src) {
            $kinds[$type] = $src->label();
        }

        return [
            ['key' => 'q', 'label' => 'Item, SKU, batch or voucher', 'type' => 'text', 'choices' => [], 'default' => ''],
            ['key' => 'type', 'label' => 'Kind of movement', 'choices' => ['' => 'All kinds'] + StockMovementLabels::ALL, 'default' => ''],
            ['key' => 'kind', 'label' => 'Kind of item', 'choices' => $kinds, 'default' => ''],
        ];
    }

    private function query(Scope $scope, array $o): Builder
    {
        $items = StockMovement::hasItemColumns('stock_movements');
        $itemType = $items ? 'm.item_type' : "'product_variant'";
        $itemId = $items ? 'm.item_id' : 'm.variant_id';
        $kind = (string) ($o['kind'] ?? '');
        $text = trim((string) ($o['q'] ?? ''));
        $q = DB::table('stock_movements as m')
            ->leftJoin('product_variants as pv', fn ($j) => $j->on('pv.id', '=', 'm.variant_id'))->leftJoin('products as p', 'p.id', '=', 'pv.product_id')
            ->leftJoin('locations as l', 'l.id', '=', 'm.location_id')->leftJoin('stock_batches as sb', 'sb.id', '=', 'm.batch_id')->leftJoin('vouchers as v', 'v.id', '=', 'm.voucher_id')
            ->where('m.reversed', false)
            ->when($kind !== '', fn ($s) => $s->whereRaw("{$itemType} = ?", [$kind]))
            ->when($text !== '', function ($s) use ($text, $kind, $itemType, $itemId) {
                $like = "%{$text}%";
                $ids = [];
                foreach (StockItemRegistry::all() as $type => $src) {
                    if ($type !== ProductVariantSource::TYPE && ($kind === '' || $kind === $type)) {
                        $ids[$type] = $src->search($text);
                    }
                }
                $s->where(function ($w) use ($like, $ids, $itemType, $itemId) {
                    $w->where('p.name', 'like', $like)->orWhere('pv.sku', 'like', $like)->orWhere('sb.batch_no', 'like', $like)->orWhere('v.voucher_number', 'like', $like);
                    foreach ($ids as $type => $list) {
                        if ($list) {
                            $w->orWhere(fn ($x) => $x->whereRaw("{$itemType} = ?", [$type])->whereIn(DB::raw($itemId), array_map('intval', $list)));
                        }
                    }
                });
            })
            ->when(! empty($o['type']), fn ($s) => $s->where('m.movement_type', $o['type']))
            ->when($scope->locationId !== null, fn ($s) => $s->where('m.location_id', $scope->locationId))
            ->when($scope->from, fn ($s) => $s->where('m.movement_date', '>=', $scope->from))
            ->when($scope->to, fn ($s) => $s->where('m.movement_date', '<=', $scope->to));

        return app(BranchFilter::class)->apply($q, 'm.location_id', $scope->area, 'journal');
    }

    public function run(Scope $scope, array $options): array
    {
        $items = StockMovement::hasItemColumns('stock_movements');
        $itemType = $items ? 'm.item_type' : "'product_variant'";
        $itemId = $items ? 'm.item_id' : 'm.variant_id';
        $q = $this->query($scope, $options);
        $sums = (clone $q)->selectRaw('COUNT(*) AS n, COALESCE(SUM(m.quantity * m.unit_cost), 0) AS value')->first();
        $total = (int) $sums->n;
        $export = ! empty($options['_export']);
        $size = $export ? max(1, $total) : self::PER_PAGE;
        $pages = max(1, (int) ceil($total / $size));
        $page = min(max(1, (int) ($options['page'] ?? 1)), $pages);

        $found = $q->orderByDesc('m.movement_date')->orderByDesc('m.id');
        $found = $export ? $found : $found->forPage($page, $size);
        $rows = $found->get(['m.id', 'm.movement_date', 'm.movement_type', 'm.quantity', 'm.unit_cost', 'm.ref_type', 'm.ref_id', 'm.voucher_id', 'v.voucher_number', 'p.name as product', 'pv.name as variant', 'pv.sku',
            'l.name as location', 'sb.batch_no', DB::raw("{$itemType} as item_type"), DB::raw("{$itemId} as item_id")]);
        // what the rows that are not products are: asked of the module that owns that kind of item
        $described = [];
        foreach ($rows->where('item_type', '!=', ProductVariantSource::TYPE)->groupBy('item_type') as $type => $group) {
            $described[$type] = StockItemRegistry::get((string) $type)?->describe($group->pluck('item_id')->map(fn ($i) => (int) $i)->unique()->all()) ?? [];
        }
        $out = $rows->map(function ($r) use ($described) {
            $other = $r->item_type !== ProductVariantSource::TYPE;
            $info = $other ? ($described[$r->item_type][(int) $r->item_id] ?? StockItemRegistry::unknown((string) $r->item_type, (int) $r->item_id)) : null;

            return [
                'id' => (int) $r->id, 'date' => (string) $r->movement_date, 'type' => $r->movement_type, 'label' => StockMovementLabels::label($r->movement_type),
                'quantity' => (float) $r->quantity, 'value' => round((float) $r->quantity * (float) $r->unit_cost, 2), 'product' => $other ? $info['name'] : $r->product, 'variant' => $other ? null : $r->variant,
                'sku' => $other ? $info['sku'] : $r->sku, 'unit' => $other ? $info['unit'] : null, 'kind' => $r->item_type, 'location' => $r->location, 'batch_no' => $r->batch_no,
                'voucher_id' => $r->voucher_id ? (int) $r->voucher_id : null, 'voucher_number' => $r->voucher_number, 'ref_type' => $r->ref_type, 'ref_id' => $r->ref_id,
            ];
        })->values()->all();

        return ['ready' => true, 'from' => $scope->from, 'to' => $scope->to, 'rows' => $out, 'total' => $total, 'totals' => ['movements' => $total, 'value' => round((float) $sums->value, 2)],
            'paging' => ['page' => $page, 'per_page' => $export ? $total : $size, 'pages' => $pages, 'total' => $total]];
    }

    public function table(array $data, Scope $scope): array
    {
        $rows = array_map(fn ($r) => ['date' => substr($r['date'], 0, 10), 'item' => $r['product'] . ($r['variant'] && $r['variant'] !== 'Standard' ? ' — ' . $r['variant'] : ''), 'sku' => $r['sku'], 'label' => $r['label'],
            'location' => $r['location'], 'batch_no' => $r['batch_no'], 'quantity' => $r['quantity'], 'unit' => $r['unit'], 'value' => $r['value'],
            'document' => $r['voucher_number'] ?: ($r['ref_type'] ? "{$r['ref_type']} #{$r['ref_id']}" : '')], $data['rows']);

        return ['title' => $this->title(), 'subtitle' => $this->period($scope),
            'columns' => ['date' => 'Date', 'item' => 'Item', 'sku' => 'SKU', 'label' => 'Kind', 'location' => 'Branch', 'batch_no' => 'Batch', 'quantity' => 'Quantity', 'unit' => 'Unit', 'value' => 'Value', 'document' => 'Document'],
            'rows' => $rows, 'totals' => ['item' => 'Total (' . $data['totals']['movements'] . ' movements)', 'value' => $data['totals']['value']]];
    }
}
