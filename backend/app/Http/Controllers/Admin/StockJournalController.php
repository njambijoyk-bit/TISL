<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Models\Books\StockMovement;
use App\Services\Stock\Items\ProductVariantSource;
use App\Services\Stock\Items\StockItemRegistry;
use Illuminate\Support\Facades\DB;

/** The stock journal: every movement of stock in and out, with what caused it. Read-only. */
class StockJournalController extends Controller
{
    private const TYPES = [
        'sales' => 'Sale', 'cash_sale' => 'Cash sale', 'delivery_note' => 'Delivery note', 'credit_note' => 'Customer return', 'purchase' => 'Purchase', 'receipt_note' => 'Goods received',
        'debit_note' => 'Returned to supplier', 'opening_stock' => 'Opening stock', 'write_off' => 'Write-off', 'transfer_out' => 'Transfer out', 'transfer_in' => 'Transfer in',
        'count_loss' => 'Count shortage', 'count_gain' => 'Count surplus', 'production_use' => 'Used in production', 'production_out' => 'Produced', 'job_issue' => 'Issued to a job', 'job_return' => 'Returned from a job', 'ingredient_use' => 'Used in dishes', 'reversal' => 'Taken back',
    ];

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['q' => 'nullable|string|max:80', 'type' => 'nullable|string|max:30', 'kind' => 'nullable|string|max:40', 'location_id' => 'nullable|integer', 'from' => 'nullable|date', 'to' => 'nullable|date', 'page' => 'nullable|integer|min:1']);
        $items = StockMovement::hasItemColumns('stock_movements');
        $itemType = $items ? 'm.item_type' : "'product_variant'";
        $itemId = $items ? 'm.item_id' : 'm.variant_id';
        $q = DB::table('stock_movements as m')
            ->leftJoin('product_variants as pv', fn ($j) => $j->on('pv.id', '=', 'm.variant_id'))->leftJoin('products as p', 'p.id', '=', 'pv.product_id')
            ->leftJoin('locations as l', 'l.id', '=', 'm.location_id')->leftJoin('stock_batches as sb', 'sb.id', '=', 'm.batch_id')->leftJoin('vouchers as v', 'v.id', '=', 'm.voucher_id')
            ->where('m.reversed', false)
            ->when(! empty($d['kind']), fn ($s) => $s->whereRaw("{$itemType} = ?", [$d['kind']]))
            ->when(! empty($d['q']), function ($s) use ($d, $itemType, $itemId) {
                $like = "%{$d['q']}%";
                $ids = [];
                foreach (StockItemRegistry::all() as $type => $src) {
                    if ($type !== ProductVariantSource::TYPE && (empty($d['kind']) || $d['kind'] === $type)) {
                        $ids[$type] = $src->search($d['q']);
                    }
                }
                $s->where(function ($w) use ($like, $ids, $itemType, $itemId) {
                    $w->where('p.name', 'like', $like)->orWhere('pv.sku', 'like', $like)->orWhere('sb.batch_no', 'like', $like);
                    foreach ($ids as $type => $list) {
                        if ($list) {
                            $w->orWhere(fn ($x) => $x->whereRaw("{$itemType} = ?", [$type])->whereIn(DB::raw($itemId), array_map('intval', $list)));
                        }
                    }
                });
            })
            ->when(! empty($d['type']), fn ($s) => $s->where('m.movement_type', $d['type']))
            ->when(! empty($d['location_id']), fn ($s) => $s->where('m.location_id', $d['location_id']))
            ->when(true, fn ($s) => app(\App\Services\Access\BranchFilter::class)->apply($s, 'm.location_id', 'stock', 'journal'))
            ->when(! empty($d['from']), fn ($s) => $s->where('m.movement_date', '>=', $d['from']))
            ->when(! empty($d['to']), fn ($s) => $s->where('m.movement_date', '<=', $d['to']));
        $total = (clone $q)->count();
        $rows = $q->orderByDesc('m.movement_date')->orderByDesc('m.id')->forPage((int) ($d['page'] ?? 1), 50)
            ->get(['m.id', 'm.movement_date', 'm.movement_type', 'm.quantity', 'm.unit_cost', 'm.ref_type', 'm.ref_id', 'm.voucher_id', 'v.voucher_number', 'p.name as product', 'pv.name as variant', 'pv.sku', 'l.name as location', 'sb.batch_no',
                DB::raw("{$itemType} as item_type"), DB::raw("{$itemId} as item_id")]);
        // what the rows that are not products are: asked of the module that owns that kind of item
        $described = [];
        foreach ($rows->where('item_type', '!=', ProductVariantSource::TYPE)->groupBy('item_type') as $type => $group) {
            $described[$type] = StockItemRegistry::get((string) $type)?->describe($group->pluck('item_id')->map(fn ($i) => (int) $i)->unique()->all()) ?? [];
        }
        $rows = $rows->map(function ($r) use ($described) {
            $other = $r->item_type !== ProductVariantSource::TYPE;
            $info = $other ? ($described[$r->item_type][(int) $r->item_id] ?? StockItemRegistry::unknown((string) $r->item_type, (int) $r->item_id)) : null;

            return [
                'id' => (int) $r->id, 'date' => (string) $r->movement_date, 'type' => $r->movement_type, 'label' => self::TYPES[$r->movement_type] ?? ucfirst(str_replace('_', ' ', (string) $r->movement_type)),
                'quantity' => (float) $r->quantity, 'value' => round((float) $r->quantity * (float) $r->unit_cost, 2), 'product' => $other ? $info['name'] : $r->product, 'variant' => $other ? null : $r->variant, 'sku' => $other ? $info['sku'] : $r->sku,
                'unit' => $other ? $info['unit'] : null, 'kind' => $r->item_type, 'location' => $r->location, 'batch_no' => $r->batch_no, 'voucher_id' => $r->voucher_id ? (int) $r->voucher_id : null, 'voucher_number' => $r->voucher_number,
                'ref_type' => $r->ref_type, 'ref_id' => $r->ref_id,
            ];
        })->values();
        $kinds = collect(StockItemRegistry::all())->map(fn ($src, $type) => ['type' => $type, 'label' => $src->label()])->values();

        return response()->json(['rows' => $rows, 'total' => $total, 'types' => self::TYPES, 'kinds' => $kinds, 'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name'])]);
    }
}
