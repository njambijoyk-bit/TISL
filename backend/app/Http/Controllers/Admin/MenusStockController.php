<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Books\Ledger;
use App\Models\Books\LedgerGroup;
use App\Models\Books\Voucher;
use App\Models\Menus\Ingredient;
use App\Models\Menus\Receipt;
use App\Models\TaxRate;
use App\Services\Books\BooksException;
use App\Services\Menus\IngredientReceiving;
use App\Services\Menus\IngredientStock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Menus → Stock: what is on the shelf at a branch, in packs and in the base and alternate units, and the receipts that put it there. */
class MenusStockController extends Controller
{
    public function __construct(private IngredientStock $stock, private IngredientReceiving $receiving)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $branches = DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('name')->get(['id', 'name']);
        $location = $request->integer('location_id') ?: (int) ($branches->first()->id ?? 0);
        $levels = IngredientStock::installed() ? $this->stock->levels($location) : [];

        $rows = Ingredient::with(['baseUnit:id,code,name,dimension,to_base_factor', 'altUnit:id,code,name,dimension,to_base_factor', 'variants'])->orderBy('name')->get()->map(function (Ingredient $i) use ($levels) {
            $variants = $i->variants->map(function ($v) use ($i, $levels) {
                $lv = $levels[$v->id] ?? ['qty' => 0.0, 'value' => 0.0, 'next_expiry' => null];
                $pack = $v->pack_size ? (float) $v->pack_size : null;

                return [
                    'id' => (int) $v->id, 'name' => $v->name, 'is_active' => (bool) $v->is_active, 'track_expiry' => (bool) $v->track_expiry, 'pack_size_base' => $pack,
                    'qty_base' => $lv['qty'], 'qty_alt' => $i->altUnit ? round($i->baseUnit->convertTo($i->altUnit, $lv['qty']), 4) : null,
                    'packs' => $pack ? round($lv['qty'] / $pack, 4) : null, 'value' => $lv['value'], 'next_expiry' => $lv['next_expiry'],
                ];
            })->values();

            return [
                'id' => $i->id, 'name' => $i->name, 'is_active' => (bool) $i->is_active, 'base_unit' => $i->baseUnit?->code, 'alt_unit' => $i->altUnit?->code,
                'alt_factor' => $i->altUnit ? round($i->altUnit->convertTo($i->baseUnit, 1), 6) : null,   // base units in one alternate unit (1 kg = 1000 g)
                'qty_base' => round($variants->sum('qty_base'), 4), 'qty_alt' => $i->altUnit ? round($i->baseUnit->convertTo($i->altUnit, (float) $variants->sum('qty_base')), 4) : null,
                'value' => round($variants->sum('value'), 2), 'variants' => $variants,
            ];
        })->values();

        return response()->json([
            'location_id' => $location, 'branches' => $branches, 'ingredients' => $rows, 'installed' => IngredientStock::installed(),
            'suppliers' => $this->suppliers(), 'tax_rates' => $this->taxRates(),
        ]);
    }

    public function receipts(Request $request): JsonResponse
    {
        if (! IngredientStock::installed()) {
            return response()->json(['receipts' => []]);
        }
        $rows = Receipt::when($request->integer('location_id'), fn ($q, $l) => $q->where('location_id', $l))->orderByDesc('receipt_date')->orderByDesc('id')->limit(60)->get();
        $numbers = Voucher::whereIn('id', $rows->pluck('voucher_id')->filter())->pluck('voucher_number', 'id');
        $suppliers = Ledger::whereIn('id', $rows->pluck('supplier_ledger_id')->filter())->pluck('name', 'id');

        return response()->json(['receipts' => $rows->map(fn (Receipt $r) => [
            'id' => $r->id, 'kind' => $r->kind, 'date' => $r->receipt_date?->toDateString(), 'voucher_id' => $r->voucher_id, 'voucher_number' => $numbers[$r->voucher_id] ?? null,
            'supplier' => $suppliers[$r->supplier_ledger_id] ?? null, 'supplier_invoice_no' => $r->supplier_invoice_no, 'total' => (float) $r->total, 'status' => $r->status, 'narration' => $r->narration,
        ])->values()]);
    }

    /** Body: location_id, date, supplier_ledger_id | paid_ledger_id | payment_method_id, supplier_invoice_no?, due_date?, narration?, lines[{item_id, quantity, unit: pack|alt|base, rate, tax_rate_id?, batch_no?, expiry_date?}]. */
    public function receive(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules() + [
            'supplier_ledger_id' => 'nullable|integer|exists:ledgers,id', 'paid_ledger_id' => 'nullable|integer|exists:ledgers,id', 'payment_method_id' => 'nullable|integer',
            'supplier_invoice_no' => 'nullable|string|max:60', 'due_date' => 'nullable|date', 'lines.*.tax_rate_id' => 'nullable|integer',
        ]);

        return $this->guard(function () use ($d, $request) {
            $r = $this->receiving->receive($d, $request->user());

            return response()->json(['message' => 'Received. The supplier bill is in the books and the stock is on the shelf.', 'receipt_id' => $r->id, 'voucher_id' => $r->voucher_id], 201);
        });
    }

    public function opening(Request $request): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(function () use ($d, $request) {
            $r = $this->receiving->opening($d, $request->user());

            return response()->json(['message' => 'Opening stock recorded.', 'receipt_id' => $r->id, 'voucher_id' => $r->voucher_id], 201);
        });
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['reason' => 'nullable|string|max:255']);

        return $this->guard(function () use ($d, $request, $id) {
            $this->receiving->cancel(Receipt::findOrFail($id), $d['reason'] ?? null, $request->user());

            return response()->json(['message' => 'Receipt cancelled. The stock is off the shelf and the bill is cancelled in the books.']);
        });
    }

    private function rules(): array
    {
        return [
            'location_id' => 'nullable|integer|exists:locations,id', 'date' => 'nullable|date', 'narration' => 'nullable|string|max:255',
            'lines' => 'required|array|min:1|max:100', 'lines.*.item_id' => 'required|integer', 'lines.*.quantity' => 'required|numeric|gt:0',
            'lines.*.unit' => 'nullable|in:pack,alt,base', 'lines.*.rate' => 'required|numeric|min:0', 'lines.*.batch_no' => 'nullable|string|max:60', 'lines.*.expiry_date' => 'nullable|date',
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

    private function taxRates(): array
    {
        try {
            return TaxRate::where('is_active', true)->orderBy('name')->get(['id', 'name', 'rate_type', 'rate_value'])->map(fn ($t) => ['id' => $t->id, 'name' => $t->name, 'percent' => $t->rate_type === 'percentage' ? (float) $t->rate_value : null])->values()->all();
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
