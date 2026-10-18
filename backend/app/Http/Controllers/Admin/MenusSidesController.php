<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Menus\DishRecipe;
use App\Models\Menus\Ingredient;
use App\Models\Menus\Serving;
use App\Models\Menus\Station;
use App\Models\UnitOfMeasure;
use App\Services\Books\BooksException;
use App\Services\Menus\DishRecipes;
use App\Services\Menus\IngredientKinds;
use App\Services\Menus\MenusLists;
use App\Services\Menus\Sides;
use App\Services\Menus\SidesFromDishes;
use App\Services\Menus\SidesReadiness;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

/** Menus → Sides: what is served (ugali, pilau, kale, a soda), what it is made from, and how much of it goes in each serving size. */
class MenusSidesController extends Controller
{
    public function __construct(private Sides $sides, private SidesFromDishes $fromDishes)
    {
    }

    public function index(): JsonResponse
    {
        if (! Sides::installed()) {
            return response()->json(['ready' => false, 'sides' => [], 'recipes' => [], 'ingredients' => [], 'servings' => [], 'stations' => [], 'units' => [], 'servings_ready' => false]);
        }

        return response()->json([
            'ready' => true, 'sides' => $this->sides->all(), 'servings_ready' => MenusLists::installed(), 'from_dishes' => ['ready' => SidesFromDishes::installed()] + (SidesFromDishes::installed() ? ['pending' => count($this->fromDishes->preview()['pending'])] : ['pending' => 0]),
            'recipes' => DishRecipes::has('name') ? DishRecipe::standalone()->with('yieldUnit')->where('is_active', true)->orderBy('name')->get()->map(fn (DishRecipe $r) => [
                'id' => (int) $r->id, 'name' => $r->name, 'unit_id' => $r->yield_unit_id ? (int) $r->yield_unit_id : null, 'unit' => $r->yieldUnit?->code ?? 'portions', 'dimension' => $r->yieldUnit?->dimension])->values() : [],
            'ingredients' => Ingredient::with(['baseUnit', 'kind'])->where('is_active', true)->orderBy('name')->get()->filter(fn (Ingredient $i) => ! IngredientKinds::installed() || ! $i->kind_id || $i->kind?->sold_as_is)->map(fn (Ingredient $i) => [
                'id' => (int) $i->id, 'name' => $i->name, 'unit_id' => $i->base_unit_id ? (int) $i->base_unit_id : null, 'unit' => $i->baseUnit?->code, 'dimension' => $i->baseUnit?->dimension])->values(),
            'servings' => MenusLists::installed() ? Serving::where('is_active', true)->orderBy('sort_order')->orderBy('id')->get(['id', 'name'])->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name])->values() : [],
            'stations' => Schema::hasTable('menus_stations') ? Station::where('is_active', true)->orderBy('sort_order')->orderBy('name')->get(['id', 'name'])->map(fn ($s) => ['id' => (int) $s->id, 'name' => $s->name])->values() : [],
            'units' => UnitOfMeasure::active()->whereIn('dimension', DishRecipes::YIELD_DIMENSIONS)->orderBy('dimension')->orderBy('to_base_factor')->get(['id', 'code', 'name', 'dimension']),
        ]);
    }

    /** Body: name, recipe_id | ingredient_id, unit_id?, base_amount, station_id?, note?, is_active?, amounts[{serving_id, amount}]. */
    public function save(Request $request, ?int $id = null): JsonResponse
    {
        $d = $request->validate([
            'name' => 'required|string|max:80', 'recipe_id' => 'nullable|integer', 'ingredient_id' => 'nullable|integer', 'unit_id' => 'nullable|integer', 'base_amount' => 'nullable|numeric', 'station_id' => 'nullable|integer',
            'note' => 'nullable|string|max:255', 'is_active' => 'nullable|boolean', 'amounts' => 'nullable|array|max:60', 'amounts.*.serving_id' => 'required|integer', 'amounts.*.amount' => 'nullable|numeric',
        ]);
        if (isset($d['amounts'])) {
            ksort($d['amounts']);
        }

        return $this->guard(function () use ($d, $id) {
            $s = $this->sides->save($d, $id);

            return response()->json(['message' => "{$s->name} saved.", 'side' => $this->sides->row($s)], $id === null ? 201 : 200);
        });
    }

    /** A side and its recipe in one go, for the guided dish screen. Body: name, yield_qty?, made_to_order?, lines[{ingredient_id, quantity, unit?, waste_pct?}], base_amount?, station_id?. */
    public function quick(Request $request, \App\Services\Menus\SideWithRecipe $make): JsonResponse
    {
        $d = $request->validate([
            'name' => 'required|string|max:80', 'yield_qty' => 'nullable|numeric|min:0.0001', 'made_to_order' => 'nullable|boolean', 'base_amount' => 'nullable|numeric', 'station_id' => 'nullable|integer', 'note' => 'nullable|string|max:255',
            'lines' => 'required|array|min:1|max:60', 'lines.*.ingredient_id' => 'required|integer', 'lines.*.quantity' => 'required|numeric|min:0', 'lines.*.unit' => 'nullable|string|in:base,alt', 'lines.*.waste_pct' => 'nullable|numeric|min:0|max:90',
        ]);
        ksort($d['lines']);

        return $this->guard(function () use ($d, $make) {
            $r = $make->make($d);

            return response()->json(['message' => "{$r['side']->name} made, with its recipe.", 'side' => $this->sides->row($r['side'])], 201);
        });
    }

    /** Is it safe to switch on selling through sides: copies that differ from their dishes' recipes, dishes without a side, stock on the old shelf. */
    public function readiness(SidesReadiness $readiness): JsonResponse
    {
        return response()->json($readiness->report());
    }

    /** What making sides from the dishes' recipes would do now (nothing is changed). */
    public function fromDishes(): JsonResponse
    {
        return response()->json($this->fromDishes->preview());
    }

    /** Copy each dish's recipe into a recipe of its own and make a side from the copy, for the dishes not done yet. */
    public function makeFromDishes(): JsonResponse
    {
        return $this->guard(function () {
            $r = $this->fromDishes->run();

            return response()->json(['message' => $r['sides'] === 0 && $r['recipes'] === 0 ? 'Nothing to do: every dish with a recipe already has a side.' : "Done: {$r['recipes']} recipe".($r['recipes'] === 1 ? '' : 's')." copied and {$r['sides']} side".($r['sides'] === 1 ? '' : 's').' made. The dishes keep their own recipes.'] + $r);
        });
    }

    public function destroy(int $id): JsonResponse
    {
        return $this->guard(function () use ($id) {
            $this->sides->delete($id);

            return response()->json(['message' => 'Side removed.']);
        });
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
