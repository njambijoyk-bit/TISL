<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The product search the stock reports' pickers use: products, and the kitchen's stock when Menus is on. The reports themselves are on the report engine. Read only. */
class MovementReportController extends Controller
{
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
}
