<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** The stock journal: every movement of stock in and out, with what caused it. Read-only. */
class StockJournalController extends Controller
{
    private const TYPES = [
        'sales' => 'Sale', 'cash_sale' => 'Cash sale', 'delivery_note' => 'Delivery note', 'credit_note' => 'Customer return', 'purchase' => 'Purchase', 'receipt_note' => 'Goods received',
        'debit_note' => 'Returned to supplier', 'opening_stock' => 'Opening stock', 'write_off' => 'Write-off', 'transfer_out' => 'Transfer out', 'transfer_in' => 'Transfer in',
        'count_loss' => 'Count shortage', 'count_gain' => 'Count surplus', 'production_use' => 'Used in production', 'production_out' => 'Produced', 'job_issue' => 'Issued to a job', 'job_return' => 'Returned from a job',
    ];

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['q' => 'nullable|string|max:80', 'type' => 'nullable|string|max:30', 'location_id' => 'nullable|integer', 'from' => 'nullable|date', 'to' => 'nullable|date', 'page' => 'nullable|integer|min:1']);
        $q = DB::table('stock_movements as m')
            ->join('product_variants as pv', 'pv.id', '=', 'm.variant_id')->join('products as p', 'p.id', '=', 'pv.product_id')
            ->leftJoin('locations as l', 'l.id', '=', 'm.location_id')->leftJoin('stock_batches as sb', 'sb.id', '=', 'm.batch_id')->leftJoin('vouchers as v', 'v.id', '=', 'm.voucher_id')
            ->where('m.reversed', false)
            ->when(! empty($d['q']), fn ($s) => $s->where(fn ($w) => $w->where('p.name', 'like', "%{$d['q']}%")->orWhere('pv.sku', 'like', "%{$d['q']}%")->orWhere('sb.batch_no', 'like', "%{$d['q']}%")))
            ->when(! empty($d['type']), fn ($s) => $s->where('m.movement_type', $d['type']))
            ->when(! empty($d['location_id']), fn ($s) => $s->where('m.location_id', $d['location_id']))
            ->when(! empty($d['from']), fn ($s) => $s->where('m.movement_date', '>=', $d['from']))
            ->when(! empty($d['to']), fn ($s) => $s->where('m.movement_date', '<=', $d['to']));
        $total = (clone $q)->count();
        $rows = $q->orderByDesc('m.movement_date')->orderByDesc('m.id')->forPage((int) ($d['page'] ?? 1), 50)
            ->get(['m.id', 'm.movement_date', 'm.movement_type', 'm.quantity', 'm.unit_cost', 'm.ref_type', 'm.ref_id', 'm.voucher_id', 'v.voucher_number', 'p.name as product', 'pv.name as variant', 'pv.sku', 'l.name as location', 'sb.batch_no'])
            ->map(fn ($r) => [
                'id' => (int) $r->id, 'date' => (string) $r->movement_date, 'type' => $r->movement_type, 'label' => self::TYPES[$r->movement_type] ?? ucfirst(str_replace('_', ' ', (string) $r->movement_type)),
                'quantity' => (float) $r->quantity, 'value' => round((float) $r->quantity * (float) $r->unit_cost, 2), 'product' => $r->product, 'variant' => $r->variant, 'sku' => $r->sku,
                'location' => $r->location, 'batch_no' => $r->batch_no, 'voucher_id' => $r->voucher_id ? (int) $r->voucher_id : null, 'voucher_number' => $r->voucher_number, 'ref_type' => $r->ref_type, 'ref_id' => $r->ref_id,
            ])->values();

        return response()->json(['rows' => $rows, 'total' => $total, 'types' => self::TYPES, 'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name'])]);
    }
}
