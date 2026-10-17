<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use App\Models\Menus\Ingredient;
use App\Models\Menus\Receipt;
use App\Services\Books\BooksException;
use App\Services\Menus\IngredientReceiving;
use App\Services\Menus\IngredientKinds;
use App\Services\Menus\IngredientStock;
use App\Services\Menus\StockCounts;
use App\Services\Menus\StockTransfers;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Menus → Stock: what is on the shelf at a branch, in packs and in the base and alternate units, and the receipts that put it there. */
class MenusStockController extends Controller
{
    public function __construct(private IngredientStock $stock, private IngredientReceiving $receiving, private StockCounts $counts, private StockTransfers $transfers)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $branches = DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('name')->get(['id', 'name']);
        $location = $request->integer('location_id') ?: (int) ($branches->first()->id ?? 0);
        $levels = IngredientStock::installed() ? $this->stock->levels($location) : [];
        // what a count is compared with: everything physically there, held and recalled lots too (the shelf figures above are the good stock only)
        $every = IngredientStock::installed() ? \App\Models\Menus\StockBatch::where('location_id', $location)->where('qty_left', '>', 0)->groupBy('item_id')->selectRaw('item_id, SUM(qty_left) as q, SUM(qty_left * unit_cost) as v')->get()->keyBy('item_id') : collect();

        $rows = Ingredient::with(array_merge(['baseUnit:id,code,name,dimension,to_base_factor', 'altUnit:id,code,name,dimension,to_base_factor', 'variants'], IngredientKinds::installed() ? ['kind:id,name'] : []))->orderBy('name')->get()->map(function (Ingredient $i) use ($levels, $every) {
            $variants = $i->variants->map(function ($v) use ($i, $levels, $every) {
                $lv = $levels[$v->id] ?? ['qty' => 0.0, 'value' => 0.0, 'next_expiry' => null];
                $pack = $v->pack_size ? (float) $v->pack_size : null;

                return [
                    'id' => (int) $v->id, 'name' => $v->name, 'is_active' => (bool) $v->is_active, 'track_expiry' => (bool) $v->track_expiry, 'pack_size_base' => $pack, 'reorder_level' => $v->reorder_level === null ? null : (float) $v->reorder_level,
                    'qty_base' => $lv['qty'], 'qty_alt' => $i->altUnit ? round($i->baseUnit->convertTo($i->altUnit, $lv['qty']), 4) : null,
                    'packs' => $pack ? round($lv['qty'] / $pack, 4) : null, 'value' => $lv['value'], 'next_expiry' => $lv['next_expiry'],
                    'book_qty' => round((float) ($every[$v->id]->q ?? 0), 4), 'book_cost' => isset($every[$v->id]) && (float) $every[$v->id]->q > 0 ? round((float) $every[$v->id]->v / (float) $every[$v->id]->q, 6) : null,
                ];
            })->values();

            return [
                'id' => $i->id, 'name' => $i->name, 'is_active' => (bool) $i->is_active, 'base_unit' => $i->baseUnit?->code, 'alt_unit' => $i->altUnit?->code, 'kind_id' => $i->kind_id ? (int) $i->kind_id : null, 'kind' => $i->relationLoaded('kind') ? $i->kind?->name : null,
                'alt_factor' => $i->altUnit ? round($i->altUnit->convertTo($i->baseUnit, 1), 6) : null,   // base units in one alternate unit (1 kg = 1000 g)
                'qty_base' => round($variants->sum('qty_base'), 4), 'qty_alt' => $i->altUnit ? round($i->baseUnit->convertTo($i->altUnit, (float) $variants->sum('qty_base')), 4) : null,
                'value' => round($variants->sum('value'), 2), 'variants' => $variants,
            ];
        })->values();

        return response()->json([
            'location_id' => $location, 'branches' => $branches, 'ingredients' => $rows, 'installed' => IngredientStock::installed(),
            'kinds' => IngredientKinds::installed() ? \App\Models\Menus\IngredientKind::orderBy('sort_order')->orderBy('id')->get(['id', 'name'])->map(fn ($k) => ['id' => (int) $k->id, 'name' => $k->name])->all() : [],
            'suppliers' => $this->suppliers(), 'payment_methods' => $this->paymentMethods(),
        ]);
    }

    /** The vouchers that brought ingredients in (purchases, goods received, opening stock), newest first, with any older receipts made before ingredients had voucher lines of their own. */
    public function receipts(Request $request): JsonResponse
    {
        if (! IngredientStock::installed()) {
            return response()->json(['receipts' => []]);
        }
        $loc = $request->integer('location_id');
        $out = [];
        if (\Illuminate\Support\Facades\Schema::hasColumn('voucher_items', 'ingredient_item_id')) {
            $vouchers = Voucher::with('type')->whereIn('id', DB::table('voucher_items')->where('item_type', 'ingredient')->select('voucher_id'))->when($loc, fn ($q) => $q->where('location_id', $loc))
                ->orderByDesc('date')->orderByDesc('id')->limit(60)->get();
            $suppliers = Ledger::whereIn('id', $vouchers->pluck('party_ledger_id')->filter())->pluck('name', 'id');
            foreach ($vouchers as $v) {
                $out[] = ['id' => $v->id, 'legacy' => false, 'kind' => $v->type?->base_type === 'opening_stock' ? 'opening' : ($v->type?->base_type === 'receipt_note' ? 'goods' : 'purchase'), 'date' => $v->date?->toDateString(), 'voucher_id' => $v->id,
                    'voucher_number' => $v->voucher_number, 'supplier' => $suppliers[$v->party_ledger_id] ?? null, 'supplier_invoice_no' => $v->supplier_invoice_no, 'total' => (float) $v->total_amount,
                    'status' => $v->status === Voucher::CANCELLED ? 'cancelled' : 'posted', 'narration' => $v->narration];
            }
        }
        $old = Receipt::when($loc, fn ($q) => $q->where('location_id', $loc))->orderByDesc('receipt_date')->orderByDesc('id')->limit(60)->get();
        $numbers = Voucher::whereIn('id', $old->pluck('voucher_id')->filter())->pluck('voucher_number', 'id');
        $oldSuppliers = Ledger::whereIn('id', $old->pluck('supplier_ledger_id')->filter())->pluck('name', 'id');
        foreach ($old as $r) {
            $out[] = ['id' => $r->id, 'legacy' => true, 'kind' => $r->kind, 'date' => $r->receipt_date?->toDateString(), 'voucher_id' => $r->voucher_id, 'voucher_number' => $numbers[$r->voucher_id] ?? null,
                'supplier' => $oldSuppliers[$r->supplier_ledger_id] ?? null, 'supplier_invoice_no' => $r->supplier_invoice_no, 'total' => (float) $r->total, 'status' => $r->status, 'narration' => $r->narration];
        }
        usort($out, fn ($a, $b) => [$b['date'], $b['id']] <=> [$a['date'], $a['id']]);

        return response()->json(['receipts' => array_slice($out, 0, 60)]);
    }

    /** Body: location_id, date, supplier_ledger_id | paid_ledger_id | payment_method_id, supplier_invoice_no?, due_date?, narration?, lines[{item_id, quantity, unit: pack|alt|base, rate, batch_no?, expiry_date?}]. */
    public function receive(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules() + [
            'supplier_ledger_id' => 'nullable|integer|exists:ledgers,id', 'paid_ledger_id' => 'nullable|integer|exists:ledgers,id', 'payment_method_id' => 'nullable|integer',
            'supplier_invoice_no' => 'nullable|string|max:60', 'due_date' => 'nullable|date',
        ]);

        return $this->guard(function () use ($d, $request) {
            $v = $this->receiving->receive($d, $request->user());

            return response()->json(['message' => 'Received. The supplier bill is in the books and the stock is on the shelf.', 'voucher_id' => $v->id], 201);
        });
    }

    /** The same body as receive: what the books would post for it (entries, tax, totals). Nothing is saved. */
    public function previewReceive(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules() + [
            'supplier_ledger_id' => 'nullable|integer|exists:ledgers,id', 'paid_ledger_id' => 'nullable|integer|exists:ledgers,id', 'payment_method_id' => 'nullable|integer',
            'supplier_invoice_no' => 'nullable|string|max:60', 'due_date' => 'nullable|date',
        ]);

        return $this->guard(fn () => response()->json($this->receiving->preview($d, $request->user())));
    }

    public function opening(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(function () use ($d, $request) {
            $made = $this->receiving->opening($d, $request->user());
            $n = count($made);

            return response()->json(['message' => $n === 1 ? 'Opening stock recorded: 1 Opening stock voucher.' : "Opening stock recorded: {$n} Opening stock vouchers, one for each ingredient variant.", 'voucher_ids' => array_map(fn ($v) => $v->id, $made)], 201);
        });
    }

    /** Lots that have expired or will soon. */
    public function expiring(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'nullable|integer', 'days' => 'nullable|integer|min:0|max:365']);
        $loc = (int) ($d['location_id'] ?? 0) ?: (int) DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('name')->value('id');

        return response()->json(['location_id' => $loc, 'days' => (int) ($d['days'] ?? 7), 'rows' => IngredientStock::installed() ? $this->stock->expiring($loc, (int) ($d['days'] ?? 7)) : []]);
    }

    public function counts(Request $request): JsonResponse
    {
        if (! Schema::hasTable('menus_counts')) {
            return response()->json(['counts' => [], 'transfers' => [], 'ready' => false]);
        }
        $loc = $request->integer('location_id');
        $out = [];
        if (StockCounts::countsInstalled()) {
            foreach (\App\Models\StockCount::whereIn('id', DB::table('stock_count_ingredient_lines')->select('count_id'))->when($loc, fn ($q) => $q->where('location_id', $loc))->orderByDesc('id')->limit(30)->get() as $c) {
                $out[] = ['id' => $c->id, 'number' => $c->number, 'date' => ($c->posted_at ?? $c->created_at)?->toDateString(), 'location_id' => $c->location_id, 'status' => $c->status,
                    'value_change' => (float) DB::table('stock_count_ingredient_lines')->where('count_id', $c->id)->sum('value_change'), 'note' => $c->note,
                    'lines' => DB::table('stock_count_ingredient_lines')->where('count_id', $c->id)->count(), 'voucher_id' => $c->ingredient_voucher_id, 'legacy' => false];
            }
        }
        foreach (\App\Models\Menus\Count::when($loc, fn ($q) => $q->where('location_id', $loc))->orderByDesc('counted_on')->orderByDesc('id')->limit(30)->get() as $c) {
            $out[] = ['id' => $c->id, 'number' => $c->number, 'date' => $c->counted_on->toDateString(), 'location_id' => $c->location_id, 'status' => 'posted', 'value_change' => (float) $c->value_change, 'note' => $c->note,
                'lines' => $c->lines()->count(), 'voucher_id' => $c->journal_id, 'legacy' => true];
        }
        usort($out, fn ($a, $b) => [$b['date'], $b['id']] <=> [$a['date'], $a['id']]);
        $moves = [];
        if (StockTransfers::installed()) {
            foreach (\App\Models\StockTransfer::whereIn('id', DB::table('stock_transfer_ingredient_lines')->select('transfer_id'))->when($loc, fn ($q) => $q->where('from_location_id', $loc)->orWhere('to_location_id', $loc))->orderByDesc('id')->limit(30)->get() as $t) {
                $moves[] = ['id' => $t->id, 'number' => $t->number, 'date' => ($t->sent_at ?? $t->created_at)?->toDateString(), 'from' => $t->from_location_id, 'to' => $t->to_location_id, 'note' => $t->note, 'status' => $t->status,
                    'lines' => DB::table('stock_transfer_ingredient_lines')->where('transfer_id', $t->id)->count(), 'legacy' => false];
            }
        }
        foreach (\App\Models\Menus\Transfer::when($loc, fn ($q) => $q->where('from_location_id', $loc)->orWhere('to_location_id', $loc))->orderByDesc('transferred_on')->orderByDesc('id')->limit(30)->get() as $t) {
            $moves[] = ['id' => $t->id, 'number' => $t->number, 'date' => $t->transferred_on->toDateString(), 'from' => $t->from_location_id, 'to' => $t->to_location_id, 'note' => $t->note, 'status' => 'received', 'lines' => $t->lines()->count(), 'legacy' => true];
        }
        usort($moves, fn ($a, $b) => [$b['date'], $b['id']] <=> [$a['date'], $a['id']]);

        return response()->json(['ready' => true, 'counts' => array_slice($out, 0, 30), 'transfers' => array_slice($moves, 0, 30)]);
    }

    /** Body: location_id, date?, note?, lines[{item_id, quantity, unit: pack|alt|base}] (only what was counted). */
    public function count(Request $request): JsonResponse
    {
        $d = $request->validate(['location_id' => 'required|integer|exists:locations,id', 'date' => 'nullable|date', 'note' => 'nullable|string|max:255', 'lines' => 'required|array|min:1|max:500',
            'lines.*.item_id' => 'required|integer', 'lines.*.quantity' => 'required|numeric|min:0', 'lines.*.unit' => 'nullable|in:pack,alt,base']);

        return $this->guard(function () use ($d, $request) {
            $c = $this->counts->post($d, $request->user());

            return response()->json(['message' => 'Stock count recorded.', 'id' => $c->id, 'number' => $c->number, 'value_change' => (float) $c->ingredientLines->sum('value_change'), 'voucher_id' => $c->ingredient_voucher_id], 201);
        });
    }

    /** Body: from_location_id, to_location_id, date?, note?, lines[{item_id, quantity, unit}]. */
    public function transfer(Request $request): JsonResponse
    {
        $d = $request->validate(['from_location_id' => 'required|integer|exists:locations,id', 'to_location_id' => 'required|integer|exists:locations,id', 'date' => 'nullable|date', 'note' => 'nullable|string|max:255',
            'lines' => 'required|array|min:1|max:200', 'lines.*.item_id' => 'required|integer', 'lines.*.quantity' => 'required|numeric|min:0.0001', 'lines.*.unit' => 'nullable|in:pack,alt,base']);

        return $this->guard(function () use ($d, $request) {
            $t = $this->transfers->send($d, $request->user());

            return response()->json(['message' => 'Sent. The stock is now on the other branch\'s shelf.', 'id' => $t->id, 'number' => $t->number], 201);
        });
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:255', 'legacy' => 'nullable|boolean']);

        return $this->guard(function () use ($d, $request, $id) {
            if (! empty($d['legacy'])) {
                $this->receiving->cancel(Receipt::findOrFail($id), $d['reason'] ?? null, $request->user());
            } else {
                $this->receiving->cancelVoucher(Voucher::findOrFail($id), $d['reason'] ?? null, $request->user());
            }

            return response()->json(['message' => 'Receipt cancelled. The stock is off the shelf and the bill is cancelled in the books.']);
        });
    }

    private function rules(): array
    {
        return [
            'location_id' => 'nullable|integer|exists:locations,id', 'date' => 'nullable|date', 'narration' => 'nullable|string|max:255',
            'lines' => 'required|array|min:1|max:100', 'lines.*.item_id' => 'required|integer', 'lines.*.quantity' => 'required|numeric|gt:0',
            'lines.*.unit' => 'nullable|in:pack,alt,base', 'lines.*.rate' => 'required|numeric|min:0', 'lines.*.discount' => 'nullable|numeric|min:0', 'reference_no' => 'nullable|string|max:60', 'lines.*.batch_no' => 'nullable|string|max:60', 'lines.*.expiry_date' => 'nullable|date',
        ];
    }

    /** Ledgers under Sundry Creditors (a vendor's own ledger sits there). */
    private function suppliers(): array
    {
        $group = LedgerGroup::where('name', 'Sundry Creditors')->first();
        if (! $group) {
            return [];
        }
        $ids = LedgerGroup::where('parent_id', $group->id)->pluck('id')->push($group->id);

        return Ledger::whereIn('group_id', $ids)->where('is_active', true)->orderBy('name')->get(['id', 'name'])->map(fn ($l) => ['id' => $l->id, 'name' => $l->name])->values()->all();
    }

    /** How a delivery can be paid for at once: the active methods that have an account behind them (not gift vouchers). */
    private function paymentMethods(): array
    {
        try {
            return \App\Models\Books\PaymentMethod::where('is_active', true)->where('kind', '!=', 'gift_voucher')->whereNotNull('ledger_id')->orderBy('sort_order')->orderBy('name')->get(['id', 'name'])->map(fn ($m) => ['id' => $m->id, 'name' => $m->name])->values()->all();
        } catch (\Throwable) {
            return [];
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
