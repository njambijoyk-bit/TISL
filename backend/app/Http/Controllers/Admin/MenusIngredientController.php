<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\IngredientFamily;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use App\Services\Menus\FoodTags;
use App\Services\Menus\IngredientFamilies;
use App\Services\Menus\IngredientItems;
use App\Services\Menus\IngredientResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Menus → Ingredients: "Wheat flour" and the stock items the kitchen takes it from. */
class MenusIngredientController extends Controller
{
    public function __construct(private IngredientFamilies $families, private IngredientResolver $resolver, private IngredientItems $items)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $location = $request->integer('location_id') ?: (int) DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('id')->value('id');
        $rows = IngredientFamily::with(['unit:id,code,name', 'variants'])->orderBy('name')->get()->map(fn (IngredientFamily $f) => $this->row($f, $location))->values();

        return response()->json([
            'families' => $rows, 'location_id' => $location,
            'units' => UnitOfMeasure::active()->orderBy('dimension')->orderBy('to_base_factor')->get(['id', 'code', 'name', 'dimension']),
            'pick_rules' => IngredientFamily::PICK_RULES, 'allergens' => FoodTags::ALLERGENS, 'tags' => FoodTags::TAGS,
            'branches' => DB::table('locations')->where('is_active', 1)->orderBy('name')->get(['id', 'name']),
        ]);
    }

    /** Body: name, unit_id, pick_rule?, allergens?, tags?, notes?, is_active?, variants[{variant_id, units_per_stock, is_allowed?, sell_retail?}] in order of preference. */
    public function save(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate([
            'name' => 'required|string|max:120', 'unit_id' => 'required|integer|exists:units_of_measure,id', 'pick_rule' => 'nullable|string|max:16',
            'allergens' => 'nullable|array', 'allergens.*' => 'string|max:20', 'tags' => 'nullable|array', 'tags.*' => 'string|max:20', 'notes' => 'nullable|string|max:255', 'is_active' => 'nullable|boolean',
            'variants' => 'nullable|array|max:50', 'variants.*.variant_id' => 'required|integer', 'variants.*.units_per_stock' => 'required|numeric|min:0.000001', 'variants.*.is_allowed' => 'nullable|boolean', 'variants.*.sell_retail' => 'nullable|boolean',
        ]);

        return $this->guard(function () use ($d, $id) {
            if ($id !== null) {
                IngredientFamily::findOrFail($id);
            }
            $f = $this->families->save($d, $id);

            return response()->json(['message' => 'Ingredient saved.', 'family' => $this->row($f->load('unit:id,code,name'), null)], $id === null ? 201 : 200);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->families->delete(IngredientFamily::findOrFail($id));

            return response()->json(['message' => 'Ingredient removed. The stock items are untouched.']);
        });
    }

    /** A new stock item for an ingredient, made here so the E-commerce module is not needed. Body: name, unit_id, expires?. Answers like the stock item search does. */
    public function stockItem(Request $request): JsonResponse
    {
        $d = $request->validate(['name' => 'required|string|max:150', 'unit_id' => 'required|integer|exists:units_of_measure,id', 'expires' => 'nullable|boolean']);

        return $this->guard(function () use ($d, $request) {
            [$product, $variant] = $this->items->make($d['name'], (int) $d['unit_id'], (bool) ($d['expires'] ?? false), $request->user()?->id);

            return response()->json([
                'message' => 'Stock item made. Receive some through Purchases (or Opening stock) so it has a cost and a count.',
                'item' => ['variant_id' => $variant->id, 'product' => $product->name, 'variant' => $variant->name, 'sku' => $variant->sku, 'track_expiry' => (bool) $product->track_expiry],
            ], 201);
        });
    }

    /** What one stock unit of an item holds in a unit, when the item's net content tells it. Body: variant_id, unit_id. */
    public function suggest(Request $request): JsonResponse
    {
        $d = $request->validate(['variant_id' => 'required|integer', 'unit_id' => 'required|integer|exists:units_of_measure,id']);

        return response()->json(['units_per_stock' => $this->families->suggestUnitsPerStock((int) $d['variant_id'], UnitOfMeasure::findOrFail($d['unit_id']))]);
    }

    private function row(IngredientFamily $f, ?int $location): array
    {
        $names = DB::table('product_variants as pv')->join('products as p', 'p.id', '=', 'pv.product_id')->whereIn('pv.id', $f->variants->pluck('variant_id'))->get(['pv.id', 'p.name', 'pv.name as variant', 'pv.sku'])->keyBy('id');

        return [
            'id' => $f->id, 'name' => $f->name, 'unit_id' => (int) $f->unit_id, 'unit' => $f->unit?->code, 'pick_rule' => $f->pick_rule, 'allergens' => $f->allergens ?? [], 'tags' => $f->tags ?? [], 'notes' => $f->notes, 'is_active' => $f->is_active,
            'on_hand' => $location ? $this->resolver->available($f, $location) : null,
            'unit_cost' => $location ? $this->resolver->unitCost($f, $location) : null,
            'variants' => $f->variants->map(fn ($v) => [
                'variant_id' => (int) $v->variant_id, 'name' => ($n = $names[$v->variant_id] ?? null) ? trim($n->name.($n->variant && $n->variant !== 'Standard' ? ' — '.$n->variant : '')) : null, 'sku' => $names[$v->variant_id]->sku ?? null,
                'rank' => (int) $v->preference, 'units_per_stock' => (float) $v->units_per_stock, 'is_allowed' => (bool) $v->is_allowed, 'sell_retail' => (bool) $v->sell_retail,
            ])->values(),
        ];
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
