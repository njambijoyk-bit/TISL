<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Ingredient;
use App\Models\Menus\Production;
use App\Services\Books\BooksException;
use App\Services\Menus\DishProduction;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\IngredientKinds;
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
        $branches = app(\App\Services\Menus\MenuBranches::class)->narrow(DB::table('locations')->where('is_active', 1))->orderByDesc('is_default')->orderBy('name')->get(['id', 'name']);
        $location = $request->integer('location_id') ?: (int) ($branches->first()->id ?? 0);
        $with = ['lines.ingredient.baseUnit', 'lines.ingredient.altUnit', 'steps', 'yieldUnit'];
        $recipes = DishRecipe::with($with)->whereNotNull('dish_id')->get()->keyBy('dish_id');

        return response()->json([
            'location_id' => $location, 'branches' => $branches, 'installed' => DishRecipes::installed(),
            'dishes' => Dish::orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'is_active'])->map(fn ($d) => [
                'id' => $d->id, 'name' => $d->name, 'is_active' => (bool) $d->is_active, 'recipe' => ($r = $recipes->get($d->id)) ? $this->row($r, $location) : null,
            ])->values(),
            'ingredients' => Ingredient::with(['baseUnit:id,code', 'altUnit:id,code'])->where('is_active', true)->orderBy('name')->get()->filter(fn ($i) => IngredientKinds::allowedInRecipe($i))->map(fn ($i) => ['id' => $i->id, 'name' => $i->name, 'base_unit' => $i->baseUnit?->code, 'alt_unit' => $i->altUnit?->code])->values(),
            'standalone' => DishRecipe::standalone()->with($with)->orderBy('name')->get()->map(fn (DishRecipe $r) => $this->row($r, $location))->values(),
            'units' => \App\Models\UnitOfMeasure::active()->whereIn('dimension', DishRecipes::YIELD_DIMENSIONS)->orderBy('dimension')->orderBy('to_base_factor')->get(['id', 'code', 'name', 'dimension']),
            'visibility' => DishRecipe::VISIBILITY,
        ]);
    }

    /** Body: yield_qty, made_to_order, note?, visibility, prep_minutes?, cook_minutes?, lines[{ingredient_id, quantity, unit: base|alt, waste_pct?}], steps[{body, minutes?}]. */
    public function save(Request $request, int $dishId): JsonResponse
    {
        $d = $request->validate($this->rules());

        return $this->guard(function () use ($d, $dishId) {
            $r = $this->recipes->save(Dish::findOrFail($dishId), $d);

            return response()->json(['message' => 'Recipe saved.', 'recipe' => $this->row($r->load(['lines.ingredient.baseUnit', 'lines.ingredient.altUnit', 'steps', 'yieldUnit']), null)]);
        });
    }

    /** Body: as for a dish's recipe, plus name. A recipe of its own, not tied to a dish. */
    public function saveBook(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate($this->rules() + ['name' => 'required|string|max:120']);

        return $this->guard(function () use ($d, $id) {
            $r = $this->recipes->saveStandalone($d, $id);

            return response()->json(['message' => "{$r->name} saved.", 'recipe' => $this->row($r->load(['lines.ingredient.baseUnit', 'lines.ingredient.altUnit', 'steps', 'yieldUnit']), null)], $id === null ? 201 : 200);
        });
    }

    public function destroyBook(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->recipes->deleteStandalone($id);

            return response()->json(['message' => 'Recipe removed.']);
        });
    }

    /** Recent batches of made-ahead dishes, and the dishes that can be made ahead. */
    public function productions(Request $request): JsonResponse
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('menus_productions')) {
            return response()->json(['ready' => false, 'runs' => [], 'dishes' => []]);
        }
        $loc = $request->integer('location_id');
        $runs = Production::when($loc, fn ($q) => $q->where('location_id', $loc))->orderByDesc('made_on')->orderByDesc('id')->limit(40)->get();
        $names = Dish::whereIn('id', $runs->pluck('dish_id'))->pluck('name', 'id');
        $left = \App\Models\Menus\DishBatch::whereIn('id', $runs->pluck('batch_id')->filter())->pluck('qty_left', 'id');
        $ahead = DishRecipe::where('is_active', true)->where('made_to_order', false)->pluck('dish_id');

        return response()->json(['ready' => true,
            'dishes' => Dish::whereIn('id', $ahead)->where('is_active', true)->orderBy('name')->get(['id', 'name'])->values(),
            'runs' => $runs->map(fn (Production $p) => ['id' => $p->id, 'number' => $p->number, 'dish' => $names[$p->dish_id] ?? 'Dish', 'date' => $p->made_on->toDateString(), 'portions' => (float) $p->portions, 'left' => (float) ($left[$p->batch_id] ?? 0),
                'cost' => (float) $p->cost, 'unit_cost' => (float) $p->unit_cost, 'status' => $p->status, 'note' => $p->note, 'location_id' => $p->location_id])->values()]);
    }

    /** Body: dish_id, location_id, portions, date?, batch_no?, expiry_date?, note?. Uses the ingredients and puts the portions on the dish's own shelf. */
    public function produce(Request $request, DishProduction $production): JsonResponse
    {
        $d = $request->validate(['dish_id' => 'required|integer', 'location_id' => 'required|integer|exists:locations,id', 'portions' => 'required|numeric|gt:0', 'date' => 'nullable|date', 'batch_no' => 'nullable|string|max:60',
            'expiry_date' => 'nullable|date', 'note' => 'nullable|string|max:255']);

        return $this->guard(function () use ($d, $request, $production) {
            $p = $production->run(Dish::findOrFail($d['dish_id']), (int) $d['location_id'], (float) $d['portions'], $d, $request->user());

            return response()->json(['message' => "Made. {$p->number} is on the shelf and the ingredients are used.", 'id' => $p->id, 'number' => $p->number, 'cost' => (float) $p->cost], 201);
        });
    }

    public function cancelRun(Request $request, DishProduction $production, int $id): JsonResponse
    {
        return $this->guard(function () use ($request, $production, $id) {
            $production->cancel(Production::findOrFail($id), $request->user());

            return response()->json(['message' => 'Batch cancelled. The ingredients are back on the shelf.']);
        });
    }

    public function destroy(int $dishId): JsonResponse
    {
        $this->recipes->delete(Dish::findOrFail($dishId));

        return response()->json(['message' => 'Recipe removed.']);
    }

    /** @return array<string, string> */
    private function rules(): array
    {
        return [
            'yield_qty' => 'required|numeric|gt:0', 'yield_unit_id' => 'nullable|integer', 'made_to_order' => 'nullable|boolean', 'note' => 'nullable|string|max:255', 'visibility' => 'nullable|string|max:12',
            'prep_minutes' => 'nullable|integer|min:0|max:6000', 'cook_minutes' => 'nullable|integer|min:0|max:6000', 'is_active' => 'nullable|boolean',
            'lines' => 'required|array|min:1|max:80', 'lines.*.ingredient_id' => 'required|integer', 'lines.*.quantity' => 'required|numeric|min:0', 'lines.*.unit' => 'nullable|in:base,alt', 'lines.*.waste_pct' => 'nullable|numeric|min:0|max:90',
            'steps' => 'nullable|array|max:60', 'steps.*.body' => 'nullable|string|max:2000', 'steps.*.minutes' => 'nullable|integer|min:0|max:6000',
        ];
    }

    private function row(DishRecipe $r, ?int $location): array
    {
        $cost = $location ? $this->use->cost($r, $location) : null;

        return [
            'id' => $r->id, 'dish_id' => $r->dish_id ? (int) $r->dish_id : null, 'name' => $r->name, 'yield_qty' => (float) $r->yield_qty, 'yield_unit_id' => $r->yield_unit_id ? (int) $r->yield_unit_id : null, 'yield_unit' => $r->yieldUnit?->code, 'yield_label' => $r->yieldLabel(), 'made_to_order' => (bool) $r->made_to_order, 'note' => $r->note, 'visibility' => $r->visibility,
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
