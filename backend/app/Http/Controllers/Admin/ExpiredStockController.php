<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Stock\StockWriteOffService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Expiring and expired stock: the dashboard (expired / within 30 / 60 / 90 days) and what to do with what expired —
 * write it off, or send it back to the supplier on a Debit Note.
 */
class ExpiredStockController extends Controller
{
    public function __construct(private StockWriteOffService $writeOffs) {}

    public function index(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'nullable|integer', 'within' => 'nullable|integer|min:1|max:365']);
        $within = (int) ($d['within'] ?? 90);
        $today = today();

        $rows = DB::table('stock_batch_balances as bb')
            ->join('stock_batches as sb', 'sb.id', '=', 'bb.batch_id')
            ->join('product_variants as pv', 'pv.id', '=', 'sb.variant_id')
            ->join('products as p', 'p.id', '=', 'pv.product_id')
            ->leftJoin('locations as l', 'l.id', '=', 'bb.location_id')
            ->leftJoin('vouchers as rv', 'rv.id', '=', 'sb.received_voucher_id')
            ->leftJoin('ledgers as sup', 'sup.id', '=', 'rv.party_ledger_id')
            ->where('bb.quantity', '>', 0)->whereNotNull('sb.expiry_date')
            ->whereIn('sb.status', [StockBatch::ACTIVE, StockBatch::EXPIRED])
            ->where('sb.expiry_date', '<=', $today->copy()->addDays($within)->toDateString())
            ->when(! empty($d['location_id']), fn ($q) => $q->where('bb.location_id', $d['location_id']))
            ->orderBy('sb.expiry_date')->orderBy('sb.id')
            ->get(['sb.id as batch_id', 'sb.batch_no', 'sb.expiry_date', 'sb.status', 'sb.unit_cost', 'sb.received_voucher_id', 'bb.location_id', 'bb.quantity',
                'p.id as product_id', 'p.name as product', 'pv.id as variant_id', 'pv.name as variant', 'pv.sku', 'l.name as location',
                'rv.voucher_number as received_on', 'rv.party_ledger_id as supplier_id', 'sup.name as supplier']);

        $buckets = ['expired' => 0, 'd30' => 0, 'd60' => 0, 'd90' => 0];
        $summary = collect($buckets)->map(fn () => ['batches' => [], 'quantity' => 0.0, 'value' => 0.0])->all();
        $out = [];
        foreach ($rows as $r) {
            $left = (int) $today->diffInDays($r->expiry_date, false);   // negative = days ago
            $key = ($r->status === StockBatch::EXPIRED || $left < 0) ? 'expired' : ($left <= 30 ? 'd30' : ($left <= 60 ? 'd60' : 'd90'));
            $value = round((float) $r->quantity * (float) $r->unit_cost, 2);
            $summary[$key]['batches'][$r->batch_id] = true;
            $summary[$key]['quantity'] += (float) $r->quantity;
            $summary[$key]['value'] += $value;
            $out[] = [
                'batch_id' => (int) $r->batch_id, 'batch_no' => $r->batch_no, 'expiry_date' => $r->expiry_date, 'days_left' => $left, 'bucket' => $key,
                'status' => $r->status, 'location_id' => (int) $r->location_id, 'location' => $r->location, 'quantity' => (float) $r->quantity,
                'unit_cost' => (float) $r->unit_cost, 'value' => $value, 'product_id' => (int) $r->product_id, 'product' => $r->product,
                'variant' => $r->variant, 'sku' => $r->sku, 'received_on' => $r->received_on, 'supplier_id' => $r->supplier_id ? (int) $r->supplier_id : null, 'supplier' => $r->supplier,
            ];
        }
        foreach ($summary as $k => $v) {
            $summary[$k] = ['batches' => count($v['batches']), 'quantity' => round($v['quantity'], 4), 'value' => round($v['value'], 2)];
        }

        return response()->json([
            'summary' => $summary, 'rows' => $out,
            'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name']),
            'suppliers' => \App\Models\Books\Ledger::whereHas('group', fn ($g) => $g->where('name', 'Sundry Creditors'))->orderBy('name')->get(['id', 'name']),
        ]);
    }

    /** Write (part of) a batch off as a loss. Body: batch_id, location_id?, quantity?, reason. */
    public function writeOff(Request $request): JsonResponse
    {
        $d = $request->validate(['batch_id' => 'required|integer', 'location_id' => 'nullable|integer', 'quantity' => 'nullable|numeric|min:0.0001', 'reason' => 'required|string|max:255']);

        return $this->guard(function () use ($d, $request) {
            $r = $this->writeOffs->writeOff(StockBatch::findOrFail($d['batch_id']), $d['location_id'] ?? null, isset($d['quantity']) ? (float) $d['quantity'] : null, $d['reason'], $request->user());

            return response()->json(['message' => 'Written off: ' . round($r['quantity'], 4) . ' units, ' . number_format($r['cost'], 2) . ' lost.'] + $r);
        });
    }

    /** Send (part of) a batch back to the supplier on a Debit Note. Body: batch_id, location_id, quantity, supplier_ledger_id?, reason?. */
    public function returnToSupplier(Request $request): JsonResponse
    {
        $d = $request->validate(['batch_id' => 'required|integer', 'location_id' => 'required|integer', 'quantity' => 'required|numeric|min:0.0001', 'supplier_ledger_id' => 'nullable|integer|exists:ledgers,id', 'reason' => 'nullable|string|max:255']);

        return $this->guard(function () use ($d, $request) {
            $note = $this->writeOffs->returnToSupplier(StockBatch::findOrFail($d['batch_id']), (int) $d['location_id'], (float) $d['quantity'], $d['supplier_ledger_id'] ?? null, $d['reason'] ?? '', $request->user());

            return response()->json(['message' => "Debit note {$note->voucher_number} raised.", 'voucher_id' => $note->id]);
        });
    }

    private function guard(\Closure $fn): JsonResponse
    {
        try {
            return $fn();
        } catch (BooksException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }
}
