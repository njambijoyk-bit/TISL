<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Ingredient;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\IngredientUse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Menus → Recipes: what each dish is made of, on ingredients (Menus' own stock), what a portion costs and how many can be made from the shelf. */
class MenusRecipesController extends Controller
{
    public function __construct(private DishRecipes $recipes, private IngredientUse $use)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $branches = DB::table('locations')->where('is_active', 1)->orderByDesc('is_default')->orderBy('name')->get(['id', 'name']);
        $location = $request->integer('location_id') ?: (int) ($branches->first()->id ?? 0);
        $recipes = DishRecipe::with(['lines.ingredient.baseUnit', 'lines.ingredient.altUnit', 'steps'])->get()->keyBy('dish_id');

        return response()->json([
            'location_id' => $location, 'branches' => $branches, 'installed' => DishRecipes::installed(),
            'dishes' => Dish::orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'is_active'])->map(fn ($d) => [
                'id' => $d->id, 'name' => $d->name, 'is_active' => (bool) $d->is_active, 'recipe' => ($r = $recipes->get($d->id)) ? $this->row($r, $location) : null,
            ])->values(),
            'ingredients' => Ingredient::with(['baseUnit:id,code', 'altUnit:id,code'])->where('is_active', true)->orderBy('name')->get()->map(fn ($i) => ['id' => $i->id, 'name' => $i->name, 'base_unit' => $i->baseUnit?->code, 'alt_unit' => $i->altUnit?->code])->values(),
            'visibility' => DishRecipe::VISIBILITY,
        ]);
    }

    /** Body: yield_qty, made_to_order, note?, visibility, prep_minutes?, cook_minutes?, lines[{ingredient_id, quantity, unit: base|alt, waste_pct?}], steps[{body, minutes?}]. */
    public function save(Request $request, int $dishId): JsonResponse
    {
        $d = $request->validate([
            'yield_qty' => 'required|numeric|gt:0', 'made_to_order' => 'nullable|boolean', 'note' => 'nullable|string|max:255', 'visibility' => 'nullable|string|max:12',
            'prep_minutes' => 'nullable|integer|min:0|max:6000', 'cook_minutes' => 'nullable|integer|min:0|max:6000', 'is_active' => 'nullable|boolean',
            'lines' => 'required|array|min:1|max:80', 'lines.*.ingredient_id' => 'required|integer', 'lines.*.quantity' => 'required|numeric|min:0', 'lines.*.unit' => 'nullable|in:base,alt', 'lines.*.waste_pct' => 'nullable|numeric|min:0|max:90',
            'steps' => 'nullable|array|max:60', 'steps.*.body' => 'nullable|string|max:2000', 'steps.*.minutes' => 'nullable|integer|min:0|max:6000',
        ]);

        return $this->guard(function () use ($d, $dishId) {
            $r = $this->recipes->save(Dish::findOrFail($dishId), $d);

            return response()->json(['message' => 'Recipe saved.', 'recipe' => $this->row($r->load(['lines.ingredient.baseUnit', 'lines.ingredient.altUnit', 'steps']), null)]);
        });
    }

    public function destroy(int $dishId): JsonResponse
    {
        $this->recipes->delete(Dish::findOrFail($dishId));

        return response()->json(['message' => 'Recipe removed.']);
    }

    private function row(DishRecipe $r, ?int $location): array
    {
        $cost = $location ? $this->use->cost($r, $location) : null;

        return [
            'id' => $r->id, 'dish_id' => (int) $r->dish_id, 'yield_qty' => (float) $r->yield_qty, 'made_to_order' => (bool) $r->made_to_order, 'note' => $r->note, 'visibility' => $r->visibility,
            'prep_minutes' => $r->prep_minutes, 'cook_minutes' => $r->cook_minutes, 'is_active' => (bool) $r->is_active,
            'lines' => $r->lines->map(fn ($l) => [
                'ingredient_id' => (int) $l->ingredient_id, 'name' => $l->ingredient?->name, 'quantity' => (float) $l->quantity, 'unit' => $l->unit, 'waste_pct' => (float) $l->waste_pct,
                'base_unit' => $l->ingredient?->baseUnit?->code, 'alt_unit' => $l->ingredient?->altUnit?->code,
            ])->values(),
            'steps' => $r->steps->map(fn ($s) => ['body' => $s->body, 'minutes' => $s->minutes])->values(),
            'cost' => $cost, 'portions' => $location && $r->made_to_order && $r->is_active ? $this->use->capacity($r, $location) : null,
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
