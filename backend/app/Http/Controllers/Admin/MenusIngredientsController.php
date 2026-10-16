<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Ingredient;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use App\Services\Menus\FoodTags;
use App\Services\Menus\Ingredients;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Menus → Ingredients: "Wheat flour" in grams and kilograms, and its variants (Exe, Pembe, Soko), with no product behind them. */
class MenusIngredientsController extends Controller
{
    public function __construct(private Ingredients $ingredients)
    {
    }

    public function index(): JsonResponse
    {
        $rows = Ingredient::with(['baseUnit:id,code,name,dimension,to_base_factor', 'altUnit:id,code,name,dimension,to_base_factor', 'variants'])->orderBy('name')->get()->map(fn (Ingredient $i) => $this->row($i))->values();

        return response()->json([
            'ingredients' => $rows,
            'units' => UnitOfMeasure::active()->orderBy('dimension')->orderBy('to_base_factor')->get(['id', 'code', 'name', 'dimension', 'to_base_factor']),
            'pick_rules' => Ingredient::PICK_RULES, 'allergens' => FoodTags::ALLERGENS, 'tags' => FoodTags::TAGS,
        ]);
    }

    /** Body: name, base_unit_id, alt_unit_id?, pick_rule?, allergens?, tags?, notes?, is_active?, variants[{id?, name, code?, pack_size?, pack_unit_id?, track_expiry?, is_allowed?, is_active?}] in order of preference. */
    public function save(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate([
            'name' => 'required|string|max:120', 'base_unit_id' => 'required|integer|exists:units_of_measure,id', 'alt_unit_id' => 'nullable|integer|exists:units_of_measure,id',
            'pick_rule' => 'nullable|string|max:16', 'allergens' => 'nullable|array', 'allergens.*' => 'string|max:20', 'tags' => 'nullable|array', 'tags.*' => 'string|max:20',
            'notes' => 'nullable|string|max:255', 'is_active' => 'nullable|boolean',
            'variants' => 'nullable|array|max:50', 'variants.*.id' => 'nullable|integer', 'variants.*.name' => 'required|string|max:120', 'variants.*.code' => 'nullable|string|max:40',
            'variants.*.pack_size' => 'nullable|numeric|min:0', 'variants.*.pack_unit_id' => 'nullable|integer', 'variants.*.track_expiry' => 'nullable|boolean', 'variants.*.reorder_level' => 'nullable|numeric|min:0',
            'variants.*.is_allowed' => 'nullable|boolean', 'variants.*.is_active' => 'nullable|boolean',
        ]);

        return $this->guard(function () use ($d, $id) {
            if ($id !== null) {
                Ingredient::findOrFail($id);
            }
            $i = $this->ingredients->save($d, $id);

            return response()->json(['message' => 'Ingredient saved.', 'ingredient' => $this->row($i->load(['baseUnit', 'altUnit']))], $id === null ? 201 : 200);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->ingredients->delete(Ingredient::findOrFail($id));

            return response()->json(['message' => 'Ingredient removed.']);
        });
    }

    private function row(Ingredient $i): array
    {
        $base = $i->baseUnit;
        $alt = $i->altUnit;
        $show = $alt ?? $base;   // a pack size is shown in the bigger unit when there is one: 2 kg, not 2000 g

        return [
            'id' => $i->id, 'name' => $i->name, 'base_unit_id' => (int) $i->base_unit_id, 'base_unit' => $base?->code, 'alt_unit_id' => $i->alt_unit_id ? (int) $i->alt_unit_id : null, 'alt_unit' => $alt?->code,
            'pick_rule' => $i->pick_rule, 'allergens' => $i->allergens ?? [], 'tags' => $i->tags ?? [], 'notes' => $i->notes, 'is_active' => (bool) $i->is_active,
            'variants' => $i->variants->map(fn ($v) => [
                'id' => (int) $v->id, 'name' => $v->name, 'code' => $v->code, 'rank' => (int) $v->preference, 'track_expiry' => (bool) $v->track_expiry, 'is_allowed' => (bool) $v->is_allowed, 'is_active' => (bool) $v->is_active,
                'pack_size_base' => $v->pack_size === null ? null : (float) $v->pack_size, 'reorder_level' => $v->reorder_level === null ? null : (float) $v->reorder_level,
                'pack_size' => $v->pack_size === null || ! $base ? null : round($base->convertTo($show, (float) $v->pack_size), 6), 'pack_unit_id' => $show?->id, 'pack_unit' => $show?->code,
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
