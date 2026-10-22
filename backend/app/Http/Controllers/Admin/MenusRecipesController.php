<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\Dish;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Ingredient;
use App\Models\Menus\IngredientItem;
use App\Models\Menus\Production;
use App\Models\Menus\StockBatch;
use App\Services\Books\BooksException;
use App\Services\Menus\DishProduction;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\IngredientKinds;
use App\Services\Menus\IngredientUse;
use App\Services\Menus\RecipeTimes;
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
        $with = array_merge(['lines.ingredient.baseUnit', 'lines.ingredient.altUnit', 'steps'], DishRecipes::hasSubLines() ? ['lines.subRecipe.yieldUnit'] : [], DishRecipes::has('yield_unit_id') ? ['yieldUnit'] : [], RecipeTimes::installed() ? ['times'] : []);
        $recipes = DishRecipe::with($with)->whereNotNull('dish_id')->get()->keyBy('dish_id');

        return response()->json([
            'location_id' => $location, 'branches' => $branches, 'installed' => DishRecipes::installed(),
            'dishes' => Dish::orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'is_active'])->map(fn ($d) => [
                'id' => $d->id, 'name' => $d->name, 'is_active' => (bool) $d->is_active, 'recipe' => ($r = $recipes->get($d->id)) ? $this->row($r, $location) : null,
            ])->values(),
            'ingredients' => Ingredient::with(['baseUnit:id,code', 'altUnit:id,code'])->where('is_active', true)->orderBy('name')->get()->filter(fn ($i) => IngredientKinds::allowedInRecipe($i))->map(fn ($i) => ['id' => $i->id, 'name' => $i->name, 'base_unit' => $i->baseUnit?->code, 'alt_unit' => $i->altUnit?->code] + $this->variants($i, $location))->values(),
            'standalone' => DishRecipes::has('name') ? DishRecipe::standalone()->with($with)->orderBy('name')->get()->map(fn (DishRecipe $r) => $this->row($r, $location))->values() : [],
            'units' => \App\Models\UnitOfMeasure::active()->whereIn('dimension', DishRecipes::YIELD_DIMENSIONS)->orderBy('dimension')->orderBy('to_base_factor')->get(['id', 'code', 'name', 'dimension']),
            'visibility' => DishRecipe::VISIBILITY, 'times_installed' => RecipeTimes::installed(), 'own_installed' => DishRecipes::has('name'), 'sub_installed' => DishRecipes::hasSubLines(), 'flags_installed' => DishRecipes::hasFlags(), 'pins_installed' => DishRecipes::hasPins(),
            'recipes' => DishRecipes::has('name') && DishRecipes::hasSubLines() ? DishRecipe::standalone()->with('yieldUnit')->where('is_active', true)->orderBy('name')->get()->map(fn (DishRecipe $r) => ['id' => (int) $r->id, 'name' => $r->name, 'unit' => $r->yieldUnit?->code ?? 'portions'])->values() : [], 'units_installed' => DishRecipes::has('yield_unit_id'),
        ]);
    }

    /** Body: yield_qty, made_to_order, note?, visibility, prep_minutes?, cook_minutes?, lines[{ingredient_id, quantity, unit: base|alt, waste_pct?}], steps[{body, minutes?}]. */
    public function save(Request $request, int $dishId): JsonResponse
    {
        $d = $this->validated($request, $this->rules());

        return $this->guard(function () use ($d, $dishId) {
            $r = $this->recipes->save(Dish::findOrFail($dishId), $d);

            return response()->json(['message' => 'Recipe saved.', 'recipe' => $this->row($r->load(array_merge(['lines.ingredient.baseUnit', 'lines.ingredient.altUnit', 'steps'], DishRecipes::hasSubLines() ? ['lines.subRecipe.yieldUnit'] : [], DishRecipes::has('yield_unit_id') ? ['yieldUnit'] : [], RecipeTimes::installed() ? ['times'] : [])), null)]);
        });
    }

    /** Body: as for a dish's recipe, plus name. A recipe of its own, not tied to a dish. */
    public function saveBook(Request $request, ?int $id = null): JsonResponse
    {
        $d = $this->validated($request, $this->rules() + ['name' => 'required|string|max:120']);

        return $this->guard(function () use ($d, $id) {
            $r = $this->recipes->saveStandalone($d, $id);

            return response()->json(['message' => "{$r->name} saved.", 'recipe' => $this->row($r->load(array_merge(['lines.ingredient.baseUnit', 'lines.ingredient.altUnit', 'steps'], DishRecipes::hasSubLines() ? ['lines.subRecipe.yieldUnit'] : [], DishRecipes::has('yield_unit_id') ? ['yieldUnit'] : [], RecipeTimes::installed() ? ['times'] : [])), null)], $id === null ? 201 : 200);
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

    /** The checked body, with its lines, steps and times in the order they were sent (the validator hands back a line that has no ingredient after one that has). */
    private function validated(Request $request, array $rules): array
    {
        $d = $request->validate($rules);
        foreach (['lines', 'steps', 'times'] as $key) {
            if (isset($d[$key]) && is_array($d[$key])) {
                ksort($d[$key]);
            }
        }

        return $d;
    }

    /** @return array<string, string> */
    private function rules(): array
    {
        return [
            'yield_qty' => 'required|numeric|gt:0', 'yield_unit_id' => 'nullable|integer', 'made_to_order' => 'nullable|boolean', 'note' => 'nullable|string|max:255', 'visibility' => 'nullable|string|max:12',
            'prep_minutes' => 'nullable|integer|min:0|max:6000', 'cook_minutes' => 'nullable|integer|min:0|max:6000', 'is_active' => 'nullable|boolean',
            'lines' => 'required|array|min:1|max:80', 'lines.*.ingredient_id' => 'nullable|integer', 'lines.*.recipe_id' => 'nullable|integer', 'lines.*.quantity' => 'required|numeric|min:0', 'lines.*.unit' => 'nullable|in:base,alt', 'lines.*.waste_pct' => 'nullable|numeric|min:0|max:90', 'lines.*.item_id' => 'nullable|integer', 'lines.*.removable' => 'nullable|boolean', 'lines.*.extra_allowed' => 'nullable|boolean',
            'times' => 'nullable|array|max:'.RecipeTimes::MAX_ROWS, 'times.*.up_to' => 'nullable|numeric|min:0', 'times.*.minutes' => 'nullable|integer|min:0|max:6000',
            'steps' => 'nullable|array|max:60', 'steps.*.body' => 'nullable|string|max:2000', 'steps.*.minutes' => 'nullable|integer|min:0|max:6000',
        ];
    }

    /**
     * The variants of an ingredient a recipe line may name, with what is left of each at the branch, the pick rule, and the variant the rule would take now (what a line left on automatic gets).
     *
     * @return array{pick_rule: string, pick_label: string, variants: array<int, array<string, mixed>>, auto: ?array{id: int, name: string}}
     */
    private function variants(Ingredient $i, ?int $location): array
    {
        $left = $location ? StockBatch::where('location_id', $location)->where('status', 'ok')->where('qty_left', '>', 0)->whereIn('item_id', $i->variants()->select('id'))->selectRaw('item_id, SUM(qty_left) as q')->groupBy('item_id')->pluck('q', 'item_id') : collect();

        return [
            'pick_rule' => (string) $i->pick_rule, 'pick_label' => ['preferred' => 'the preferred one first', 'cheapest' => 'the cheapest first', 'first_expiring' => 'the one that expires first'][$i->pick_rule] ?? (string) $i->pick_rule,
            'variants' => $i->variants()->where('is_active', true)->where('is_allowed', true)->orderBy('preference')->orderBy('id')->get(['id', 'name'])->map(fn ($v) => ['id' => (int) $v->id, 'name' => $v->name, 'left' => round((float) ($left[$v->id] ?? 0), 4)])->values(),
            'auto' => $location ? $this->use->variantNow($i, $location) : null,
        ];
    }

    private function row(DishRecipe $r, ?int $location): array
    {
        $cost = $location ? $this->use->cost($r, $location) : null;
        $variants = DishRecipes::hasPins() ? IngredientItem::whereIn('id', $r->lines->pluck('item_id')->filter()->unique())->pluck('name', 'id') : collect();   // the variant a line names, for the kitchen card

        return [
            'id' => $r->id, 'dish_id' => $r->dish_id ? (int) $r->dish_id : null, 'name' => $r->name, 'yield_qty' => (float) $r->yield_qty, 'yield_unit_id' => $r->yield_unit_id ? (int) $r->yield_unit_id : null, 'yield_unit' => $r->yieldUnit?->code, 'yield_label' => $r->yieldLabel(), 'made_to_order' => (bool) $r->made_to_order, 'note' => $r->note, 'visibility' => $r->visibility,
            'prep_minutes' => $r->prep_minutes, 'cook_minutes' => $r->cook_minutes, 'is_active' => (bool) $r->is_active,
            'lines' => $r->lines->map(fn ($l) => $l->sub_recipe_id ? [
                'ingredient_id' => null, 'recipe_id' => (int) $l->sub_recipe_id, 'name' => $l->subRecipe?->title(), 'quantity' => (float) $l->quantity, 'unit' => 'base', 'waste_pct' => (float) $l->waste_pct,
                'base_unit' => $l->subRecipe?->yieldUnit?->code ?? 'portions', 'alt_unit' => null, 'removable' => false, 'extra_allowed' => false,
            ] : [
                'ingredient_id' => (int) $l->ingredient_id, 'recipe_id' => null, 'name' => $l->ingredient?->name, 'quantity' => (float) $l->quantity, 'unit' => $l->unit, 'waste_pct' => (float) $l->waste_pct,
                'base_unit' => $l->ingredient?->baseUnit?->code, 'alt_unit' => $l->ingredient?->altUnit?->code, 'removable' => (bool) ($l->removable ?? false), 'extra_allowed' => (bool) ($l->extra_allowed ?? false),
                'item_id' => ($l->item_id ?? null) ? (int) $l->item_id : null, 'variant' => ($l->item_id ?? null) ? $variants[(int) $l->item_id] ?? null : null,
            ])->values(),
            'times' => $r->relationLoaded('times') ? $r->times->map(fn ($t) => ['up_to' => (float) $t->up_to_qty, 'minutes' => (int) $t->minutes])->values() : [],
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
