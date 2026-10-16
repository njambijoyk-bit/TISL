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
            ->when(true, fn ($q) => app(\App\Services\Access\BranchFilter::class)->apply($q, 'bb.location_id', 'stock', 'expiry'))
            ->orderBy('sb.expiry_date')->orderBy('sb.id')
            ->get(['sb.id as batch_id', 'sb.batch_no', 'sb.expiry_date', 'sb.status', 'sb.unit_cost', 'sb.clearance_percent', 'sb.received_voucher_id', 'bb.location_id', 'bb.quantity',
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
                'unit_cost' => (float) $r->unit_cost, 'clearance_percent' => $r->clearance_percent !== null ? (float) $r->clearance_percent : null, 'value' => $value, 'product_id' => (int) $r->product_id, 'product' => $r->product,
                'variant' => $r->variant, 'sku' => $r->sku, 'received_on' => $r->received_on, 'supplier_id' => $r->supplier_id ? (int) $r->supplier_id : null, 'supplier' => $r->supplier,
            ];
        }
        // the kitchen's ingredient lots (Menus on): the ingredient is the product, the variant is the variant
        foreach ($this->ingredientLots($within, $d['location_id'] ?? null, $today) as $r) {
            $summary[$r['bucket']]['batches'][$r['kind'].$r['batch_id']] = true;
            $summary[$r['bucket']]['quantity'] += $r['quantity'];
            $summary[$r['bucket']]['value'] += $r['value'];
            $out[] = $r;
        }
        usort($out, fn ($a, $b) => [$a['expiry_date'], $a['batch_id']] <=> [$b['expiry_date'], $b['batch_id']]);
        foreach ($summary as $k => $v) {
            $summary[$k] = ['batches' => count($v['batches']), 'quantity' => round($v['quantity'], 4), 'value' => round($v['value'], 2)];
        }

        return response()->json([
            'summary' => $summary, 'rows' => $out,
            'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name']),
            'suppliers' => \App\Models\Books\Ledger::whereHas('group', fn ($g) => $g->where('name', 'Sundry Creditors'))->orderBy('name')->get(['id', 'name']),
        ]);
    }

    /** @return array<int, array<string, mixed>> */
    private function ingredientLots(int $within, $location, $today): array
    {
        if (! \App\Services\Menus\IngredientStock::moduleOn() || ! \App\Services\Menus\IngredientStock::installed()) {
            return [];
        }
        $rows = \App\Models\Menus\StockBatch::where('qty_left', '>', 0)->whereNotNull('expiry_date')->where('expiry_date', '<=', $today->copy()->addDays($within)->toDateString())
            ->when($location, fn ($q) => $q->where('location_id', $location))
            ->when(true, fn ($q) => app(\App\Services\Access\BranchFilter::class)->apply($q, 'location_id', 'stock', 'expiry'))->orderBy('expiry_date')->orderBy('id')->get();
        $items = \App\Models\Menus\IngredientItem::with('ingredient.baseUnit')->whereIn('id', $rows->pluck('item_id'))->get()->keyBy('id');
        $places = DB::table('locations')->pluck('name', 'id');
        $out = [];
        foreach ($rows as $b) {
            $i = $items[$b->item_id] ?? null;
            $left = (int) $today->diffInDays($b->expiry_date, false);
            $out[] = [
                'kind' => \App\Services\Menus\IngredientItemSource::TYPE, 'batch_id' => (int) $b->id, 'batch_no' => $b->batch_no, 'expiry_date' => $b->expiry_date->toDateString(), 'days_left' => $left,
                'bucket' => $left < 0 ? 'expired' : ($left <= 30 ? 'd30' : ($left <= 60 ? 'd60' : 'd90')), 'status' => $left < 0 ? 'expired' : ($b->status === 'ok' ? 'active' : $b->status), 'location_id' => (int) $b->location_id,
                'location' => $places[$b->location_id] ?? null, 'quantity' => round((float) $b->qty_left, 4), 'unit' => $i?->ingredient?->baseUnit?->code, 'unit_cost' => (float) $b->unit_cost, 'clearance_percent' => null,
                'value' => round((float) $b->qty_left * (float) $b->unit_cost, 2), 'product_id' => null, 'product' => $i?->ingredient?->name ?? "Item {$b->item_id}", 'variant' => $i?->name, 'sku' => $i?->code,
                'received_on' => null, 'supplier_id' => null, 'supplier' => null, 'item_id' => (int) $b->item_id,
            ];
        }

        return $out;
    }

    /** Write (part of) a batch off as a loss. Body: batch_id, location_id?, quantity?, reason, kind? (menus_ingredient_item for a lot of the kitchen's ingredients; the quantity is then in its base unit). */
    public function writeOff(Request $request): JsonResponse
    {
        $d = $request->validate(['batch_id' => 'required|integer', 'location_id' => 'nullable|integer', 'quantity' => 'nullable|numeric|min:0.0001', 'reason' => 'required|string|max:255', 'kind' => 'nullable|string|max:40']);

        if (($d['kind'] ?? null) === \App\Services\Menus\IngredientItemSource::TYPE) {
            return $this->guard(function () use ($d, $request) {
                $lot = \App\Models\Menus\StockBatch::findOrFail($d['batch_id']);
                $this->branchWrite($request, (int) $lot->location_id);
                $w = app(\App\Services\Menus\WasteService::class)->record(['location_id' => $lot->location_id, 'item_id' => $lot->item_id, 'batch_id' => $lot->id, 'quantity' => $d['quantity'] ?? $lot->qty_left,
                    'unit' => 'base', 'kind' => 'spoilage', 'note' => $d['reason']], $request->user());

                return response()->json(['message' => 'Written off: ' . round((float) $w->quantity, 4) . ' units, ' . number_format((float) $w->cost, 2) . ' lost.', 'quantity' => (float) $w->quantity, 'cost' => (float) $w->cost]);
            });
        }

        return $this->guard(function () use ($d, $request) {
            $this->branchWrite($request, $d['location_id'] ?? null);
            $r = $this->writeOffs->writeOff(StockBatch::findOrFail($d['batch_id']), $d['location_id'] ?? null, isset($d['quantity']) ? (float) $d['quantity'] : null, $d['reason'], $request->user());

            return response()->json(['message' => 'Written off: ' . round($r['quantity'], 4) . ' units, ' . number_format($r['cost'], 2) . ' lost.'] + $r);
        });
    }

    /** Send (part of) a batch back to the supplier on a Debit Note. Body: batch_id, location_id, quantity, supplier_ledger_id?, reason?. */
    public function returnToSupplier(Request $request): JsonResponse
    {
        if ($request->input('kind') === \App\Services\Menus\IngredientItemSource::TYPE) {
            return response()->json(['message' => 'Ingredients are written off here. To send them back, cancel the purchase they came on (allowed while none has been used).'], 422);
        }
        $d = $request->validate(['batch_id' => 'required|integer', 'location_id' => 'required|integer', 'quantity' => 'required|numeric|min:0.0001', 'supplier_ledger_id' => 'nullable|integer|exists:ledgers,id', 'reason' => 'nullable|string|max:255']);

        return $this->guard(function () use ($d, $request) {
            $this->branchWrite($request, $d['location_id']);
            $note = $this->writeOffs->returnToSupplier(StockBatch::findOrFail($d['batch_id']), (int) $d['location_id'], (float) $d['quantity'], $d['supplier_ledger_id'] ?? null, $d['reason'] ?? '', $request->user());

            return response()->json(['message' => "Debit note {$note->voucher_number} raised.", 'voucher_id' => $note->id]);
        });
    }

    /** Writing stock off or returning it needs full access to the branch it is at; a person limited to some branches must say which. */
    private function branchWrite(Request $request, $locationId): void
    {
        $filter = app(\App\Services\Access\BranchFilter::class);
        if ($locationId) {
            $filter->assertWrite($request->user(), (int) $locationId, 'stock', 'expiry');
        } elseif ($filter->enforcing('stock')) {
            abort(422, 'Choose the branch the stock is at.');
        }
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
