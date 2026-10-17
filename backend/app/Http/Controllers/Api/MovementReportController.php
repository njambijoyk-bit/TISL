<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Books\MovementReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Books reports on what moved: stock with a ledger, and money through the cash and bank accounts. Read only. */
class MovementReportController extends Controller
{
    public function __construct(private MovementReportService $moves) {}

    private function dates(Request $r): array
    {
        $r->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);

        return [$r->query('from'), $r->query('to')];
    }

    /** What one ledger has bought from us or sold to us, item by item. */
    public function ledgerItems(Request $request): JsonResponse
    {
        $request->validate(['ledger_id' => 'required|integer|exists:ledgers,id']);

        return response()->json($this->moves->ledgerItems((int) $request->query('ledger_id'), ...$this->dates($request)));
    }

    /** Item voucher analysis: every voucher line of an item, for one ledger or for everyone. */
    public function itemVouchers(Request $request): JsonResponse
    {
        $request->validate(['product_id' => 'required_without:item_id|integer', 'item_id' => 'required_without:product_id|integer', 'item_type' => 'nullable|in:product,ingredient', 'ledger_id' => 'nullable|integer']);

        return response()->json($this->moves->itemVouchers((int) ($request->query('item_id') ?? $request->query('product_id')), $request->filled('ledger_id') ? (int) $request->query('ledger_id') : null, ...[...$this->dates($request), (string) $request->query('item_type', 'product')]));
    }

    /** Which ledgers one item moved with. */
    public function itemLedgers(Request $request): JsonResponse
    {
        $request->validate(['product_id' => 'required_without:item_id|integer', 'item_id' => 'required_without:product_id|integer', 'item_type' => 'nullable|in:product,ingredient']);

        return response()->json($this->moves->itemLedgers((int) ($request->query('item_id') ?? $request->query('product_id')), ...[...$this->dates($request), (string) $request->query('item_type', 'product')]));
    }

    /** Products, and the kitchen's stock when Menus is on, by name or code, to pick the item to follow. */
    public function products(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $rows = \Illuminate\Support\Facades\DB::table('products')->when($q !== '', fn ($w) => $w->where(fn ($x) => $x->where('name', 'like', "%{$q}%")->orWhere('sku', 'like', "%{$q}%")))
            ->orderBy('name')->limit(30)->get(['id', 'name', 'sku'])->map(fn ($r) => ['item_type' => 'product', 'id' => (int) $r->id, 'name' => $r->name, 'sku' => $r->sku])->all();
        if (\App\Services\Menus\IngredientStock::moduleOn() && \Illuminate\Support\Facades\Schema::hasTable('menus_ingredient_items')) {
            $kitchen = \App\Models\Menus\IngredientItem::with('ingredient:id,name')->whereHas('ingredient')
                ->when($q !== '', fn ($v) => $v->where(fn ($w) => $w->where('name', 'like', "%{$q}%")->orWhere('code', 'like', "%{$q}%")->orWhereHas('ingredient', fn ($i) => $i->where('name', 'like', "%{$q}%"))))
                ->orderBy('ingredient_id')->orderBy('preference')->limit(30)->get();
            foreach ($kitchen as $i) {
                $rows[] = ['item_type' => 'ingredient', 'id' => (int) $i->id, 'name' => "{$i->ingredient->name} — {$i->name}", 'sku' => $i->code, 'kitchen' => true];
            }
        }

        return response()->json($rows);
    }

    /** What flowed into and out of the cash and bank accounts, and who with. */
    public function moneyFlow(Request $request): JsonResponse
    {
        $request->validate(['ledger_id' => 'nullable|integer']);

        return response()->json($this->moves->moneyFlow(...[...$this->dates($request), $request->filled('ledger_id') ? (int) $request->query('ledger_id') : null]));
    }
}
